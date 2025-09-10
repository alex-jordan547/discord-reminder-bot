# Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide covers common issues, diagnostic procedures, and resolution steps for the Discord Reminder Bot and its monitoring dashboard. Issues are organized by component and severity level.

## Quick Diagnosis Tools

### System Health Check
```bash
# Quick system overview
docker compose ps
curl -f http://localhost:3000/health
docker stats --no-stream

# Check logs for errors
docker compose logs --since 1h | grep -i error
docker compose logs --since 1h | grep -i warning
```

### Service Status Commands
```bash
# Check all services
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# Check specific service health
docker inspect discord-reminder-bot | grep -A 5 Health
docker inspect discord-bot-postgres | grep -A 5 Health
docker inspect discord-bot-redis | grep -A 5 Health
```

## Dashboard Issues

### Dashboard Won't Load

#### Symptoms
- Browser shows "connection refused" or "site can't be reached"
- Dashboard loads but shows blank page
- Loading spinner appears indefinitely

#### Diagnosis
```bash
# Check if container is running
docker compose ps discord-reminder-bot

# Check application logs
docker compose logs discord-reminder-bot

# Test local connectivity
curl -v http://localhost:3000/health
telnet localhost 3000

# Check if process is listening
docker exec discord-reminder-bot netstat -tlnp | grep 3000
```

#### Resolution Steps
1. **Container Not Running:**
   ```bash
   # Start the service
   docker compose up -d discord-reminder-bot
   
   # Check startup logs
   docker compose logs -f discord-reminder-bot
   ```

2. **Port Binding Issues:**
   ```bash
   # Check if port is already in use
   sudo netstat -tlnp | grep 3000
   
   # Kill conflicting process
   sudo kill -9 $(sudo lsof -t -i:3000)
   
   # Restart service
   docker compose restart discord-reminder-bot
   ```

3. **Application Startup Errors:**
   ```bash
   # Check environment variables
   docker exec discord-reminder-bot env | grep -E "DISCORD_TOKEN|DATABASE|DASHBOARD"
   
   # Verify configuration
   docker exec discord-reminder-bot cat .env
   
   # Check file permissions
   docker exec discord-reminder-bot ls -la
   ```

### Dashboard Shows "No Data" or Empty Charts

#### Symptoms
- Dashboard loads but charts are empty
- Metrics show "No data available"
- Real-time updates not working

#### Diagnosis
```bash
# Check WebSocket connection
docker compose logs discord-reminder-bot | grep -i websocket

# Test API endpoints
curl http://localhost:3000/api/metrics/realtime
curl http://localhost:3000/api/metrics/history

# Check database connectivity
docker exec discord-reminder-bot node -e "
const db = require('./dist/db/index.js');
db.testConnection().then(r => console.log('DB OK:', r)).catch(e => console.log('DB ERROR:', e));
"
```

#### Resolution Steps
1. **WebSocket Connection Issues:**
   ```bash
   # Check WebSocket server status
   docker compose logs discord-reminder-bot | grep -i "websocket\|socket.io"
   
   # Restart service to reset connections
   docker compose restart discord-reminder-bot
   
   # Check browser developer tools for WebSocket errors
   # (Open browser dev tools -> Network tab -> WS filter)
   ```

2. **Database Connection Problems:**
   ```bash
   # Test PostgreSQL connection
   docker exec discord-bot-postgres pg_isready -U bot_user -d discord_bot
   
   # Test from application container
   docker exec discord-reminder-bot psql -h postgres -U bot_user -d discord_bot -c "SELECT 1;"
   
   # Check SQLite fallback
   docker exec discord-reminder-bot sqlite3 data/discord_bot.db ".tables"
   ```

3. **Missing Metrics Data:**
   ```bash
   # Check if monitoring service is collecting data
   docker compose logs discord-reminder-bot | grep -i "metrics\|monitoring"
   
   # Verify data exists in database
   docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
     SELECT count(*) FROM metrics_history WHERE created_at > NOW() - INTERVAL '1 hour';
   "
   
   # Force metrics collection
   curl -X POST http://localhost:3000/api/metrics/refresh
   ```

