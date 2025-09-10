#!/bin/bash
# Production Deployment Script
# ============================
# Comprehensive production deployment with blue-green strategy, health checks, and rollback capability

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/logs/deployment.log"

# Deployment configuration
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${IMAGE_NAME:-discord-reminder-bot}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"
ROLLBACK_ENABLED="${ROLLBACK_ENABLED:-true}"

# Blue-Green deployment configuration
BLUE_SERVICE="discord-reminder-bot-blue"
GREEN_SERVICE="discord-reminder-bot-green"
ACTIVE_SERVICE_FILE="$PROJECT_ROOT/.active-service"

# Create log file
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

# Error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Deployment failed at line $line_number with exit code $exit_code"
    
    if [ "$ROLLBACK_ENABLED" = "true" ]; then
        log "INFO" "Initiating automatic rollback..."
        rollback_deployment
    fi
    
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Pre-deployment checks
pre_deployment_checks() {
    log "INFO" "🔍 Running pre-deployment checks..."
    
    # Check Docker and Docker Compose
    if ! command -v docker >/dev/null 2>&1; then
        log "ERROR" "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose >/dev/null 2>&1; then
        log "ERROR" "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        log "ERROR" "Docker daemon is not running"
        exit 1
    fi
    
    # Check available disk space
    local available_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    local required_space=2097152  # 2GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        log "ERROR" "Insufficient disk space. Required: 2GB, Available: $((available_space/1024/1024))GB"
        exit 1
    fi
    
    # Check environment file
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log "ERROR" "Environment file (.env) not found"
        exit 1
    fi
    
    # Validate environment variables
    local required_vars=("DISCORD_TOKEN" "POSTGRES_PASSWORD")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$PROJECT_ROOT/.env"; then
            log "ERROR" "Required environment variable $var not found in .env"
            exit 1
        fi
    done
    
    log "INFO" "✅ Pre-deployment checks passed"
}

# Create deployment backup
create_deployment_backup() {
    log "INFO" "📦 Creating deployment backup..."
    
    local backup_dir="$PROJECT_ROOT/backups/deployment"
    local backup_file="$backup_dir/pre-deployment-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    mkdir -p "$backup_dir"
    
    # Create comprehensive backup
    tar -czf "$backup_file" \
        -C "$PROJECT_ROOT" \
        --exclude="node_modules" \
        --exclude="backups" \
        --exclude="logs" \
        data/ \
        volumes/ \
        .env \
        docker-compose.yml 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log "INFO" "✅ Deployment backup created: $backup_file"
        echo "$backup_file" > "$PROJECT_ROOT/.last-backup"
    else
        log "ERROR" "❌ Failed to create deployment backup"
        exit 1
    fi
}

# Get current active service
get_active_service() {
    if [ -f "$ACTIVE_SERVICE_FILE" ]; then
        cat "$ACTIVE_SERVICE_FILE"
    else
        echo "$BLUE_SERVICE"  # Default to blue
    fi
}

# Get inactive service
get_inactive_service() {
    local active_service=$(get_active_service)
    if [ "$active_service" = "$BLUE_SERVICE" ]; then
        echo "$GREEN_SERVICE"
    else
        echo "$BLUE_SERVICE"
    fi
}

# Pull latest image
pull_latest_image() {
    log "INFO" "📥 Pulling latest Docker image..."
    
    local full_image_name="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if docker pull "$full_image_name"; then
        log "INFO" "✅ Successfully pulled image: $full_image_name"
    else
        log "ERROR" "❌ Failed to pull image: $full_image_name"
        exit 1
    fi
}

# Deploy to inactive service
deploy_to_inactive() {
    local inactive_service=$(get_inactive_service)
    
    log "INFO" "🚀 Deploying to inactive service: $inactive_service"
    
    # Update environment for inactive service
    export COMPOSE_PROJECT_NAME="$inactive_service"
    export SERVICE_NAME="$inactive_service"
    
    # Stop inactive service if running
    docker-compose -p "$inactive_service" down 2>/dev/null || true
    
    # Start infrastructure services
    docker-compose -p "$inactive_service" up -d postgres redis
    
    # Wait for infrastructure to be ready
    log "INFO" "⏳ Waiting for infrastructure services..."
    sleep 30
    
    # Health check infrastructure
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec "${inactive_service}_postgres_1" pg_isready -U bot_user -d discord_bot >/dev/null 2>&1 && \
           docker exec "${inactive_service}_redis_1" redis-cli ping >/dev/null 2>&1; then
            log "INFO" "✅ Infrastructure services are ready"
            break
        fi
        
        log "INFO" "⏳ Infrastructure not ready, attempt $attempt/$max_attempts"
        sleep 10
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log "ERROR" "❌ Infrastructure services failed to start"
        exit 1
    fi
    
    # Deploy main application
    docker-compose -p "$inactive_service" up -d discord-reminder-bot
    
    log "INFO" "✅ Deployment to $inactive_service completed"
}

