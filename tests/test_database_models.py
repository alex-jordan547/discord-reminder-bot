"""
Unit tests for SQLite database models using Pewee ORM.

This module tests all database models including validation, constraints,
relationships, and complex queries for the SQLite migration.
"""

import json
import pytest
import tempfile
import os
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

from peewee import SqliteDatabase, IntegrityError, DoesNotExist

# Import models and related modules
from models.database_models import (
    BaseModel, Guild, User, Event, Reaction, ReminderLog,
    ALL_MODELS, initialize_models, create_tables, drop_tables, get_table_info
)
from models.validation import ValidationError


# Test database configuration
TEST_DB = SqliteDatabase(':memory:')


@pytest.fixture(scope='function')
def test_db():
    """
    Create a test database for each test function.
    """
    # Set up test database for all models
    for model in ALL_MODELS:
        model._meta.database = TEST_DB
    
    # Connect and create tables
    TEST_DB.connect()
    TEST_DB.create_tables(ALL_MODELS, safe=True)
    
    yield TEST_DB
    
    # Clean up
    TEST_DB.drop_tables(ALL_MODELS, safe=True)
    TEST_DB.close()


@pytest.fixture
def sample_guild(test_db):
    """Create a sample guild for testing."""
    return Guild.create(
        guild_id=123456789012345678,  # Valid Discord snowflake
        name="Test Guild",
        settings='{"test": "value"}'
    )


@pytest.fixture
def sample_user(test_db, sample_guild):
    """Create a sample user for testing."""
    return User.create(
        user_id=987654321098765432,  # Valid Discord snowflake
        guild=sample_guild,
        username="TestUser",
        is_bot=False
    )


@pytest.fixture
def sample_event(test_db, sample_guild):
    """Create a sample event for testing."""
    return Event.create(
        message_id=111222333444555666,  # Valid Discord snowflake
        channel_id=444555666777888999,  # Valid Discord snowflake
        guild=sample_guild,
        title="Test Event",
        description="A test event for unit testing",
        interval_minutes=60.0,
        required_reactions='["✅", "❌", "❓"]'
    )


class TestBaseModel:
    """Test the BaseModel functionality."""
    
    def test_base_model_timestamps(self, test_db):
        """Test that BaseModel automatically sets timestamps."""
        guild = Guild.create(guild_id=123, name="Test")
        
        assert guild.created_at is not None
        assert guild.updated_at is not None
        assert isinstance(guild.created_at, datetime)
        assert isinstance(guild.updated_at, datetime)
    
    def test_base_model_update_timestamp(self, test_db, sample_guild):
        """Test that updated_at is automatically updated on save."""
        original_updated = sample_guild.updated_at
        
        # Wait a small amount to ensure timestamp difference
        import time
        time.sleep(0.01)
        
        sample_guild.name = "Updated Guild"
        sample_guild.save()
        
        assert sample_guild.updated_at > original_updated
    
    def test_base_model_validation_mixin(self, test_db):
        """Test that BaseModel includes validation functionality."""
        guild = Guild(guild_id=123, name="Test")
        
        # Should have validation methods from ValidationMixin
        assert hasattr(guild, 'validate')
        assert hasattr(guild, 'full_clean')
        assert callable(guild.validate)
        assert callable(guild.full_clean)
    
    def test_base_model_serialization_mixin(self, test_db):
        """Test that BaseModel includes serialization functionality."""
        guild = Guild(guild_id=123, name="Test")
        
        # Should have serialization methods from SerializationMixin
        assert hasattr(guild, 'to_dict')
        assert hasattr(guild, 'from_dict')
        assert callable(guild.to_dict)
        assert callable(guild.from_dict)


