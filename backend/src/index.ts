import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import winston from 'winston';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { apiRouter } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';
import { CacheService } from './services/CacheService';
import { RateLimiter } from './utils/RateLimiter';
import { Pool } from 'pg';
import * as neo4j from 'neo4j-driver';
import { AnalysisEngine } from './analyzers/AnalysisEngine';
import { DatabaseInitializer } from './database/init';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRouter);

// Error handling
app.use(errorHandler);

// Socket.io for real-time updates
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('subscribe:analysis', (analysisId) => {
    socket.join(`analysis:${analysisId}`);
    logger.info(`Client ${socket.id} subscribed to analysis ${analysisId}`);
  });

  socket.on('unsubscribe:analysis', (analysisId) => {
    socket.leave(`analysis:${analysisId}`);
    logger.info(`Client ${socket.id} unsubscribed from analysis ${analysisId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Database connections
let pgPool: Pool | null = null;
let neo4jDriver: any = null;
let cache: CacheService | null = null;
let analysisEngine: AnalysisEngine | null = null;

if (process.env.NO_DB !== 'true') {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || 
      `postgresql://analyzer:${process.env.POSTGRES_PASSWORD}@localhost:5432/twitter_analyzer`
  });

  neo4jDriver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'neo4j_pass'
    )
  );

  // Initialize services
  cache = new CacheService(logger, process.env.REDIS_URL);
  analysisEngine = new AnalysisEngine(logger, pgPool, neo4jDriver);
} else {
  logger.info('Running in NO_DB mode - database connections skipped');
  // Create mock services
  cache = null;
  analysisEngine = null;
}

// Export for use in other modules
export { io, logger, pgPool, neo4jDriver, cache, analysisEngine };

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Skip database initialization if NO_DB flag is set
    if (process.env.NO_DB !== 'true' && pgPool && neo4jDriver) {
      // Initialize database schemas
      const dbInit = new DatabaseInitializer(pgPool, neo4jDriver, logger);
      await dbInit.initialize();
      
      // Connect to cache
      if (cache) await cache.connect();
      
      // Initialize analysis engine
      if (analysisEngine) await analysisEngine.initialize();
    } else {
      logger.info('Running in NO_DB mode - skipping database connections');
    }
    
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info('All services initialized successfully');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(async () => {
    if (pgPool) await pgPool.end();
    if (neo4jDriver) await neo4jDriver.close();
    if (cache) await cache.disconnect();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

startServer();