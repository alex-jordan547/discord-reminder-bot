# Disaster Recovery Guide

## Overview

This comprehensive disaster recovery guide provides procedures for backing up, restoring, and recovering the Discord Reminder Bot system in various failure scenarios. The guide covers both automated backup systems and manual recovery procedures.

## Backup Strategy

### Backup Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Layer    │    │ Application     │    │    System       │
│   - PostgreSQL  │    │ Layer           │    │    Layer        │
│   - SQLite      │    │ - App Data      │    │ - Config Files  │
│   - Redis       │    │ - Logs          │    │ - Docker Vol.   │
│   - Files       │    │ - Uploads       │    │ - System Info   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Backup        │
                    │   System        │
                    │ - Automated     │
                    │ - Compressed    │
                    │ - Encrypted     │
                    │ - Remote Store  │
                    └─────────────────┘
```

### Backup Types

#### 1. Full System Backup
- **Frequency**: Daily at 2 AM
- **Retention**: 30 days local, 90 days remote
- **Components**: All databases, application data, configuration
- **Duration**: 5-15 minutes depending on data size

#### 2. Incremental Backup
- **Frequency**: Every 6 hours
- **Components**: Changed files, logs, active data
- **Purpose**: Minimize data loss between full backups

#### 3. Critical Data Backup
- **Frequency**: Every hour during business hours
- **Components**: Database changes, active sessions
- **Purpose**: Real-time protection for critical operations

#### 4. Configuration Backup
- **Frequency**: On changes or weekly
- **Components**: Docker configs, environment files, scripts
- **Purpose**: System rebuild capability

## Automated Backup System

### Installation and Setup

#### Quick Setup
```bash
# Navigate to project directory
cd /path/to/discord-reminder-bot

# Run backup system setup
./scripts/backup-system.sh help

# Perform initial full backup
./scripts/backup-system.sh backup

# Set up automated backups
crontab -e
```

#### Cron Job Configuration
```bash
# Add to crontab for automated backups
# Full backup daily at 2 AM
0 2 * * * /path/to/discord-reminder-bot/scripts/backup-system.sh backup

# Cleanup old backups weekly
0 3 * * 0 /path/to/discord-reminder-bot/scripts/backup-system.sh cleanup

# Quick verification daily
0 4 * * * /path/to/discord-reminder-bot/scripts/backup-system.sh verify latest
```

### Backup Configuration

#### Environment Variables
```bash
# Basic backup settings
export BACKUP_RETENTION_DAYS=30
export BACKUP_COMPRESSION=true
export BACKUP_ENCRYPTION=true
export BACKUP_ENCRYPTION_KEY="your-secure-encryption-key-here"

# Remote backup settings
export BACKUP_REMOTE_ENABLED=true
export BACKUP_REMOTE_TYPE="s3"
export BACKUP_S3_BUCKET="your-backup-bucket"
export BACKUP_S3_REGION="us-east-1"

# Notification settings
export BACKUP_NOTIFY_EMAIL="admin@yourcompany.com"
export BACKUP_NOTIFY_WEBHOOK="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
export BACKUP_NOTIFY_SUCCESS=false
export BACKUP_NOTIFY_FAILURE=true
```

#### Security Configuration
```bash
# Generate strong encryption key
export BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Store encryption key securely
echo "$BACKUP_ENCRYPTION_KEY" | sudo tee /etc/discord-bot-backup-key
sudo chmod 600 /etc/discord-bot-backup-key
sudo chown root:root /etc/discord-bot-backup-key

# Use key in backup script
export BACKUP_ENCRYPTION_KEY=$(sudo cat /etc/discord-bot-backup-key)
```

### Backup Verification

#### Automatic Verification
```bash
# Verify latest backup
./scripts/backup-system.sh verify latest

# Verify specific backup file
./scripts/backup-system.sh verify /path/to/backup/file.sql.gz postgres

# List all available backups
./scripts/backup-system.sh list
```

#### Manual Verification
```bash
# Test PostgreSQL backup restoration (dry run)
gunzip -c backup.sql.gz | head -20  # Check file format
pg_restore --list backup.dump      # Check dump contents

# Test SQLite backup
sqlite3 backup.db ".schema"         # Check schema
sqlite3 backup.db "PRAGMA integrity_check;"  # Check integrity