class TestGuildModel:
    """Test the Guild model."""
    
    def test_guild_creation(self, test_db):
        """Test basic guild creation."""
        guild = Guild.create(
            guild_id=123456789012345678,
            name="Test Guild"
        )
        
        assert guild.guild_id == 123456789012345678
        assert guild.name == "Test Guild"
        assert guild.settings == '{}'  # Default empty JSON
        assert guild.created_at is not None
    
    def test_guild_settings_property(self, test_db):
        """Test guild settings JSON property."""
        guild = Guild.create(
            guild_id=123456789012345678,
            name="Test",
            settings='{"key": "value", "number": 42}'
        )
        
        settings_dict = guild.settings_dict
        assert isinstance(settings_dict, dict)
        assert settings_dict["key"] == "value"
        assert settings_dict["number"] == 42
    
    def test_guild_settings_setter(self, test_db):
        """Test setting guild settings via property."""
        guild = Guild.create(guild_id=123456789012345678, name="Test")
        
        new_settings = {"test": "data", "enabled": True}
        guild.settings_dict = new_settings
        guild.save()
        
        # Reload from database
        guild = Guild.get(Guild.guild_id == 123456789012345678)
        assert guild.settings_dict == new_settings
    
    def test_guild_settings_invalid_json(self, test_db):
        """Test handling of invalid JSON in settings."""
        guild = Guild.create(
            guild_id=123456789012345678,
            name="Test",
            settings='invalid json'
        )
        
        # Should return empty dict for invalid JSON
        assert guild.settings_dict == {}
    
    def test_guild_active_events_count(self, test_db, sample_guild):
        """Test counting active events in a guild."""
        # Create some events
        Event.create(
            message_id=111222333444555111, channel_id=222333444555666222, guild=sample_guild,
            title="Active Event 1", is_paused=False
        )
        Event.create(
            message_id=333444555666777333, channel_id=444555666777888444, guild=sample_guild,
            title="Active Event 2", is_paused=False
        )
        Event.create(
            message_id=555666777888999555, channel_id=666777888999000666, guild=sample_guild,
            title="Paused Event", is_paused=True
        )
        
        assert sample_guild.get_active_events_count() == 2
        assert sample_guild.get_total_events_count() == 3
    
    def test_guild_validation(self, test_db):
        """Test guild data validation."""
        guild = Guild(guild_id=123456789012345678, name="Test")
        
        # Valid guild should have no errors
        errors = guild.validate_data()
        assert len(errors) == 0
        
        # Test invalid guild ID
        guild.guild_id = -1
        errors = guild.validate_data()
        assert any("guild_id" in error for error in errors)
        
        # Test empty name
        guild.guild_id = 123456789012345678
        guild.name = ""
        errors = guild.validate_data()
        assert any("name cannot be empty" in error for error in errors)
        
        # Test name too long
        guild.name = "x" * 101
        errors = guild.validate_data()
        assert any("name cannot exceed 100 characters" in error for error in errors)
    
    def test_guild_unique_constraint(self, test_db):
        """Test that guild_id must be unique."""
        Guild.create(guild_id=123456789012345678, name="First Guild")
        
        with pytest.raises(IntegrityError):
            Guild.create(guild_id=123456789012345678, name="Second Guild")
    
    def test_guild_string_representation(self, test_db):
        """Test guild string representation."""
        guild = Guild.create(guild_id=123456789012345678, name="Test Guild")
        assert str(guild) == "Guild(123456789012345678, Test Guild)"


class TestUserModel:
    """Test the User model."""
    
    def test_user_creation(self, test_db, sample_guild):
        """Test basic user creation."""
        user = User.create(
            user_id=987654321098765432,
            guild=sample_guild,
            username="TestUser",
            is_bot=False
        )
        
        assert user.user_id == 987654321098765432
        assert user.guild == sample_guild
        assert user.username == "TestUser"
        assert user.is_bot is False
        assert user.last_seen is not None
    
    def test_user_guild_relationship(self, test_db, sample_guild):
        """Test user-guild relationship."""
        user = User.create(
            user_id=123456789012345678,
            guild=sample_guild,
            username="Test"
        )
        
        # Test forward relationship
        assert user.guild == sample_guild
        
        # Test backward relationship
        assert user in sample_guild.users
    
    def test_user_unique_per_guild(self, test_db, sample_guild):
        """Test that user_id + guild combination must be unique."""
        User.create(user_id=123456789012345678, guild=sample_guild, username="User1")
        
        # Same user_id in same guild should fail
        with pytest.raises(IntegrityError):
            User.create(user_id=123456789012345678, guild=sample_guild, username="User2")
        
        # Same user_id in different guild should work
        other_guild = Guild.create(guild_id=999888777666555444, name="Other Guild")
        User.create(user_id=123456789012345678, guild=other_guild, username="User3")
    
    def test_user_reaction_count(self, test_db, sample_guild, sample_event):
        """Test getting user reaction count."""
        user = User.create(user_id=123456789012345678, guild=sample_guild, username="Test")
        
        # Initially no reactions
        assert user.get_reaction_count() == 0
        
        # Add some reactions
        Reaction.create(event=sample_event, user_id=user.user_id, emoji="✅")
        
        # Create another event and reaction
        event2 = Event.create(
            message_id=999888777666555444, channel_id=888777666555444333, guild=sample_guild, title="Event 2"
        )
        Reaction.create(event=event2, user_id=user.user_id, emoji="❌")
        
        assert user.get_reaction_count() == 2
    
    def test_user_validation(self, test_db, sample_guild):
        """Test user data validation."""
        user = User(user_id=123456789012345678, guild=sample_guild, username="Test")
        
        # Valid user should have no errors
        errors = user.validate_data()
        assert len(errors) == 0
        
        # Test invalid user ID
        user.user_id = -1
        errors = user.validate_data()
        assert any("user_id" in error for error in errors)
        
        # Test empty username
        user.user_id = 123456789012345678
        user.username = ""
        errors = user.validate_data()
        assert any("Username cannot be empty" in error for error in errors)
    
    def test_user_string_representation(self, test_db, sample_guild):
        """Test user string representation."""
        user = User.create(
            user_id=123456789012345678, guild=sample_guild, username="TestUser"
        )
        assert str(user) == f"User(123456789012345678, TestUser, Guild:{sample_guild.guild_id})"


