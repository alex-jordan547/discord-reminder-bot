# Database Administrator Guide

## Overview

This guide provides comprehensive database administration procedures for the Discord Reminder Bot monitoring dashboard. It covers database management, backup procedures, migration operations, performance optimization, and troubleshooting.

## Database Architecture

### Supported Database Systems

#### SQLite (Default)
- **File-based**: Single file database (`discord_bot.db`)
- **No server required**: Embedded database engine
- **Performance**: Excellent for small to medium datasets
- **Backup**: Simple file copy operations
- **Use case**: Development, small production deployments

#### PostgreSQL (Production)
- **Server-based**: Separate database server process
- **High performance**: Optimized for concurrent operations
- **Scalability**: Better for large datasets and high traffic
- **Advanced features**: Full ACID compliance, complex queries
- **Use case**: Large production deployments

### Database Schema

#### Core Tables
- **events**: Discord reminder events and tracking
- **users**: User information across guilds
- **guilds**: Discord server configurations
- **guild_configs**: Per-guild settings and preferences
- **reactions**: User reaction tracking
- **reminder_logs**: Audit trail of reminder activities

#### Monitoring Tables
- **metrics_history**: Historical performance data
- **alert_history**: Alert and notification records
- **audit_logs**: Administrative action audit trail
- **backup_history**: Database backup metadata

## Database Management Operations

### 1. Database Connection Management

#### Check Database Status
```bash
# Using the dashboard API
curl -X GET http://localhost:3001/api/database/status

# Manual SQLite check
sqlite3 discord_bot.db "PRAGMA integrity_check;"

# PostgreSQL health check
psql -h localhost -U bot_user -d discord_bot -c "SELECT version();"
```

#### Monitor Connection Pool
```javascript
// Check active connections through dashboard
GET /api/metrics/database
{
  "activeConnections": 5,
  "maxConnections": 20,
  "queriesPerSecond": 15.2,
  "averageResponseTime": "23ms"
}
```

### 2. Backup Operations

#### Automated Backup System
The system includes automatic backup capabilities:

```bash
# Manual backup creation
npm run db:backup

# Scheduled backup (configured in cron)
0 2 * * * /path/to/bot/scripts/backup-database.sh
```

#### Manual Backup Procedures

**SQLite Backup:**
```bash
# Simple file copy (database must be idle)
cp discord_bot.db "backup_$(date +%Y%m%d_%H%M%S).db"

# Using SQLite backup API (safe for active database)
sqlite3 discord_bot.db ".backup backup_$(date +%Y%m%d_%H%M%S).db"

# Vacuum and backup (optimizes file)
sqlite3 discord_bot.db "VACUUM INTO 'backup_$(date +%Y%m%d_%H%M%S).db'"
```

**PostgreSQL Backup:**
```bash
# Full database dump
pg_dump -h localhost -U bot_user -d discord_bot > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump -h localhost -U bot_user -d discord_bot | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Custom format (faster restore)
pg_dump -h localhost -U bot_user -d discord_bot -Fc > backup_$(date +%Y%m%d_%H%M%S).dump
```

#### Backup Verification
```bash
# Test SQLite backup integrity
sqlite3 backup_file.db "PRAGMA integrity_check;"

# Test PostgreSQL backup
pg_restore --list backup_file.dump

# Verify backup size and content
ls -la backups/
sqlite3 backup_file.db ".tables"
```

### 3. Database Migration

#### SQLite to PostgreSQL Migration
Use the automated migration script:

```bash
# Run migration with logging
node scripts/migrate-database.js 2>&1 | tee migration_$(date +%Y%m%d_%H%M%S).log

# Check migration status
tail -f migration.log
```

**Migration Process:**
1. **Pre-migration validation**
   - Check SQLite database integrity
   - Verify PostgreSQL connection
   - Create automatic backup

2. **Schema migration**
   - Create PostgreSQL tables
   - Apply indexes and constraints
   - Set up foreign key relationships

3. **Data transfer**
   - Migrate data table by table
   - Preserve data relationships
   - Validate data integrity

4. **Post-migration validation**
   - Compare record counts
   - Test application functionality
   - Performance verification

#### PostgreSQL to SQLite Failover
Automatic failover is handled by the `DatabaseFailoverService`:

```bash
# Check failover status
curl -X GET http://localhost:3001/api/database/failover/status

# Manual failover trigger
curl -X POST http://localhost:3001/api/database/failover/trigger
```

### 4. Performance Optimization

#### SQLite Optimization
```sql
-- Update SQLite settings for better performance
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;

-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM events WHERE guild_id = ?;

-- Rebuild indexes
REINDEX;

-- Vacuum database (reclaim space)
VACUUM;
```

