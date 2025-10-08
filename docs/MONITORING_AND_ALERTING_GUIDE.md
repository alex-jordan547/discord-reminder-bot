# Monitoring and Alerting Guide

## Overview

This guide provides comprehensive instructions for setting up, configuring, and managing monitoring and alerting systems for the Discord Reminder Bot and its monitoring dashboard. The system includes health checks, performance monitoring, alerting, and integration with external monitoring services.

## Architecture Overview

### Monitoring Components

1. **Health Monitoring**: Continuous health checks for all system components
2. **Performance Monitoring**: Real-time metrics collection and analysis
3. **Alerting System**: Multi-channel alert notifications
4. **External Integrations**: Prometheus, uptime monitoring, and webhooks
5. **Reporting**: Automated weekly and monthly reports

### Monitoring Stack

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Health Checks │    │ Performance     │    │   Alerting      │
│   - Docker      │    │ Monitoring      │    │   - Email       │
│   - Database    │    │ - CPU/Memory    │    │   - Webhooks    │
│   - Dashboard   │    │ - Disk/Network  │    │   - Logs        │
│   - API         │    │ - App Metrics   │    │   - External    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Monitoring    │
                    │   Dashboard     │
                    │   - Status      │
                    │   - Metrics     │
                    │   - Reports     │
                    └─────────────────┘
```

## Quick Setup

### Automated Setup

Run the monitoring setup script to configure everything automatically:

```bash
# Navigate to project root
cd /path/to/discord-reminder-bot

# Run setup script
./scripts/setup-monitoring.sh

# Install cron jobs
crontab monitoring/config/monitoring-cron

# Optional: Install systemd service
sudo cp monitoring/config/discord-bot-monitor.service /etc/systemd/system/
sudo systemctl enable discord-bot-monitor
sudo systemctl start discord-bot-monitor
```

### Manual Setup

If you prefer manual configuration:

```bash
# Create monitoring structure
mkdir -p monitoring/{scripts,config,alerts,health-checks,dashboards}
mkdir -p logs/monitoring

# Copy monitoring scripts
cp scripts/setup-monitoring.sh .
./scripts/setup-monitoring.sh
```

## Health Monitoring

### Health Check Components

The health monitoring system checks:

1. **Docker Containers**: All required containers running and healthy
2. **Database Connectivity**: PostgreSQL and SQLite fallback
3. **Cache Connectivity**: Redis availability
4. **API Endpoints**: Dashboard and API response
5. **WebSocket**: Real-time communication
6. **System Resources**: Memory, CPU, disk usage
7. **Application Process**: Main bot process status

### Health Check Script

The main health check script (`monitoring/scripts/health-check.sh`) performs comprehensive checks:

```bash
# Run health check manually
./monitoring/scripts/health-check.sh

# Check health check logs
tail -f logs/monitoring/health-check.log

# View latest health report
ls -la logs/monitoring/health-report-*.json | tail -1
```

### Health Check Configuration

```bash
# Environment variables for health checks
export DASHBOARD_URL="http://localhost:3000"
export ALERT_THRESHOLD="3"
export ALERT_EMAIL="admin@yourcompany.com"
export ALERT_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
```

### Health Check Results

Health checks generate:

- **Log Files**: Detailed check results in `logs/monitoring/health-check.log`
- **JSON Reports**: Structured data in `logs/monitoring/health-report-*.json`
- **Exit Codes**: 0 for success, non-zero for failures
- **Alerts**: Triggered when failure threshold exceeded

## Performance Monitoring

### Metrics Collection

The performance monitoring system collects:

#### System Metrics
- **CPU Usage**: Current processor utilization
- **Memory Usage**: RAM consumption and availability
- **Disk Usage**: Storage utilization and I/O
- **Network**: Connection counts and throughput

#### Application Metrics
- **Response Times**: API and dashboard response latency
- **Active Connections**: WebSocket and HTTP connections
- **Database Performance**: Query times and connection counts
- **Error Rates**: Application errors and failures

#### Custom Metrics
- **Bot-specific**: Discord API calls, events processed
- **Business Logic**: Reminders sent, reactions tracked
- **User Activity**: Commands executed, active guilds

### Performance Monitoring Script

```bash
# Run performance monitoring manually
./monitoring/scripts/performance-monitor.sh

