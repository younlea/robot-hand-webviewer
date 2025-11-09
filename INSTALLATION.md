# Installation Guide

## Prerequisites

### 1. System Requirements
- Ubuntu 20.04/22.04 LTS (Recommended)
- Node.js 16+ (for development)
- Docker 20.10+ (for containerized deployment)
- Modern web browser (Chrome, Firefox, Edge)

### 2. Install Docker (Ubuntu)

#### Automatic Installation
Run the following command to install Docker and Docker Compose:

```bash
# Install required packages
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and CLI
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

#### Post-Installation Steps
Add your user to the docker group to run Docker without sudo:

```bash
sudo usermod -aG docker $USER
newgrp docker
docker run hello-world  # Verify installation
```

## Running with Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/hand_webviewer.git
   cd hand_webviewer
   ```

2. **Build and start the container**
   ```bash
   docker-compose up --build -d
   ```

3. **Access the application**
   Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

4. **Stop the application**
   ```bash
   docker-compose down
   ```

## Development Setup

### 1. Install Node.js and npm

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts

# Or using package manager
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start development server

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
npm run preview
```

## Troubleshooting

### Docker Permission Denied
If you encounter permission issues with Docker:

```bash
sudo chmod 666 /var/run/docker.sock
```

### Port Already in Use
If port 5173 is already in use:

```bash
# Find and kill the process
sudo lsof -i :5173
kill -9 <PID>

# Or change the port in docker-compose.yml
```

## Updating the Application

To update to the latest version:

```bash
git pull origin main
docker-compose up --build -d
```

## Uninstallation

To completely remove the application:

```bash
docker-compose down -v
rm -rf node_modules
# Remove Docker images if needed
docker system prune -a
```
