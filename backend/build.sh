#!/bin/bash

# Build script for backend
echo "Building backend..."

# Install dependencies
npm ci --production

# Compile TypeScript
npm run build

echo "Backend build complete!"