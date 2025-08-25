# API Reference - Discord Reminder Bot

## Overview

This document provides comprehensive API reference for the Discord Reminder Bot's internal components after the SQLite migration. The API is organized into logical modules with clear interfaces and usage examples.

## Core Models API

### BaseModel

Base class for all database models providing common functionality.

```python
class BaseModel(Model, ValidationMixin, SerializationMixin):
    """Base model with automatic timestamps and validation."""
    
    created_at: DateTimeField
    updated_at: DateTimeField
    
    def save(self, *args, **kwargs) -> BaseModel
    def clean(self) -> None
    def full_clean(self, validate_unique: bool = True) -> None
```

**Methods:**
- `save()`: Save model with automatic timestamp update
- `clean()`: Custom validation logic (override in subclasses)
- `full_clean()`: Complete validation including field and custom validation

### Guild Model

Represents a Discord server with settings and metadata.

```python
class Guild(BaseModel):
    """Discord guild (server) model."""
    
    guild_id: BigIntegerField  # Primary key
    name: CharField
    settings: TextField  # JSON serialized
    
    # Properties
    @property
    def settings_dict(self) -> Dict[str, Any]
    @settings_dict.setter
    def settings_dict(self, value: Dict[str, Any]) -> None
    
    # Methods
    def get_active_events_count(self) -> int
    def get_total_events_count(self) -> int
    def validate_data(self) -> List[str]
```

**Usage Example:**
```python
# Create a new guild
guild = Guild.create(
    guild_id=123456789,
    name="My Discord Server",
    settings_dict={"timezone": "UTC", "language": "en"}
)

# Get active events count
active_count = guild.get_active_events_count()

# Update settings
guild.settings_dict = {"timezone": "EST", "language": "fr"}
guild.save()
```

### User Model

Represents a Discord user within a guild context.

```python
class User(BaseModel):
    """Discord user model with guild context."""
    
    user_id: BigIntegerField
    guild: ForeignKeyField  # Reference to Guild
    username: CharField
    is_bot: BooleanField
    last_seen: DateTimeField
    
    # Methods
    def get_reaction_count(self) -> int
    def validate_data(self) -> List[str]
```

**Usage Example:**
```python
# Create a new user
user = User.create(
    user_id=987654321,
    guild=guild,
    username="JohnDoe",
    is_bot=False
)

# Get user's reaction count
reaction_count = user.get_reaction_count()

# Update last seen
user.last_seen = datetime.now()
user.save()
```

### Event Model

Main model representing events being tracked for reminders.

```python
class Event(BaseModel):
    """Event model for reminder tracking."""
    
    message_id: BigIntegerField  # Primary key
    channel_id: BigIntegerField
    guild: ForeignKeyField  # Reference to Guild
    title: CharField
    description: TextField
    interval_minutes: FloatField
    is_paused: BooleanField
    last_reminder: DateTimeField
    required_reactions: TextField  # JSON array
    
    # Properties
    @property
    def required_reactions_list(self) -> List[str]
    @required_reactions_list.setter
    def required_reactions_list(self, value: List[str]) -> None
    
    @property
    def is_due_for_reminder(self) -> bool
    @property
    def next_reminder_time(self) -> datetime
    @property
    def missing_users_count(self) -> int
    @property
    def response_percentage(self) -> float
    
    # Methods
    def mark_reminder_sent(self) -> None
    def get_missing_users(self) -> List[int]
    def get_reaction_count(self) -> int
    def get_total_users_count(self) -> int
    def get_next_reminder_time(self) -> datetime
    def get_status_summary(self) -> Dict[str, Any]
    async def update_accessible_users(self, bot_instance) -> None
    def validate_data(self) -> List[str]
```

