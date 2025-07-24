FROM node:18-alpine AS base

WORKDIR /app

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 make g++ 

# Copy package files
COPY package*.json ./

# Install dependencies (without TensorFlow for now)
RUN npm install || true

# Development stage
FROM base AS dev

# Install dev dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Start in development mode
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS prod

# Copy TypeScript config
COPY tsconfig.json ./

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]