# View performance logs
tail -f logs/monitoring/performance.log

# Check daily metrics
cat logs/monitoring/metrics-$(date +%Y%m%d).json | jq '.'
```

### Metrics Storage

Metrics are stored in multiple formats:

```json
{
    "timestamp": "2024-09-09T10:30:00Z",
    "system": {
        "cpu_percent": 25.5,
        "memory": {
            "used_mb": 1024,
            "total_mb": 4096,
            "percent": 25.0
        },
        "disk": {
            "used_gb": 15,
            "total_gb": 50,
            "percent": 30.0
        }
    },
    "application": {
        "active_connections": 12,
        "database_connections": 5,
        "response_time_ms": 150,
        "error_rate": 0.01
    }
}
```

## Alerting System

### Alert Types and Thresholds

#### System Alerts
```yaml
alerts:
  high_memory_usage:
    threshold: 85%
    severity: warning
    
  critical_memory_usage:
    threshold: 95%
    severity: critical
    
  high_cpu_usage:
    threshold: 80%
    severity: warning
    
  high_disk_usage:
    threshold: 90%
    severity: warning
```

#### Application Alerts
```yaml
alerts:
  dashboard_down:
    check: "curl -f http://localhost:3000/health"
    severity: critical
    
  database_down:
    check: "pg_isready"
    severity: critical
    
  slow_response:
    threshold: 5000ms
    severity: warning
    
  high_error_rate:
    threshold: 10 errors/5min
    severity: warning
```

### Notification Channels

#### Email Notifications
```bash
# Configure email alerts
export ALERT_EMAIL_ENABLED=true
export ALERT_EMAIL_SMTP_HOST="smtp.yourcompany.com"
export ALERT_EMAIL_SMTP_PORT=587
export ALERT_EMAIL_USER="alerts@yourcompany.com"
export ALERT_EMAIL_PASSWORD="smtp_password"
export ALERT_EMAIL_TO="admin@yourcompany.com,ops@yourcompany.com"
```

#### Webhook Notifications (Slack/Teams)
```bash
# Configure webhook alerts
export ALERT_WEBHOOK_ENABLED=true
export ALERT_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
export ALERT_WEBHOOK_CHANNEL="#alerts"
```

#### Custom Integrations
```bash
# PagerDuty integration
export PAGERDUTY_INTEGRATION_KEY="your_integration_key"

# Monitoring service webhooks
export MONITORING_WEBHOOK_URL="https://your-monitoring-service.com/webhook"
```

### Alert Handling

#### Alert Handler Script
```bash
# Test alert handler
./monitoring/scripts/alert-handler.sh "test_alert" "Test message" "warning"

# Send critical alert
./monitoring/scripts/alert-handler.sh "system_failure" "Database connection lost" "critical"
```

#### Alert Escalation
```bash
# Configure escalation levels
export ALERT_ESCALATION_LEVEL_1="team@yourcompany.com"
export ALERT_ESCALATION_LEVEL_2="manager@yourcompany.com"
export ALERT_ESCALATION_LEVEL_3="cto@yourcompany.com"
export ALERT_ESCALATION_TIMEOUT=1800  # 30 minutes
```

## External Monitoring Integration

### Prometheus Integration

#### Metrics Export
```bash
# Start Prometheus metrics exporter
./monitoring/scripts/prometheus-exporter.sh

# Metrics available at http://localhost:9090/metrics
curl http://localhost:9090/metrics
```

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'discord-bot'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 30s
    metrics_path: /metrics
```

#### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "Discord Reminder Bot Monitoring",
    "panels": [
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "discord_bot_memory_usage_percent"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph", 
        "targets": [
          {
            "expr": "discord_bot_response_time_seconds"
          }
        ]
      }
    ]
  }
}
```

### Uptime Monitoring Services

#### Uptimerobot Integration
```bash
# Configure uptime monitoring
export UPTIME_PING_URL="https://uptimerobot.com/ping/your-monitor-id"

# Run uptime ping
./monitoring/scripts/uptime-ping.sh
```

#### Pingdom Integration
```bash
# Configure Pingdom webhook
export PINGDOM_WEBHOOK_URL="https://webhooks.pingdom.com/your-webhook"

# Custom uptime check
curl -X POST "$PINGDOM_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"status": "up", "response_time": 150}'
```

### APM Integration

#### New Relic
```bash
# Install New Relic agent
npm install newrelic

# Configure New Relic
export NEW_RELIC_LICENSE_KEY="your_license_key"
export NEW_RELIC_APP_NAME="Discord Reminder Bot"
export NEW_RELIC_LOG_LEVEL="info"
```

#### Datadog
```bash
# Configure Datadog
export DD_API_KEY="your_api_key"
export DD_SERVICE="discord-reminder-bot"
export DD_ENV="production"
export DD_VERSION="2.0.0"
```

## Monitoring Dashboard

### Built-in Dashboard

Access the monitoring dashboard at:
- **URL**: `http://localhost:3000/monitoring` (when implemented)
- **Status Page**: `monitoring/dashboards/status.html`

### Dashboard Features

1. **Real-time Status**: Live system status indicators
2. **Metrics Visualization**: Charts and graphs for key metrics
3. **Alert History**: Recent alerts and their status
4. **System Information**: Hardware and software details
5. **Performance Trends**: Historical performance data

### Custom Dashboard

Create custom monitoring views:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Custom Bot Monitor</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div id="status-overview">
        <!-- Status cards -->
    </div>
    
    <div id="metrics-charts">
        <canvas id="memory-chart"></canvas>
        <canvas id="response-time-chart"></canvas>
    </div>
    
    <script>
        // Fetch metrics and update charts
        async function updateDashboard() {
            const response = await fetch('/api/metrics/realtime');
            const data = await response.json();
            
            // Update charts with data
            updateCharts(data);
        }
        
        setInterval(updateDashboard, 30000);
    </script>
</body>
</html>
```

## Log Management

### Log Rotation

Configure log rotation to prevent disk space issues:

```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/discord-bot << EOF
/app/logs/monitoring/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

### Log Analysis

#### Search and Filter Logs
```bash
# Search for errors in the last hour
grep -i error logs/monitoring/*.log | grep "$(date +%Y-%m-%d\ %H)"

# Count alerts by severity
grep -o -E "(CRITICAL|WARNING|ERROR)" logs/monitoring/alerts.log | sort | uniq -c

# Performance issues
grep "slow\|timeout\|high" logs/monitoring/performance.log | tail -20
```

#### Log Aggregation
```bash
# Send logs to external aggregation service
tail -f logs/monitoring/*.log | while read line; do
    curl -X POST "https://your-log-service.com/api/logs" \
         -H "Content-Type: application/json" \
         -d "{\"message\":\"$line\",\"service\":\"discord-bot\"}"
done
```

## Automated Reporting

### Weekly Reports

Weekly reports are automatically generated and include:

- System performance summary
- Alert frequency and types
- Resource usage trends
- Recommendations for improvements

```bash
# Generate weekly report manually
./monitoring/scripts/weekly-report.sh

# View latest weekly report
cat logs/monitoring/reports/weekly-report-$(date +%Y%W).md
```

### Monthly Analysis

