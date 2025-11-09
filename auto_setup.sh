#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Hand URDF Viewer setup..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "🔒 This script requires root privileges. Please run with sudo or as root."
    exit 1
fi

# Check Ubuntu version
if [ ! -f /etc/os-release ]; then
    echo "❌ This script is only for Ubuntu Linux."
    exit 1
fi

# Source the os-release file
. /etc/os-release

if [ "$ID" != "ubuntu" ]; then
    echo "❌ This script is only for Ubuntu Linux. Detected: $ID"
    exit 1
fi

echo "🐧 Detected Ubuntu $VERSION_ID"

# Update package list
echo "🔄 Updating package lists..."
apt-get update -qq

# Install required packages
echo "📦 Installing required packages..."
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    
    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt-get update -qq
    apt-get install -y --no-install-recommends \
        docker-ce \
        docker-ce-cli \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin

    # Start and enable Docker
    systemctl enable --now docker
    
    echo "✅ Docker installed successfully"
else
    echo "ℹ️  Docker is already installed"
fi

# Add current user to docker group if not already
echo "👤 Adding user to docker group..."
if ! id -nG "$SUDO_USER" | grep -qw "docker"; then
    usermod -aG docker "$SUDO_USER"
    echo "✅ Added $SUDO_USER to docker group"
    echo "⚠️  Please log out and back in for group changes to take effect!"
else
    echo "ℹ️  User $SUDO_USER is already in docker group"
fi

# Install Node.js and npm if not installed
if ! command -v node &> /dev/null; then
    echo "⬇️  Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
    echo "✅ Node.js installed successfully"
else
    echo "ℹ️  Node.js is already installed"
fi

# Verify installations
echo "\n🔍 Verifying installations..."
docker --version
docker compose version
node --version
npm --version

# Install project dependencies
echo "\n📦 Installing project dependencies..."
sudo -u "$SUDO_USER" npm install

# Build the project
echo "\n🏗️  Building the project..."
sudo -u "$SUDO_USER" npm run build

echo "\n✨ Setup completed successfully! ✨"
echo "\n🚀 To start the application, run:"
echo "   docker-compose up -d"
echo "   Then open http://localhost:5173 in your browser"
echo "\n💡 Don't forget to log out and back in if this is your first time adding your user to the docker group!"
