# User Guide - Discord Reminder Bot

## Overview

This guide covers the new features and changes introduced with the SQLite database migration. The bot now provides enhanced data management, better performance, and improved multi-server support.

## What's New

### Database Storage
- **SQLite Database**: Your data is now stored in a robust SQLite database instead of JSON files
- **Automatic Migration**: Existing data is automatically migrated from JSON to SQLite
- **Better Performance**: Faster queries and improved response times
- **Data Integrity**: Enhanced data validation and consistency checks

### Enhanced Multi-Server Support
- **Complete Isolation**: Each Discord server's data is completely separate
- **No Data Leakage**: Impossible for data to accidentally appear in wrong servers
- **Independent Settings**: Each server can have its own configuration
- **Scalable**: Better performance with multiple servers

## New Administrative Commands

### Database Status
Check the health and status of your bot's database:

```
/db_status
```

This command shows:
- Database connection status
- Number of events, users, and reactions
- Database file size and performance metrics
- Recent error statistics

### Manual Migration
If automatic migration fails, administrators can trigger it manually:

```
/db_migrate
```

This command:
- Backs up existing JSON data
- Migrates all data to SQLite
- Validates the migration
- Reports any issues found

### Database Backup
Create a backup of your current database:

```
/db_backup
```

This command:
- Creates a timestamped backup
- Includes all events, reactions, and settings
- Stores backup in the data/backups directory

### Database Cleanup
Clean up old reminder logs and optimize the database:

```
/db_cleanup [days]
```

This command:
- Removes reminder logs older than specified days (default: 30)
- Optimizes database performance
- Reports space saved

## Migration Process

### Automatic Migration
When you first start the bot after the SQLite update:

1. **Detection**: Bot detects existing JSON files
2. **Backup**: Creates automatic backup of JSON data
3. **Migration**: Converts all data to SQLite format
4. **Validation**: Verifies all data was migrated correctly
5. **Archive**: Moves JSON files to archive folder

### What Gets Migrated
- ✅ All tracked events and their settings
- ✅ User reactions and response history
- ✅ Reminder intervals and pause states
- ✅ Guild-specific settings
- ✅ Last reminder timestamps

### Rollback Support
If something goes wrong, the bot can rollback to JSON:
- Automatic rollback if migration fails
- Manual rollback available for administrators
- Original data is always preserved during migration

## Improved Features

### Better Event Management
- **Faster Queries**: Event lookups are now much faster
- **Better Validation**: Stricter data validation prevents errors
- **Relationship Tracking**: Better tracking of user-event relationships
- **History Logging**: Complete history of all reminder activities

### Enhanced Performance
- **Optimized Queries**: Database queries are optimized with proper indexes
- **Reduced Memory Usage**: More efficient memory management
- **Faster Startup**: Quicker bot startup times
- **Better Concurrency**: Improved handling of simultaneous operations

### Improved Error Handling
- **Better Error Messages**: More descriptive error messages
- **Automatic Recovery**: Better recovery from temporary failures
- **Data Validation**: Comprehensive validation prevents data corruption
- **Logging**: Detailed logging for troubleshooting

## Configuration Options

### Environment Variables
New configuration options for database management:

```env
# Database configuration
DATABASE_PATH=discord_bot.db          # Database file location
ENABLE_SQLITE=true                    # Enable SQLite (vs JSON fallback)
AUTO_MIGRATE=true                     # Automatically migrate from JSON

# Migration settings
BACKUP_JSON=true                      # Backup JSON files during migration
STRICT_VALIDATION=true                # Enable strict data validation
ROLLBACK_ON_ERROR=true               # Auto-rollback on migration failure
```

## Troubleshooting

### Common Issues

**"Database is locked" error:**
- Stop the bot completely
- Wait a few seconds
- Restart the bot
- If persistent, check file permissions on discord_bot.db

**Migration fails:**
- Check that watched_reminders.json is valid JSON
- Ensure sufficient disk space
- Check file permissions in bot directory
- Review bot logs for specific error messages

**Data appears missing:**
- Use `/db_status` to check database contents
- Verify you're looking at the correct Discord server
- Check if events were paused during migration
- Review migration logs for any skipped items

**Performance issues:**
- Use `/db_cleanup` to optimize database
- Check available disk space
- Restart the bot to clear any memory issues
- Review bot logs for error patterns

### Getting Help

If you encounter issues:

1. **Check Logs**: Review the bot logs for error messages
2. **Use Status Commands**: Run `/db_status` and `/health` commands
3. **Check Documentation**: Review this guide and the technical documentation
4. **Report Issues**: If problems persist, report them with log details

## Best Practices

### For Server Administrators
- **Regular Backups**: Use `/db_backup` regularly to create backups
- **Monitor Status**: Periodically check `/db_status` for health
- **Clean Up**: Use `/db_cleanup` monthly to maintain performance
- **Update Regularly**: Keep the bot updated for latest improvements

### For Users
- **React Promptly**: React to events promptly to keep data current
- **Report Issues**: Report any unusual behavior to administrators
- **Understand Isolation**: Remember that each server's data is separate
- **Use New Features**: Take advantage of improved performance and reliability

## Migration FAQ

**Q: Will I lose any data during migration?**
A: No, the migration process creates backups and validates all data. If migration fails, you can rollback to the original JSON files.

**Q: How long does migration take?**
A: Migration is usually very fast (seconds to minutes), depending on how much data you have.

**Q: Can I still use JSON files?**
A: The bot can fallback to JSON if needed, but SQLite is recommended for better performance and reliability.

**Q: What happens to my old JSON files?**
A: They are automatically backed up and archived. You can safely delete them after confirming migration was successful.

**Q: Can I migrate back to JSON?**
A: Yes, administrators can use rollback commands, but this is only recommended in emergency situations.

This guide covers the major changes and new features. For technical details, see the DATABASE_ARCHITECTURE.md and API_REFERENCE.md documents.