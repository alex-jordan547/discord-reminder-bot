#!/bin/bash
# Discord Reminder Bot - Simple Health Monitor
# ===========================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTAINER_NAME="discord-reminder-bot"
LOG_FILE="$PROJECT_DIR/logs/monitor.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "[$(date +'%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    echo -e "${RED}[ALERT]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

mkdir -p "$(dirname "$LOG_FILE")"

# Check container status
check_container() {
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        success "Container running"
        return 0
    else
        alert "Container not running!"
        return 1
    fi
}

# Check resources
check_resources() {
    if ! check_container; then
        return 1
    fi
    
    local stats=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}")
    local cpu=$(echo "$stats" | awk '{print $1}')
    local mem=$(echo "$stats" | awk '{print $2}')
    
    log "CPU: $cpu, Memory: $mem"
    
    # Alert if CPU > 80%
    local cpu_num=$(echo "$cpu" | sed 's/%//')
    if (( $(echo "$cpu_num > 80" | bc -l 2>/dev/null || echo 0) )); then
        alert "High CPU: $cpu"
    fi
}

# Check logs for errors
check_logs() {
    if ! check_container; then
        return 1
    fi
    
    local errors=$(docker logs "$CONTAINER_NAME" --since "5m" 2>&1 | grep -i error | wc -l)
    
    if (( errors > 0 )); then
        alert "$errors errors in logs (last 5min)"
    else
        log "No recent errors"
    fi
}

# Check health endpoint
check_health() {
    if ! check_container; then
        return 1
    fi
    
    if docker exec "$CONTAINER_NAME" curl -f http://localhost:3000/health >/dev/null 2>&1; then
        success "Health endpoint OK"
    else
        alert "Health endpoint failed"
    fi
}

# Single health check
single_check() {
    log "Running health check..."
    
    check_container || return 1
    check_resources
    check_logs
    check_health
    
    success "Health check completed"
}





# Main
case "${1:-}" in
    --check|-c|"")
        single_check
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --check, -c    Health check (default)"
        echo "  --help, -h     Show help"
        ;;
    *)
        echo "Unknown option: $1"
        exit 1
        ;;
esac
