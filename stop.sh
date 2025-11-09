#!/bin/bash

echo "🛑 Stopping Hand URDF Viewer..."

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed"
    exit 1
fi

# Check if containers are running
if [ -z "$(docker-compose ps -q)" ]; then
    echo "ℹ️  No running containers found"
    exit 0
fi

# Stop and remove containers
echo "🔄 Stopping containers..."
docker-compose down

echo -e "\n✅ Application has been stopped"
echo "   To start again, run: ./launch.sh"

exit 0
