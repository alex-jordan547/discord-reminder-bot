#!/bin/bash

# Discord Reminder Bot - Health Monitoring Script
# ===============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTAINER_NAME="discord-reminder-bot"
LOG_FILE="$PROJECT_DIR/logs/health-monitor.log"
ALERT_LOG="$PROJECT_DIR/logs/alerts.log"

# Configuration
CHECK_INTERVAL=300  # 5 minutes
MAX_CPU_THRESHOLD=80
MAX_MEMORY_MB=400
MAX_RESTARTS=5
MONITORING_DURATION=172800  # 48 hours in seconds

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

alert() {
    echo -e "${RED}[ALERT]${NC} $1" | tee -a "$ALERT_LOG" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if container is running
check_container_status() {
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        return 0
    else
        return 1
    fi
}

# Get container stats
get_container_stats() {
    if check_container_status; then
        docker stats "$CONTAINER_NAME" --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"
    else
        echo "Container not running"
    fi
}

# Check resource usage
check_resources() {
    if ! check_container_status; then
        alert "Container is not running!"
        return 1
    fi

    local stats=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}")
    local cpu_percent=$(echo "$stats" | awk '{print $1}' | sed 's/%//')
    local memory_usage=$(echo "$stats" | awk '{print $2}' | sed 's/MiB.*//')

    # Check CPU usage
    if (( $(echo "$cpu_percent > $MAX_CPU_THRESHOLD" | bc -l) )); then
        alert "High CPU usage: ${cpu_percent}% (threshold: ${MAX_CPU_THRESHOLD}%)"
    fi

    # Check memory usage
    if (( $(echo "$memory_usage > $MAX_MEMORY_MB" | bc -l) )); then
        alert "High memory usage: ${memory_usage}MB (threshold: ${MAX_MEMORY_MB}MB)"
    fi

    log "Resources - CPU: ${cpu_percent}%, Memory: ${memory_usage}MB"
}

# Check container restarts
check_restarts() {
    if check_container_status; then
        local restart_count=$(docker inspect "$CONTAINER_NAME" --format='{{.RestartCount}}')
        if (( restart_count > MAX_RESTARTS )); then
            alert "High restart count: $restart_count (threshold: $MAX_RESTARTS)"
        else
            log "Restart count: $restart_count"
        fi
    fi
}

# Check logs for errors
check_logs() {
    if check_container_status; then
        local error_count=$(docker logs "$CONTAINER_NAME" --since "${CHECK_INTERVAL}s" 2>&1 | grep -i error | wc -l)
        local warning_count=$(docker logs "$CONTAINER_NAME" --since "${CHECK_INTERVAL}s" 2>&1 | grep -i warning | wc -l)

        if (( error_count > 0 )); then
            alert "Found $error_count errors in logs in the last $CHECK_INTERVAL seconds"
        fi

        if (( warning_count > 5 )); then
            warning "Found $warning_count warnings in logs in the last $CHECK_INTERVAL seconds"
        fi

        log "Log check - Errors: $error_count, Warnings: $warning_count"
    fi
}

# Network connectivity check
check_network() {
    if check_container_status; then
        # Simple network check - verify container can resolve DNS
        if docker exec "$CONTAINER_NAME" nslookup discord.com >/dev/null 2>&1; then
            success "Network connectivity OK"
        else
            alert "Network connectivity issue detected"
        fi
    fi
}

# Database health check
check_database() {
    if [[ -f "$PROJECT_DIR/discord_bot.db" ]]; then
        local db_size=$(stat -f%z "$PROJECT_DIR/discord_bot.db" 2>/dev/null || stat -c%s "$PROJECT_DIR/discord_bot.db" 2>/dev/null)
        log "Database size: $((db_size / 1024))KB"

        # Check if database file is accessible
        if sqlite3 "$PROJECT_DIR/discord_bot.db" "SELECT COUNT(*) FROM sqlite_master;" >/dev/null 2>&1; then
            success "Database health OK"
        else
            alert "Database integrity issue detected"
        fi
    else
        warning "Database file not found"
    fi
}

# Discord API status check (simplified)
check_discord_api() {
    local discord_status=$(curl -s -o /dev/null -w "%{http_code}" "https://discord.com/api/v10/gateway" || echo "000")
    if [[ "$discord_status" == "200" ]]; then
        success "Discord API accessible"
    else
        warning "Discord API status: $discord_status"
    fi
}

# Generate health report
generate_report() {
    local report_file="$PROJECT_DIR/logs/health-report-$(date +%Y%m%d_%H%M%S).txt"

    cat > "$report_file" << EOF
Discord Reminder Bot - Health Report
Generated: $(date)
Monitoring Duration: $((MONITORING_DURATION / 3600)) hours

=== Container Status ===
$(get_container_stats)

=== Recent Logs (last 50 lines) ===
$(docker logs "$CONTAINER_NAME" --tail 50 2>&1)

=== System Resources ===
$(df -h "$PROJECT_DIR")
$(free -h 2>/dev/null || vm_stat)

=== Alert Summary ===
$(tail -20 "$ALERT_LOG" 2>/dev/null || echo "No alerts found")

EOF

    log "Health report generated: $report_file"
}

# Main monitoring loop
start_monitoring() {
    log "Starting 48-hour health monitoring..."
    log "Check interval: ${CHECK_INTERVAL}s, Duration: $((MONITORING_DURATION / 3600))h"

    local start_time=$(date +%s)
    local check_count=0

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if (( elapsed >= MONITORING_DURATION )); then
            success "48-hour monitoring completed successfully!"
            generate_report
            break
        fi

        ((check_count++))
        log "Health check #$check_count ($(date +%H:%M:%S)) - Elapsed: $((elapsed / 3600))h $((elapsed % 3600 / 60))m"

        check_container_status || alert "Container status check failed"
        check_resources
        check_restarts
        check_logs
        check_network
        check_database
        check_discord_api

        log "Health check completed. Next check in ${CHECK_INTERVAL}s"
        sleep "$CHECK_INTERVAL"
    done
}

# One-time health check
single_check() {
    log "Performing single health check..."

    if check_container_status; then
        success "Container is running"
        get_container_stats
        check_resources
        check_restarts
        check_logs
        check_network
        check_database
        check_discord_api
    else
        alert "Container is not running!"
        exit 1
    fi
}

# Load test simulation
load_test() {
    log "Starting load test simulation..."

    if ! check_container_status; then
        error "Container not running"
        exit 1
    fi

    log "Monitoring resource usage during load test..."

    # Run for 10 minutes, checking every 30 seconds
    for i in {1..20}; do
        log "Load test check $i/20"
        get_container_stats
        check_resources
        sleep 30
    done

    success "Load test completed"
    generate_report
}

# Main function
main() {
    mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$ALERT_LOG")"

    case "${1:-}" in
        --start|-s)
            start_monitoring
            ;;
        --check|-c)
            single_check
            ;;
        --load-test|-lt)
            load_test
            ;;
        --report|-r)
            generate_report
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --start, -s        Start 48-hour monitoring"
            echo "  --check, -c        Perform single health check"
            echo "  --load-test, -lt   Run load test simulation"
            echo "  --report, -r       Generate health report"
            echo "  --help, -h         Show this help"
            ;;
        *)
            single_check
            ;;
    esac
}

main "$@"
