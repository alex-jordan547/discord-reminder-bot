# SQLite Migration Rollback Guide

This document provides detailed instructions for rolling back the SQLite migration in case of issues or problems during deployment.

## Overview

The rollback process reverts the Discord Reminder Bot from SQLite storage back to JSON file storage. This guide covers both automatic and manual rollback procedures.

## When to Rollback

Consider rollback in these situations:

- **Migration Failures**: Data migration from JSON to SQLite fails
- **Performance Issues**: Significant performance degradation after migration
- **Data Corruption**: Database integrity issues or data loss
- **System Instability**: Bot crashes or unexpected behavior
- **Feature Failures**: Critical features not working properly
- **Monitoring Alerts**: Multiple critical alerts indicating system problems

## Automatic Rollback

The system includes automatic rollback mechanisms that trigger under certain conditions.

### Automatic Rollback Triggers

1. **Health Check Failures**: 3+ consecutive health check failures
2. **Database Corruption**: SQLite integrity check failures
3. **Critical Feature Fallbacks**: Core SQLite features entering fallback mode
4. **Migration Timeout**: Migration taking longer than configured timeout
5. **System Resource Issues**: Out of memory or disk space errors

### Monitoring Automatic Rollback

```bash
# Check deployment logs for automatic rollback events
grep -i "rollback" deployment_*.log

# Check alert logs for rollback triggers
grep -i "rollback\|fallback" alerts.log

# Check feature flag status
python -c "
from config.feature_flags import feature_flags
status = feature_flags.get_status_summary()
print('Fallback flags:', status['fallback_flags'])
print('Degraded mode:', feature_flags.is_degraded_mode())
"
```

## Manual Rollback

### Method 1: Using Deployment Script

The easiest way to perform a rollback:

```bash
# Perform complete rollback
python scripts/deploy_sqlite_migration.py --rollback

# Rollback with custom configuration
python scripts/deploy_sqlite_migration.py --rollback --config rollback_config.json
```

#### Rollback Configuration

Create a `rollback_config.json` file:

```json
{
  "create_backup": true,
  "restore_json_data": true,
  "disable_sqlite_features": true,
  "enable_degraded_mode": false,
  "cleanup_sqlite_files": false,
  "verify_rollback": true,
  "rollback_timeout_minutes": 15
}
```

### Method 2: Manual Step-by-Step Rollback

For complete control over the rollback process:

#### Step 1: Stop the Bot

```bash
# If running as a systemd service
sudo systemctl stop discord-bot

# If running in screen/tmux session
# Use Ctrl+C to stop the bot process

# If running in background
pkill -f bot.py

# Verify bot is stopped
ps aux | grep bot.py
```

#### Step 2: Create Current State Backup

Before rollback, backup the current state:

```bash
# Create rollback backup directory
mkdir -p data/backups/rollback_$(date +%Y%m%d_%H%M%S)

# Backup current SQLite database
if [ -f discord_bot.db ]; then
    cp discord_bot.db data/backups/rollback_$(date +%Y%m%d_%H%M%S)/
fi

# Backup current configuration
cp .env data/backups/rollback_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true

# Backup current logs
cp logs/bot_$(date +%Y%m%d).log data/backups/rollback_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
```

#### Step 3: Disable SQLite Features

Update environment variables to disable SQLite:

```bash
# Method 1: Update .env file
sed -i 's/USE_SQLITE=true/USE_SQLITE=false/' .env
sed -i 's/AUTO_MIGRATE=true/AUTO_MIGRATE=false/' .env

# Method 2: Export environment variables
export USE_SQLITE=false
export AUTO_MIGRATE=false
export SQLITE_STORAGE_ENABLED=false
export SQLITE_MIGRATION_ENABLED=false
export SQLITE_SCHEDULER_ENABLED=false

# Method 3: Create new .env file
cat > .env << EOF
DISCORD_TOKEN=${DISCORD_TOKEN}
USE_SQLITE=false
AUTO_MIGRATE=false
BACKUP_JSON_ON_MIGRATION=false
EOF
```

