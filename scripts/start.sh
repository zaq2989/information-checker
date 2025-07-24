#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Twitter Spread Analyzer Startup Script ===${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file with default values...${NC}"
    cp .env.example .env 2>/dev/null || cat > .env << EOL
# Database passwords
POSTGRES_PASSWORD=analyzer_secure_pass_2024
NEO4J_PASSWORD=neo4j_secure_pass_2024
REDIS_PASSWORD=redis_secure_pass_2024

# Twitter API (set these when you have credentials)
TWITTER_BEARER_TOKEN=

# JWT Secret
JWT_SECRET=your_jwt_secret_here

# Environment
NODE_ENV=development
EOL
    echo -e "${GREEN}✓ .env file created${NC}"
fi

# Start services
echo -e "${YELLOW}Starting services with Docker Compose...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
check_service() {
    local service=$1
    if docker-compose ps | grep -q "${service}.*Up.*healthy"; then
        echo -e "${GREEN}✓ ${service} is healthy${NC}"
        return 0
    else
        echo -e "${RED}✗ ${service} is not healthy${NC}"
        return 1
    fi
}

all_healthy=true
for service in postgres neo4j redis backend frontend; do
    if ! check_service $service; then
        all_healthy=false
    fi
done

if [ "$all_healthy" = true ]; then
    echo ""
    echo -e "${GREEN}=== All services are running! ===${NC}"
    echo ""
    echo "Access the application at:"
    echo -e "  Frontend:  ${GREEN}http://localhost:5173${NC}"
    echo -e "  Backend:   ${GREEN}http://localhost:3000${NC}"
    echo -e "  Neo4j:     ${GREEN}http://localhost:7474${NC}"
    echo ""
    echo "To generate mock data, run:"
    echo -e "  ${YELLOW}docker-compose exec backend npm run generate-mock-data${NC}"
    echo ""
    echo "To view logs:"
    echo -e "  ${YELLOW}docker-compose logs -f [service-name]${NC}"
    echo ""
    echo "To stop all services:"
    echo -e "  ${YELLOW}docker-compose down${NC}"
else
    echo ""
    echo -e "${RED}Some services failed to start properly.${NC}"
    echo "Check logs with: docker-compose logs [service-name]"
fi