### Real-time Updates Not Working

#### Symptoms
- Data appears but doesn't update automatically
- Charts remain static
- Connection status shows "Disconnected"

#### Diagnosis
```bash
# Check WebSocket server logs
docker compose logs discord-reminder-bot | grep -i websocket

# Test WebSocket connection manually
wscat -c ws://localhost:3000/socket.io/?EIO=4&transport=websocket

# Check browser network connectivity
# (Browser dev tools -> Network -> WebSocket)
```

#### Resolution Steps
1. **Browser Issues:**
   - Clear browser cache and cookies
   - Disable browser extensions
   - Try incognito/private mode
   - Check browser console for JavaScript errors

2. **Network/Proxy Issues:**
   ```bash
   # Check if proxy is blocking WebSocket
   # Add to nginx.conf if using nginx:
   location /socket.io/ {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```

3. **Server-side Issues:**
   ```bash
   # Restart WebSocket server
   docker compose restart discord-reminder-bot
   
   # Check memory usage (WebSocket connections use memory)
   docker stats discord-reminder-bot
   
   # Check connection limits
   docker exec discord-reminder-bot netstat -an | grep :3000 | wc -l
   ```

## Database Issues

### Database Connection Failures

#### Symptoms
- "Database connection failed" errors
- Application fails to start
- Dashboard shows database as disconnected

#### Diagnosis
```bash
# Check PostgreSQL status
docker compose ps postgres
docker compose logs postgres

# Test connection manually
docker exec discord-bot-postgres pg_isready -U bot_user -d discord_bot

# Check network connectivity
docker exec discord-reminder-bot nc -zv postgres 5432

# Check authentication
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT version();"
```

#### Resolution Steps
1. **PostgreSQL Service Issues:**
   ```bash
   # Check if PostgreSQL is running
   docker compose ps postgres
   
   # Restart PostgreSQL
   docker compose restart postgres
   
   # Check PostgreSQL logs for errors
   docker compose logs postgres | grep -i error
   
   # Verify data directory permissions
   docker exec postgres ls -la /var/lib/postgresql/data
   ```

2. **Authentication Problems:**
   ```bash
   # Verify environment variables
   docker exec postgres env | grep POSTGRES
   
   # Reset PostgreSQL password
   docker exec -it postgres psql -U postgres -c "
     ALTER USER bot_user WITH PASSWORD 'new_secure_password';
   "
   
   # Update application environment
   # Edit .env file with new password
   docker compose restart discord-reminder-bot
   ```

3. **Network Connectivity:**
   ```bash
   # Check Docker network
   docker network ls
   docker network inspect discord-reminder-bot_bot-network
   
   # Test inter-container connectivity
   docker exec discord-reminder-bot ping postgres
   docker exec discord-reminder-bot nslookup postgres
   
   # Recreate network if needed
   docker compose down
   docker compose up -d
   ```

### Slow Database Performance

#### Symptoms
- Dashboard loads slowly
- API requests timeout
- High database response times

#### Diagnosis
```bash
# Check database performance
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
  SELECT query, calls, total_time, mean_time 
  FROM pg_stat_statements 
  ORDER BY total_time DESC 
  LIMIT 10;
"

# Check active connections
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
  SELECT count(*) as connections, state 
  FROM pg_stat_activity 
  GROUP BY state;
"

# Check database size
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
  SELECT pg_size_pretty(pg_database_size('discord_bot'));
"

# Check system resources
docker stats discord-bot-postgres
```

#### Resolution Steps
1. **Query Optimization:**
   ```bash
   # Add missing indexes
   docker exec discord-reminder-bot node scripts/add-indexes.js
   
   # Analyze query performance
   docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
     EXPLAIN ANALYZE SELECT * FROM events WHERE created_at > NOW() - INTERVAL '24 hours';
   "
   
   # Update table statistics
   docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "ANALYZE;"
   ```

2. **Database Maintenance:**
   ```bash
   # Vacuum database
   docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "VACUUM ANALYZE;"
   
   # Clean up old data
   docker exec discord-reminder-bot node scripts/cleanup-logs.js --days 30
   
   # Restart PostgreSQL
   docker compose restart postgres
   ```