#### Step 4: Restore JSON Data

Find and restore the most recent JSON backup:

```bash
# List available JSON backups
ls -la data/backups/watched_reminders_*.json

# Find the most recent backup
LATEST_BACKUP=$(ls -t data/backups/watched_reminders_*.json | head -1)
echo "Latest backup: $LATEST_BACKUP"

# Restore the backup
cp "$LATEST_BACKUP" watched_reminders.json

# Verify the restored file
python -c "
import json
try:
    with open('watched_reminders.json', 'r') as f:
        data = json.load(f)
    print(f'✅ JSON file restored successfully with {len(data)} entries')
except Exception as e:
    print(f'❌ JSON file restoration failed: {e}')
"
```

#### Step 5: Clean Up SQLite Files (Optional)

```bash
# Move SQLite database to backup location
if [ -f discord_bot.db ]; then
    mv discord_bot.db data/backups/rollback_$(date +%Y%m%d_%H%M%S)/discord_bot_rollback.db
fi

# Remove SQLite-related temporary files
rm -f discord_bot.db-shm discord_bot.db-wal
```

#### Step 6: Update Feature Flags

Reset feature flags to safe defaults:

```bash
python -c "
from config.feature_flags import feature_flags, FeatureFlag

# Disable SQLite features
sqlite_flags = [
    FeatureFlag.SQLITE_STORAGE,
    FeatureFlag.SQLITE_MIGRATION,
    FeatureFlag.SQLITE_SCHEDULER,
    FeatureFlag.SQLITE_CONCURRENCY,
    FeatureFlag.SQLITE_MONITORING,
    FeatureFlag.SQLITE_BACKUP
]

for flag in sqlite_flags:
    feature_flags.disable_flag(flag, 'Manual rollback')

# Enable degraded mode temporarily
feature_flags.enable_flag(FeatureFlag.DEGRADED_MODE, 'Rollback safety mode')

print('Feature flags reset for rollback')
"
```

#### Step 7: Restart the Bot

```bash
# Start the bot
python bot.py

# Or if using systemd
sudo systemctl start discord-bot

# Or in screen session
screen -S discord-bot python bot.py
```

#### Step 8: Verify Rollback

```bash
# Check bot logs
tail -f logs/bot_$(date +%Y%m%d).log

# Verify JSON storage is being used
python -c "
from utils.unified_event_manager import unified_event_manager
import asyncio

async def check_rollback():
    try:
        await unified_event_manager.initialize()
        print('✅ Event manager initialized')
        print('Using JSON backend:', unified_event_manager.is_using_json())
        print('Using SQLite backend:', unified_event_manager.is_using_sqlite())
        
        status = unified_event_manager.get_status()
        print('Backend type:', status['backend_type'])
        print('Event count:', status['event_count'])
    except Exception as e:
        print(f'❌ Verification failed: {e}')

asyncio.run(check_rollback())
"
```

## Rollback Verification

### Functional Testing

After rollback, verify the bot is working correctly:

1. **Discord Commands**: Test all Discord slash commands
2. **Event Management**: Add, remove, and modify events
3. **Reminders**: Verify reminders are sent correctly
4. **Reactions**: Test reaction handling
5. **Permissions**: Verify admin commands work

### Data Integrity Check

```bash
# Verify JSON data structure
python -c "
import json
from datetime import datetime

try:
    with open('watched_reminders.json', 'r') as f:
        data = json.load(f)
    
    print(f'Total events: {len(data)}')
    
    # Check data structure
    for event_id, event_data in data.items():
        required_fields = ['message_id', 'channel_id', 'guild_id', 'title']
        missing_fields = [field for field in required_fields if field not in event_data]
        
        if missing_fields:
            print(f'⚠️ Event {event_id} missing fields: {missing_fields}')
    
    print('✅ Data integrity check completed')
    
except Exception as e:
    print(f'❌ Data integrity check failed: {e}')
"
```

### Performance Verification

