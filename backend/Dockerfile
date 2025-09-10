FROM node:18-alpine

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files (from backend directory)
COPY backend/package*.json ./

# Install production dependencies
RUN npm ci --only=production || npm install

# Copy TypeScript config and source
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src

# Install all dependencies (including dev) for build
RUN npm install

# Build the application
RUN npm run build

# Set production environment
ENV NODE_ENV=production
ENV NO_DB=true

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]