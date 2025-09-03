#!/bin/bash

# Discord Reminder Bot - Production Deployment Script
# ==================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="discord-reminder-bot"
CONTAINER_NAME="discord-reminder-bot"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$PROJECT_DIR/logs/deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Create necessary directories
mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running or not accessible"
        exit 1
    fi

    # Check if required environment file exists
    if [[ ! -f "$PROJECT_DIR/.env" ]]; then
        warning ".env file not found. Make sure environment variables are properly set."
    fi

    # Check disk space (minimum 2GB)
    available_space=$(df "$PROJECT_DIR" | tail -1 | awk '{print $4}')
    if [[ $available_space -lt 2097152 ]]; then
        error "Insufficient disk space. At least 2GB required."
        exit 1
    fi

    success "Pre-deployment checks passed"
}

# Backup current data
backup_data() {
    log "Creating backup..."

    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="$BACKUP_DIR/backup_$backup_timestamp"

    mkdir -p "$backup_path"

    # Backup database
    if [[ -f "$PROJECT_DIR/discord_bot.db" ]]; then
        cp "$PROJECT_DIR/discord_bot.db" "$backup_path/"
        success "Database backed up"
    fi

    # Backup data directory
    if [[ -d "$PROJECT_DIR/data" ]]; then
        cp -r "$PROJECT_DIR/data" "$backup_path/"
        success "Data directory backed up"
    fi

    # Backup logs
    if [[ -d "$PROJECT_DIR/logs" ]]; then
        cp -r "$PROJECT_DIR/logs" "$backup_path/"
        success "Logs backed up"
    fi

    echo "$backup_path" > "$PROJECT_DIR/.last_backup"
    success "Backup created at: $backup_path"
}

# Build new image
build_image() {
    log "Building new Docker image..."

    cd "$PROJECT_DIR"

    if docker build -t "$IMAGE_NAME:latest" -t "$IMAGE_NAME:$(date +%Y%m%d_%H%M%S)" .; then
        success "Docker image built successfully"
    else
        error "Failed to build Docker image"
        exit 1
    fi
}

# Deploy in shadow mode
deploy_shadow() {
    log "Deploying in shadow mode..."

    # Create network if it doesn't exist
    if ! docker network ls --format '{{.Name}}' | grep -q "^bot-network$"; then
        log "Creating bot-network..."
        docker network create bot-network
        success "Network bot-network created"
    else
        log "Network bot-network already exists"
    fi

    # Stop and remove existing shadow container if exists
    if docker ps -a --format '{{.Names}}' | grep -q "${CONTAINER_NAME}-shadow"; then
        docker stop "${CONTAINER_NAME}-shadow" >/dev/null 2>&1 || true
        docker rm "${CONTAINER_NAME}-shadow" >/dev/null 2>&1 || true
    fi

    # Start shadow container
    docker run -d \
        --name "${CONTAINER_NAME}-shadow" \
        --env-file "$PROJECT_DIR/.env" \
        -e NODE_ENV=production \
        -v "$PROJECT_DIR/data:/app/data" \
        -v "$PROJECT_DIR/logs:/app/logs" \
        --network bot-network \
        --restart unless-stopped \
        "$IMAGE_NAME:latest"

    success "Shadow deployment started"
}

# Health checks
health_checks() {
    log "Running health checks..."

    local max_attempts=30
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if docker exec "${CONTAINER_NAME}-shadow" node -e "process.exit(0)" >/dev/null 2>&1; then
            success "Health check passed"
            return 0
        fi

        log "Health check attempt $attempt/$max_attempts failed, retrying in 10s..."
        sleep 10
        ((attempt++))
    done

    error "Health checks failed after $max_attempts attempts"
    return 1
}