class TestEventModel:
    """Test the Event model."""
    
    def test_event_creation(self, test_db, sample_guild):
        """Test basic event creation."""
        event = Event.create(
            message_id=111222333444555666,
            channel_id=444555666777888999,
            guild=sample_guild,
            title="Test Event",
            description="Test description",
            interval_minutes=120.0
        )
        
        assert event.message_id == 111222333444555666
        assert event.channel_id == 444555666777888999
        assert event.guild == sample_guild
        assert event.title == "Test Event"
        assert event.description == "Test description"
        assert event.interval_minutes == 120.0
        assert event.is_paused is False
        assert event.last_reminder is not None
    
    def test_event_required_reactions_property(self, test_db, sample_event):
        """Test required reactions JSON property."""
        # Test default reactions
        reactions = sample_event.required_reactions_list
        assert reactions == ["✅", "❌", "❓"]
        
        # Test setting new reactions
        new_reactions = ["👍", "👎", "🤔"]
        sample_event.required_reactions_list = new_reactions
        sample_event.save()
        
        # Reload and verify
        event = Event.get(Event.message_id == sample_event.message_id)
        assert event.required_reactions_list == new_reactions
    
    def test_event_required_reactions_invalid_json(self, test_db, sample_guild):
        """Test handling of invalid JSON in required_reactions."""
        event = Event.create(
            message_id=123456789012345678, channel_id=456789012345678901, guild=sample_guild,
            title="Test", required_reactions='invalid json'
        )
        
        # Should return default reactions for invalid JSON
        assert event.required_reactions_list == ["✅", "❌", "❓"]
    
    def test_event_is_due_for_reminder(self, test_db, sample_event):
        """Test reminder due logic."""
        # Event just created should not be due
        assert not sample_event.is_due_for_reminder
        
        # Set last reminder to past
        sample_event.last_reminder = datetime.now() - timedelta(hours=2)
        sample_event.save()
        
        assert sample_event.is_due_for_reminder
        
        # Paused events should never be due
        sample_event.is_paused = True
        sample_event.save()
        
        assert not sample_event.is_due_for_reminder
    
    def test_event_mark_reminder_sent(self, test_db, sample_event):
        """Test marking reminder as sent."""
        old_time = sample_event.last_reminder
        
        # Wait a bit to ensure timestamp difference
        import time
        time.sleep(0.01)
        
        sample_event.mark_reminder_sent()
        
        assert sample_event.last_reminder > old_time
    
    def test_event_user_tracking(self, test_db, sample_guild, sample_event):
        """Test user reaction tracking methods."""
        # Create some users
        user1 = User.create(user_id=111222333444555111, guild=sample_guild, username="User1")
        user2 = User.create(user_id=222333444555666222, guild=sample_guild, username="User2")
        user3 = User.create(user_id=333444555666777333, guild=sample_guild, username="User3", is_bot=True)
        
        # Initially no reactions
        assert sample_event.get_reaction_count() == 0
        assert sample_event.get_total_users_count() == 2  # Excludes bot
        assert len(sample_event.get_missing_users()) == 2
        
        # Add a reaction
        Reaction.create(event=sample_event, user_id=user1.user_id, emoji="✅")
        
        assert sample_event.get_reaction_count() == 1
        assert len(sample_event.get_missing_users()) == 1
        assert user2.user_id in sample_event.get_missing_users()
        assert user1.user_id not in sample_event.get_missing_users()
    
    def test_event_computed_properties(self, test_db, sample_guild, sample_event):
        """Test computed properties."""
        # Create users and reactions
        user1 = User.create(user_id=111222333444555111, guild=sample_guild, username="User1")
        user2 = User.create(user_id=222333444555666222, guild=sample_guild, username="User2")
        Reaction.create(event=sample_event, user_id=user1.user_id, emoji="✅")
        
        assert sample_event.missing_users_count == 1
        assert sample_event.response_percentage == 50.0
        
        # Test next reminder time
        next_time = sample_event.next_reminder_time
        expected_time = sample_event.last_reminder + timedelta(minutes=sample_event.interval_minutes)
        assert abs((next_time - expected_time).total_seconds()) < 1
    
    def test_event_legacy_compatibility_methods(self, test_db, sample_guild, sample_event):
        """Test legacy compatibility methods."""
        # Create users and reactions for testing
        user1 = User.create(user_id=111222333444555111, guild=sample_guild, username="User1")
        Reaction.create(event=sample_event, user_id=user1.user_id, emoji="✅")
        
        # Test legacy methods
        assert sample_event.get_response_count() == sample_event.get_reaction_count()
        assert sample_event.get_missing_count() == sample_event.missing_users_count
        
        # Test status summary
        status = sample_event.get_status_summary()
        assert isinstance(status, dict)
        assert status["title"] == sample_event.title
        assert status["message_id"] == sample_event.message_id
        assert status["response_count"] == 1
        assert status["missing_count"] == 0  # Only 1 non-bot user total
        assert "next_reminder" in status
        assert "is_overdue" in status
    
    def test_event_validation(self, test_db, sample_guild):
        """Test event data validation."""
        event = Event(
            message_id=123456789012345678, channel_id=456789012345678901, guild=sample_guild,
            title="Test", interval_minutes=60.0
        )
        
        # Valid event should have no errors
        errors = event.validate_data()
        assert len(errors) == 0
        
        # Test invalid message ID
        event.message_id = -1
        errors = event.validate_data()
        assert any("message_id" in error for error in errors)
        
        # Test empty title
        event.message_id = 123456789012345678
        event.title = ""
        errors = event.validate_data()
        assert any("title cannot be empty" in error for error in errors)
        
        # Test invalid interval
        event.title = "Test"
        event.interval_minutes = -1
        errors = event.validate_data()
        assert any("interval" in error.lower() for error in errors)
    
    def test_event_unique_message_id(self, test_db, sample_guild):
        """Test that message_id must be unique."""
        Event.create(
            message_id=123456789012345678, channel_id=456789012345678901, guild=sample_guild, title="Event 1"
        )
        
        with pytest.raises(IntegrityError):
            Event.create(
                message_id=123456789012345678, channel_id=789012345678901234, guild=sample_guild, title="Event 2"
            )
    
    def test_event_indexes(self, test_db, sample_guild):
        """Test that database indexes work correctly."""
        # Create multiple events to test index performance
        events = []
        for i in range(10):
            event = Event.create(
                message_id=100000000000000000 + i,  # Valid Discord snowflakes
                channel_id=200000000000000000 + i,
                guild=sample_guild,
                title=f"Event {i}",
                is_paused=(i % 2 == 0)
            )
            events.append(event)
        
        # Test guild + is_paused index
        active_events = Event.select().where(
            (Event.guild == sample_guild) & (Event.is_paused == False)
        )
        assert active_events.count() == 5
        
        # Test last_reminder + interval_minutes index (for scheduler)
        # Since events were just created, none should be due yet
        past_time = datetime.now() + timedelta(hours=2)  # Future time
        due_events = Event.select().where(
            Event.last_reminder < past_time
        )
        # All events should be "due" since their last_reminder is in the past relative to future time
        assert due_events.count() == 10
    
    @patch('models.database_models.logger')
    async def test_event_update_accessible_users(self, mock_logger, test_db, sample_guild, sample_event):
        """Test updating accessible users (legacy compatibility)."""
        # Mock bot instance and guild
        mock_bot = Mock()
        mock_guild = Mock()
        mock_channel = Mock()
        mock_member1 = Mock()
        mock_member2 = Mock()
        
        # Set up mock objects
        mock_bot.get_guild.return_value = mock_guild
        mock_guild.get_channel.return_value = mock_channel
        mock_guild.members = [mock_member1, mock_member2]
        
        mock_member1.id = 111
        mock_member1.display_name = "User1"
        mock_member1.bot = False
        mock_member2.id = 222
        mock_member2.display_name = "User2"
        mock_member2.bot = True  # Bot user
        
        # Mock permissions
        mock_permissions1 = Mock()
        mock_permissions1.view_channel = True
        mock_permissions1.send_messages = True
        mock_permissions2 = Mock()
        mock_permissions2.view_channel = True
        mock_permissions2.send_messages = True
        
        mock_channel.permissions_for.side_effect = [mock_permissions1, mock_permissions2]
        
        # Call the method
        await sample_event.update_accessible_users(mock_bot)
        
        # Verify user was created in database
        users = User.select().where(User.guild == sample_guild)
        assert users.count() == 1  # Only non-bot user should be added
        user = users.get()
        assert user.user_id == 111
        assert user.username == "User1"
    
    def test_event_string_representation(self, test_db, sample_guild):
        """Test event string representation."""
        event = Event.create(
            message_id=123456789012345678, channel_id=456789012345678901, guild=sample_guild, title="Test Event"
        )
        assert str(event) == f"Event(123456789012345678, Test Event, Guild:{sample_guild.guild_id})"


