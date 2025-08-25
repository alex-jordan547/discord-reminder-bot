# SQLite Migration Deployment Guide

This document provides comprehensive instructions for deploying the SQLite migration for the Discord Reminder Bot.

## Overview

The SQLite migration transforms the bot's data storage from JSON files to a SQLite database with the Pewee ORM. This migration includes:

- **Feature flags system** for progressive activation
- **Automatic fallback** to JSON storage if issues occur
- **Comprehensive monitoring** and alerting
- **Rollback capabilities** for safe deployment

## Prerequisites

### System Requirements

- Python 3.9 or higher
- SQLite 3.x
- Sufficient disk space (at least 100MB free)
- Write permissions in the bot directory

### Environment Variables

Ensure these environment variables are configured:

```bash
# Required
DISCORD_TOKEN=your_discord_bot_token

# SQLite Configuration
USE_SQLITE=true                    # Enable SQLite storage
DATABASE_PATH=discord_bot.db       # SQLite database file path
AUTO_MIGRATE=true                  # Enable automatic migration
BACKUP_JSON_ON_MIGRATION=true     # Backup JSON files during migration

# Feature Flags (Optional)
SQLITE_STORAGE_ENABLED=true       # Enable SQLite storage
SQLITE_MIGRATION_ENABLED=true     # Enable migration features
SQLITE_SCHEDULER_ENABLED=true     # Enable SQLite scheduler
SQLITE_CONCURRENCY_ENABLED=true   # Enable concurrency features
SQLITE_MONITORING_ENABLED=true    # Enable monitoring
SQLITE_BACKUP_ENABLED=true        # Enable backup features

# Safety Features
AUTO_FALLBACK_ENABLED=true        # Enable automatic fallback
DEGRADED_MODE_ENABLED=false       # Start in degraded mode
STRICT_VALIDATION_ENABLED=true    # Enable strict validation

# Monitoring and Alerts (Optional)
ALERT_EMAIL_ENABLED=false         # Enable email alerts
ALERT_SMTP_SERVER=localhost       # SMTP server
ALERT_SMTP_PORT=587               # SMTP port
ALERT_EMAIL_USERNAME=             # SMTP username
ALERT_EMAIL_PASSWORD=             # SMTP password
ALERT_FROM_EMAIL=bot@example.com  # From email address
ALERT_TO_EMAILS=admin@example.com # Alert recipient emails (comma-separated)

ALERT_WEBHOOK_ENABLED=false       # Enable webhook alerts
ALERT_WEBHOOK_URL=                # Webhook URL for alerts
```

## Deployment Methods

### Method 1: Automated Deployment Script

The recommended method uses the automated deployment script:

```bash
# Basic deployment
python scripts/deploy_sqlite_migration.py

# Deployment with custom configuration
python scripts/deploy_sqlite_migration.py --config deployment_config.json

# Dry run (test without making changes)
python scripts/deploy_sqlite_migration.py --dry-run

# Skip pre-deployment checks (not recommended)
python scripts/deploy_sqlite_migration.py --skip-checks

# Deployment without backup (not recommended)
python scripts/deploy_sqlite_migration.py --no-backup
```

#### Deployment Configuration File

Create a `deployment_config.json` file to customize the deployment:

```json
{
  "pre_deployment_checks": true,
  "create_backup": true,
  "enable_monitoring": true,
  "migration_timeout_minutes": 30,
  "health_check_interval_seconds": 10,
  "max_health_check_failures": 3,
  "enable_progressive_rollout": false,
  "rollout_percentage": 100,
  "dry_run": false
}
```

### Method 2: Manual Deployment

For more control over the deployment process:

#### Step 1: Pre-deployment Checks

```bash
# Check environment configuration
python -c "from config.settings import Settings; Settings.validate_required_settings()"

# Test database connectivity
python -c "import sqlite3; conn = sqlite3.connect('test.db'); conn.execute('SELECT 1'); conn.close()"

# Verify feature flags
python test_integration.py
```

#### Step 2: Create Backup

```bash
# Create backup directory
mkdir -p data/backups

# Backup existing JSON files
cp watched_reminders.json data/backups/watched_reminders_$(date +%Y%m%d_%H%M%S).json

# Backup existing SQLite database (if exists)
if [ -f discord_bot.db ]; then
    cp discord_bot.db data/backups/discord_bot_$(date +%Y%m%d_%H%M%S).db
fi
```

#### Step 3: Enable SQLite Features

Set environment variables or update your `.env` file:

```bash
export USE_SQLITE=true
export AUTO_MIGRATE=true
export BACKUP_JSON_ON_MIGRATION=true
```

#### Step 4: Start the Bot

```bash
python bot.py
```

The bot will automatically:
- Initialize the SQLite database
- Migrate existing JSON data
- Enable SQLite features progressively
- Create backups of JSON files

#### Step 5: Verify Deployment

```bash
# Check bot logs for successful migration
tail -f logs/bot_$(date +%Y%m%d).log

# Verify database was created
ls -la discord_bot.db

# Check feature flag status
python -c "
from config.feature_flags import feature_flags
print('SQLite fully enabled:', feature_flags.is_sqlite_fully_enabled())
print('Degraded mode:', feature_flags.is_degraded_mode())
"
```

## Monitoring and Alerting

### Starting Monitoring

```bash
# Start monitoring with default configuration
python scripts/monitoring_alerts.py

# Start monitoring with custom configuration
python scripts/monitoring_alerts.py --config monitoring_config.json

# Monitor for specific duration (in minutes)
python scripts/monitoring_alerts.py --duration 60

# Test alert system
python scripts/monitoring_alerts.py --test-alerts
```

### Monitoring Configuration

Create a `monitoring_config.json` file:

