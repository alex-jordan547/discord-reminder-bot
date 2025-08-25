# Data Directory

This directory contains runtime data for the Discord Reminder Bot.

## Structure

```
data/
├── logs/           # Application logs
├── backups/        # Data backups
└── README.md       # This file
```

## Files

### Root Level
- `watched_events.json` - Main data file (created at runtime)
- `watched_matches.json` - Legacy filename (deprecated)

### Logs Directory
- `bot_YYYYMMDD.log` - Daily log files
- `error.log` - Error-specific logs
- `debug.log` - Debug information (when LOG_LEVEL=DEBUG)

### Backups Directory
- `watched_events_YYYYMMDD_HHMMSS.json` - Automatic backups
- `watched_matches_YYYYMMDD_HHMMSS.json` - Legacy backup format
- `recovery/` - Recovery data from error scenarios

## Configuration

Data storage is configured via environment variables:

- `LOG_TO_FILE=true` - Enable file logging
- `LOG_LEVEL=INFO` - Set logging level (INFO/DEBUG)
- `DATA_BACKUP_ENABLED=true` - Enable automatic backups
- `DATA_BACKUP_INTERVAL_HOURS=24` - Backup frequency

## Maintenance

### Log Rotation
Logs are rotated automatically by date. Old logs can be safely removed after archival.

### Backup Management
Backups older than 30 days can be cleaned up manually or via automation.

### Data Recovery
In case of data corruption:
1. Check latest backup in `backups/`
2. Copy to `watched_events.json` (or `watched_matches.json` for legacy compatibility)
3. Restart the bot

## Security

- This directory may contain sensitive Discord IDs
- Ensure proper file permissions in production
- Include in .gitignore to avoid committing runtime data