# Health check service
health_check_service() {
    local service_name="$1"
    local timeout="${2:-$HEALTH_CHECK_TIMEOUT}"
    
    log "INFO" "🏥 Running health checks for $service_name..."
    
    # Get container name
    local container_name="${service_name}_discord-reminder-bot_1"
    
    # Wait for container to start
    local attempt=1
    local max_attempts=$((timeout / 10))
    
    while [ $attempt -le $max_attempts ]; do
        if docker ps --filter "name=$container_name" --filter "status=running" | grep -q "$container_name"; then
            log "INFO" "✅ Container $container_name is running"
            break
        fi
        
        log "INFO" "⏳ Waiting for container to start, attempt $attempt/$max_attempts"
        sleep 10
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log "ERROR" "❌ Container failed to start within timeout"
        return 1
    fi
    
    # Health check endpoint
    local health_url="http://localhost:3000/health"
    attempt=1
    max_attempts=$((timeout / 5))
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec "$container_name" curl -f "$health_url" >/dev/null 2>&1; then
            log "INFO" "✅ Health check passed for $service_name"
            return 0
        fi
        
        log "INFO" "⏳ Health check failed, attempt $attempt/$max_attempts"
        sleep 5
        ((attempt++))
    done
    
    log "ERROR" "❌ Health check failed for $service_name"
    return 1
}

# Run deployment tests
run_deployment_tests() {
    local service_name="$1"
    
    log "INFO" "🧪 Running deployment tests for $service_name..."
    
    local container_name="${service_name}_discord-reminder-bot_1"
    
    # Test database connectivity
    if docker exec "$container_name" node -e "
        const db = require('./dist/db/index.js');
        db.testConnection().then(() => {
            console.log('Database connection test passed');
            process.exit(0);
        }).catch(e => {
            console.error('Database connection test failed:', e.message);
            process.exit(1);
        });
    " >/dev/null 2>&1; then
        log "INFO" "✅ Database connectivity test passed"
    else
        log "ERROR" "❌ Database connectivity test failed"
        return 1
    fi
    
    # Test Redis connectivity
    if docker exec "${service_name}_redis_1" redis-cli ping >/dev/null 2>&1; then
        log "INFO" "✅ Redis connectivity test passed"
    else
        log "ERROR" "❌ Redis connectivity test failed"
        return 1
    fi
    
    # Test API endpoints
    local api_endpoints=("/health" "/api/metrics/realtime")
    for endpoint in "${api_endpoints[@]}"; do
        if docker exec "$container_name" curl -f "http://localhost:3000$endpoint" >/dev/null 2>&1; then
            log "INFO" "✅ API endpoint test passed: $endpoint"
        else
            log "ERROR" "❌ API endpoint test failed: $endpoint"
            return 1
        fi
    done
    
    log "INFO" "✅ All deployment tests passed"
    return 0
}

# Switch traffic to new service
switch_traffic() {
    local new_active_service="$1"
    local old_active_service=$(get_active_service)
    
    log "INFO" "🔄 Switching traffic from $old_active_service to $new_active_service"
    
    # Update load balancer or proxy configuration
    # This is a placeholder - implement based on your load balancer
    # Examples:
    # - Update nginx configuration
    # - Update cloud load balancer target groups
    # - Update DNS records
    
    # For Docker Compose, we'll update port mapping
    docker-compose -p "$old_active_service" stop discord-reminder-bot
    
    # Update active service
    echo "$new_active_service" > "$ACTIVE_SERVICE_FILE"
    
    # Verify traffic switch
    sleep 10
    if health_check_service "$new_active_service" 60; then
        log "INFO" "✅ Traffic successfully switched to $new_active_service"
        
        # Clean up old service
        log "INFO" "🧹 Cleaning up old service: $old_active_service"
        docker-compose -p "$old_active_service" down
        
        return 0
    else
        log "ERROR" "❌ Traffic switch verification failed"
        return 1
    fi
}

# Rollback deployment
rollback_deployment() {
    log "INFO" "🔙 Starting deployment rollback..."
    
    local active_service=$(get_active_service)
    local rollback_service=$(get_inactive_service)
    
    # Check if rollback service exists
    if docker ps --filter "name=${rollback_service}_discord-reminder-bot_1" | grep -q "$rollback_service"; then
        log "INFO" "📦 Rolling back to previous service: $rollback_service"
        switch_traffic "$rollback_service"
    else
        # Restore from backup
        if [ -f "$PROJECT_ROOT/.last-backup" ]; then
            local backup_file=$(cat "$PROJECT_ROOT/.last-backup")
            
            if [ -f "$backup_file" ]; then
                log "INFO" "📦 Restoring from backup: $backup_file"
                
                # Stop current services
                docker-compose down
                
                # Restore from backup
                tar -xzf "$backup_file" -C "$PROJECT_ROOT"
                
                # Start services
                docker-compose up -d
                
                # Health check
                if health_check_service "discord-reminder-bot" 120; then
                    log "INFO" "✅ Rollback completed successfully"
                else
                    log "ERROR" "❌ Rollback health check failed"
                    exit 1
                fi
            else
                log "ERROR" "❌ Backup file not found: $backup_file"
                exit 1
            fi
        else
            log "ERROR" "❌ No backup available for rollback"
            exit 1
        fi
    fi
}

