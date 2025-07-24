#!/bin/bash

# Development startup script without Docker

echo "=== Twitter Spread Analyzer Development Mode ==="
echo ""
echo "Starting backend and frontend in development mode..."
echo "Note: This runs without databases - using mock data only"
echo ""

# Kill any existing processes
pkill -f "ts-node" 2>/dev/null
pkill -f "vite" 2>/dev/null

# Start backend in background
cd backend
echo "Starting backend on port 3000..."
NO_DB=true npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend in background
cd frontend
echo "Starting frontend on port 5173..."
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo "Services started!"
echo "  Backend PID: $BACKEND_PID (logs: tail -f backend.log)"
echo "  Frontend PID: $FRONTEND_PID (logs: tail -f frontend.log)"
echo ""
echo "Access the application at: http://localhost:5173"
echo ""
echo "To stop all services, run: pkill -f 'ts-node|vite'"