# Terminology Migration Guide

## Overview

This document outlines the terminology migration from "match" to "event" throughout the Discord Reminder Bot codebase. This change reflects the generic nature of the events being monitored and improves code clarity.

## Changes Made

### Code Changes

#### Models
- `MatchReminder` class → `Event` class (with backward compatibility alias)
- All model references updated to use "event" terminology
- Database models use "Event" as the primary class name

#### Functions and Variables
- `migrate_matches_data()` → `migrate_events_data()` (with compatibility alias)
- Variable names changed from `match_*` to `event_*` throughout the codebase
- Log messages updated to use "event" terminology

#### File References
- Primary data file: `watched_events.json` (legacy: `watched_matches.json`)
- Backup files: `watched_events_YYYYMMDD_HHMMSS.json`
- Legacy backup format still supported for compatibility

### Documentation Changes

#### User-Facing Documentation
- README.md: Updated all references from "match" to "event"
- Command descriptions now refer to "events" instead of "matches"
- Help text and examples updated

#### Technical Documentation
- CONTRIBUTING.md: Updated architecture references
- CLAUDE.md: Updated French documentation to use "événement"
- All code comments updated to use consistent terminology

#### Configuration
- Default reminder channel name: `rappels-events` (was `rappels-matchs`)
- Environment variable descriptions updated

### User Interface Changes

#### Discord Commands
- Command descriptions updated to use "event" terminology
- Help messages now refer to "events" instead of "matches"
- Error messages use consistent "event" terminology

#### Log Messages
- All log messages updated to use "event" instead of "match"
- Debug messages use consistent terminology
- Error reporting uses "event" terminology

## Backward Compatibility

### Legacy Support
- `MatchReminder` alias maintained for backward compatibility
- Legacy function names (`save_matches`, `load_matches`) still available
- Old data file names (`watched_matches.json`) still supported
- Legacy backup format recognized and processed

### Migration Path
1. Existing code using `MatchReminder` continues to work
2. New code should use `Event` class
3. Legacy function calls are automatically redirected
4. Data files are automatically migrated on first run

### Deprecation Timeline
- **Phase 1** (Current): Both terminologies supported
- **Phase 2** (Future): Legacy aliases marked as deprecated
- **Phase 3** (Long-term): Legacy aliases removed after sufficient notice

## Implementation Details

### Files Modified
- `utils/migration.py`: Updated function names and log messages
- `utils/message_parser.py`: Updated title generation
- `models/__init__.py`: Added both new and legacy exports
- `persistence/__init__.py`: Added both new and legacy function exports
- All documentation files: Updated terminology
- Test files: Updated test data and assertions

### Compatibility Aliases
```python
# In models/reminder.py
MatchReminder = Event  # Legacy compatibility

# In utils/migration.py
migrate_matches_data = migrate_events_data  # Legacy compatibility

# In persistence/storage.py
def save_matches(watched_matches): return save_events(watched_matches)
def load_matches(): return load_events()
```

### Configuration Updates
- `REMINDER_CHANNEL_NAME`: Default changed to `rappels-events`
- Data file paths support both old and new naming conventions
- Backup strategies handle both naming formats

## Testing

### Test Updates
- Test fixtures updated to use "event" terminology
- Test assertions updated for new class names
- Compatibility tests ensure legacy code still works
- Integration tests verify both old and new APIs

### Validation
- All existing functionality preserved
- Legacy code paths tested and verified
- New terminology consistently applied
- Documentation accuracy verified

## Migration Checklist

### For Developers
- [ ] Update imports to use `Event` instead of `MatchReminder`
- [ ] Update variable names from `match_*` to `event_*`
- [ ] Update function calls to use new naming (optional, legacy still works)
- [ ] Update documentation and comments
- [ ] Update test cases to use new terminology

### For Users
- [ ] No action required - all changes are backward compatible
- [ ] Optional: Update configuration to use new channel name format
- [ ] Optional: Update any custom scripts to use new terminology

### For Administrators
- [ ] Review log messages for new terminology
- [ ] Update monitoring scripts if they parse log messages
- [ ] Consider updating channel names to match new convention
- [ ] Review backup procedures for new file naming

## Benefits

### Code Quality
- Consistent terminology throughout codebase
- More descriptive and generic naming
- Improved code readability and maintainability
- Better alignment with actual functionality

### User Experience
- Clearer command descriptions
- More intuitive terminology for general events
- Consistent language across all interfaces
- Better documentation and help text

### Technical Benefits
- Easier onboarding for new developers
- Reduced confusion about terminology
- Better code organization and structure
- Improved maintainability

## Support

### Getting Help
- Check this migration guide for compatibility information
- Review the main README.md for updated examples
- Legacy code continues to work without changes
- New features will use the updated terminology

### Reporting Issues
- Report any compatibility issues with legacy code
- Document any missing aliases or compatibility functions
- Suggest improvements to the migration process
- Provide feedback on documentation clarity