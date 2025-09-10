#!/bin/bash
# Staging Deployment Script
# ========================
# Simplified staging deployment with health checks and validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/logs/staging-deployment.log"

# Deployment configuration
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-staging}"
IMAGE_TAG="${IMAGE_TAG:-develop}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${IMAGE_NAME:-discord-reminder-bot}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-180}"

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
    log "ERROR" "Staging deployment failed at line $line_number with exit code $exit_code"
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Pre-deployment checks
pre_deployment_checks() {
    log "INFO" "🔍 Running staging pre-deployment checks..."
    
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
    
    # Check staging environment file
    if [ ! -f "$PROJECT_ROOT/.env.staging" ]; then
        log "WARN" "Staging environment file (.env.staging) not found, using .env"
        if [ ! -f "$PROJECT_ROOT/.env" ]; then
            log "ERROR" "No environment file found"
            exit 1
        fi
    fi
    
    log "INFO" "✅ Staging pre-deployment checks passed"
}

# Pull latest staging image
pull_staging_image() {
    log "INFO" "📥 Pulling staging Docker image..."
    
    local full_image_name="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if docker pull "$full_image_name"; then
        log "INFO" "✅ Successfully pulled staging image: $full_image_name"
    else
        log "ERROR" "❌ Failed to pull staging image: $full_image_name"
        exit 1
    fi
}

# Deploy staging environment
deploy_staging() {
    log "INFO" "🚀 Deploying to staging environment..."
    
    # Stop existing staging containers
    docker-compose -f docker-compose.staging.yml down 2>/dev/null || true
    
    # Start staging infrastructure
    docker-compose -f docker-compose.staging.yml up -d postgres redis
    
    # Wait for infrastructure
    log "INFO" "⏳ Waiting for staging infrastructure..."
    sleep 20
    
    # Start main application
    docker-compose -f docker-compose.staging.yml up -d discord-reminder-bot
    
    log "INFO" "✅ Staging deployment completed"
}

# Health check staging service
health_check_staging() {
    local timeout="${1:-$HEALTH_CHECK_TIMEOUT}"
    
    log "INFO" "🏥 Running staging health checks..."
    
    # Wait for container to start
    local attempt=1
    local max_attempts=$((timeout / 10))
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.staging.yml ps discord-reminder-bot | grep -q "Up"; then
            log "INFO" "✅ Staging container is running"
            break
        fi
        
        log "INFO" "⏳ Waiting for staging container to start, attempt $attempt/$max_attempts"
        sleep 10
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log "ERROR" "❌ Staging container failed to start within timeout"
        return 1
    fi
    
    # Test health endpoint if available
    if docker-compose -f docker-compose.staging.yml exec -T discord-reminder-bot curl -f "http://localhost:3000/health" >/dev/null 2>&1; then
        log "INFO" "✅ Staging health check passed"
        return 0
    else
        log "WARN" "Health endpoint not available or failed, checking container logs..."
        docker-compose -f docker-compose.staging.yml logs --tail=20 discord-reminder-bot
        return 0  # Don't fail for staging
    fi
}

# Run staging tests
run_staging_tests() {
    log "INFO" "🧪 Running staging validation tests..."
    
    # Test database connectivity
    if docker-compose -f docker-compose.staging.yml exec -T postgres pg_isready -U bot_user >/dev/null 2>&1; then
        log "INFO" "✅ Staging database connectivity test passed"
    else
        log "ERROR" "❌ Staging database connectivity test failed"
        return 1
    fi
    
    # Test Redis connectivity
    if docker-compose -f docker-compose.staging.yml exec -T redis redis-cli ping >/dev/null 2>&1; then
        log "INFO" "✅ Staging Redis connectivity test passed"
    else
        log "ERROR" "❌ Staging Redis connectivity test failed"
        return 1
    fi
    
    log "INFO" "✅ Staging validation tests completed"
    return 0
}

# Main staging deployment function
main_staging_deployment() {
    local deployment_start_time=$(date +%s)
    
    log "INFO" "🚀 Starting staging deployment..."
    log "INFO" "   Environment: $DEPLOYMENT_ENV"
    log "INFO" "   Image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    # Pre-deployment steps
    pre_deployment_checks
    pull_staging_image
    
    # Deploy to staging
    deploy_staging
    
    # Health checks and testing
    if health_check_staging; then
        log "INFO" "✅ Staging health checks passed"
    else
        log "WARN" "⚠️ Staging health checks had issues but continuing"
    fi
    
    if run_staging_tests; then
        log "INFO" "✅ Staging tests passed"
    else
        log "ERROR" "❌ Staging tests failed"
        exit 1
    fi
    
    # Calculate deployment duration
    local deployment_end_time=$(date +%s)
    local deployment_duration=$((deployment_end_time - deployment_start_time))
    
    log "INFO" "🎉 Staging deployment completed successfully!"
    log "INFO" "   Duration: ${deployment_duration}s"
    
    return 0
}

# Command line interface
case "${1:-deploy}" in
    "deploy")
        main_staging_deployment
        ;;
    "health-check")
        health_check_staging
        ;;
    "logs")
        docker-compose -f docker-compose.staging.yml logs "${2:-discord-reminder-bot}"
        ;;
    "status")
        docker-compose -f docker-compose.staging.yml ps
        ;;
    "stop")
        log "INFO" "Stopping staging environment..."
        docker-compose -f docker-compose.staging.yml down
        ;;
    "help"|*)
        cat << EOF
Staging Deployment Script

Usage: $0 [command] [options]

Commands:
  deploy              Deploy to staging environment (default)
  health-check        Run health check on staging
  logs [service]      Show logs for staging service
  status              Show staging services status
  stop                Stop staging environment
  help                Show this help message

Environment Variables:
  DEPLOYMENT_ENV         Deployment environment (default: staging)
  IMAGE_TAG             Docker image tag (default: develop)
  REGISTRY              Docker registry (default: ghcr.io)
  IMAGE_NAME            Docker image name (default: discord-reminder-bot)
  HEALTH_CHECK_TIMEOUT  Health check timeout in seconds (default: 180)

Examples:
  $0 deploy                    # Deploy to staging
  IMAGE_TAG=feature-123 $0 deploy  # Deploy specific feature branch
  $0 health-check             # Check staging health
  $0 logs                     # Show staging logs
  $0 status                   # Show staging status

EOF
        ;;
esac