**Usage Example:**
```python
# Create a new event
event = Event.create(
    message_id=111222333,
    channel_id=444555666,
    guild=guild,
    title="Weekly Team Meeting",
    description="Please react to confirm attendance",
    interval_minutes=1440,  # 24 hours
    required_reactions_list=["✅", "❌", "❓"]
)

# Check if reminder is due
if event.is_due_for_reminder:
    event.mark_reminder_sent()

# Get status summary
status = event.get_status_summary()
print(f"Response rate: {status['response_percentage']}%")
```

### Reaction Model

Represents user reactions to events.

```python
class Reaction(BaseModel):
    """User reaction to an event."""
    
    event: ForeignKeyField  # Reference to Event
    user_id: BigIntegerField
    emoji: CharField
    reacted_at: DateTimeField
    
    # Methods
    def validate_data(self) -> List[str]
```

**Usage Example:**
```python
# Record a user reaction
reaction = Reaction.create(
    event=event,
    user_id=987654321,
    emoji="✅",
    reacted_at=datetime.now()
)

# Query reactions for an event
reactions = Reaction.select().where(Reaction.event == event)
for reaction in reactions:
    print(f"User {reaction.user_id} reacted with {reaction.emoji}")
```

### ReminderLog Model

Tracks reminder history and status.

```python
class ReminderLog(BaseModel):
    """Log entry for sent reminders."""
    
    event: ForeignKeyField  # Reference to Event
    scheduled_at: DateTimeField
    sent_at: DateTimeField
    users_notified: IntegerField
    status: CharField  # 'pending', 'sent', 'failed'
    error_message: TextField
    
    # Methods
    def mark_as_sent(self, users_notified: int = 0) -> None
    def mark_as_failed(self, error_message: str) -> None
    def validate_data(self) -> List[str]
```

**Usage Example:**
```python
# Create a reminder log entry
log = ReminderLog.create(
    event=event,
    scheduled_at=datetime.now(),
    status='pending'
)

# Mark as sent
log.mark_as_sent(users_notified=5)

# Or mark as failed
log.mark_as_failed("Discord API rate limit exceeded")
```

## Database Management API

### Database Connection

```python
# persistence/database.py

def get_database() -> SqliteDatabase
def initialize_database() -> bool
def close_database() -> None
def get_database_info() -> dict
def is_database_available() -> bool

class DatabaseConfig:
    @staticmethod
    def is_test_mode() -> bool
    @staticmethod
    def get_test_database() -> SqliteDatabase
    @staticmethod
    def get_production_database() -> SqliteDatabase
    @classmethod
    def get_configured_database() -> SqliteDatabase
```

**Usage Example:**
```python
# Initialize database connection
if initialize_database():
    print("Database connected successfully")

# Get database info
info = get_database_info()
print(f"Database size: {info['database_size_mb']} MB")

# Check availability
if is_database_available():
    # Perform database operations
    pass
```

### Schema Management

```python
# models/schema_manager.py

def setup_database() -> bool
def get_database_status() -> Dict[str, Any]
def verify_database_integrity() -> bool
def reset_database() -> bool
def create_backup_info() -> Dict[str, Any]
```

**Usage Example:**
```python
# Complete database setup
if setup_database():
    print("Database setup completed")

# Get comprehensive status
status = get_database_status()
print(f"Tables: {list(status['table_info'].keys())}")

# Verify integrity
if verify_database_integrity():
    print("Database integrity verified")
```

### Model Management

```python
# models/database_models.py

def initialize_models() -> None
def create_tables() -> bool
def drop_tables() -> bool
def get_table_info() -> Dict[str, Any]

# List of all models
ALL_MODELS = [Guild, User, Event, Reaction, ReminderLog]
```

**Usage Example:**
```python
# Initialize models
initialize_models()

# Create all tables
if create_tables():
    print("Tables created successfully")

# Get table information
table_info = get_table_info()
for table, info in table_info.items():
    print(f"{table}: {info['row_count']} rows")
```

## Data Migration API

### Migration Classes