```json
{
  "email": {
    "enabled": true,
    "smtp_server": "smtp.gmail.com",
    "smtp_port": 587,
    "username": "your_email@gmail.com",
    "password": "your_app_password",
    "from_email": "bot@yourcompany.com",
    "to_emails": ["admin@yourcompany.com", "devops@yourcompany.com"],
    "use_tls": true
  },
  "webhook": {
    "enabled": true,
    "url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
    "timeout": 10
  },
  "alert_levels": {
    "email": ["error", "critical"],
    "webhook": ["warning", "error", "critical"],
    "file": ["info", "warning", "error", "critical"],
    "console": ["info", "warning", "error", "critical"]
  }
}
```

### Key Metrics Monitored

- **Feature Flag Status**: Fallbacks and degraded mode
- **Database Health**: Connectivity and integrity
- **Performance**: Response times and query performance
- **System Health**: Component status and errors
- **Migration Status**: Progress and completion

## Rollback Procedures

### Automatic Rollback

The system includes automatic rollback triggers:

- **Health Check Failures**: Multiple consecutive health check failures
- **Critical Errors**: Database corruption or initialization failures
- **Feature Flag Fallbacks**: Critical feature flags entering fallback mode

### Manual Rollback

#### Using Deployment Script

```bash
# Perform rollback using deployment script
python scripts/deploy_sqlite_migration.py --rollback
```

#### Manual Rollback Steps

1. **Stop the Bot**:
   ```bash
   # If running as a service
   sudo systemctl stop discord-bot
   
   # If running in screen/tmux
   # Use Ctrl+C to stop the bot
   ```

2. **Disable SQLite Features**:
   ```bash
   export USE_SQLITE=false
   # or update your .env file
   echo "USE_SQLITE=false" >> .env
   ```

3. **Restore JSON Backup**:
   ```bash
   # Find the most recent backup
   ls -la data/backups/watched_reminders_*.json
   
   # Restore the backup
   cp data/backups/watched_reminders_YYYYMMDD_HHMMSS.json watched_reminders.json
   ```

4. **Remove SQLite Database** (optional):
   ```bash
   # Move database to backup location
   mv discord_bot.db data/backups/discord_bot_rollback_$(date +%Y%m%d_%H%M%S).db
   ```

5. **Restart the Bot**:
   ```bash
   python bot.py
   ```

### Rollback Verification

After rollback, verify the system is working:

```bash
# Check that JSON storage is being used
python -c "
from utils.unified_event_manager import unified_event_manager
import asyncio
async def check():
    await unified_event_manager.initialize()
    print('Using JSON backend:', unified_event_manager.is_using_json())
asyncio.run(check())
"

# Verify bot functionality
# Test Discord commands to ensure the bot is working normally
```

## Troubleshooting

### Common Issues

#### 1. Migration Fails with "Database locked" Error

**Cause**: Another process is accessing the SQLite database.

**Solution**:
```bash
# Check for processes using the database
lsof discord_bot.db

# Kill any processes using the database
# Then restart the migration
```

#### 2. Feature Flags Not Working

**Cause**: Environment variables not properly set.

**Solution**:
```bash
# Check environment variables
env | grep SQLITE

# Verify feature flags are loaded
python -c "from config.feature_flags import feature_flags; print(feature_flags.get_status_summary())"
```

#### 3. JSON Data Not Migrated

**Cause**: JSON file not found or corrupted.

**Solution**:
```bash
# Check if JSON file exists and is valid
python -c "import json; print(json.load(open('watched_reminders.json')))"

# If corrupted, restore from backup
cp data/backups/watched_reminders_*.json watched_reminders.json
```

#### 4. High Memory Usage

**Cause**: Large dataset or memory leak.

**Solution**:
```bash
# Monitor memory usage
top -p $(pgrep -f bot.py)

# Check database size
ls -lh discord_bot.db

# Consider database optimization
sqlite3 discord_bot.db "VACUUM;"
```

### Log Analysis

Check logs for deployment issues:

```bash
# Bot logs
tail -f logs/bot_$(date +%Y%m%d).log

# Deployment logs
ls -la deployment_*.log
tail -f deployment_*.log

# Alert logs
tail -f alerts.log
```

### Getting Help

If you encounter issues:

1. **Check the logs** for error messages
2. **Verify environment variables** are correctly set
3. **Test the integration** using `python test_integration.py`
4. **Review the deployment report** generated by the deployment script
5. **Check system resources** (disk space, memory, CPU)

## Post-Deployment

### Verification Checklist

After successful deployment:

- [ ] Bot starts without errors
- [ ] SQLite database is created and populated
- [ ] Discord commands work normally
- [ ] Event reminders are sent correctly
- [ ] Monitoring is active and alerts are working
- [ ] Backups are created and accessible
- [ ] Performance is acceptable

### Ongoing Maintenance

- **Monitor alerts** regularly for system health
- **Review logs** for any warnings or errors
- **Backup database** regularly
- **Update monitoring configuration** as needed
- **Test rollback procedures** periodically

### Performance Optimization

After deployment, consider these optimizations:

```sql
-- Database optimization queries
PRAGMA optimize;
VACUUM;
REINDEX;

-- Check database statistics
.schema
.tables
.dbinfo
```

## Security Considerations

- **Environment Variables**: Store sensitive configuration in environment variables, not in code
- **File Permissions**: Ensure database and backup files have appropriate permissions
- **Network Security**: If using webhook alerts, ensure URLs are secure
- **Access Control**: Limit access to deployment scripts and configuration files

## Conclusion

The SQLite migration deployment provides a robust, monitored transition from JSON to SQLite storage. The feature flags system and automatic fallback mechanisms ensure a safe deployment with minimal risk of data loss or service interruption.

For additional support or questions, refer to the project documentation or contact the development team.