#!/bin/bash
# Monitoring and Alerting Setup Script
# =====================================
# This script sets up comprehensive monitoring and alerting for the Discord Reminder Bot dashboard

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MONITORING_DIR="$PROJECT_ROOT/monitoring"
LOG_FILE="$PROJECT_ROOT/logs/monitoring-setup.log"

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

log "INFO" "🚀 Starting monitoring and alerting setup..."

# Create monitoring directory structure
create_monitoring_structure() {
    log "INFO" "📁 Creating monitoring directory structure..."
    
    mkdir -p "$MONITORING_DIR"/{scripts,config,alerts,health-checks,dashboards}
    mkdir -p "$PROJECT_ROOT/logs/monitoring"
    
    log "INFO" "✅ Monitoring structure created"
}

# Install monitoring dependencies
install_dependencies() {
    log "INFO" "📦 Installing monitoring dependencies..."
    
    # Check if running as root for system-wide installs
    if [ "$EUID" -eq 0 ]; then
        log "WARN" "Running as root - installing system-wide monitoring tools"
        
        # Install system monitoring tools
        if command -v apt >/dev/null 2>&1; then
            apt update
            apt install -y curl jq netcat-openbsd htop iotop
        elif command -v yum >/dev/null 2>&1; then
            yum install -y curl jq nc htop iotop
        fi
    else
        log "INFO" "Running as non-root user - checking available tools"
    fi
    
    # Check required tools
    local required_tools=("curl" "jq" "docker" "docker-compose")
    local missing_tools=()
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        log "ERROR" "Missing required tools: ${missing_tools[*]}"
        log "ERROR" "Please install missing tools and run again"
        exit 1
    fi
    
    log "INFO" "✅ All required tools are available"
}

# Create health check scripts
create_health_checks() {
    log "INFO" "🏥 Creating health check scripts..."
    
    # Main health check script
    cat > "$MONITORING_DIR/scripts/health-check.sh" << 'EOF'
#!/bin/bash
# Comprehensive health check for Discord Reminder Bot

set -euo pipefail

# Configuration
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
LOG_FILE="/app/logs/monitoring/health-check.log"
ALERT_THRESHOLD="${ALERT_THRESHOLD:-3}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

# Metrics
declare -A METRICS
METRICS[checks_total]=0
METRICS[checks_passed]=0
METRICS[checks_failed]=0

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

# Check function template
check() {
    local name="$1"
    local command="$2"
    local timeout="${3:-30}"
    
    METRICS[checks_total]=$((METRICS[checks_total] + 1))
    
    log "INFO" "🔍 Checking: $name"
    
    if timeout "$timeout" bash -c "$command" >/dev/null 2>&1; then
        log "INFO" "✅ $name: OK"
        METRICS[checks_passed]=$((METRICS[checks_passed] + 1))
        return 0
    else
        log "ERROR" "❌ $name: FAILED"
        METRICS[checks_failed]=$((METRICS[checks_failed] + 1))
        return 1
    fi
}

# Health checks
perform_health_checks() {
    log "INFO" "Starting health checks..."
    
    # Docker container health
    check "Docker containers" "docker-compose ps | grep -E '(postgres|redis|discord-reminder-bot).*Up'"
    
    # Database connectivity
    check "PostgreSQL" "docker exec discord-bot-postgres pg_isready -U bot_user -d discord_bot"
    
    # Redis connectivity
    check "Redis" "docker exec discord-bot-redis redis-cli ping | grep PONG"
    
    # Dashboard endpoint
    check "Dashboard health" "curl -f $DASHBOARD_URL/health"
    
    # API endpoints
    check "API metrics" "curl -f $DASHBOARD_URL/api/metrics/realtime"
    
    # WebSocket connectivity
    check "WebSocket" "curl -f $DASHBOARD_URL/socket.io/?EIO=4&transport=polling"
    
    # Disk space
    check "Disk space" "[[ \$(df / | awk 'NR==2 {print \$5}' | sed 's/%//') -lt 90 ]]"
    
    # Memory usage
    check "Memory usage" "[[ \$(free | awk '/^Mem:/ {printf \"%.0f\", \$3/\$2*100}') -lt 90 ]]"
    
    # Process check
    check "Main process" "docker exec discord-reminder-bot pgrep -f 'node.*dist/index.js'"
}

# Generate health report
generate_report() {
    local total=${METRICS[checks_total]}
    local passed=${METRICS[checks_passed]}
    local failed=${METRICS[checks_failed]}
    local success_rate=$((passed * 100 / total))
    
    log "INFO" "📊 Health Check Summary:"
    log "INFO" "   Total checks: $total"
    log "INFO" "   Passed: $passed"
    log "INFO" "   Failed: $failed"
    log "INFO" "   Success rate: $success_rate%"
    
    # Create JSON report
    local report_file="/app/logs/monitoring/health-report-$(date +%Y%m%d-%H%M%S).json"
    cat > "$report_file" << JSON
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "summary": {
        "total_checks": $total,
        "passed": $passed,
        "failed": $failed,
        "success_rate": $success_rate
    },
    "status": "$( [ $failed -eq 0 ] && echo "healthy" || echo "degraded" )"
}
JSON
    
    # Alert if too many failures
    if [ $failed -ge $ALERT_THRESHOLD ]; then
        log "WARN" "🚨 Health check failures exceed threshold ($failed >= $ALERT_THRESHOLD)"
        send_alert "Health check failures: $failed/$total checks failed"
    fi
}

