# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Bot
```bash
# Local development (requires environment setup)
python bot.py

# Docker development
docker-compose up --build

# Docker production (detached)
docker-compose up -d
```

### Testing Configuration
Set `REMINDER_INTERVAL_HOURS=0.1` for rapid testing (6-minute intervals instead of 24 hours).

## Architecture Overview

### Core Components

**MatchReminder Class** (`bot.py:30-65`)
- Central data structure storing match state, user reactions, and timing information
- Serialization methods for JSON persistence (`to_dict/from_dict`)
- Tracks `all_users` (server members) vs `users_who_reacted` for availability calculation

**Persistence Layer** (`bot.py:67-83`)
- JSON file storage in `watched_matches.json`
- Auto-saves on state changes via `save_matches()`
- Graceful handling of missing save files

**Event-Driven Architecture**
- Discord.py event handlers for reactions (`on_reaction_add/remove`)
- Task loop for automated reminders (`check_reminders`)
- Command system with role-based permissions

### Key Data Flow

1. **Match Watching**: Admin adds message link → extract IDs → create MatchReminder → scan existing reactions
2. **State Tracking**: React events → update `users_who_reacted` → auto-save
3. **Reminder Logic**: Task loop → check time intervals → calculate missing users → send reminders

### Configuration System

Environment variables with defaults:
- `DISCORD_TOKEN` (required)
- `REMINDER_INTERVAL_HOURS` (default: 24, supports fractional for testing)
- `USE_SEPARATE_REMINDER_CHANNEL` (default: false)
- `REMINDER_CHANNEL_NAME` (default: "rappels-matchs")
- `ADMIN_ROLES` (default: "Admin,Moderateur,Coach")

### Permission Model

Role-based access for admin commands (`watch`, `unwatch`, `remind`):
- Server administrators (automatic)
- Members with roles defined in `ADMIN_ROLES` environment variable

### Multi-Server Support

- Guild-aware data storage with `guild_id` tracking
- Server-specific filtering for all commands
- Automatic channel creation per server when using separate reminder channels

## Key Implementation Details

### Message Link Parsing
Uses regex to extract `guild_id/channel_id/message_id` from Discord message links.

### Reaction Tracking Strategy
- Stores user IDs in sets for efficient lookup
- Real-time updates via Discord events
- Full rescan during reminder generation for accuracy

### Reminder Rate Limiting
- 50-mention limit per reminder to avoid Discord spam detection
- 2-second delays between reminder messages
- Footer indicates when users are truncated

### Data Persistence
- All state changes immediately saved to JSON
- Backward compatibility handling in `from_dict` method
- No external database dependencies