#### PostgreSQL Optimization
```sql
-- Check database statistics
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del 
FROM pg_stat_user_tables;

-- Analyze table usage
ANALYZE;

-- Vacuum tables
VACUUM ANALYZE;

-- Check index usage
SELECT indexname, idx_tup_read, idx_tup_fetch 
FROM pg_stat_user_indexes;
```

#### Index Management
```bash
# Add database indexes
node scripts/add-indexes.js

# Monitor index effectiveness
sqlite3 discord_bot.db "EXPLAIN QUERY PLAN SELECT * FROM events WHERE created_at > '2024-01-01';"
```

### 5. Data Export and Import

#### Export Operations

**Dashboard Export (Recommended):**
1. Access Dashboard → Database Management
2. Select export format (SQLite/JSON/CSV)
3. Monitor export progress
4. Download generated file

**Command Line Export:**
```bash
# Export to JSON
node scripts/export-database.js --format json --output data_export.json

# Export to CSV
node scripts/export-database.js --format csv --output data_export.csv

# Export specific tables
node scripts/export-database.js --tables events,users --format json
```

#### Import Operations

**Dashboard Import (Recommended):**
1. Access Dashboard → Database Management
2. Drag and drop or select file
3. Preview data before import
4. Confirm import operation
5. Monitor import progress

**Command Line Import:**
```bash
# Import from backup
node scripts/import-database.js --file backup_20240901_120000.json

# Import with validation
node scripts/import-database.js --file data.json --validate

# Import specific tables only
node scripts/import-database.js --file data.json --tables events,users
```

### 6. Database Maintenance

#### Regular Maintenance Tasks

**Daily Tasks:**
- Monitor database size and growth
- Check error logs for issues
- Verify backup completion
- Review performance metrics

**Weekly Tasks:**
- Analyze query performance
- Clean up old log entries
- Vacuum database (SQLite)
- Update table statistics (PostgreSQL)

**Monthly Tasks:**
- Full database backup verification
- Performance optimization review
- Disk space planning
- Security audit

#### Automated Maintenance
```bash
# Set up maintenance cron jobs
# Daily backup at 2 AM
0 2 * * * /path/to/bot/scripts/daily-maintenance.sh

# Weekly optimization at 3 AM Sunday
0 3 * * 0 /path/to/bot/scripts/weekly-maintenance.sh

# Monthly full maintenance
0 4 1 * * /path/to/bot/scripts/monthly-maintenance.sh
```

#### Clean-up Operations
```bash
# Clean old logs (older than 30 days)
node scripts/cleanup-logs.js --days 30

# Clean old backups (keep last 10)
node scripts/cleanup-backups.js --keep 10

# Optimize database size
node scripts/optimize-database.js
```

## Security and Access Control

### 1. Database Security

#### Access Control
- **Database Users**: Separate users for application and administration
- **Password Policy**: Strong passwords with regular rotation
- **Network Security**: Restrict database access to authorized hosts
- **SSL/TLS**: Encrypted connections for PostgreSQL

#### Authentication Setup
```sql
-- PostgreSQL user management
CREATE USER bot_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE discord_bot TO bot_user;
GRANT USAGE ON SCHEMA public TO bot_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bot_user;

-- Read-only user for monitoring
CREATE USER monitor_user WITH PASSWORD 'monitor_password';
GRANT CONNECT ON DATABASE discord_bot TO monitor_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor_user;
```

### 2. Audit and Compliance

#### Audit Logging
All database operations are logged through the `AuditLogger` service:

```bash
# View audit logs
tail -f logs/audit/audit.log

# Search specific operations
grep "file_operation" logs/audit/audit.log

# Export audit trail
node scripts/export-audit-logs.js --start 2024-01-01 --end 2024-01-31
```

#### Data Protection
- **Encryption at Rest**: Database files should be on encrypted storage
- **Backup Encryption**: Encrypt backup files before storage
- **Data Retention**: Follow data retention policies
- **GDPR Compliance**: Tools for data deletion and export

## Monitoring and Alerting

### 1. Performance Monitoring

#### Key Metrics to Monitor
- **Query Response Time**: Average and peak response times
- **Connection Count**: Active database connections
- **Database Size**: Growth trends and storage usage
- **Error Rate**: Failed queries and connection errors
- **Backup Status**: Backup success and duration

#### Alert Thresholds
```yaml
# Default alert thresholds
database_alerts:
  response_time:
    warning: 1000ms
    critical: 5000ms
  
  connections:
    warning: 80% of max
    critical: 95% of max
  
  disk_usage:
    warning: 80%
    critical: 90%
  
  backup_age:
    warning: 25 hours
    critical: 48 hours
```

### 2. Dashboard Monitoring

#### Real-time Metrics
Access live database metrics through:
- **Overview Dashboard**: High-level database status
- **Metrics Dashboard**: Detailed performance charts
- **Alerts Dashboard**: Active database alerts