3. **Resource Allocation:**
   ```bash
   # Increase PostgreSQL memory in docker-compose.yml
   # Change memory limit from 256M to 512M
   
   # Restart with new limits
   docker compose up -d postgres
   
   # Monitor performance improvement
   docker stats postgres
   ```

### Data Corruption or Integrity Issues

#### Symptoms
- Database integrity check failures
- Missing or corrupted data
- Application errors during data access

#### Diagnosis
```bash
# Check PostgreSQL integrity
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
  SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, n_dead_tup
  FROM pg_stat_user_tables;
"

# Check SQLite integrity (if using fallback)
docker exec discord-reminder-bot sqlite3 data/discord_bot.db "PRAGMA integrity_check;"

# Check for recent errors
docker compose logs --since 24h | grep -i "corrupt\|integrity\|constraint"
```

#### Resolution Steps
1. **Stop Services Immediately:**
   ```bash
   # Stop application to prevent further corruption
   docker compose stop discord-reminder-bot
   
   # Create emergency backup
   docker exec discord-bot-postgres pg_dump -U bot_user discord_bot > emergency_backup.sql
   tar -czf emergency_backup.tar.gz volumes/postgres data/
   ```

2. **Restore from Backup:**
   ```bash
   # List available backups
   ls -la backups/
   
   # Restore from most recent backup
   docker compose down
   tar -xzf backups/backup-20240901-120000.tar.gz
   docker compose up -d postgres
   
   # Wait for PostgreSQL to start
   docker exec discord-bot-postgres pg_isready -U bot_user -d discord_bot
   
   # Verify restored data
   docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM events;"
   ```

3. **Investigate Root Cause:**
   ```bash
   # Check system logs for hardware issues
   sudo dmesg | grep -i error
   
   # Check disk space and health
   df -h
   sudo smartctl -a /dev/sda
   
   # Review application logs for patterns
   grep -i "error\|exception" logs/*.log | tail -100
   ```

## Application Issues

### Bot Not Responding to Discord Commands

#### Symptoms
- Bot appears online but doesn't respond to commands
- Commands work intermittently
- Bot shows as offline in Discord

#### Diagnosis
```bash
# Check bot connection status
docker compose logs discord-reminder-bot | grep -i "discord\|login\|ready"

# Check Discord API connectivity
docker exec discord-reminder-bot curl -s https://discord.com/api/v10/gateway

# Verify bot token
docker exec discord-reminder-bot node -e "
console.log('Token length:', process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 'undefined');
"

# Check command registration
docker exec discord-reminder-bot node -e "
const client = require('./dist/bot.js');
// Check if commands are registered
"
```

#### Resolution Steps
1. **Token Issues:**
   ```bash
   # Verify token in environment
   docker exec discord-reminder-bot env | grep DISCORD_TOKEN
   
   # Test token validity
   curl -H "Authorization: Bot YOUR_TOKEN_HERE" https://discord.com/api/v10/users/@me
   
   # Update token if needed
   # Edit .env file and restart
   docker compose restart discord-reminder-bot
   ```

2. **Permission Issues:**
   - Check bot permissions in Discord server settings
   - Verify bot has required intents enabled
   - Ensure bot role is high enough in role hierarchy

3. **Application Errors:**
   ```bash
   # Check for uncaught exceptions
   docker compose logs discord-reminder-bot | grep -i "uncaught\|unhandled"
   
   # Check memory usage
   docker stats discord-reminder-bot
   
   # Restart if needed
   docker compose restart discord-reminder-bot
   ```

### High Memory Usage or Memory Leaks

#### Symptoms
- Container memory usage continuously increasing
- Application becomes unresponsive
- Out of memory errors in logs

#### Diagnosis
```bash
# Monitor memory usage over time
docker stats discord-reminder-bot --no-stream

# Check for memory leaks in logs
docker compose logs discord-reminder-bot | grep -i "memory\|heap\|gc"

# Check Node.js memory usage
docker exec discord-reminder-bot node -e "
console.log('Memory usage:', process.memoryUsage());
console.log('Uptime:', process.uptime());
"

# Check for long-running operations
docker exec discord-reminder-bot ps aux
```