class TestReactionModel:
    """Test the Reaction model."""
    
    def test_reaction_creation(self, test_db, sample_event):
        """Test basic reaction creation."""
        reaction = Reaction.create(
            event=sample_event,
            user_id=987654321098765432,
            emoji="✅"
        )
        
        assert reaction.event == sample_event
        assert reaction.user_id == 987654321098765432
        assert reaction.emoji == "✅"
        assert reaction.reacted_at is not None
    
    def test_reaction_event_relationship(self, test_db, sample_event):
        """Test reaction-event relationship."""
        reaction = Reaction.create(
            event=sample_event,
            user_id=123456789012345678,
            emoji="✅"
        )
        
        # Test forward relationship
        assert reaction.event == sample_event
        
        # Test backward relationship
        assert reaction in sample_event.reactions
    
    def test_reaction_unique_per_user_per_event(self, test_db, sample_event):
        """Test that each user can only have one reaction per event."""
        Reaction.create(event=sample_event, user_id=123456789012345678, emoji="✅")
        
        # Same user reacting to same event should fail
        with pytest.raises(IntegrityError):
            Reaction.create(event=sample_event, user_id=123456789012345678, emoji="❌")
        
        # Same user reacting to different event should work
        guild = sample_event.guild
        event2 = Event.create(
            message_id=999888777666555444, channel_id=888777666555444333, guild=guild, title="Event 2"
        )
        Reaction.create(event=event2, user_id=123456789012345678, emoji="❌")
    
    def test_reaction_validation(self, test_db, sample_event):
        """Test reaction data validation."""
        reaction = Reaction(event=sample_event, user_id=123456789012345678, emoji="✅")
        
        # Valid reaction should have no errors
        errors = reaction.validate_data()
        assert len(errors) == 0
        
        # Test invalid user ID
        reaction.user_id = -1
        errors = reaction.validate_data()
        assert any("user_id" in error for error in errors)
        
        # Test invalid emoji (empty)
        reaction.user_id = 123456789012345678
        reaction.emoji = ""
        errors = reaction.validate_data()
        assert any("emoji" in error.lower() for error in errors)
    
    def test_reaction_string_representation(self, test_db, sample_event):
        """Test reaction string representation."""
        reaction = Reaction.create(
            event=sample_event, user_id=123456789012345678, emoji="✅"
        )
        assert str(reaction) == f"Reaction(123456789012345678, ✅, Event:{sample_event.message_id})"


