#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Hand URDF Viewer..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if user is in docker group
if ! groups | grep -q "\bdocker\b"; then
    echo "⚠️  Warning: Current user is not in the docker group."
    echo "   You may need to run this script with sudo or add your user to the docker group:"
    echo "   sudo usermod -aG docker $USER && newgrp docker"
    echo "   Then log out and back in for the changes to take effect."
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if containers are already running
if [ "$(docker-compose ps -q)" ]; then
    echo "🔄 Stopping existing containers..."
    docker-compose down
fi

# Start the application
echo "🚀 Starting containers in detached mode..."
docker-compose up -d

# Get the container ID
CONTAINER_ID=$(docker-compose ps -q app)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Failed to start the application. Check the logs with: docker-compose logs"
    exit 1
fi

# Get the container's IP address
CONTAINER_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTAINER_ID")

# Get the exposed port
EXPOSED_PORT=$(docker-compose port app 5173 | cut -d: -f2)

# Wait for the application to start
MAX_RETRIES=30
COUNTER=0

while ! curl -s -o /dev/null "http://localhost:${EXPOSED_PORT}"; do
    if [ $COUNTER -eq $MAX_RETRIES ]; then
        echo "\n❌ Application failed to start. Check the logs with: docker-compose logs"
        exit 1
    fi
    printf "."
    sleep 1
    ((COUNTER++))
done

# Print success message
echo -e "\n\n✨ Hand URDF Viewer is now running!"
echo -e "\n🌐 Open in your browser:"
echo -e "   Local:   http://localhost:${EXPOSED_PORT}"
echo -e "   Network: http://${CONTAINER_IP}:${EXPOSED_PORT}"
echo -e "\n🛑 To stop the application, run: ./stop.sh"
echo -e "📋 View logs: docker-compose logs -f"

# Open the browser if possible
if command -v xdg-open > /dev/null; then
    read -p "Open in browser now? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ || -z "$REPLY" ]]; then
        xdg-open "http://localhost:${EXPOSED_PORT}" &
    fi
fi

exit 0