#### API Endpoints
```bash
# Database health check
GET /api/database/health

# Performance metrics
GET /api/database/metrics

# Connection status
GET /api/database/connections

# Backup status
GET /api/database/backups
```

## Troubleshooting

### 1. Common Issues

#### Database Connection Failures

**Symptoms:**
- Dashboard shows database disconnected
- Application errors connecting to database
- High connection timeouts

**Diagnosis:**
```bash
# Check database process
ps aux | grep postgres
ps aux | grep sqlite

# Test connection
telnet localhost 5432  # PostgreSQL
ls -la discord_bot.db  # SQLite

# Check error logs
tail -f logs/database.log
tail -f /var/log/postgresql/postgresql.log
```

**Resolution:**
1. Restart database service
2. Check connection configuration
3. Verify network connectivity
4. Review error logs for specific issues

#### Performance Degradation

**Symptoms:**
- Slow query response times
- High CPU usage
- Dashboard loading slowly

**Diagnosis:**
```sql
-- SQLite slow query analysis
.timer on
SELECT * FROM events WHERE created_at > '2024-01-01';

-- PostgreSQL query analysis
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM events WHERE created_at > '2024-01-01';

-- Check database size
SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size();
```

**Resolution:**
1. Add missing indexes
2. Vacuum and analyze tables
3. Optimize query patterns
4. Consider database migration

#### Data Corruption

**Symptoms:**
- Database integrity check failures
- Unexpected application errors
- Missing or corrupted data

**Diagnosis:**
```bash
# SQLite integrity check
sqlite3 discord_bot.db "PRAGMA integrity_check;"

# PostgreSQL data validation
psql -d discord_bot -c "SELECT * FROM pg_stat_database;"
```

**Resolution:**
1. Stop application immediately
2. Restore from most recent backup
3. Investigate root cause
4. Implement additional monitoring

### 2. Recovery Procedures

#### Backup Restoration

**SQLite Recovery:**
```bash
# Stop application
systemctl stop discord-bot

# Restore from backup
cp backup_20240901_120000.db discord_bot.db

# Verify integrity
sqlite3 discord_bot.db "PRAGMA integrity_check;"

# Restart application
systemctl start discord-bot
```

**PostgreSQL Recovery:**
```bash
# Stop application
systemctl stop discord-bot

# Drop and recreate database
dropdb discord_bot
createdb discord_bot

# Restore from backup
pg_restore -d discord_bot backup_20240901_120000.dump

# Restart application
systemctl start discord-bot
```

#### Disaster Recovery

**Complete System Recovery:**
1. **Assess Damage**: Determine scope of data loss
2. **Choose Recovery Point**: Select appropriate backup
3. **Restore Database**: Follow backup restoration procedures
4. **Validate Data**: Verify data integrity and completeness
5. **Resume Operations**: Restart services and monitor
6. **Post-incident Review**: Document lessons learned

#### Failover Procedures

**Automatic Failover:**
The system automatically fails over from PostgreSQL to SQLite when:
- PostgreSQL connection fails
- Response times exceed thresholds
- Error rates become critical

**Manual Failover:**
```bash
# Force failover to SQLite
curl -X POST http://localhost:3001/api/database/failover/force

# Check failover status
curl -X GET http://localhost:3001/api/database/failover/status

# Restore to PostgreSQL (when available)
curl -X POST http://localhost:3001/api/database/failover/restore
```

## Best Practices

### 1. Operational Excellence

#### Daily Operations
- Monitor dashboard for alerts and status
- Review backup completion logs
- Check database performance metrics
- Verify sufficient disk space

#### Change Management
- Test database changes in development first
- Create backups before any modifications
- Document all configuration changes
- Plan maintenance windows for updates

#### Capacity Planning
- Monitor database growth trends
- Plan for storage expansion
- Consider migration to PostgreSQL for growth
- Regular performance baseline reviews

### 2. Security Best Practices

#### Access Management
- Use principle of least privilege
- Regular password rotation
- Monitor database access logs
- Restrict administrative access

#### Data Protection
- Encrypt backup files
- Secure backup storage location
- Regular security assessments
- Compliance with data protection regulations

### 3. Documentation

#### Maintain Records Of
- Database configuration changes
- Performance optimization efforts
- Backup and recovery procedures
- Incident response activities
- Migration and upgrade procedures

---

This guide provides comprehensive database administration procedures for the Discord Reminder Bot. Regular following of these procedures will ensure optimal performance, data integrity, and reliable service availability.

For additional technical details, refer to:
- [Architecture Documentation](ARCHITECTURE.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Monitoring Dashboard User Guide](MONITORING_DASHBOARD_USER_GUIDE.md)