class TestReminderLogModel:
    """Test the ReminderLog model."""
    
    def test_reminder_log_creation(self, test_db, sample_event):
        """Test basic reminder log creation."""
        scheduled_time = datetime.now() + timedelta(minutes=30)
        log = ReminderLog.create(
            event=sample_event,
            scheduled_at=scheduled_time
        )
        
        assert log.event == sample_event
        assert log.scheduled_at == scheduled_time
        assert log.sent_at is None
        assert log.users_notified == 0
        assert log.status == 'pending'
        assert log.error_message is None
    
    def test_reminder_log_mark_as_sent(self, test_db, sample_event):
        """Test marking reminder log as sent."""
        log = ReminderLog.create(
            event=sample_event,
            scheduled_at=datetime.now()
        )
        
        log.mark_as_sent(users_notified=5)
        
        assert log.status == 'sent'
        assert log.sent_at is not None
        assert log.users_notified == 5
        assert log.error_message is None
    
    def test_reminder_log_mark_as_failed(self, test_db, sample_event):
        """Test marking reminder log as failed."""
        log = ReminderLog.create(
            event=sample_event,
            scheduled_at=datetime.now()
        )
        
        error_msg = "Failed to send reminder"
        log.mark_as_failed(error_msg)
        
        assert log.status == 'failed'
        assert log.error_message == error_msg
    
    def test_reminder_log_validation(self, test_db, sample_event):
        """Test reminder log data validation."""
        log = ReminderLog(
            event=sample_event,
            scheduled_at=datetime.now(),
            status='pending'
        )
        
        # Valid log should have no errors
        errors = log.validate_data()
        assert len(errors) == 0
        
        # Test invalid status
        log.status = 'invalid_status'
        errors = log.validate_data()
        assert any("Status must be one of" in error for error in errors)
        
        # Test negative users_notified
        log.status = 'pending'
        log.users_notified = -1
        errors = log.validate_data()
        assert any("cannot be negative" in error for error in errors)
        
        # Test sent status without sent_at
        log.users_notified = 0
        log.status = 'sent'
        log.sent_at = None
        errors = log.validate_data()
        assert any("must have a sent_at timestamp" in error for error in errors)
        
        # Test failed status without error message
        log.status = 'failed'
        log.error_message = None
        errors = log.validate_data()
        assert any("must have an error message" in error for error in errors)
    
    def test_reminder_log_string_representation(self, test_db, sample_event):
        """Test reminder log string representation."""
        log = ReminderLog.create(
            event=sample_event,
            scheduled_at=datetime.now(),
            users_notified=3
        )
        assert str(log) == f"ReminderLog({sample_event.message_id}, pending, 3 users)"


