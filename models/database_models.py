"""
Database models for Discord Reminder Bot using Pewee ORM.

This module defines the database schema and models for the SQLite migration.
All models inherit from BaseModel which provides common functionality.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from peewee import (
    BigIntegerField,
    BooleanField,
    CharField,
    DateTimeField,
    FloatField,
    ForeignKeyField,
    IntegerField,
    Model,
    TextField,
)

from persistence.database import get_database
from models.validation import ValidationMixin, SerializationMixin, FieldValidator

# Get logger for this module
logger = logging.getLogger(__name__)


class BaseModel(Model, ValidationMixin, SerializationMixin):
    """
    Base model class that provides common functionality for all models.
    
    Includes automatic timestamps, validation, and serialization capabilities.
    """
    
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)
    
    class Meta:
        # Database will be set dynamically when models are initialized
        database = None
    
    def save(self, *args, **kwargs):
        """
        Override save to automatically update the updated_at timestamp.
        """
        self.updated_at = datetime.now()
        return super().save(*args, **kwargs)
    
    def clean(self) -> None:
        """
        Perform model cleaning and validation before save.
        Override this method in subclasses for custom cleaning logic.
        """
        pass
    
    def full_clean(self, validate_unique: bool = True) -> None:
        """
        Perform full model validation including field validation and custom cleaning.
        
        Args:
            validate_unique: Whether to validate unique constraints
            
        Raises:
            ValidationError: If validation fails
        """
        # Run custom cleaning logic
        self.clean()
        
        # Run validation
        self.validate(raise_exception=True)


class Guild(BaseModel):
    """
    Model representing a Discord guild (server).
    
    Stores guild-specific settings and metadata.
    """
    
    guild_id = BigIntegerField(primary_key=True)
    name = CharField(max_length=100)
    settings = TextField(default='{}')  # JSON serialized settings
    
    @property
    def settings_dict(self) -> Dict[str, Any]:
        """
        Get guild settings as a dictionary.
        
        Returns:
            Dict[str, Any]: Guild settings dictionary
        """
        try:
            return json.loads(self.settings)
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Invalid JSON in guild {self.guild_id} settings, returning empty dict")
            return {}
    
    @settings_dict.setter
    def settings_dict(self, value: Dict[str, Any]) -> None:
        """
        Set guild settings from a dictionary.
        
        Args:
            value: Dictionary of settings to store
        """
        try:
            self.settings = json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError) as e:
            logger.error(f"Failed to serialize guild settings: {e}")
            self.settings = '{}'
    
    def get_active_events_count(self) -> int:
        """
        Get the number of active (non-paused) events in this guild.
        
        Returns:
            int: Number of active events
        """
        return Event.select().where(
            (Event.guild == self) & 
            (Event.is_paused == False)
        ).count()
    
    def get_total_events_count(self) -> int:
        """
        Get the total number of events in this guild.
        
        Returns:
            int: Total number of events
        """
        return Event.select().where(Event.guild == self).count()
    
    def validate_data(self) -> List[str]:
        """
        Validate the guild data and return any validation errors.
        
        Returns:
            List[str]: List of validation error messages
        """
        errors = []
        
        # Validate guild ID
        errors.extend(FieldValidator.validate_discord_id(self.guild_id, "guild_id"))
        
        # Validate name
        if not self.name or len(self.name.strip()) == 0:
            errors.append("Guild name cannot be empty")
        
        if len(self.name) > 100:
            errors.append("Guild name cannot exceed 100 characters")
        
        # Validate settings JSON
        if self.settings:
            errors.extend(FieldValidator.validate_json_field(self.settings, "settings"))
        
        return errors
    
    def __str__(self) -> str:
        return f"Guild({self.guild_id}, {self.name})"


class User(BaseModel):
    """
    Model representing a Discord user within a guild context.
    
    Tracks user information and activity per guild.
    """
    
    user_id = BigIntegerField()
    guild = ForeignKeyField(Guild, backref='users')
    username = CharField(max_length=100)
    is_bot = BooleanField(default=False)
    last_seen = DateTimeField(default=datetime.now)
    
    class Meta:
        indexes = (
            (('user_id', 'guild'), True),  # Unique constraint per guild
        )
    
    def get_reaction_count(self) -> int:
        """
        Get the number of reactions this user has made.
        
        Returns:
            int: Number of reactions by this user
        """
        return Reaction.select().where(Reaction.user_id == self.user_id).count()
    
    def validate_data(self) -> List[str]:
        """
        Validate the user data and return any validation errors.
        
        Returns:
            List[str]: List of validation error messages
        """
        errors = []
        
        # Validate user ID
        errors.extend(FieldValidator.validate_discord_id(self.user_id, "user_id"))
        
        # Validate username
        if not self.username or len(self.username.strip()) == 0:
            errors.append("Username cannot be empty")
        
        if len(self.username) > 100:
            errors.append("Username cannot exceed 100 characters")
        
        return errors
    
    def __str__(self) -> str:
        return f"User({self.user_id}, {self.username}, Guild:{self.guild.guild_id})"


class Event(BaseModel):
    """
    Model representing a Discord event.
    
    This is the main entity that tracks events being monitored for reminders.
    """
    
    message_id = BigIntegerField(unique=True)
    channel_id = BigIntegerField()
    guild = ForeignKeyField(Guild, backref='events')
    title = CharField(max_length=200)
    description = TextField(null=True)
    interval_minutes = FloatField(default=60.0)
    is_paused = BooleanField(default=False)
    last_reminder = DateTimeField(default=datetime.now)
    required_reactions = TextField(default='["✅", "❌", "❓"]')  # JSON array
    
    # Define computed properties for serialization
    _computed_properties = [
        'is_due_for_reminder',
        'next_reminder_time',
        'reaction_count',
        'total_users_count',
        'missing_users_count',
        'response_percentage'
    ]
    
    @property
    def required_reactions_list(self) -> List[str]:
        """
        Get required reactions as a list.
        
        Returns:
            List[str]: List of required reaction emojis
        """
        try:
            return json.loads(self.required_reactions)
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Invalid JSON in event {self.message_id} reactions, returning default")
            return ["✅", "❌", "❓"]
    
    @required_reactions_list.setter
    def required_reactions_list(self, value: List[str]) -> None:
        """
        Set required reactions from a list.
        
        Args:
            value: List of reaction emojis
        """
        try:
            self.required_reactions = json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError) as e:
            logger.error(f"Failed to serialize event reactions: {e}")
            self.required_reactions = '["✅", "❌", "❓"]'
    
    @property
    def is_due_for_reminder(self) -> bool:
        """
        Check if this event is due for a reminder.
        
        Returns:
            bool: True if reminder is due
        """
        if self.is_paused:
            return False
        
        time_since_last = datetime.now() - self.last_reminder
        interval_seconds = self.interval_minutes * 60
        
        return time_since_last.total_seconds() >= interval_seconds
    
    def mark_reminder_sent(self) -> None:
        """
        Mark that a reminder was sent for this event.
        """
        self.last_reminder = datetime.now()
        self.save()
    
    def get_missing_users(self) -> List[int]:
        """
        Get list of user IDs who haven't reacted to this event.
        
        Returns:
            List[int]: User IDs who haven't reacted
        """
        # Get all users in the guild who aren't bots
        all_users = User.select().where(
            (User.guild == self.guild) & 
            (User.is_bot == False)
        )
        all_user_ids = {user.user_id for user in all_users}
        
        # Get users who have reacted
        reacted_users = Reaction.select().where(Reaction.event == self)
        reacted_user_ids = {reaction.user_id for reaction in reacted_users}
        
        # Return the difference
        return list(all_user_ids - reacted_user_ids)
    
    def get_reaction_count(self) -> int:
        """
        Get the number of users who have reacted to this event.
        
        Returns:
            int: Number of unique users who have reacted
        """
        return Reaction.select().where(Reaction.event == self).count()
    
    def get_total_users_count(self) -> int:
        """
        Get the total number of non-bot users in the guild.
        
        Returns:
            int: Total number of users who could react
        """
        return User.select().where(
            (User.guild == self.guild) & 
            (User.is_bot == False)
        ).count()
    
    def get_next_reminder_time(self) -> datetime:
        """
        Calculate when the next reminder should be sent.
        
        Returns:
            datetime: The time when the next reminder should be sent
        """
        from datetime import timedelta
        return self.last_reminder + timedelta(minutes=self.interval_minutes)
    
    @property
    def next_reminder_time(self) -> datetime:
        """
        Property version of get_next_reminder_time for computed properties.
        """
        return self.get_next_reminder_time()
    
    @property
    def missing_users_count(self) -> int:
        """
        Get the number of users who haven't reacted.
        """
        return len(self.get_missing_users())
    
    @property
    def response_percentage(self) -> float:
        """
        Get the percentage of users who have responded.
        """
        total = self.get_total_users_count()
        if total == 0:
            return 0.0
        return round((self.get_reaction_count() / total) * 100, 1)
    
    def validate_data(self) -> List[str]:
        """
        Validate the event data and return any validation errors.
        
        Returns:
            List[str]: List of validation error messages
        """
        errors = []
        
        # Validate message and channel IDs
        errors.extend(FieldValidator.validate_discord_id(self.message_id, "message_id"))
        errors.extend(FieldValidator.validate_discord_id(self.channel_id, "channel_id"))
        
        # Validate title
        if not self.title or len(self.title.strip()) == 0:
            errors.append("Event title cannot be empty")
        
        if len(self.title) > 200:
            errors.append("Event title cannot exceed 200 characters")
        
        # Validate interval
        errors.extend(FieldValidator.validate_interval_minutes(self.interval_minutes))
        
        # Validate required reactions JSON
        if self.required_reactions:
            errors.extend(FieldValidator.validate_json_field(self.required_reactions, "required_reactions"))
            
            # Validate individual emojis in the list
            try:
                reactions = self.required_reactions_list
                if not reactions:
                    errors.append("At least one required reaction must be specified")
                else:
                    for emoji in reactions:
                        errors.extend(FieldValidator.validate_emoji(emoji, f"required_reaction '{emoji}'"))
            except Exception as e:
                errors.append(f"Invalid required_reactions format: {e}")
        
        return errors
    
    class Meta:
        indexes = (
            (('guild', 'is_paused'), False),  # For finding active events per guild
            (('last_reminder', 'interval_minutes'), False),  # For scheduler queries
            (('guild', 'created_at'), False),  # For chronological queries per guild
        )
    
    def __str__(self) -> str:
        return f"Event({self.message_id}, {self.title}, Guild:{self.guild.guild_id})"


class Reaction(BaseModel):
    """
    Model representing a user's reaction to an event.
    
    Tracks which users have reacted to which events with which emojis.
    """
    
    event = ForeignKeyField(Event, backref='reactions')
    user_id = BigIntegerField()
    emoji = CharField(max_length=10)
    reacted_at = DateTimeField(default=datetime.now)
    
    class Meta:
        indexes = (
            (('event', 'user_id'), True),  # One reaction per user per event
            (('event', 'emoji'), False),  # For filtering by emoji type
        )
    
    def validate_data(self) -> List[str]:
        """
        Validate the reaction data and return any validation errors.
        
        Returns:
            List[str]: List of validation error messages
        """
        errors = []
        
        # Validate user ID
        errors.extend(FieldValidator.validate_discord_id(self.user_id, "user_id"))
        
        # Validate emoji
        errors.extend(FieldValidator.validate_emoji(self.emoji))
        
        return errors
    
    def __str__(self) -> str:
        return f"Reaction({self.user_id}, {self.emoji}, Event:{self.event.message_id})"


class ReminderLog(BaseModel):
    """
    Model representing a log entry for sent reminders.
    
    Tracks the history of reminders sent for events.
    """
    
    event = ForeignKeyField(Event, backref='reminder_logs')
    scheduled_at = DateTimeField()
    sent_at = DateTimeField(null=True)
    users_notified = IntegerField(default=0)
    status = CharField(max_length=20, default='pending')  # pending, sent, failed
    error_message = TextField(null=True)
    
    class Meta:
        indexes = (
            (('event', 'scheduled_at'), False),  # For chronological queries per event
            (('status', 'scheduled_at'), False),  # For finding pending/failed reminders
        )
    
    def mark_as_sent(self, users_notified: int = 0) -> None:
        """
        Mark this reminder log as successfully sent.
        
        Args:
            users_notified: Number of users who were notified
        """
        self.status = 'sent'
        self.sent_at = datetime.now()
        self.users_notified = users_notified
        self.error_message = None
        self.save()
    
    def mark_as_failed(self, error_message: str) -> None:
        """
        Mark this reminder log as failed.
        
        Args:
            error_message: Description of the error that occurred
        """
        self.status = 'failed'
        self.error_message = error_message
        self.save()
    
    def validate_data(self) -> List[str]:
        """
        Validate the reminder log data and return any validation errors.
        
        Returns:
            List[str]: List of validation error messages
        """
        errors = []
        
        valid_statuses = ['pending', 'sent', 'failed']
        if self.status not in valid_statuses:
            errors.append(f"Status must be one of: {', '.join(valid_statuses)}")
        
        if self.users_notified < 0:
            errors.append("Users notified count cannot be negative")
        
        if self.status == 'sent' and self.sent_at is None:
            errors.append("Sent reminders must have a sent_at timestamp")
        
        if self.status == 'failed' and not self.error_message:
            errors.append("Failed reminders must have an error message")
        
        return errors
    
    def __str__(self) -> str:
        return f"ReminderLog({self.event.message_id}, {self.status}, {self.users_notified} users)"


# List of all models for easy iteration
ALL_MODELS = [Guild, User, Event, Reaction, ReminderLog]


def initialize_models() -> None:
    """
    Initialize all models with the database connection.
    This must be called before using any models.
    """
    database = get_database()
    
    # Set the database for all models
    for model in ALL_MODELS:
        model._meta.database = database


def create_tables() -> bool:
    """
    Create all database tables if they don't exist.
    
    Returns:
        bool: True if tables were created successfully
    """
    try:
        # Initialize models with database connection
        initialize_models()
        
        database = get_database()
        database.connect()
        
        # Debug: Check if models are properly initialized
        for model in ALL_MODELS:
            if model._meta.database is None:
                logger.error(f"Model {model.__name__} has no database set")
                return False
        
        # Create tables in dependency order
        database.create_tables(ALL_MODELS, safe=True)
        
        logger.info("Database tables created successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        logger.error(f"Exception type: {type(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False
    finally:
        database = get_database()
        if not database.is_closed():
            database.close()


def drop_tables() -> bool:
    """
    Drop all database tables. Use with caution!
    
    Returns:
        bool: True if tables were dropped successfully
    """
    try:
        # Initialize models with database connection
        initialize_models()
        
        database = get_database()
        database.connect()
        
        # Drop tables in reverse dependency order
        database.drop_tables(reversed(ALL_MODELS), safe=True)
        
        logger.warning("All database tables dropped")
        return True
        
    except Exception as e:
        logger.error(f"Failed to drop database tables: {e}")
        return False
    finally:
        database = get_database()
        if not database.is_closed():
            database.close()


def get_table_info() -> Dict[str, Any]:
    """
    Get information about database tables.
    
    Returns:
        Dict[str, Any]: Information about tables and their row counts
    """
    info = {}
    
    try:
        # Initialize models with database connection
        initialize_models()
        
        database = get_database()
        database.connect()
        
        for model in ALL_MODELS:
            table_name = model._meta.table_name
            try:
                count = model.select().count()
                info[table_name] = {
                    'model': model.__name__,
                    'row_count': count,
                    'exists': True
                }
            except Exception as e:
                info[table_name] = {
                    'model': model.__name__,
                    'row_count': 0,
                    'exists': False,
                    'error': str(e)
                }
        
    except Exception as e:
        logger.error(f"Failed to get table info: {e}")
        info['error'] = str(e)
    finally:
        database = get_database()
        if database and not database.is_closed():
            database.close()
    
    return info