```python
# utils/data_migration.py

class DataMigration:
    """Main migration orchestrator."""
    
    def __init__(self, json_file_path: str)
    async def migrate_from_json(self) -> MigrationResult
    async def validate_migration(self) -> ValidationResult
    async def rollback_to_json(self) -> bool
    async def cleanup_old_files(self) -> bool

class MigrationResult:
    """Migration operation result."""
    
    success: bool
    guilds_migrated: int
    events_migrated: int
    reactions_migrated: int
    errors: List[str]
    duration_seconds: float

class ValidationResult:
    """Migration validation result."""
    
    is_valid: bool
    data_integrity_check: bool
    count_verification: bool
    errors: List[str]
```

**Usage Example:**
```python
# Perform migration
migration = DataMigration("watched_reminders.json")
result = await migration.migrate_from_json()

if result.success:
    print(f"Migrated {result.events_migrated} events successfully")
else:
    print(f"Migration failed: {result.errors}")

# Validate migration
validation = await migration.validate_migration()
if validation.is_valid:
    print("Migration validation passed")
```

## Event Management API

### EventManager

```python
# utils/event_manager_sqlite.py

class EventManager:
    """SQLite-based event management."""
    
    async def create_event(self, guild_id: int, message_id: int, **kwargs) -> Event
    async def get_event(self, message_id: int) -> Optional[Event]
    async def update_event(self, message_id: int, **kwargs) -> bool
    async def delete_event(self, message_id: int) -> bool
    async def get_guild_events(self, guild_id: int) -> List[Event]
    async def get_due_events(self) -> List[Event]
    async def pause_event(self, message_id: int) -> bool
    async def resume_event(self, message_id: int) -> bool
    async def set_event_interval(self, message_id: int, interval_minutes: float) -> bool
    async def add_reaction(self, message_id: int, user_id: int, emoji: str) -> bool
    async def remove_reaction(self, message_id: int, user_id: int) -> bool
    async def get_event_status(self, message_id: int) -> Optional[Dict[str, Any]]
```

**Usage Example:**
```python
# Create event manager
event_manager = EventManager()

# Create a new event
event = await event_manager.create_event(
    guild_id=123456789,
    message_id=111222333,
    channel_id=444555666,
    title="Team Meeting",
    interval_minutes=1440
)

# Get events due for reminder
due_events = await event_manager.get_due_events()
for event in due_events:
    print(f"Event {event.title} is due for reminder")

# Pause an event
await event_manager.pause_event(111222333)

# Get event status
status = await event_manager.get_event_status(111222333)
print(f"Event status: {status}")
```

## Validation API

### Field Validation

```python
# models/validation.py

class FieldValidator:
    """Field validation utilities."""
    
    @staticmethod
    def validate_discord_id(value: int, field_name: str) -> List[str]
    @staticmethod
    def validate_interval_minutes(value: float) -> List[str]
    @staticmethod
    def validate_emoji(emoji: str, field_name: str = "emoji") -> List[str]
    @staticmethod
    def validate_json_field(json_str: str, field_name: str) -> List[str]

class ValidationMixin:
    """Mixin for model validation."""
    
    def validate(self, raise_exception: bool = False) -> List[str]
    def is_valid(self) -> bool

class SerializationMixin:
    """Mixin for model serialization."""
    
    def to_dict(self, include_computed: bool = False) -> Dict[str, Any]
    def to_json(self, include_computed: bool = False) -> str
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'BaseModel'
```

**Usage Example:**
```python
# Validate Discord ID
errors = FieldValidator.validate_discord_id(123456789, "guild_id")
if errors:
    print(f"Validation errors: {errors}")

# Validate model
event = Event(title="", interval_minutes=-1)
if not event.is_valid():
    errors = event.validate()
    print(f"Model validation errors: {errors}")

# Serialize model
event_dict = event.to_dict(include_computed=True)
event_json = event.to_json()
```

## Utility APIs

### Concurrency Management