# Send alert
send_alert() {
    local message="$1"
    log "WARN" "📢 Sending alert: $message"
    
    # Email alert (if configured)
    if [ -n "$ALERT_EMAIL" ]; then
        echo "Discord Bot Health Alert: $message" | mail -s "Health Alert" "$ALERT_EMAIL" || true
    fi
    
    # Webhook alert (if configured)
    if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
        curl -X POST "$ALERT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"🚨 Discord Bot Alert: $message\"}" || true
    fi
    
    # Log alert
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ): $message" >> /app/logs/monitoring/alerts.log
}

# Main execution
main() {
    log "INFO" "🏥 Starting health check at $(date)"
    
    perform_health_checks
    generate_report
    
    log "INFO" "🏁 Health check completed"
    
    # Exit with failure code if any checks failed
    exit ${METRICS[checks_failed]}
}

main "$@"
EOF

    # Performance monitoring script
    cat > "$MONITORING_DIR/scripts/performance-monitor.sh" << 'EOF'
#!/bin/bash
# Performance monitoring for Discord Reminder Bot

set -euo pipefail

LOG_FILE="/app/logs/monitoring/performance.log"
METRICS_FILE="/app/logs/monitoring/metrics-$(date +%Y%m%d).json"

# Logging function
log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $*" | tee -a "$LOG_FILE"
}

# Collect system metrics
collect_system_metrics() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    
    # Memory usage
    local memory_info=$(free -m | awk 'NR==2{printf "%.0f %.0f %.2f", $3,$2,$3*100/$2}')
    read -r mem_used mem_total mem_percent <<< "$memory_info"
    
    # Disk usage
    local disk_info=$(df / | awk 'NR==2{printf "%.0f %.0f %.2f", $3,$2,$3*100/$2}')
    read -r disk_used disk_total disk_percent <<< "$disk_info"
    
    # Docker container stats
    local container_stats=$(docker stats --no-stream --format "{{.Container}},{{.CPUPerc}},{{.MemUsage}}" | grep discord-reminder-bot)
    
    # Network connections
    local connections=$(netstat -an | grep :3000 | wc -l)
    
    # Database metrics
    local db_connections=0
    if docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM pg_stat_activity;" >/dev/null 2>&1; then
        db_connections=$(docker exec discord-bot-postgres psql -U bot_user -d discord_bot -t -c "SELECT count(*) FROM pg_stat_activity;" | xargs)
    fi
    
    # Create metrics JSON
    cat >> "$METRICS_FILE" << JSON
{
    "timestamp": "$timestamp",
    "system": {
        "cpu_percent": ${cpu_usage:-0},
        "memory": {
            "used_mb": $mem_used,
            "total_mb": $mem_total,
            "percent": $mem_percent
        },
        "disk": {
            "used_gb": $((disk_used / 1024)),
            "total_gb": $((disk_total / 1024)),
            "percent": $disk_percent
        }
    },
    "application": {
        "active_connections": $connections,
        "database_connections": $db_connections
    }
},
JSON
    
    log "📊 Metrics collected - CPU: ${cpu_usage:-0}%, Memory: ${mem_percent}%, Disk: ${disk_percent}%"
}