# Test tar archive
tar -tzf backup.tar.gz | head -10   # List archive contents
```

## Recovery Procedures

### Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO)

| Scenario | RTO Target | RPO Target | Recovery Method |
|----------|------------|------------|-----------------|
| Database corruption | 15 minutes | 1 hour | Automated restore from backup |
| Application failure | 5 minutes | Real-time | Container restart/rebuild |
| Complete system failure | 2 hours | 24 hours | Full system restore |
| Data center outage | 4 hours | 24 hours | Remote backup restore |

### Quick Recovery Procedures

#### Database Recovery

**PostgreSQL Recovery:**
```bash
# Stop application to prevent connections
docker-compose stop discord-reminder-bot

# List available PostgreSQL backups
ls -la backups/database/postgres-*

# Restore from latest backup
./scripts/backup-system.sh restore-postgres backups/database/postgres-20240909-020000.sql.gz

# Verify restoration
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM events;"

# Restart application
docker-compose start discord-reminder-bot
```

**SQLite Recovery:**
```bash
# Stop application
docker-compose stop discord-reminder-bot

# Backup current database (if exists)
cp data/discord_bot.db data/discord_bot.db.backup.$(date +%Y%m%d-%H%M%S)

# Restore from backup
./scripts/backup-system.sh restore-sqlite backups/database/sqlite-20240909-020000.db.gz

# Verify restoration
sqlite3 data/discord_bot.db "PRAGMA integrity_check;"

# Restart application
docker-compose start discord-reminder-bot
```

#### Application Recovery
```bash
# Quick application restart
docker-compose restart discord-reminder-bot

# Rebuild from latest image
docker-compose up -d --build discord-reminder-bot

# Full application restore from backup
tar -xzf backups/application/app-data-20240909-020000.tar.gz -C /
docker-compose up -d
```

### Complete System Recovery

#### Scenario 1: Hardware Failure

**Preparation:**
1. Ensure you have access to:
   - Latest system backups
   - Backup encryption keys
   - Environment configuration
   - Network configuration details

**Recovery Steps:**
```bash
# 1. Prepare new hardware/VM
# Install required software (Docker, Docker Compose, etc.)

# 2. Restore project structure
mkdir -p /opt/discord-reminder-bot
cd /opt/discord-reminder-bot

# 3. Restore configuration
tar -xzf system-backup/config-20240909-020000.tar.gz

# 4. Restore Docker volumes
tar -xzf system-backup/docker-volumes-20240909-020000.tar.gz

# 5. Restore application data
tar -xzf system-backup/app-data-20240909-020000.tar.gz

# 6. Start infrastructure services
docker-compose up -d postgres redis

# 7. Restore databases
./scripts/backup-system.sh restore-postgres database-backup/postgres-20240909-020000.sql.gz

# 8. Start application
docker-compose up -d discord-reminder-bot

# 9. Verify system functionality
./monitoring/scripts/health-check.sh
```

#### Scenario 2: Data Corruption

**Detection:**
```bash
# Check database integrity
sqlite3 data/discord_bot.db "PRAGMA integrity_check;"
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT pg_database_size('discord_bot');"

# Check application logs for errors
docker-compose logs discord-reminder-bot | grep -i error

# Run comprehensive health check
./monitoring/scripts/health-check.sh
```

**Recovery:**
```bash
# 1. Immediately stop services to prevent further corruption
docker-compose stop

# 2. Create emergency backup of current state
tar -czf emergency-backup-$(date +%Y%m%d-%H%M%S).tar.gz data/ logs/ volumes/

# 3. Identify last known good backup
ls -la backups/database/ | grep $(date -d "1 day ago" +%Y%m%d)

# 4. Restore from last known good backup
./scripts/backup-system.sh restore-postgres backups/database/postgres-20240908-020000.sql.gz

# 5. Verify data integrity
docker-compose up -d postgres
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM events;"

# 6. Restart all services
docker-compose up -d

# 7. Monitor for issues
./monitoring/scripts/health-check.sh
docker-compose logs -f
```

#### Scenario 3: Security Incident

**Immediate Response:**
```bash
# 1. Isolate system
docker-compose down
iptables -A INPUT -j DROP  # Block all incoming traffic

# 2. Create forensic backup
tar -czf forensic-backup-$(date +%Y%m%d-%H%M%S).tar.gz data/ logs/ volumes/

# 3. Analyze compromise
grep -r "suspicious_pattern" logs/
docker history discord-reminder-bot:latest

