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

# Get logger for this module
logger = logging.getLogger(__name__)


class BaseModel(Model):
    """
    Base model class that provides common functionality for all models.
    
    Includes automatic timestamps and common utility methods.
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
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert model instance to dictionary for JSON serialization.
        
        Returns:
            Dict[str, Any]: Dictionary representation of the model
        """
        data = {}
        for field_name in self._meta.fields:
            field_value = getattr(self, field_name)
            
            # Handle datetime fields
            if isinstance(field_value, datetime):
                data[field_name] = field_value.isoformat()
            # Handle foreign key fields
            elif hasattr(field_value, 'id'):
                data[field_name] = field_value.id
            else:
                data[field_name] = field_value
        
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'BaseModel':
        """
        Create model instance from dictionary data.
        
        Args:
            data: Dictionary containing model data
            
        Returns:
            BaseModel: New model instance
        """
        # Convert datetime strings back to datetime objects
        for field_name, field in cls._meta.fields.items():
            if field_name in data and isinstance(field, DateTimeField):
                if isinstance(data[field_name], str):
                    try:
                        data[field_name] = datetime.fromisoformat(data[field_name])
                    except ValueError:
                        logger.warning(f"Invalid datetime format for {field_name}: {data[field_name]}")
                        data[field_name] = datetime.now()
        
        return cls(**data)


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
    
    def __str__(self) -> str:
        return f"User({self.user_id}, {self.username}, Guild:{self.guild.guild_id})"


class Event(BaseModel):
    """
    Model representing a Discord event (formerly called "match").
    
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
    
    class Meta:
        pass
    
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
        pass
    
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
        pass
    
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