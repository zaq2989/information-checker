FROM node:18-alpine

WORKDIR /app

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 make g++ 

# Copy package files first (with explicit paths)
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

# Install all dependencies
RUN npm ci --only=production || npm install

# Copy TypeScript config
COPY ./tsconfig.json ./tsconfig.json

# Copy source code
COPY ./src ./src

# Install dev dependencies for build
RUN npm install

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]