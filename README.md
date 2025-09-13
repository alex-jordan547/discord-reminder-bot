# Discord Reminder Bot

A Discord bot that helps track user availability for events by monitoring reactions and sending automatic reminders to users who haven't responded.

## ✨ Features

- **🎯 Event Tracking**: Monitor Discord message reactions for event availability
- **🔔 Automated Reminders**: Send reminders to users who haven't responded
- **⚡ Dynamic Scheduling**: ±5 second precision instead of ±30 seconds
- **😴 Smart Sleep Mode**: 0% CPU usage when no events are being tracked
- **🎮 Multi-Server Support**: Works across multiple Discord servers
- **🛡️ Role-Based Permissions**: Configurable admin roles for management commands
- **💾 Persistent Storage**: SQLite database with automatic migration from JSON
- **🔄 Error Recovery**: Advanced retry system with statistics tracking
- **🧪 Test Mode**: Short intervals (30s, 1min, 2min) for development
- **⏸️ Pause/Resume**: Individual event control for maintenance periods

## 🚀 Quick Start

### Local Development (Recommended)

```bash
# Clone the repository
git clone https://github.com/alex-jordan547/discord-reminder-bot.git
cd discord-reminder-bot

# Set up Python environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install audioop-lts  # Required for Python 3.13

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your Discord token and settings

# Run the bot
./run_dev.sh
# Or manually: python bot.py
```

### Production Docker Deployment

**Pull from GitHub Container Registry (GHCR):**

```bash
# Pull the latest production-ready image
docker pull ghcr.io/alex-jordan547/discord-reminder-bot:latest

# Run with your configuration
docker run -d \
  --name discord-reminder-bot \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  ghcr.io/alex-jordan547/discord-reminder-bot:latest
```

**Available Image Tags:**
- `ghcr.io/alex-jordan547/discord-reminder-bot:latest` - Latest production build
- `ghcr.io/alex-jordan547/discord-reminder-bot:main-YYYY-MM-DD` - Date-tagged releases
- `ghcr.io/alex-jordan547/discord-reminder-bot:vX.Y.Z` - Semantic version releases

### Local Docker Development

```bash
# Development with auto-rebuild
docker-compose up --build

# Production (detached)
docker-compose up -d

# Check logs
docker-compose logs --tail=50 discord-reminder-bot

# Stop
docker-compose down
```

## 🎮 Commands

### Slash Commands (Modern Interface)

| Command | Description | Example |
|---------|-------------|---------|
| `/watch <message> [interval]` | Start monitoring a message with reminders | `/watch https://discord.com/channels/... 3600` |
| `/unwatch <message>` | Stop monitoring a message | `/unwatch https://discord.com/channels/...` |
| `/list` | List all tracked events on this server | `/list` |
| `/remind [message]` | Send manual reminder (all if no message) | `/remind https://discord.com/channels/...` |
| `/status <message>` | Show detailed status of a reminder | `/status https://discord.com/channels/...` |
| `/pause <message>` | Pause reminders for a message | `/pause https://discord.com/channels/...` |
| `/resume <message>` | Resume paused reminders | `/resume https://discord.com/channels/...` |
| `/set_interval <message> <interval>` | Change reminder interval | `/set_interval https://discord.com/channels/... 7200` |
| `/health` | Show bot health and error recovery stats | `/health` |
| `/help` | Show comprehensive help | `/help` |
| `/sync` | Synchronize slash commands (dev only) | `/sync` |

### Available Intervals

| Interval | Seconds | Use Case |
|----------|---------|----------|
| 30 seconds | 30 | Test mode only |
| 1 minute | 60 | Test mode only |
| 2 minutes | 120 | Test mode only |
| 5 minutes | 300 | Short-term events |
| 15 minutes | 900 | Quick events |
| 30 minutes | 1800 | Standard events |
| 1 hour | 3600 | **Default** - Regular events |
| 2 hours | 7200 | Long events |
| 6 hours | 21600 | Tournament events |
| 12 hours | 43200 | Daily events |
| 24 hours | 86400 | Weekly events |

### Administrative Commands

| Command | Description | Admin Only |
|---------|-------------|------------|
| `/db_status` | Show database status and statistics | ✅ |
| `/db_migrate` | Manually trigger JSON to SQLite migration | ✅ |
| `/db_backup` | Create database backup | ✅ |
| `/db_cleanup` | Clean up old reminder logs | ✅ |

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | *required* | Your Discord bot token |
| `REMINDER_INTERVAL_HOURS` | 1 | Default reminder interval in hours |
| `TEST_MODE` | false | Enable test mode with short intervals |
| `LOG_LEVEL` | INFO | Logging level (INFO/DEBUG) |
| `LOG_TO_FILE` | true | Enable file logging |
| `ADMIN_ROLES` | Admin,Moderateur,Coach | Comma-separated admin role names |
| `USE_SEPARATE_REMINDER_CHANNEL` | false | Create separate reminder channel |
| `REMINDER_CHANNEL_NAME` | rappels-events | Name for reminder channel |
| `DATABASE_PATH` | discord_bot.db | SQLite database file path |
| `ENABLE_SQLITE` | true | Enable SQLite storage (vs JSON fallback) |
| `AUTO_MIGRATE` | true | Automatically migrate from JSON to SQLite |

