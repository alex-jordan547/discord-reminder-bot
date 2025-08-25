# Database Infrastructure

This directory contains the database infrastructure for the Discord Reminder Bot's SQLite migration.

## Overview

The database infrastructure provides a complete SQLite-based persistence layer using the Pewee ORM, designed to replace the existing JSON file storage system.

## Architecture

```
persistence/
├── database.py          # Database connection and configuration
├── database_manager.py  # High-level database management
├── storage.py          # Legacy JSON storage (for migration)
└── README.md           # This file

models/
└── database_models.py  # Pewee ORM models
```

## Components

### Database Connection (`database.py`)

Manages SQLite database connections with optimized settings:

- **WAL Mode**: Write-Ahead Logging for better concurrency
- **64MB Cache**: Improved query performance
- **Foreign Keys**: Enabled for data integrity
- **Environment Configuration**: Supports test and production modes

```python
from persistence.database import get_database, initialize_database

# Initialize database connection
success = initialize_database()

# Get database instance
db = get_database()
```

### Database Manager (`database_manager.py`)

High-level database management with health monitoring:

```python
from persistence.database_manager import get_database_manager

# Get manager instance
manager = get_database_manager()

# Initialize database system
await manager.initialize()

# Health check
health = await manager.health_check()

# Create backup
await manager.backup_database()

# Optimize database
await manager.optimize_database()
```

### Database Models (`models/database_models.py`)

Pewee ORM models for all data entities:

- **Guild**: Discord server information and settings
- **User**: User information per guild
- **Event**: Events being monitored (formerly "matches")
- **Reaction**: User reactions to events
- **ReminderLog**: History of sent reminders

```python
from models.database_models import Guild, Event, initialize_models

# Initialize models (required before use)
initialize_models()

# Create a guild
guild = Guild.create(guild_id=123456, name="My Server")

# Create an event
event = Event.create(
    message_id=789012,
    channel_id=345678,
    guild=guild,
    title="Weekly Meeting"
)
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_SQLITE` | `false` | Enable SQLite database |
| `DATABASE_PATH` | `discord_bot.db` | Path to database file |
| `AUTO_MIGRATE` | `true` | Automatic JSON to SQLite migration |
| `BACKUP_JSON_ON_MIGRATION` | `true` | Backup JSON files during migration |
| `TEST_MODE` | `false` | Use in-memory database for testing |

### Example Configuration

```bash
# Enable SQLite
export USE_SQLITE=true

# Custom database path
export DATABASE_PATH=/data/bot.db

# Enable test mode (in-memory database)
export TEST_MODE=true
```

## Database Schema

### Tables

1. **guild**
   - `guild_id` (Primary Key): Discord guild ID
   - `name`: Guild name
   - `settings`: JSON settings
   - `created_at`, `updated_at`: Timestamps

2. **user**
   - `id` (Primary Key): Auto-increment ID
   - `user_id`: Discord user ID
   - `guild_id` (Foreign Key): Reference to guild
   - `username`: User display name
   - `is_bot`: Boolean flag
   - `last_seen`: Last activity timestamp
   - `created_at`, `updated_at`: Timestamps

3. **event**
   - `id` (Primary Key): Auto-increment ID
   - `message_id` (Unique): Discord message ID
   - `channel_id`: Discord channel ID
   - `guild_id` (Foreign Key): Reference to guild
   - `title`: Event title
   - `description`: Event description
   - `interval_minutes`: Reminder interval
   - `is_paused`: Pause status
   - `last_reminder`: Last reminder timestamp
   - `required_reactions`: JSON array of required emojis
   - `created_at`, `updated_at`: Timestamps

4. **reaction**
   - `id` (Primary Key): Auto-increment ID
   - `event_id` (Foreign Key): Reference to event
   - `user_id`: Discord user ID
   - `emoji`: Reaction emoji
   - `reacted_at`: Reaction timestamp
   - `created_at`, `updated_at`: Timestamps