# 4. Clean restore from known good backup
rm -rf data/ logs/* volumes/*
./scripts/backup-system.sh restore-postgres clean-backup.sql.gz
```

**Security Hardening:**
```bash
# 5. Update all components
docker-compose pull
docker-compose build --no-cache

# 6. Rotate all secrets
# Update Discord token, database passwords, API keys

# 7. Enhanced monitoring
./scripts/setup-monitoring.sh
./monitoring/scripts/security-audit.sh

# 8. Gradual service restoration
docker-compose up -d postgres redis  # Infrastructure first
docker-compose up -d discord-reminder-bot  # Application last
```

### Point-in-Time Recovery

#### Database Point-in-Time Recovery

**PostgreSQL PITR:**
```bash
# Enable WAL archiving (configure in postgresql.conf)
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backup/archive/%f && cp %p /backup/archive/%f'

# Restore to specific point in time
pg_restore --point-in-time "2024-09-09 14:30:00" backup.dump
```

**Application Data PITR:**
```bash
# Find backup closest to desired recovery point
find backups/ -name "*202409091430*" | head -5

# Restore from specific time
tar -xzf backups/app-data-20240909-143000.tar.gz

# Apply incremental changes if available
./scripts/apply-incremental-backup.sh 20240909143000 20240909150000
```

## Backup Monitoring and Alerting

### Backup Health Monitoring

#### Automated Backup Monitoring
```bash
# Create backup monitoring script
cat > scripts/monitor-backups.sh << 'EOF'
#!/bin/bash
# Monitor backup system health

BACKUP_DIR="./backups"
ALERT_EMAIL="admin@yourcompany.com"

# Check if daily backup exists
today=$(date +%Y%m%d)
if ! find "$BACKUP_DIR" -name "*$today*" | grep -q .; then
    echo "ALERT: No backup found for today ($today)" | mail -s "Backup Alert" "$ALERT_EMAIL"
fi

# Check backup sizes
for backup in $(find "$BACKUP_DIR" -name "*.gz" -mtime -1); do
    size=$(stat -c%s "$backup")
    if [ "$size" -lt 1000000 ]; then  # Less than 1MB
        echo "ALERT: Backup file too small: $backup ($size bytes)" | mail -s "Backup Alert" "$ALERT_EMAIL"
    fi
done

# Verify backup integrity
./scripts/backup-system.sh verify latest || {
    echo "ALERT: Backup verification failed" | mail -s "Backup Alert" "$ALERT_EMAIL"
}
EOF

chmod +x scripts/monitor-backups.sh

# Add to cron
echo "0 6 * * * /path/to/scripts/monitor-backups.sh" | crontab -
```

#### Backup Metrics Dashboard
```bash
# Create backup metrics
cat > monitoring/backup-metrics.json << 'JSON'
{
    "last_backup": "2024-09-09T02:00:00Z",
    "backup_size": "150MB",
    "backup_duration": "8m 23s",
    "success_rate": "98.5%",
    "retention_status": "healthy",
    "remote_sync": "completed"
}
JSON
```

### Remote Backup Configuration

#### Amazon S3 Setup
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure set aws_access_key_id YOUR_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_SECRET_KEY
aws configure set default.region us-east-1

# Create S3 bucket with versioning
aws s3 mb s3://discord-bot-backups
aws s3api put-bucket-versioning --bucket discord-bot-backups --versioning-configuration Status=Enabled

# Set lifecycle policy
aws s3api put-bucket-lifecycle-configuration --bucket discord-bot-backups --lifecycle-configuration file://s3-lifecycle.json
```

#### Google Cloud Storage Setup
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Initialize gcloud
gcloud init

# Create bucket
gsutil mb gs://discord-bot-backups

# Configure backup script for GCS
export BACKUP_REMOTE_TYPE="gcs"
export BACKUP_GCS_BUCKET="discord-bot-backups"
```

#### rsync Remote Backup
```bash
# Set up SSH key authentication
ssh-keygen -t rsa -b 4096 -f ~/.ssh/backup_key
ssh-copy-id -i ~/.ssh/backup_key.pub user@backup-server

# Configure rsync backup
export BACKUP_REMOTE_TYPE="rsync"
export BACKUP_RSYNC_DESTINATION="user@backup-server:/backups/discord-bot"

# Test connection
rsync -avz --dry-run backups/ user@backup-server:/backups/discord-bot/
```

## Testing and Validation

### Regular Testing Schedule

#### Monthly Recovery Testing
```bash
#!/bin/bash
# monthly-recovery-test.sh

echo "=== Monthly Recovery Test - $(date) ==="

# 1. Create test environment
docker-compose -f docker-compose.test.yml up -d

# 2. Restore from backup
./scripts/backup-system.sh restore-postgres backups/database/latest.sql.gz

# 3. Run validation tests
./tests/recovery-validation.sh

# 4. Generate test report
echo "Recovery test completed: $(date)" >> recovery-test-log.txt

# 5. Cleanup test environment
docker-compose -f docker-compose.test.yml down
```

#### Backup Integrity Testing
```bash
#!/bin/bash
# backup-integrity-test.sh

# Test all backup types
for backup in $(find backups/ -name "*.gz" -mtime -7); do
    echo "Testing: $backup"
    
    # Test compression integrity
    gunzip -t "$backup" || echo "FAIL: Compression error in $backup"
    
    # Test file format
    case "$backup" in
        *postgres*) 
            # Test PostgreSQL backup
            gunzip -c "$backup" | head -1 | grep -q "PostgreSQL" || echo "FAIL: Invalid PostgreSQL backup"
            ;;
        *sqlite*)
            # Test SQLite backup
            temp_file=$(mktemp)
            gunzip -c "$backup" > "$temp_file"
            sqlite3 "$temp_file" "PRAGMA integrity_check;" | grep -q "ok" || echo "FAIL: SQLite integrity error"
            rm "$temp_file"
            ;;
    esac
done
```

### Disaster Recovery Drills

#### Quarterly Full Recovery Drill
```bash
#!/bin/bash
# quarterly-recovery-drill.sh

echo "=== Quarterly Recovery Drill - $(date) ==="

# 1. Document current system state
./scripts/system-snapshot.sh > pre-drill-snapshot.txt

# 2. Simulate complete failure
docker-compose down
mv data/ data-backup/
mv volumes/ volumes-backup/

# 3. Perform full recovery
./scripts/disaster-recovery.sh full

# 4. Validate recovery
./monitoring/scripts/health-check.sh
./tests/functional-tests.sh

# 5. Document recovery time
echo "Recovery completed: $(date)" >> drill-results.txt

# 6. Restore original system
docker-compose down
mv data-backup/ data/
mv volumes-backup/ volumes/
docker-compose up -d
```

## Best Practices

### Backup Best Practices

1. **3-2-1 Rule**: 3 copies of data, 2 different media types, 1 offsite
2. **Regular Testing**: Monthly recovery testing and quarterly drills
3. **Encryption**: Always encrypt backups containing sensitive data
4. **Version Control**: Keep multiple backup versions
5. **Documentation**: Maintain current recovery procedures
6. **Monitoring**: Automated backup success/failure monitoring
7. **Access Control**: Secure backup storage with proper access controls

### Security Considerations

1. **Encryption Keys**: Store encryption keys separately from backups
2. **Access Logs**: Monitor backup access and modifications
3. **Network Security**: Use encrypted transfers for remote backups
4. **Retention Policies**: Implement secure deletion of expired backups
5. **Audit Trail**: Maintain logs of all backup and recovery operations

### Operational Excellence

1. **Automation**: Automate backup and basic recovery procedures
2. **Monitoring Integration**: Integrate with existing monitoring systems
3. **Staff Training**: Regular training on recovery procedures
4. **Documentation**: Keep recovery documentation current and accessible
5. **Communication**: Clear escalation and communication procedures

## Emergency Contacts and Resources

### Emergency Response Team
- **Primary Contact**: System Administrator (admin@yourcompany.com)
- **Secondary Contact**: Development Team Lead (dev-lead@yourcompany.com)
- **Escalation**: IT Manager (it-manager@yourcompany.com)

### External Resources
- **Cloud Provider Support**: [Provider-specific support contacts]
- **Database Consultant**: [Database expert contact]
- **Security Incident Response**: [Security team contact]

### Critical Information
- **Backup Encryption Keys**: [Secure storage location]
- **Access Credentials**: [Credential management system]
- **Network Configuration**: [Network documentation location]
- **Recovery Procedures**: [This document location]

---

This disaster recovery guide provides comprehensive procedures for protecting and recovering the Discord Reminder Bot system. Regular review and testing of these procedures ensures effective disaster response and minimal service disruption.

For additional support documentation:
- [Monitoring and Alerting Guide](MONITORING_AND_ALERTING_GUIDE.md)
- [Production Configuration Guide](PRODUCTION_CONFIGURATION_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md)