# information-checker / Twitter Spread Analyzer

A comprehensive tool for analyzing information spread patterns on Twitter, designed for cognitive warfare and information manipulation detection.

## Features

- **Real-time Tweet Collection**: Stream and analyze tweets by keywords or specific tweet IDs
- **Bot Detection**: Machine learning-based bot detection with multiple signal analysis
- **Coordination Detection**: Identify coordinated behavior patterns across accounts
- **Network Analysis**: Visualize and analyze spread networks, identify influencers
- **Anomaly Detection**: Detect unusual patterns in spreading behavior
- **Interactive Visualizations**: Network graphs, timelines, heatmaps, and influence trees

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, D3.js, Cytoscape.js
- **Databases**: PostgreSQL (time-series data), Neo4j (graph data)
- **Cache**: Redis
- **ML**: TensorFlow.js
- **Real-time**: Socket.io
- **Container**: Docker

## Prerequisites

- Docker and Docker Compose
- Twitter Developer Account with Bearer Token
- Node.js 18+ (for local development)

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/zaq2989/information-checker.git
cd information-checker/twitter-spread-analyzer
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Update `.env` with your Twitter Bearer Token:
```
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

4. Start all services:
```bash
docker-compose up -d
```

5. Access the application:
- Frontend: http://localhost
- Backend API: http://localhost/api
- Neo4j Browser: http://localhost:7474

## API Endpoints

### Analysis
- `POST /api/analysis` - Create new analysis
- `GET /api/analysis/:id` - Get analysis details
- `GET /api/analysis/:id/results` - Get analysis results

### Data Collection
- `POST /api/collect/tweet` - Collect spread data for a tweet
- `POST /api/collect/stream` - Start streaming by keywords
- `POST /api/collect/historical` - Collect historical data

### Account Analysis
- `POST /api/accounts/analyze` - Analyze specific account
- `POST /api/accounts/batch-analyze` - Batch analyze accounts

## Development

### Backend Development
```bash
cd backend
npm install
npm run dev
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Running Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

## Architecture

The system uses a microservices architecture with the following components:

1. **Data Collector**: Interfaces with Twitter API to collect tweets and metadata
2. **Analysis Engine**: Performs bot detection, coordination analysis, and network analysis
3. **Storage Layer**: PostgreSQL for structured data, Neo4j for graph relationships
4. **Cache Layer**: Redis for caching API responses and rate limiting
5. **API Server**: RESTful API with real-time WebSocket support
6. **Frontend**: React-based dashboard with interactive visualizations

## Security Considerations

- All API endpoints require authentication
- Rate limiting implemented on Twitter API calls
- Data anonymization options available
- Audit logging for all analysis requests
- HTTPS enforced in production

## Configuration

Key configuration options in `.env`:

- `TWITTER_BEARER_TOKEN`: Twitter API authentication
- `POSTGRES_PASSWORD`: Database password
- `NEO4J_PASSWORD`: Graph database password
- `REDIS_PASSWORD`: Cache password
- `JWT_SECRET`: JWT token secret
- `NODE_ENV`: Environment (development/production)

## Monitoring

The application includes:
- Health check endpoints
- Prometheus metrics export
- Structured logging with Winston
- Error tracking and alerting

## License

This tool is designed for defensive security purposes only. Use responsibly and ethically for information integrity protection.