5. **reminderlog**
   - `id` (Primary Key): Auto-increment ID
   - `event_id` (Foreign Key): Reference to event
   - `scheduled_at`: When reminder was scheduled
   - `sent_at`: When reminder was sent
   - `users_notified`: Number of users notified
   - `status`: Reminder status (pending, sent, failed)
   - `error_message`: Error details if failed
   - `created_at`, `updated_at`: Timestamps

## Usage Examples

### Basic Setup

```python
import asyncio
from persistence.database_manager import initialize_database_system

async def setup():
    # Initialize the database system
    success = await initialize_database_system()
    if success:
        print("Database ready!")
    else:
        print("Database initialization failed!")

asyncio.run(setup())
```

### Working with Models

```python
from models.database_models import Guild, Event, initialize_models

# Initialize models
initialize_models()

# Create a guild
guild = Guild.create(
    guild_id=123456789,
    name="My Discord Server",
    settings='{"auto_delete": true}'
)

# Create an event
event = Event.create(
    message_id=987654321,
    channel_id=555666777,
    guild=guild,
    title="Weekly Team Meeting",
    interval_minutes=1440  # 24 hours
)

# Query events for a guild
guild_events = Event.select().where(Event.guild == guild)
for event in guild_events:
    print(f"Event: {event.title}")
```

### Health Monitoring

```python
from persistence.database_manager import get_database_manager

async def check_health():
    manager = get_database_manager()
    health = await manager.health_check()
    
    print(f"Status: {health['status']}")
    print(f"Database Available: {health['database_available']}")
    print(f"Tables Exist: {health['tables_exist']}")
    
    if health['errors']:
        print("Errors:")
        for error in health['errors']:
            print(f"  - {error}")

asyncio.run(check_health())
```

## Testing

### Initialize Database

```bash
# Initialize database and create tables
python3 scripts/init_database.py
```

### Test Models

```bash
# Test CRUD operations on all models
python3 scripts/test_database_models.py
```

### Test Configuration

```bash
# Test environment configuration
python3 scripts/test_database_config.py
```

## Migration from JSON

The database infrastructure is designed to work alongside the existing JSON storage system during the migration phase. The migration process will:

1. **Detect existing JSON files**
2. **Create database tables**
3. **Migrate data from JSON to SQLite**
4. **Backup original JSON files**
5. **Switch to SQLite for all operations**

See the migration specification in `.kiro/specs/sqlite-migration/` for detailed migration plans.

## Performance Considerations

### Optimizations

- **WAL Mode**: Enables concurrent reads during writes
- **Connection Pooling**: Reuses database connections
- **Prepared Statements**: Pewee automatically uses prepared statements
- **Indexes**: Will be added in later tasks for query optimization

### Monitoring

- **Health Checks**: Regular database health monitoring
- **Query Performance**: Logging of slow queries
- **Database Size**: Monitoring of database file growth
- **Connection Status**: Tracking of connection pool usage

## Troubleshooting

### Common Issues

1. **Database Locked**
   - Ensure no other processes are using the database
   - Check for stale lock files
   - Restart the application

2. **Permission Errors**
   - Verify write permissions to database directory
   - Check file ownership and permissions

3. **Corruption**
   - Use `PRAGMA integrity_check` to verify database
   - Restore from backup if necessary
   - Run `VACUUM` to rebuild database

### Debug Commands

```python
# Check database info
from persistence.database import get_database_info
info = get_database_info()
print(info)

# Check table info
from models.database_models import get_table_info
tables = get_table_info()
print(tables)

# Health check
from persistence.database_manager import get_database_manager
manager = get_database_manager()
health = await manager.health_check()
print(health)
```

## Security Considerations

- **SQL Injection**: Pewee ORM provides protection against SQL injection
- **File Permissions**: Database files should have restricted permissions
- **Backup Security**: Backup files should be stored securely
- **Connection Security**: Database connections are local (SQLite)

## Future Enhancements

- **Connection Pooling**: For high-concurrency scenarios
- **Read Replicas**: For scaling read operations
- **Sharding**: For very large datasets
- **Encryption**: Database file encryption for sensitive data