# Deployment Guide

This guide explains how to deploy the Twitter Spread Analyzer to production using Vercel (frontend) and Railway (backend).

## Prerequisites

1. **Accounts Required:**
   - GitHub account (with repository access)
   - Vercel account
   - Railway account
   - Twitter Developer account
   - Database accounts: Neon (PostgreSQL), Upstash (Redis), Neo4j Aura

2. **Environment Variables Ready:**
   - Twitter Bearer Token
   - Database connection strings
   - JWT secret

## Frontend Deployment (Vercel)

### 1. Connect Repository to Vercel

1. Log in to [Vercel](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure build settings:
   - Framework Preset: `Vite`
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`

### 2. Set Environment Variables

In Vercel project settings → Environment Variables:

```
VITE_API_URL=https://your-backend.railway.app/api
```

Replace `your-backend.railway.app` with your actual Railway backend URL.

### 3. Deploy

Click "Deploy" and wait for the build to complete.

## Backend Deployment (Railway)

### 1. Create New Project in Railway

1. Log in to [Railway](https://railway.app)
2. Click "New Project"
3. Choose "Deploy from GitHub repo"
4. Select your repository

### 2. Configure Environment Variables

Add these environment variables in Railway:

```bash
# Environment
NODE_ENV=production
NO_DB=false

# Database - PostgreSQL (Neon)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Neo4j (Aura)
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Twitter API
TWITTER_BEARER_TOKEN=your_bearer_token

# Security
JWT_SECRET=generate_secure_secret_here

# Frontend URL (for CORS)
FRONTEND_URL=https://your-app.vercel.app
```

### 3. Deploy

Railway will automatically deploy when you push to GitHub.

## Database Setup

### PostgreSQL (Neon)

1. Create account at [Neon](https://neon.tech)
2. Create new database
3. Copy connection string to `DATABASE_URL`

### Redis (Upstash)

1. Create account at [Upstash](https://upstash.com)
2. Create new Redis database
3. Copy REST URL and token

### Neo4j (Aura)

1. Create account at [Neo4j Aura](https://neo4j.com/cloud/aura/)
2. Create free instance
3. Save connection details

## Post-Deployment

### 1. Update Frontend Environment

After Railway deployment, update Vercel's `VITE_API_URL` with the Railway backend URL.

### 2. Test the Application

1. Visit your Vercel frontend URL
2. Enter a test keyword
3. Click "Analyze"
4. Verify dashboard loads correctly

### 3. Monitor Logs

- **Vercel**: Functions → Logs
- **Railway**: Project → Logs

## Development vs Production

| Setting | Development | Production |
|---------|------------|------------|
| `NODE_ENV` | `development` | `production` |
| `NO_DB` | `true` | `false` |
| API URL | `http://localhost:3001` | Railway URL |
| Frontend | `http://localhost:5173` | Vercel URL |

## Troubleshooting

### CORS Issues
- Ensure backend allows Vercel domain in CORS settings
- Check `FRONTEND_URL` environment variable

### Database Connection
- Verify connection strings are correct
- Check database service is running
- Ensure IP whitelisting is configured

### API Timeout
- Railway has 30-second timeout for requests
- Consider implementing pagination for large datasets

## Security Checklist

- [ ] Remove all sensitive data from `.env` files
- [ ] Set strong `JWT_SECRET` in production
- [ ] Enable HTTPS on all services
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerts
- [ ] Regular security updates

## Support

For issues, check:
- Railway status: https://railway.app/status
- Vercel status: https://vercel.com/status
- Application logs in respective dashboards