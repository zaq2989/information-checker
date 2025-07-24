import { Pool } from 'pg';
import * as neo4j from 'neo4j-driver';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';

export class DatabaseInitializer {
  private pgPool: Pool;
  private neo4jDriver: neo4j.Driver;
  private logger: winston.Logger;

  constructor(pgPool: Pool, neo4jDriver: neo4j.Driver, logger: winston.Logger) {
    this.pgPool = pgPool;
    this.neo4jDriver = neo4jDriver;
    this.logger = logger;
  }

  async initializePostgreSQL(): Promise<void> {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');
      
      await this.pgPool.query(schema);
      this.logger.info('PostgreSQL schema initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PostgreSQL schema:', error);
      throw error;
    }
  }

  async initializeNeo4j(): Promise<void> {
    const session = this.neo4jDriver.session();
    try {
      const schemaPath = path.join(__dirname, 'neo4j-schema.cypher');
      const schema = await fs.readFile(schemaPath, 'utf-8');
      
      // Split by semicolon and execute each statement
      const statements = schema.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim() && !statement.trim().startsWith('//')) {
          await session.run(statement);
        }
      }
      
      this.logger.info('Neo4j schema initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Neo4j schema:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.initializePostgreSQL(),
      this.initializeNeo4j()
    ]);
  }
}