# Main execution
main() {
    collect_system_metrics
}

main "$@"
EOF

    # Make scripts executable
    chmod +x "$MONITORING_DIR/scripts/"*.sh
    
    log "INFO" "✅ Health check scripts created"
}

# Create alerting configuration
create_alerting_config() {
    log "INFO" "🔔 Creating alerting configuration..."
    
    # Alert manager configuration
    cat > "$MONITORING_DIR/config/alerts.yml" << 'EOF'
# Alert configuration for Discord Reminder Bot
alerts:
  # System alerts
  high_memory_usage:
    threshold: 85
    severity: warning
    description: "Memory usage is above 85%"
    
  critical_memory_usage:
    threshold: 95
    severity: critical
    description: "Memory usage is above 95%"
    
  high_cpu_usage:
    threshold: 80
    severity: warning
    description: "CPU usage is above 80%"
    
  high_disk_usage:
    threshold: 90
    severity: warning
    description: "Disk usage is above 90%"
    
  # Application alerts
  dashboard_down:
    check: "curl -f http://localhost:3000/health"
    severity: critical
    description: "Dashboard health check failed"
    
  database_down:
    check: "docker exec discord-bot-postgres pg_isready"
    severity: critical
    description: "Database connection failed"
    
  redis_down:
    check: "docker exec discord-bot-redis redis-cli ping"
    severity: warning
    description: "Redis connection failed"
    
  # Performance alerts
  slow_response:
    threshold: 5000
    severity: warning
    description: "API response time above 5 seconds"
    
  many_errors:
    threshold: 10
    window: "5m"
    severity: warning
    description: "High error rate detected"

# Notification channels
notifications:
  email:
    enabled: false
    smtp_server: "smtp.example.com"
    smtp_port: 587
    username: "alerts@example.com"
    password: "password"
    to: ["admin@example.com"]
    
  webhook:
    enabled: false
    url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
    channel: "#alerts"
    
  file:
    enabled: true
    path: "/app/logs/monitoring/alerts.log"
EOF

    # Alert handler script
    cat > "$MONITORING_DIR/scripts/alert-handler.sh" << 'EOF'
#!/bin/bash
# Alert handler for Discord Reminder Bot monitoring

set -euo pipefail

ALERT_TYPE="$1"
ALERT_MESSAGE="$2"
ALERT_SEVERITY="${3:-info}"

ALERT_LOG="/app/logs/monitoring/alerts.log"
CONFIG_FILE="/app/monitoring/config/alerts.yml"

# Logging
log_alert() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[$timestamp] [$ALERT_SEVERITY] $ALERT_TYPE: $ALERT_MESSAGE" >> "$ALERT_LOG"
}

# Send email alert
send_email() {
    local subject="Discord Bot Alert: $ALERT_TYPE"
    local body="Alert: $ALERT_MESSAGE\nSeverity: $ALERT_SEVERITY\nTime: $(date)"
    
    if [ -n "${ALERT_EMAIL:-}" ]; then
        echo -e "$body" | mail -s "$subject" "$ALERT_EMAIL"
    fi
}

# Send webhook alert
send_webhook() {
    if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
        local emoji="ℹ️"
        case "$ALERT_SEVERITY" in
            warning) emoji="⚠️" ;;
            critical) emoji="🚨" ;;
            error) emoji="❌" ;;
        esac
        
        curl -X POST "$ALERT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$emoji Discord Bot Alert: $ALERT_MESSAGE\"}" \
            >/dev/null 2>&1 || true
    fi
}