### Test Mode

Enable rapid development and testing:

```env
TEST_MODE=true
REMINDER_INTERVAL_HOURS=0.0167  # 1 minute
LOG_LEVEL=DEBUG
```

## 🏗️ Architecture

The bot uses a modern, modular architecture with SQLite database:

```
discord-reminder-bot/
├── bot.py                     # 🚀 Main entry point
├── commands/                  # 🎮 Discord command handlers  
│   ├── handlers.py           # Core business logic
│   ├── slash_commands.py     # Modern slash commands
│   └── command_utils.py      # Utility functions
├── config/                   # ⚙️ Configuration management
│   └── settings.py          # Centralized settings
├── models/                   # 📊 Database models (Pewee ORM)
│   ├── database_models.py   # SQLite models (Guild, Event, User, etc.)
│   ├── schema_manager.py    # Database schema management
│   ├── migrations.py        # Database migrations
│   └── validation.py        # Data validation
├── persistence/              # 💾 Data storage
│   ├── database.py          # SQLite connection management
│   └── storage.py           # Legacy JSON storage (fallback)
├── utils/                    # 🛠️ Utilities
│   ├── event_manager_sqlite.py  # SQLite-based event management
│   ├── data_migration.py    # JSON to SQLite migration
│   ├── logging_config.py    # Logging setup
│   ├── message_parser.py    # Discord message parsing
│   ├── permissions.py       # Role-based permissions
│   ├── error_recovery.py    # Error handling & retries
│   └── validation.py        # Input validation
├── tests/                    # 🧪 Organized test suite
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
├── docs/                     # 📚 Documentation
│   ├── DATABASE_ARCHITECTURE.md  # Database design
│   └── API_REFERENCE.md     # API documentation
└── scripts/                  # 🔧 Development utilities
    └── dev/                 # Development tools
```

### Key Components

**1. SQLite Database System**
- 🗄️ **Robust Storage**: SQLite database with Pewee ORM
- 🔄 **Auto Migration**: Seamless migration from JSON to SQLite
- 🛡️ **Data Integrity**: Foreign key constraints and validation
- 🏢 **Multi-Server Isolation**: Complete data separation per Discord server
- 📊 **Performance**: Optimized queries with proper indexing

**2. Dynamic Scheduling System**
- ⚡ **Precision**: ±5 seconds instead of ±30 seconds  
- 🎯 **Smart Planning**: Calculates exact next reminder time
- 😴 **Sleep Mode**: 0% CPU when no events to track
- 🔄 **Auto-Reschedule**: Recomputes timing after any changes

**3. Error Recovery & Monitoring**
- 📊 **Statistics Tracking**: Success rates, retry counts, error types
- 🔄 **Automatic Retries**: Configurable retry logic with exponential backoff
- 🚨 **Graceful Degradation**: Continues operating despite individual failures
- 📈 **Health Monitoring**: `/health` and `/db_status` commands
- 🔙 **Rollback Support**: Automatic rollback to JSON if migration fails

**4. Modern Discord Integration**
- 💬 **Slash Commands**: Native Discord interface with autocomplete
- 🔐 **Permission System**: Role-based access control
- 🌐 **Multi-Server**: Isolated operation per Discord server
- 📝 **Rich Embeds**: Beautiful formatted responses

## 🔄 Database Migration

The bot automatically migrates from JSON storage to SQLite on first startup.

### Automatic Migration

When you start the bot for the first time after the SQLite update:

1. **Backup Creation**: Your existing `watched_reminders.json` is automatically backed up
2. **Data Migration**: All events, reactions, and settings are migrated to SQLite
3. **Validation**: The migration is validated to ensure no data loss
4. **Archive**: Original JSON files are archived with timestamp

### Manual Migration Commands

If you need to manually control the migration process:

```bash
# Check migration status
python -c "from utils.data_migration import get_migration_status; print(get_migration_status())"

# Force migration (if automatic migration failed)
python -c "from utils.data_migration import DataMigration; import asyncio; asyncio.run(DataMigration('watched_reminders.json').migrate_from_json())"

# Rollback to JSON (emergency only)
python -c "from utils.data_migration import DataMigration; import asyncio; asyncio.run(DataMigration('watched_reminders.json').rollback_to_json())"
```

