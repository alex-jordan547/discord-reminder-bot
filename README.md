# Discord Reminder Bot

A Discord bot that helps track user availability for matches by monitoring reactions and sending automatic reminders to users who haven't responded.

## Quick Start

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment variables
export DISCORD_TOKEN="your_discord_token_here"

# Run the bot
python bot.py
```

### Docker Deployment

#### Development with Docker
```bash
# Build and run with auto-rebuild
docker-compose up --build

# Run in background
docker-compose up -d
```

#### Production Deployment
```bash
# Create environment file
cp .env.example .env
# Edit .env with your Discord token and configuration

# Deploy in production mode
docker-compose up -d

# Check logs
docker-compose logs -f

# Check health
docker-compose ps
```

#### Docker Configuration

The bot supports several environment variables for Docker deployment:

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | *required* | Your Discord bot token |
| `REMINDER_INTERVAL_HOURS` | 24 | Hours between reminders (supports decimals) |
| `USE_SEPARATE_REMINDER_CHANNEL` | false | Create separate reminder channel |
| `REMINDER_CHANNEL_NAME` | "rappels-matchs" | Name for reminder channel |
| `ADMIN_ROLES` | "Admin,Moderateur,Coach" | Comma-separated admin roles |

#### Testing Docker Setup
```bash
# Validate Docker configuration
python validate_docker_structure.py

# Run Docker integration tests
python tests/test_docker_integration.py
```

#### Health Monitoring

The container includes a health check that verifies the Discord bot modules can be imported correctly. Check container health with:
```bash
docker inspect --format='{{.State.Health.Status}}' <container-name>
```

## Features

- **Match Tracking**: Monitor Discord message reactions for match availability
- **Automated Reminders**: Send reminders to users who haven't responded
- **Multi-Server Support**: Works across multiple Discord servers
- **Role-Based Permissions**: Configurable admin roles for management commands
- **Persistent Storage**: JSON-based data persistence without external databases

## Commands

- `!watch <message_link>` - Start tracking a match message
- `!unwatch <message_link>` - Stop tracking a match message  
- `!remind <message_link>` - Send immediate reminder
- `!list` - List all tracked matches

## Architecture

The bot uses a modular architecture with the following components:

- **Commands**: Discord command handlers
- **Config**: Configuration and settings management
- **Models**: Data models for match tracking
- **Persistence**: JSON storage layer
- **Utils**: Utilities for logging, parsing, migrations, and permissions

For detailed architecture information, see `CLAUDE.md`.