#### Resolution Steps
1. **Immediate Relief:**
   ```bash
   # Restart application to free memory
   docker compose restart discord-reminder-bot
   
   # Increase memory limit temporarily
   # Edit docker-compose.yml memory limit
   docker compose up -d discord-reminder-bot
   ```

2. **Investigation:**
   ```bash
   # Enable Node.js heap profiling
   # Add --inspect flag to start command
   # Use Chrome DevTools for heap analysis
   
   # Check for unclosed connections
   docker exec discord-reminder-bot netstat -an | grep ESTABLISHED | wc -l
   
   # Review recent code changes
   git log --oneline --since="1 week ago"
   ```

3. **Long-term Fix:**
   ```bash
   # Implement memory monitoring
   # Add memory alerts to monitoring system
   
   # Review and optimize code
   # Add garbage collection logging
   # Implement connection pooling
   ```

## Network and Connectivity Issues

### External API Connectivity Problems

#### Symptoms
- Discord API timeouts
- External service failures
- Network-related errors in logs

#### Diagnosis
```bash
# Test Discord API connectivity
docker exec discord-reminder-bot curl -I https://discord.com/api/v10/gateway

# Check DNS resolution
docker exec discord-reminder-bot nslookup discord.com

# Test network connectivity
docker exec discord-reminder-bot ping -c 4 8.8.8.8

# Check proxy settings
docker exec discord-reminder-bot env | grep -i proxy
```

#### Resolution Steps
1. **Network Configuration:**
   ```bash
   # Check Docker network settings
   docker network inspect discord-reminder-bot_bot-network
   
   # Test external connectivity
   docker exec discord-reminder-bot curl -I https://httpbin.org/ip
   
   # Configure DNS if needed
   # Add to docker-compose.yml:
   dns:
     - 8.8.8.8
     - 8.8.4.4
   ```

2. **Firewall and Proxy:**
   ```bash
   # Check firewall rules
   sudo ufw status
   
   # Configure proxy if needed
   # Add to docker-compose.yml environment:
   - HTTP_PROXY=http://proxy:8080
   - HTTPS_PROXY=http://proxy:8080
   ```

### Internal Service Communication Issues

#### Symptoms
- Services can't communicate with each other
- Database connection failures
- Redis connection errors

#### Diagnosis
```bash
# Test inter-service connectivity
docker exec discord-reminder-bot ping postgres
docker exec discord-reminder-bot ping redis

# Check service discovery
docker exec discord-reminder-bot nslookup postgres
docker exec discord-reminder-bot nslookup redis

# Test port connectivity
docker exec discord-reminder-bot nc -zv postgres 5432
docker exec discord-reminder-bot nc -zv redis 6379
```

#### Resolution Steps
1. **Network Troubleshooting:**
   ```bash
   # Recreate Docker network
   docker compose down
   docker network prune
   docker compose up -d
   
   # Check network configuration
   docker network inspect discord-reminder-bot_bot-network
   ```

2. **Service Dependencies:**
   ```bash
   # Check service startup order
   docker compose config
   
   # Verify depends_on configuration
   # Ensure health checks are working
   docker compose ps
   ```

## Performance Issues

### Slow Response Times

#### Symptoms
- Dashboard loads slowly
- API requests take too long
- Chart updates are delayed

#### Diagnosis
```bash
# Check system resources
docker stats --no-stream

# Test API response times
time curl http://localhost:3000/api/metrics/realtime

# Check database query performance
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
  SELECT query, mean_time, calls 
  FROM pg_stat_statements 
  WHERE mean_time > 100 
  ORDER BY mean_time DESC;
"

# Check application logs for slow operations
docker compose logs discord-reminder-bot | grep -i "slow\|timeout\|delay"
```

#### Resolution Steps
1. **Database Optimization:**
   ```bash
   # Add database indexes
   docker exec discord-reminder-bot node scripts/add-indexes.js
   
   # Optimize queries
   docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "VACUUM ANALYZE;"
   
   # Increase connection pool size
   # Edit application configuration
   ```

