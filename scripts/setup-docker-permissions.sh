#!/bin/bash
# Setup Docker Permissions Script
# ================================
# This script helps configure permissions for Docker deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USER_ID=1001
DOCKER_GROUP_ID=1001

echo -e "${GREEN}🔧 Docker Permissions Setup${NC}"
echo "=================================="
echo ""

# Function to print colored messages
info() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if running from project root
if [ ! -f "docker-compose.yml" ]; then
    error "This script must be run from the project root directory"
    exit 1
fi

# Create directories if they don't exist
echo "📁 Creating directories..."
mkdir -p data logs backups

# Option 1: Use Docker volumes (recommended)
echo ""
echo "Choose deployment option:"
echo "1) Docker volumes (recommended - no permission issues)"
echo "2) Bind mounts (direct access to files from host)"
echo ""
read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        info "Using Docker volumes (recommended)"
        info "No permission setup needed - Docker will manage volumes"
        info ""
        info "To backup data, use:"
        echo "  docker compose exec discord-reminder-bot tar czf /app/backups/backup.tar.gz /app/data"
        info ""
        info "To access data directly:"
        echo "  docker compose exec discord-reminder-bot ls -la /app/data"
        ;;
    2)
        info "Using bind mounts - setting up permissions..."
        
        # Check if we need sudo
        if [ -w data ] && [ -w logs ] && [ -w backups ]; then
            info "Current user has write access, no sudo needed"
            chown -R $DOCKER_USER_ID:$DOCKER_GROUP_ID data logs backups
            chmod -R 755 data logs backups
        else
            warn "Need sudo to change ownership"
            sudo chown -R $DOCKER_USER_ID:$DOCKER_GROUP_ID data logs backups
            sudo chmod -R 755 data logs backups
        fi
        
        info "Permissions set successfully"
        
        # Create override file
        cat > docker-compose.override.yml <<EOF
# Override file for bind mounts
services:
  discord-reminder-bot:
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./backups:/app/backups
EOF
        
        info "Created docker-compose.override.yml for bind mounts"
        warn "Note: You may need to run this script again if you reset permissions"
        ;;
    *)
        error "Invalid choice"
        exit 1
        ;;
esac

echo ""
info "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env.docker and configure your settings"
echo "2. Run: docker compose build"
echo "3. Run: docker compose up -d"
echo "4. Check logs: docker compose logs -f discord-reminder-bot"