# Main execution
main() {
    log_alert
    
    case "$ALERT_SEVERITY" in
        critical|error)
            send_email
            send_webhook
            ;;
        warning)
            send_webhook
            ;;
    esac
}

main "$@"
EOF

    chmod +x "$MONITORING_DIR/scripts/alert-handler.sh"
    
    log "INFO" "✅ Alerting configuration created"
}

# Create monitoring dashboard
create_monitoring_dashboard() {
    log "INFO" "📊 Creating monitoring dashboard..."
    
    # Simple HTML dashboard
    cat > "$MONITORING_DIR/dashboards/status.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Bot Monitoring</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .status-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .status-ok { background-color: #d4edda; border-color: #c3e6cb; }
        .status-warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .status-error { background-color: #f8d7da; border-color: #f5c6cb; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .metric { text-align: center; padding: 10px; background: #f8f9fa; border-radius: 5px; }
        #refresh-btn { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Discord Reminder Bot - System Status</h1>
    
    <button id="refresh-btn" onclick="refreshStatus()">Refresh Status</button>
    
    <div id="status-container">
        <!-- Status will be loaded here -->
    </div>
    
    <h2>System Metrics</h2>
    <div id="metrics-container" class="metrics">
        <!-- Metrics will be loaded here -->
    </div>
    
    <h2>Recent Alerts</h2>
    <div id="alerts-container">
        <!-- Alerts will be loaded here -->
    </div>

    <script>
        async function refreshStatus() {
            try {
                // Fetch health status
                const healthResponse = await fetch('/health');
                const healthData = await healthResponse.json();
                
                // Fetch metrics
                const metricsResponse = await fetch('/api/metrics/realtime');
                const metricsData = await metricsResponse.json();
                
                updateStatusDisplay(healthData, metricsData);
            } catch (error) {
                console.error('Failed to refresh status:', error);
                document.getElementById('status-container').innerHTML = 
                    '<div class="status-card status-error">Failed to load status</div>';
            }
        }
        
        function updateStatusDisplay(health, metrics) {
            const statusContainer = document.getElementById('status-container');
            const metricsContainer = document.getElementById('metrics-container');
            
            // Update status
            statusContainer.innerHTML = `
                <div class="status-card ${health.status === 'ok' ? 'status-ok' : 'status-error'}">
                    <h3>Overall Status: ${health.status}</h3>
                    <p>Last check: ${new Date().toLocaleString()}</p>
                </div>
            `;
            
            // Update metrics
            if (metrics) {
                metricsContainer.innerHTML = `
                    <div class="metric">
                        <h4>Memory</h4>
                        <div>${metrics.system?.memory?.percentage || 'N/A'}%</div>
                    </div>
                    <div class="metric">
                        <h4>CPU</h4>
                        <div>${metrics.system?.cpu?.percentage || 'N/A'}%</div>
                    </div>
                    <div class="metric">
                        <h4>Uptime</h4>
                        <div>${formatUptime(metrics.system?.uptime || 0)}</div>
                    </div>
                    <div class="metric">
                        <h4>Database</h4>
                        <div>${metrics.database?.connectionStatus || 'Unknown'}</div>
                    </div>
                `;
            }
        }
        
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
        
        // Auto-refresh every 30 seconds
        setInterval(refreshStatus, 30000);
        
        // Initial load
        refreshStatus();
    </script>
</body>
</html>
EOF

    log "INFO" "✅ Monitoring dashboard created"
}

# Create systemd service for monitoring
create_systemd_service() {
    log "INFO" "⚙️ Creating systemd service for monitoring..."
    
    # Monitoring service file
    cat > "$MONITORING_DIR/config/discord-bot-monitor.service" << EOF
[Unit]
Description=Discord Reminder Bot Health Monitor
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$PROJECT_ROOT
ExecStart=$MONITORING_DIR/scripts/health-check.sh
Restart=always
RestartSec=300

# Environment
Environment=DASHBOARD_URL=http://localhost:3000
Environment=ALERT_THRESHOLD=3
Environment=LOG_LEVEL=INFO

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    # Installation instructions
    cat > "$MONITORING_DIR/INSTALL_SERVICE.md" << EOF
# Installing Monitoring Service

To install the monitoring service as a systemd service:

1. Copy the service file:
   sudo cp $MONITORING_DIR/config/discord-bot-monitor.service /etc/systemd/system/

2. Reload systemd:
   sudo systemctl daemon-reload

3. Enable the service:
   sudo systemctl enable discord-bot-monitor

4. Start the service:
   sudo systemctl start discord-bot-monitor

5. Check status:
   sudo systemctl status discord-bot-monitor

6. View logs:
   sudo journalctl -u discord-bot-monitor -f
EOF

    log "INFO" "✅ Systemd service configuration created"
}

# Create cron jobs for monitoring
create_cron_jobs() {
    log "INFO" "⏰ Creating cron jobs for monitoring..."
    
    # Cron configuration
    cat > "$MONITORING_DIR/config/monitoring-cron" << EOF
# Discord Reminder Bot Monitoring Cron Jobs
# Edit this file and install with: crontab monitoring-cron

# Health check every 5 minutes
*/5 * * * * $MONITORING_DIR/scripts/health-check.sh >/dev/null 2>&1

# Performance metrics every minute
* * * * * $MONITORING_DIR/scripts/performance-monitor.sh >/dev/null 2>&1

# Daily log rotation
0 0 * * * find $PROJECT_ROOT/logs/monitoring -name "*.log" -mtime +7 -delete

# Weekly health report
0 9 * * 1 $MONITORING_DIR/scripts/weekly-report.sh
EOF

    # Weekly report script
    cat > "$MONITORING_DIR/scripts/weekly-report.sh" << 'EOF'
#!/bin/bash
# Weekly health report generator

set -euo pipefail

REPORT_DIR="/app/logs/monitoring/reports"
REPORT_FILE="$REPORT_DIR/weekly-report-$(date +%Y%W).md"

mkdir -p "$REPORT_DIR"

# Generate report
cat > "$REPORT_FILE" << REPORT
# Weekly Health Report - Week $(date +%Y-%W)

Generated: $(date)

## Summary

$(find /app/logs/monitoring -name "health-report-*.json" -mtime -7 | wc -l) health checks performed this week.

## System Performance

### Average Resource Usage
- Memory: $(find /app/logs/monitoring -name "metrics-*.json" -mtime -7 -exec jq -r '.system.memory.percent' {} \; | awk '{sum+=$1; count++} END {printf "%.1f%%", sum/count}')
- CPU: $(find /app/logs/monitoring -name "metrics-*.json" -mtime -7 -exec jq -r '.system.cpu_percent' {} \; | awk '{sum+=$1; count++} END {printf "%.1f%%", sum/count}')
- Disk: $(df / | awk 'NR==2 {printf "%.1f%%", $5}')

## Alerts

$(grep -c "CRITICAL\|ERROR" /app/logs/monitoring/alerts.log 2>/dev/null || echo "0") critical alerts this week.

## Recommendations

$([ $(df / | awk 'NR==2 {print $5}' | sed 's/%//') -gt 80 ] && echo "- Consider disk cleanup or expansion")
$([ $(free | awk '/^Mem:/ {printf "%.0f", $3/$2*100}') -gt 80 ] && echo "- Monitor memory usage trends")

REPORT

echo "Weekly report generated: $REPORT_FILE"
EOF

    chmod +x "$MONITORING_DIR/scripts/weekly-report.sh"
    
    log "INFO" "✅ Cron jobs configuration created"
    log "INFO" "📝 To install cron jobs: crontab $MONITORING_DIR/config/monitoring-cron"
}

# Setup external monitoring integrations
setup_external_monitoring() {
    log "INFO" "🌐 Setting up external monitoring integrations..."
    
    # Prometheus metrics exporter
    cat > "$MONITORING_DIR/scripts/prometheus-exporter.sh" << 'EOF'
#!/bin/bash
# Prometheus metrics exporter for Discord Reminder Bot

set -euo pipefail

METRICS_PORT="${PROMETHEUS_PORT:-9090}"
METRICS_FILE="/tmp/discord-bot-metrics.prom"

# Generate Prometheus metrics
generate_metrics() {
    local timestamp=$(date +%s)
    
    # System metrics
    local memory_percent=$(free | awk '/^Mem:/ {printf "%.2f", $3/$2*100}')
    local cpu_percent=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' | sed 's/,//')
    local disk_percent=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    # Application metrics
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/health 2>/dev/null || echo "0")
    local active_connections=$(netstat -an | grep :3000 | wc -l)
    
    # Database metrics
    local db_connections=0
    if docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT 1;" >/dev/null 2>&1; then
        db_connections=$(docker exec discord-bot-postgres psql -U bot_user -d discord_bot -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | xargs || echo "0")
    fi
    
    # Generate metrics file
    cat > "$METRICS_FILE" << METRICS
# HELP discord_bot_memory_usage_percent Memory usage percentage
# TYPE discord_bot_memory_usage_percent gauge
discord_bot_memory_usage_percent $memory_percent

# HELP discord_bot_cpu_usage_percent CPU usage percentage  
# TYPE discord_bot_cpu_usage_percent gauge
discord_bot_cpu_usage_percent ${cpu_percent:-0}

# HELP discord_bot_disk_usage_percent Disk usage percentage
# TYPE discord_bot_disk_usage_percent gauge
discord_bot_disk_usage_percent $disk_percent

# HELP discord_bot_response_time_seconds API response time in seconds
# TYPE discord_bot_response_time_seconds gauge
discord_bot_response_time_seconds $response_time

# HELP discord_bot_active_connections Current active connections
# TYPE discord_bot_active_connections gauge
discord_bot_active_connections $active_connections

# HELP discord_bot_database_connections Current database connections
# TYPE discord_bot_database_connections gauge
discord_bot_database_connections $db_connections

# HELP discord_bot_uptime_seconds Bot uptime in seconds
# TYPE discord_bot_uptime_seconds counter
discord_bot_uptime_seconds $timestamp
METRICS
}

# Serve metrics via HTTP
serve_metrics() {
    while true; do
        generate_metrics
        
        # Simple HTTP server response
        echo -e "HTTP/1.1 200 OK\nContent-Type: text/plain\n\n$(cat $METRICS_FILE)" | nc -l -p $METRICS_PORT -q 1
        
        sleep 1
    done
}

# Main execution
main() {
    echo "Starting Prometheus metrics exporter on port $METRICS_PORT"
    serve_metrics
}

main "$@"
EOF

    chmod +x "$MONITORING_DIR/scripts/prometheus-exporter.sh"
    
    # Uptime monitoring script for external services
    cat > "$MONITORING_DIR/scripts/uptime-ping.sh" << 'EOF'
#!/bin/bash
# Uptime ping for external monitoring services

set -euo pipefail

PING_URL="${UPTIME_PING_URL:-}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"

# Perform health check
if [ -n "$PING_URL" ]; then
    if curl -f "$DASHBOARD_URL/health" >/dev/null 2>&1; then
        # Healthy - ping success URL
        curl -s "$PING_URL" >/dev/null 2>&1 || true
    else
        # Unhealthy - ping failure URL
        curl -s "$PING_URL/fail" >/dev/null 2>&1 || true
    fi
fi
EOF

    chmod +x "$MONITORING_DIR/scripts/uptime-ping.sh"
    
    log "INFO" "✅ External monitoring integrations created"
}