```python
# utils/concurrency_sqlite.py

class SQLiteConcurrencyManager:
    """Manage concurrent access to SQLite database."""
    
    def __init__(self)
    async def acquire_lock(self, resource_id: str) -> bool
    async def release_lock(self, resource_id: str) -> bool
    async def with_lock(self, resource_id: str, operation: Callable) -> Any
```

### Error Recovery

```python
# utils/error_recovery.py

class ErrorRecoveryManager:
    """Manage error recovery and retry logic."""
    
    def __init__(self)
    async def execute_with_retry(self, operation: Callable, max_retries: int = 3) -> Any
    def get_error_statistics(self) -> Dict[str, Any]
    def reset_statistics(self) -> None
```

## Configuration API

### Settings Management

```python
# config/settings.py

class Settings:
    """Application settings management."""
    
    # Database settings
    DATABASE_PATH: str
    DATABASE_BACKUP_DIR: str
    
    # Migration settings
    ENABLE_SQLITE: bool
    AUTO_MIGRATE: bool
    BACKUP_JSON: bool
    STRICT_VALIDATION: bool
    
    # Performance settings
    MAX_CONCURRENT_OPERATIONS: int
    QUERY_TIMEOUT_SECONDS: int
    
    @classmethod
    def load_from_env(cls) -> 'Settings'
    def to_dict(self) -> Dict[str, Any]
```

## Error Handling

### Exception Classes

```python
# Custom exceptions for database operations

class DatabaseError(Exception):
    """Base database error."""
    pass

class MigrationError(DatabaseError):
    """Migration-specific error."""
    
    CODES = {
        'JSON_CORRUPT': 'Fichier JSON corrompu ou illisible',
        'DB_CREATION_FAILED': 'Échec de création de la base SQLite',
        'MIGRATION_INCOMPLETE': 'Migration incomplète, données partielles',
        'VALIDATION_FAILED': 'Validation des données migrées échouée',
        'ROLLBACK_FAILED': 'Échec du rollback vers JSON'
    }

class ValidationError(DatabaseError):
    """Data validation error."""
    pass

class ConcurrencyError(DatabaseError):
    """Concurrency-related error."""
    pass
```

**Usage Example:**
```python
try:
    event = await event_manager.create_event(...)
except ValidationError as e:
    print(f"Validation failed: {e}")
except MigrationError as e:
    print(f"Migration error: {e}")
except DatabaseError as e:
    print(f"Database error: {e}")
```

## Testing API

### Test Utilities

```python
# tests/fixtures/database_fixtures.py

class DatabaseTestCase:
    """Base test case for database operations."""
    
    def setUp(self) -> None
    def tearDown(self) -> None
    def create_test_guild(self) -> Guild
    def create_test_event(self, guild: Guild) -> Event
    def create_test_user(self, guild: Guild) -> User

# Test data factories
def create_sample_guild_data() -> Dict[str, Any]
def create_sample_event_data() -> Dict[str, Any]
def create_sample_reaction_data() -> Dict[str, Any]
```

**Usage Example:**
```python
class TestEventOperations(DatabaseTestCase):
    def test_create_event(self):
        guild = self.create_test_guild()
        event = self.create_test_event(guild)
        
        self.assertIsNotNone(event.id)
        self.assertEqual(event.guild, guild)
```

## Performance Monitoring

### Metrics Collection

```python
# utils/performance_monitoring.py

class DatabaseMetrics:
    """Database performance metrics collection."""
    
    def record_query_time(self, query_type: str, duration: float) -> None
    def record_connection_event(self, event_type: str) -> None
    def get_performance_summary(self) -> Dict[str, Any]
    def reset_metrics(self) -> None

# Usage in application
metrics = DatabaseMetrics()

# Record query performance
start_time = time.time()
result = Event.select().where(Event.guild == guild_id)
metrics.record_query_time('select_events', time.time() - start_time)
```

This API reference provides comprehensive documentation for all major components of the SQLite migration. Each section includes practical usage examples and covers the most common use cases developers will encounter when working with the new database architecture.