```bash
# Check memory usage
ps aux | grep bot.py | awk '{print $4, $6}'

# Check response times
python -c "
import time
import asyncio
from utils.unified_event_manager import unified_event_manager

async def test_performance():
    start_time = time.time()
    await unified_event_manager.initialize()
    init_time = time.time() - start_time
    
    start_time = time.time()
    events = await unified_event_manager.get_all_events()
    query_time = time.time() - start_time
    
    print(f'Initialization time: {init_time:.3f}s')
    print(f'Query time: {query_time:.3f}s')
    print(f'Events loaded: {len(events)}')

asyncio.run(test_performance())
"
```

## Troubleshooting Rollback Issues

### Common Rollback Problems

#### 1. JSON Backup Not Found

**Problem**: No JSON backup files available for restoration.

**Solution**:
```bash
# Check all possible backup locations
find . -name "watched_reminders*.json" -type f

# If no backups exist, create empty JSON file
echo '{}' > watched_reminders.json

# Or extract data from SQLite database
python -c "
import sqlite3
import json

try:
    conn = sqlite3.connect('discord_bot.db')
    cursor = conn.cursor()
    
    # Extract events from SQLite (adjust query based on your schema)
    cursor.execute('SELECT * FROM events')
    rows = cursor.fetchall()
    
    # Convert to JSON format (adjust based on your data structure)
    data = {}
    for row in rows:
        # This is a simplified example - adjust based on your schema
        event_id = str(row[0])
        data[event_id] = {
            'message_id': row[1],
            'channel_id': row[2],
            'guild_id': row[3],
            'title': row[4],
            # Add other fields as needed
        }
    
    with open('watched_reminders.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f'✅ Extracted {len(data)} events from SQLite to JSON')
    
except Exception as e:
    print(f'❌ SQLite extraction failed: {e}')
finally:
    conn.close()
"
```

#### 2. Bot Won't Start After Rollback

**Problem**: Bot fails to start with JSON storage.

**Solution**:
```bash
# Check for syntax errors in JSON file
python -c "
import json
try:
    with open('watched_reminders.json', 'r') as f:
        json.load(f)
    print('✅ JSON file is valid')
except json.JSONDecodeError as e:
    print(f'❌ JSON syntax error: {e}')
    print('Creating empty JSON file...')
    with open('watched_reminders.json', 'w') as f:
        json.dump({}, f)
"

# Check environment variables
python -c "
import os
print('USE_SQLITE:', os.getenv('USE_SQLITE', 'not set'))
print('DISCORD_TOKEN:', 'set' if os.getenv('DISCORD_TOKEN') else 'not set')
"

# Check file permissions
ls -la watched_reminders.json
chmod 644 watched_reminders.json
```

#### 3. Data Loss During Rollback

**Problem**: Some data is missing after rollback.

**Solution**:
```bash
# Compare backup files to find the most complete one
for backup in data/backups/watched_reminders_*.json; do
    count=$(python -c "import json; print(len(json.load(open('$backup'))))")
    echo "$backup: $count events"
done

# Use the backup with the most events
BEST_BACKUP=$(for backup in data/backups/watched_reminders_*.json; do
    count=$(python -c "import json; print(len(json.load(open('$backup'))))" 2>/dev/null || echo 0)
    echo "$count $backup"
done | sort -nr | head -1 | cut -d' ' -f2-)

echo "Using backup: $BEST_BACKUP"
cp "$BEST_BACKUP" watched_reminders.json
```

#### 4. Feature Flags Still Enabled

**Problem**: SQLite features remain enabled after rollback.

