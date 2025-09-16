#!/bin/bash
# Discord Reminder Bot - Unified Deployment Script
# ===============================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTAINER_NAME="discord-reminder-bot"
IMAGE_NAME="discord-reminder-bot"
BACKUP_DIR="$PROJECT_DIR/backups"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Create backup directory
create_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="$BACKUP_DIR/backup_$timestamp"

    mkdir -p "$backup_path"

    # Backup docker-compose if running
    if docker-compose ps -q > /dev/null 2>&1; then
        docker-compose config > "$backup_path/docker-compose-backup.yml" 2>/dev/null || true
    fi

    # Backup env files
    if [ -f "$PROJECT_DIR/.env.docker" ]; then
        cp "$PROJECT_DIR/.env.docker" "$backup_path/" 2>/dev/null || true
    fi

    echo "$backup_path"
}

# Main deployment function
main() {
    log "Starting deployment..."

    cd "$PROJECT_DIR"

    # Check requirements
    log "Checking requirements..."
    command -v docker >/dev/null 2>&1 || error "Docker is not installed"
    command -v docker-compose >/dev/null 2>&1 || error "docker-compose is not installed"
    success "Requirements OK"

    # Create backup
    log "Creating backup..."
    local backup_path=$(create_backup)
    success "Backup created: $backup_path"

    # Start deployment
    log "Starting deployment..."

    # Stop existing containers
    docker-compose down --remove-orphans 2>/dev/null || true

    # Build and start
    if docker-compose up --build -d; then
        success "Deployment successful!"

        # Wait for services to be ready
        log "Waiting for services to start..."
        sleep 5

        # Check if container is running
        if docker-compose ps | grep -q "Up"; then
            success "Services are running"
            docker-compose ps
        else
            error "Services failed to start properly"
        fi
    else
        error "Deployment failed"
    fi
}

# Run main function
main "$@"