### Migration Troubleshooting

**Migration fails with "JSON corrupt" error:**
```bash
# Validate your JSON file
python -c "import json; json.load(open('watched_reminders.json'))"
```

**Database locked error:**
```bash
# Stop the bot and try again
# Check if discord_bot.db file has proper permissions
ls -la discord_bot.db
```

**Data missing after migration:**
```bash
# Check migration logs
tail -f logs/bot_$(date +%Y%m%d).log | grep -i migration

# Verify data in database
python -c "from models.schema_manager import get_database_status; print(get_database_status())"
```

## 🧪 Testing & Development

### Run Tests

```bash
# Unit tests
python -m pytest tests/unit/ -v

# Integration tests  
python -m pytest tests/integration/ -v

# All tests
python -m pytest tests/ -v

# Specific test modules
python tests/unit/test_dynamic_scheduling.py
python tests/unit/test_sleep_mode.py
python tests/integration/test_health_commands.py
```

### Development Scripts

```bash
# Format code
python scripts/dev/fix_formatting.py

# Validate imports
python scripts/dev/validate_imports.py

# Demo features
./scripts/dev/demo_help.sh
```

### Health Monitoring

Check bot status with `/health` command:
- **📊 Statistics**: Total calls, success rates, error counts
- **🔄 Recovery**: Retry attempts and recovery rates  
- **⚠️ Error Types**: Most common error types
- **📈 Performance**: System health metrics

## 🐛 Troubleshooting

### Common Issues

**Bot not responding to slash commands:**
```bash
# Sync commands manually
# Use /sync command in Discord (admin only)
```

**Database migration issues:**
```bash
# Check database status
python -c "from models.schema_manager import get_database_status; print(get_database_status())"

# Verify database integrity
python -c "from models.schema_manager import verify_database_integrity; print(verify_database_integrity())"

# Reset database (CAUTION: deletes all data)
python -c "from models.schema_manager import reset_database; reset_database()"
```

**Database locked errors:**
```bash
# Stop the bot completely
pkill -f "python bot.py"

# Check for database locks
lsof discord_bot.db

# Restart the bot
python bot.py
```

**Migration rollback needed:**
```bash
# Emergency rollback to JSON
python -c "from utils.data_migration import DataMigration; import asyncio; asyncio.run(DataMigration('watched_reminders.json').rollback_to_json())"

# Disable SQLite temporarily
export ENABLE_SQLITE=false
python bot.py
```

**Python 3.13 compatibility:**
```bash
pip install audioop-lts
```

**Import errors:**
```bash
python scripts/dev/validate_imports.py
```

**Formatting issues:**
```bash
python scripts/dev/fix_formatting.py
```

### Logging

Real-time logs:
```bash
# Local development
tail -f logs/bot_$(date +%Y%m%d).log

# Docker deployment
docker-compose logs -f discord-reminder-bot
```

Debug mode:
```env
LOG_LEVEL=DEBUG  # Detailed logs including scheduling timestamps
```

## 📚 Documentation

- **[docs/CLAUDE.md](docs/CLAUDE.md)**: Development guidelines and architecture details
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**: Contributor guide
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)**: Version history

## 🤝 Contributing

We welcome contributions! Key areas for improvement:
- 🧪 Additional test coverage
- 📚 Documentation improvements  
- 🔧 New command features
- 🐛 Bug fixes and optimizations

## 📄 License

This project is open source. See the LICENSE file for details.

---

## 🎯 Recent Improvements

- ✅ **SQLite Migration**: Complete migration from JSON to SQLite database with Pewee ORM
- ✅ **Automatic Data Migration**: Seamless migration from JSON with backup and rollback support
- ✅ **Enhanced Multi-Server Isolation**: Complete data separation per Discord server with foreign key constraints
- ✅ **Database Administration**: New admin commands for database management and monitoring
- ✅ **Improved Data Integrity**: Comprehensive validation and constraint enforcement
- ✅ **Performance Optimization**: Indexed queries and optimized database operations
- ✅ **Dynamic Scheduling**: Replaced 60-second polling with precise timestamp-based planning
- ✅ **Smart Sleep Mode**: 0% CPU usage when no events are being tracked (saves ~288 checks/day)
- ✅ **Error Recovery**: Advanced retry system with statistics and health monitoring
- ✅ **Test Mode**: Short intervals (30s/1min/2min) for rapid development and testing
- ✅ **Slash Commands**: Full migration to modern Discord slash command interface
- ✅ **Modular Architecture**: Clean separation of concerns with organized codebase
- ✅ **Health Monitoring**: `/health` and `/db_status` commands provide detailed system statistics

---

**🚀 Ready to enhance your Discord community's event coordination!**