# Load testing
load_testing() {
    log "Running load tests..."

    # Simple load test - check resource usage
    local cpu_usage=$(docker stats "${CONTAINER_NAME}-shadow" --no-stream --format "table {{.CPUPerc}}" | tail -n 1 | sed 's/%//')
    local mem_usage=$(docker stats "${CONTAINER_NAME}-shadow" --no-stream --format "table {{.MemUsage}}" | tail -n 1)

    log "Shadow container resource usage - CPU: ${cpu_usage}%, Memory: ${mem_usage}"

    # Check if CPU usage is reasonable (< 50%)
    if [[ $(echo "$cpu_usage < 50" | bc -l) -eq 1 ]]; then
        success "Load test passed - CPU usage within limits"
    else
        warning "High CPU usage detected: ${cpu_usage}%"
    fi

    sleep 60 # Let it run for a minute
    success "Load testing completed"
}

# Switch to production
switch_to_production() {
    log "Switching to production..."

    # Stop old production container
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log "Stopping old production container..."
        docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
        docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    fi

    # Rename shadow container to production
    docker rename "${CONTAINER_NAME}-shadow" "$CONTAINER_NAME"

    success "Switched to production successfully"
}

# Post-deployment validation
post_deployment_validation() {
    log "Running post-deployment validation..."

    # Wait for bot to fully initialize
    sleep 30

    # Check if container is running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        success "Production container is running"
    else
        error "Production container is not running"
        return 1
    fi

    # Check logs for errors
    local error_count=$(docker logs "$CONTAINER_NAME" --since "5m" 2>&1 | grep -i error | wc -l)
    if [[ $error_count -eq 0 ]]; then
        success "No errors found in recent logs"
    else
        warning "$error_count errors found in recent logs"
    fi

    success "Post-deployment validation completed"
}

# Rollback function
rollback() {
    error "Deployment failed, initiating rollback..."

    # Stop and remove failed containers
    docker stop "${CONTAINER_NAME}-shadow" >/dev/null 2>&1 || true
    docker rm "${CONTAINER_NAME}-shadow" >/dev/null 2>&1 || true

    # Restore from backup if available
    if [[ -f "$PROJECT_DIR/.last_backup" ]]; then
        local backup_path=$(cat "$PROJECT_DIR/.last_backup")
        if [[ -d "$backup_path" ]]; then
            log "Restoring from backup: $backup_path"

            # Restore database
            if [[ -f "$backup_path/discord_bot.db" ]]; then
                cp "$backup_path/discord_bot.db" "$PROJECT_DIR/"
            fi

            # Restore data directory
            if [[ -d "$backup_path/data" ]]; then
                rm -rf "$PROJECT_DIR/data"
                cp -r "$backup_path/data" "$PROJECT_DIR/"
            fi

            success "Rollback completed"
        else
            error "Backup directory not found: $backup_path"
        fi
    else
        error "No backup available for rollback"
    fi
}

# Main deployment function
main() {
    log "Starting deployment process..."

    # Set trap for cleanup on failure
    trap rollback ERR

    pre_deployment_checks
    backup_data
    build_image
    deploy_shadow

    if health_checks && load_testing; then
        switch_to_production
        post_deployment_validation

        # Cleanup old images (keep last 3)
        docker images "$IMAGE_NAME" --format "table {{.Repository}}:{{.Tag}}" | tail -n +4 | xargs -r docker rmi >/dev/null 2>&1 || true

        success "Deployment completed successfully!"
        log "Deployment process finished. Monitor the application for the next 48 hours."
    else
        error "Deployment validation failed"
        rollback
        exit 1
    fi
}

# Script usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --rollback     Rollback to previous version"
    echo "  --status       Show deployment status"
    echo ""
    echo "Examples:"
    echo "  $0                    # Full deployment"
    echo "  $0 --rollback         # Rollback to previous version"
    echo "  $0 --status           # Show current status"
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        usage
        exit 0
        ;;
    --rollback)
        rollback
        exit 0
        ;;
    --status)
        log "Checking deployment status..."
        docker ps --filter name="$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        docker logs "$CONTAINER_NAME" --tail 10
        exit 0
        ;;
    "")
        main
        ;;
    *)
        error "Unknown option: $1"
        usage
        exit 1
        ;;
esac