# Create monitoring documentation
create_documentation() {
    log "INFO" "📚 Creating monitoring documentation..."
    
    cat > "$MONITORING_DIR/README.md" << 'EOF'
# Discord Reminder Bot Monitoring

This directory contains monitoring and alerting scripts for the Discord Reminder Bot dashboard.

## Quick Start

1. Run the setup script:
   ```bash
   ./scripts/setup-monitoring.sh
   ```

2. Install cron jobs:
   ```bash
   crontab monitoring/config/monitoring-cron
   ```

3. Install systemd service (optional):
   ```bash
   sudo cp monitoring/config/discord-bot-monitor.service /etc/systemd/system/
   sudo systemctl enable discord-bot-monitor
   sudo systemctl start discord-bot-monitor
   ```

## Scripts

- `health-check.sh` - Comprehensive health checking
- `performance-monitor.sh` - System and application metrics collection
- `alert-handler.sh` - Alert notification handling
- `weekly-report.sh` - Weekly health report generation
- `prometheus-exporter.sh` - Prometheus metrics export
- `uptime-ping.sh` - External uptime monitoring

## Configuration

- `alerts.yml` - Alert thresholds and notification settings
- `monitoring-cron` - Cron job configuration
- `discord-bot-monitor.service` - Systemd service configuration

## Dashboards

- `status.html` - Simple web-based status dashboard

## Log Files

- `/app/logs/monitoring/health-check.log` - Health check results
- `/app/logs/monitoring/performance.log` - Performance metrics
- `/app/logs/monitoring/alerts.log` - Alert notifications
- `/app/logs/monitoring/metrics-YYYYMMDD.json` - Daily metrics data

## External Integrations

### Prometheus
```bash
# Start metrics exporter
./scripts/prometheus-exporter.sh
```

### Uptime Monitoring
```bash
# Configure uptime ping URL
export UPTIME_PING_URL="https://your-monitoring-service.com/ping/your-check-id"
./scripts/uptime-ping.sh
```

## Troubleshooting

### Health Check Fails
1. Check Docker container status: `docker-compose ps`
2. Check application logs: `docker-compose logs discord-reminder-bot`
3. Verify dashboard accessibility: `curl http://localhost:3000/health`

### Alerts Not Working
1. Check alert log: `tail -f /app/logs/monitoring/alerts.log`
2. Verify email/webhook configuration in environment variables
3. Test alert handler: `./scripts/alert-handler.sh test "Test message" warning`

### Missing Metrics
1. Check permissions on log directory: `ls -la /app/logs/monitoring/`
2. Verify cron jobs are running: `crontab -l`
3. Check performance monitor: `./scripts/performance-monitor.sh`

## Customization

### Adding New Health Checks
Edit `scripts/health-check.sh` and add:
```bash
check "Your Check Name" "your-command-here" timeout_seconds
```

### Custom Alerts
Edit `config/alerts.yml` to add new alert rules and thresholds.

### Integration with External Systems
Modify notification functions in `scripts/alert-handler.sh` for your specific needs.
EOF

    log "INFO" "✅ Monitoring documentation created"
}

# Main setup function
main() {
    log "INFO" "🚀 Discord Reminder Bot Monitoring Setup"
    log "INFO" "Project root: $PROJECT_ROOT"
    log "INFO" "Monitoring directory: $MONITORING_DIR"
    
    create_monitoring_structure
    install_dependencies
    create_health_checks
    create_alerting_config
    create_monitoring_dashboard
    create_systemd_service
    create_cron_jobs
    setup_external_monitoring
    create_documentation
    
    log "INFO" "✅ Monitoring setup completed successfully!"
    log "INFO" ""
    log "INFO" "📋 Next Steps:"
    log "INFO" "1. Review and customize configuration files in $MONITORING_DIR/config/"
    log "INFO" "2. Set up environment variables for email/webhook alerts"
    log "INFO" "3. Install cron jobs: crontab $MONITORING_DIR/config/monitoring-cron"
    log "INFO" "4. Optional: Install systemd service for continuous monitoring"
    log "INFO" "5. Test health checks: $MONITORING_DIR/scripts/health-check.sh"
    log "INFO" ""
    log "INFO" "📊 Access monitoring dashboard at: http://localhost:3000 (when running)"
    log "INFO" "📝 View setup log: $LOG_FILE"
}

# Execute main function
main "$@"