2. **Application Optimization:**
   ```bash
   # Enable caching
   # Configure Redis for better performance
   
   # Optimize chart data
   # Reduce data points for better rendering
   
   # Enable compression
   # Add gzip compression for API responses
   ```

3. **System Resources:**
   ```bash
   # Increase memory limits
   # Edit docker-compose.yml resource limits
   
   # Check disk I/O
   iostat -x 1 5
   
   # Optimize storage
   # Move to SSD storage if using HDD
   ```

## Recovery Procedures

### Emergency Recovery

#### Complete System Failure
```bash
#!/bin/bash
# emergency-recovery.sh

echo "Starting emergency recovery..."

# Stop all services
docker compose down

# Restore from latest backup
LATEST_BACKUP=$(ls -t backups/backup-*.tar.gz | head -1)
echo "Restoring from: $LATEST_BACKUP"
tar -xzf "$LATEST_BACKUP"

# Start infrastructure services first
docker compose up -d postgres redis

# Wait for services to be healthy
echo "Waiting for infrastructure services..."
timeout 300 bash -c 'until docker compose ps | grep -E "(postgres|redis).*healthy"; do sleep 5; done'

# Start main application
docker compose up -d discord-reminder-bot

# Wait for application to be ready
echo "Waiting for application..."
timeout 300 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'

echo "Emergency recovery complete!"
```

#### Data Recovery
```bash
#!/bin/bash
# data-recovery.sh

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

echo "Recovering data from: $BACKUP_FILE"

# Stop application
docker compose stop discord-reminder-bot

# Backup current state
tar -czf "pre-recovery-$(date +%Y%m%d-%H%M%S).tar.gz" volumes/postgres data/

# Restore database
if [[ "$BACKUP_FILE" == *.sql ]]; then
    # SQL backup
    docker exec -i discord-bot-postgres psql -U bot_user -d discord_bot < "$BACKUP_FILE"
elif [[ "$BACKUP_FILE" == *.tar.gz ]]; then
    # Full backup
    docker compose down postgres
    tar -xzf "$BACKUP_FILE" volumes/postgres/
    docker compose up -d postgres
fi

# Verify restoration
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM events;"

# Restart application
docker compose up -d discord-reminder-bot

echo "Data recovery complete!"
```

### Health Check Automation

#### Automated Monitoring Script
```bash
#!/bin/bash
# health-monitor.sh

ALERT_EMAIL="admin@yourcompany.com"
LOG_FILE="/var/log/discord-bot-health.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

check_service() {
    local service="$1"
    if ! docker compose ps | grep -q "$service.*healthy\|$service.*Up"; then
        log "ALERT: Service $service is not healthy"
        return 1
    fi
    return 0
}

check_dashboard() {
    if ! curl -f http://localhost:3000/health >/dev/null 2>&1; then
        log "ALERT: Dashboard health check failed"
        return 1
    fi
    return 0
}

check_disk_space() {
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$usage" -gt 90 ]; then
        log "ALERT: Disk usage is ${usage}%"
        return 1
    fi
    return 0
}

# Main health check
main() {
    local failed=0
    
    log "Starting health check..."
    
    check_service "postgres" || failed=$((failed + 1))
    check_service "redis" || failed=$((failed + 1))
    check_service "discord-reminder-bot" || failed=$((failed + 1))
    check_dashboard || failed=$((failed + 1))
    check_disk_space || failed=$((failed + 1))
    
    if [ $failed -eq 0 ]; then
        log "All health checks passed"
    else
        log "Health check failed: $failed issues detected"
        # Send alert email here
    fi
    
    return $failed
}

main "$@"
```

---

This troubleshooting guide provides comprehensive diagnostic and resolution procedures for common issues. Keep this guide updated as new issues are discovered and resolved.

For additional support:
- Check the [Architecture Documentation](ARCHITECTURE.md) for system design details
- Review [Database Administrator Guide](DATABASE_ADMINISTRATOR_GUIDE.md) for database-specific issues
- Consult [Docker Deployment Guide](DOCKER_DEPLOYMENT_GUIDE.md) for deployment-related problems