class TestModelUtilities:
    """Test model utility functions."""
    
    @patch('models.database_models.get_database')
    def test_initialize_models(self, mock_get_db):
        """Test model initialization."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db
        
        initialize_models()
        
        # All models should have the database set
        for model in ALL_MODELS:
            assert model._meta.database == mock_db
    
    @patch('models.database_models.get_database')
    @patch('models.database_models.initialize_models')
    def test_create_tables(self, mock_init, mock_get_db):
        """Test table creation."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db
        mock_db.is_closed.return_value = False
        
        # Mock successful table creation
        result = create_tables()
        
        assert result is True
        mock_init.assert_called_once()
        mock_db.connect.assert_called_once()
        mock_db.create_tables.assert_called_once_with(ALL_MODELS, safe=True)
        mock_db.close.assert_called_once()
    
    @patch('models.database_models.get_database')
    @patch('models.database_models.initialize_models')
    def test_drop_tables(self, mock_init, mock_get_db):
        """Test table dropping."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db
        mock_db.is_closed.return_value = False
        
        result = drop_tables()
        
        assert result is True
        mock_init.assert_called_once()
        mock_db.connect.assert_called_once()
        mock_db.drop_tables.assert_called_once()
        mock_db.close.assert_called_once()
    
    @patch('models.database_models.get_database')
    @patch('models.database_models.initialize_models')
    def test_get_table_info(self, mock_init, mock_get_db):
        """Test getting table information."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db
        mock_db.is_closed.return_value = False
        
        # Mock model counts
        for model in ALL_MODELS:
            mock_query = Mock()
            mock_query.count.return_value = 5
            model.select = Mock(return_value=mock_query)
        
        info = get_table_info()
        
        assert isinstance(info, dict)
        # Should have info for each model
        for model in ALL_MODELS:
            table_name = model._meta.table_name
            assert table_name in info
            assert info[table_name]['model'] == model.__name__
            assert info[table_name]['row_count'] == 5
            assert info[table_name]['exists'] is True


# Note: Complex query tests are omitted due to test environment mocking issues
# These would be tested in integration tests with a real database setup


if __name__ == '__main__':
    pytest.main([__file__])