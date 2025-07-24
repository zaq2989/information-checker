FROM node:18-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Development stage
FROM base AS dev

# Expose port
EXPOSE 5173

# Start in development mode
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production stage
FROM base AS prod

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Install serve to run the production build
RUN npm install -g serve

# Expose port
EXPOSE 5173

# Start the application
CMD ["serve", "-s", "dist", "-l", "5173"]