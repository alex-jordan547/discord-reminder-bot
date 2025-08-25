# Discord Reminder Bot

A Discord bot that helps track user availability for events by monitoring reactions and sending automatic reminders to users who haven't responded.

## ✨ Features

- **🎯 Event Tracking**: Monitor Discord message reactions for event availability
- **🔔 Automated Reminders**: Send reminders to users who haven't responded
- **⚡ Dynamic Scheduling**: ±5 second precision instead of ±30 seconds
- **😴 Smart Sleep Mode**: 0% CPU usage when no events are being tracked
- **🎮 Multi-Server Support**: Works across multiple Discord servers
- **🛡️ Role-Based Permissions**: Configurable admin roles for management commands
- **💾 Persistent Storage**: JSON-based data persistence without external databases
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
cp .env.example .env
# Edit .env with your Discord token and settings

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

### Test Mode

Enable rapid development and testing:

```env
TEST_MODE=true
REMINDER_INTERVAL_HOURS=0.0167  # 1 minute
LOG_LEVEL=DEBUG
```

## 🏗️ Architecture

The bot uses a modern, modular architecture:

```
discord-reminder-bot/
├── bot.py                     # 🚀 Main entry point
├── commands/                  # 🎮 Discord command handlers  
│   ├── handlers.py           # Core business logic
│   ├── slash_commands.py     # Modern slash commands
│   └── command_utils.py      # Utility functions
├── config/                   # ⚙️ Configuration management
│   └── settings.py          # Centralized settings
├── models/                   # 📊 Data models
│   └── reminder.py          # Event class
├── persistence/              # 💾 Data storage
│   └── storage.py           # JSON persistence layer
├── utils/                    # 🛠️ Utilities
│   ├── logging_config.py    # Logging setup
│   ├── message_parser.py    # Discord message parsing
│   ├── permissions.py       # Role-based permissions
│   ├── error_recovery.py    # Error handling & retries
│   └── validation.py        # Input validation
├── tests/                    # 🧪 Organized test suite
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
└── scripts/                  # 🔧 Development utilities
    └── dev/                 # Development tools
```

### Key Components

**1. Dynamic Scheduling System**
- ⚡ **Precision**: ±5 seconds instead of ±30 seconds  
- 🎯 **Smart Planning**: Calculates exact next reminder time
- 😴 **Sleep Mode**: 0% CPU when no events to track
- 🔄 **Auto-Reschedule**: Recomputes timing after any changes

**2. Error Recovery**
- 📊 **Statistics Tracking**: Success rates, retry counts, error types
- 🔄 **Automatic Retries**: Configurable retry logic with exponential backoff
- 🚨 **Graceful Degradation**: Continues operating despite individual failures
- 📈 **Health Monitoring**: `/health` command shows system statistics

**3. Modern Discord Integration**
- 💬 **Slash Commands**: Native Discord interface with autocomplete
- 🔐 **Permission System**: Role-based access control
- 🌐 **Multi-Server**: Isolated operation per Discord server
- 📝 **Rich Embeds**: Beautiful formatted responses

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

- **[CLAUDE.md](CLAUDE.md)**: Development guidelines and architecture details
- **[CONTRIBUTING.md](CONTRIBUTING.md)**: Contributor guide
- **[CHANGELOG.md](CHANGELOG.md)**: Version history

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

- ✅ **Dynamic Scheduling**: Replaced 60-second polling with precise timestamp-based planning
- ✅ **Smart Sleep Mode**: 0% CPU usage when no events are being tracked (saves ~288 checks/day)
- ✅ **Error Recovery**: Advanced retry system with statistics and health monitoring
- ✅ **Test Mode**: Short intervals (30s/1min/2min) for rapid development and testing
- ✅ **Slash Commands**: Full migration to modern Discord slash command interface
- ✅ **Modular Architecture**: Clean separation of concerns with organized codebase
- ✅ **Health Monitoring**: `/health` command provides detailed system statistics
- ✅ **Multi-Server**: Proper isolation and permission handling per Discord server

---

**🚀 Ready to enhance your Discord community's event coordination!**