**Solution**:
```bash
# Force disable all SQLite features
python -c "
from config.feature_flags import feature_flags, FeatureFlag

# List all SQLite-related flags
sqlite_flags = [
    FeatureFlag.SQLITE_STORAGE,
    FeatureFlag.SQLITE_MIGRATION,
    FeatureFlag.SQLITE_SCHEDULER,
    FeatureFlag.SQLITE_CONCURRENCY,
    FeatureFlag.SQLITE_MONITORING,
    FeatureFlag.SQLITE_BACKUP
]

# Disable all SQLite flags
for flag in sqlite_flags:
    feature_flags.disable_flag(flag, 'Force rollback')
    print(f'Disabled {flag.value}')

# Verify flags are disabled
status = feature_flags.get_status_summary()
print('Enabled flags:', status['enabled_flags'])
print('Fallback flags:', len(status['fallback_flags']))
"
```

### Emergency Rollback

If the standard rollback procedures fail:

#### 1. Complete Reset

```bash
# Stop bot
pkill -f bot.py

# Backup current state
mkdir -p emergency_backup_$(date +%Y%m%d_%H%M%S)
cp -r . emergency_backup_$(date +%Y%m%d_%H%M%S)/

# Reset to clean state
rm -f discord_bot.db discord_bot.db-shm discord_bot.db-wal
echo '{}' > watched_reminders.json

# Reset environment
cat > .env << EOF
DISCORD_TOKEN=${DISCORD_TOKEN}
USE_SQLITE=false
AUTO_MIGRATE=false
EOF

# Restart bot
python bot.py
```

#### 2. Restore from Git

```bash
# If using version control
git stash
git checkout HEAD~1  # Go back to previous commit
git checkout main    # Or your main branch

# Restore data from backup
cp data/backups/watched_reminders_*.json watched_reminders.json

# Restart bot
python bot.py
```

## Post-Rollback Actions

### 1. Update Documentation

Document the rollback event:

```bash
# Create rollback report
cat > rollback_report_$(date +%Y%m%d_%H%M%S).md << EOF
# Rollback Report

**Date**: $(date)
**Reason**: [Describe why rollback was necessary]
**Method**: [Manual/Automatic]
**Duration**: [How long the rollback took]
**Data Loss**: [Any data lost during rollback]
**Issues Encountered**: [Problems during rollback]
**Resolution**: [How issues were resolved]

## Lessons Learned
- [What went wrong]
- [How to prevent in the future]
- [Process improvements needed]
EOF
```

### 2. Notify Stakeholders

Inform relevant parties about the rollback:

- Bot administrators
- Discord server moderators
- Development team
- Users (if necessary)

### 3. Investigate Root Cause

Analyze why the rollback was necessary:

```bash
# Review deployment logs
grep -i "error\|fail\|exception" deployment_*.log

# Review bot logs
grep -i "error\|fail\|exception" logs/bot_*.log

# Review alert logs
grep -i "critical\|error" alerts.log

# Check system resources at time of failure
# (if monitoring was in place)
```

### 4. Plan Next Steps

- **Fix Issues**: Address the problems that caused the rollback
- **Improve Testing**: Add more comprehensive tests
- **Update Procedures**: Improve deployment and rollback procedures
- **Schedule Retry**: Plan when to attempt the migration again

## Prevention

To minimize the need for rollbacks:

### 1. Comprehensive Testing

- Test migration with production-like data
- Perform load testing
- Test all bot features after migration
- Validate data integrity thoroughly

### 2. Gradual Rollout

- Use feature flags for gradual activation
- Monitor system health continuously
- Have clear rollback triggers
- Test rollback procedures regularly

### 3. Better Monitoring

- Implement comprehensive health checks
- Set up proactive alerting
- Monitor performance metrics
- Track user experience metrics

### 4. Backup Strategy

- Automated regular backups
- Multiple backup retention periods
- Test backup restoration regularly
- Document backup procedures

## Conclusion

The rollback procedures provide multiple ways to safely revert the SQLite migration if issues occur. The key is to act quickly when problems are detected and follow the documented procedures carefully.

Remember:
- **Safety First**: Always backup current state before rollback
- **Verify Everything**: Test thoroughly after rollback
- **Document Issues**: Record what went wrong for future improvement
- **Learn and Improve**: Use rollback events to improve processes

For additional help or questions about rollback procedures, consult the development team or refer to the main deployment documentation.