```bash
# Generate monthly analysis
./monitoring/scripts/monthly-analysis.sh

# Key metrics included:
# - Average uptime percentage
# - Resource usage patterns
# - Performance trends
# - Incident summary
# - Capacity planning recommendations
```

### Custom Reports

Create custom reporting scripts:

```bash
#!/bin/bash
# custom-report.sh

# Calculate average response time for last 24 hours
avg_response=$(grep "response_time" logs/monitoring/metrics-$(date +%Y%m%d).json | \
               jq -r '.application.response_time_ms' | \
               awk '{sum+=$1; count++} END {print sum/count}')

echo "Average response time (24h): ${avg_response}ms"

# Alert summary
critical_alerts=$(grep -c "CRITICAL" logs/monitoring/alerts.log || echo "0")
warning_alerts=$(grep -c "WARNING" logs/monitoring/alerts.log || echo "0")

echo "Alerts: $critical_alerts critical, $warning_alerts warnings"
```

## Troubleshooting Monitoring

### Common Issues

#### Health Checks Failing
```bash
# Debug health check issues
./monitoring/scripts/health-check.sh --debug

# Check individual components
docker-compose ps
curl -v http://localhost:3000/health
docker exec discord-bot-postgres pg_isready
```

#### Missing Metrics
```bash
# Check metrics collection
./monitoring/scripts/performance-monitor.sh --verbose

# Verify file permissions
ls -la logs/monitoring/
chmod 755 logs/monitoring/
```

#### Alerts Not Sending
```bash
# Test alert system
./monitoring/scripts/alert-handler.sh "test" "Test alert" "warning"

# Check email configuration
echo "Test message" | mail -s "Test" "$ALERT_EMAIL"

# Test webhook
curl -X POST "$ALERT_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"text":"Test webhook"}'
```

### Monitoring the Monitoring

Monitor the monitoring system itself:

```bash
# Check monitoring system health
ps aux | grep -E "(health-check|performance-monitor)"

# Verify cron jobs are running
crontab -l
grep "health-check" /var/log/cron

# Monitor monitoring resource usage
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | grep monitoring
```

## Security Considerations

### Secure Configuration

1. **Credentials**: Store sensitive credentials securely
2. **Access Control**: Limit access to monitoring data
3. **Encryption**: Encrypt sensitive monitoring data
4. **Audit Logging**: Log all monitoring system access

### Network Security

```bash
# Restrict monitoring ports
sudo ufw allow from 192.168.1.0/24 to any port 9090
sudo ufw deny 9090

# Use VPN for remote monitoring access
# Configure monitoring behind reverse proxy with authentication
```

### Data Privacy

- Anonymize user data in metrics
- Comply with data retention policies
- Secure backup of monitoring data
- Regular security audits of monitoring infrastructure

## Best Practices

### Performance Optimization

1. **Efficient Metrics Collection**: Collect only necessary metrics
2. **Batch Processing**: Process metrics in batches
3. **Compression**: Compress historical data
4. **Retention Policies**: Implement data retention policies

### Reliability

1. **Redundancy**: Multiple monitoring paths
2. **Failover**: Backup monitoring systems
3. **Self-Monitoring**: Monitor the monitoring system
4. **Documentation**: Keep procedures current

### Operational Excellence

1. **Regular Reviews**: Weekly monitoring reviews
2. **Threshold Tuning**: Adjust alert thresholds based on patterns
3. **Automation**: Automate routine monitoring tasks
4. **Training**: Ensure team knows monitoring procedures

---

This monitoring and alerting guide provides comprehensive coverage for maintaining visibility into your Discord Reminder Bot system. Regular use of these monitoring tools ensures optimal performance, quick issue resolution, and reliable service availability.

For additional guidance, refer to:
- [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md)
- [Production Configuration Guide](PRODUCTION_CONFIGURATION_GUIDE.md)
- [Database Administrator Guide](DATABASE_ADMINISTRATOR_GUIDE.md)