# Post-deployment tasks
post_deployment_tasks() {
    log "INFO" "📋 Running post-deployment tasks..."
    
    # Update deployment record
    local deployment_record="$PROJECT_ROOT/logs/deployments.json"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Create deployment record
    cat >> "$deployment_record" << JSON
{
    "timestamp": "$timestamp",
    "image_tag": "$IMAGE_TAG",
    "active_service": "$(get_active_service)",
    "deployment_duration": "$(date +%s)",
    "status": "success"
},
JSON

    # Clean up old Docker images
    log "INFO" "🧹 Cleaning up old Docker images..."
    docker image prune -f >/dev/null 2>&1 || true
    
    # Enable enhanced monitoring
    if [ -f "$PROJECT_ROOT/monitoring/scripts/enable-enhanced-monitoring.sh" ]; then
        log "INFO" "📊 Enabling enhanced monitoring..."
        "$PROJECT_ROOT/monitoring/scripts/enable-enhanced-monitoring.sh" 24h || true
    fi
    
    log "INFO" "✅ Post-deployment tasks completed"
}

# Main deployment function
main_deployment() {
    local deployment_start_time=$(date +%s)
    
    log "INFO" "🚀 Starting production deployment..."
    log "INFO" "   Environment: $DEPLOYMENT_ENV"
    log "INFO" "   Image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    log "INFO" "   Active service: $(get_active_service)"
    log "INFO" "   Target service: $(get_inactive_service)"
    
    # Pre-deployment steps
    pre_deployment_checks
    create_deployment_backup
    pull_latest_image
    
    # Blue-Green deployment
    local inactive_service=$(get_inactive_service)
    deploy_to_inactive
    
    # Health checks and testing
    if health_check_service "$inactive_service"; then
        log "INFO" "✅ Health checks passed"
    else
        log "ERROR" "❌ Health checks failed"
        exit 1
    fi
    
    if run_deployment_tests "$inactive_service"; then
        log "INFO" "✅ Deployment tests passed"
    else
        log "ERROR" "❌ Deployment tests failed"
        exit 1
    fi
    
    # Traffic switch
    switch_traffic "$inactive_service"
    
    # Post-deployment tasks
    post_deployment_tasks
    
    # Calculate deployment duration
    local deployment_end_time=$(date +%s)
    local deployment_duration=$((deployment_end_time - deployment_start_time))
    
    log "INFO" "🎉 Production deployment completed successfully!"
    log "INFO" "   Duration: ${deployment_duration}s"
    log "INFO" "   Active service: $(get_active_service)"
    
    return 0
}

# Command line interface
case "${1:-deploy}" in
    "deploy")
        main_deployment
        ;;
    "rollback")
        rollback_deployment
        ;;
    "health-check")
        health_check_service "${2:-$(get_active_service)}"
        ;;
    "switch-traffic")
        [ -z "${2:-}" ] && { echo "Usage: $0 switch-traffic <service-name>"; exit 1; }
        switch_traffic "$2"
        ;;
    "status")
        echo "Active service: $(get_active_service)"
        echo "Inactive service: $(get_inactive_service)"
        ;;
    "help"|*)
        cat << EOF
Production Deployment Script

Usage: $0 [command] [options]

Commands:
  deploy              Perform blue-green production deployment (default)
  rollback            Rollback to previous deployment
  health-check [svc]  Run health check on service
  switch-traffic SVC  Switch traffic to specified service
  status              Show current deployment status
  help                Show this help message

Environment Variables:
  DEPLOYMENT_ENV         Deployment environment (default: production)
  IMAGE_TAG             Docker image tag (default: latest)
  REGISTRY              Docker registry (default: ghcr.io)
  IMAGE_NAME            Docker image name (default: discord-reminder-bot)
  HEALTH_CHECK_TIMEOUT  Health check timeout in seconds (default: 300)
  ROLLBACK_ENABLED      Enable automatic rollback (default: true)

Examples:
  $0 deploy                    # Deploy latest image
  IMAGE_TAG=v1.2.3 $0 deploy  # Deploy specific version
  $0 rollback                 # Rollback deployment
  $0 health-check             # Check active service health
  $0 status                   # Show deployment status

EOF
        ;;
esac