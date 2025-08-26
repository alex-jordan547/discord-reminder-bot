"""
Comprehensive unit tests for database models.

This module provides complete test coverage for all database models:
- Guild, User, Event, Reaction, ReminderLog
- Data validation and constraints
- JSON serialization/deserialization
- Business methods and computed properties

Requirements covered: 3.1, 3.2, 5.3
"""

import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from peewee import IntegrityError


class TestGuildModel:
    """Comprehensive tests for Guild model."""

    @pytest.mark.unit
    def test_guild_creation_valid_data(self, isolated_database):
        """Test creating a guild with valid data."""
        from models.database_models import Guild

        guild = Guild.create(
            guild_id=123456789,
            name="Test Guild",
            settings='{"admin_roles": ["Admin"], "auto_delete": true}',
        )

        assert guild.guild_id == 123456789
        assert guild.name == "Test Guild"
        assert guild.settings == '{"admin_roles": ["Admin"], "auto_delete": true}'
        assert guild.created_at is not None
        assert guild.updated_at is not None

    @pytest.mark.unit
    def test_guild_settings_dict_property(self, isolated_database):
        """Test guild settings dictionary property."""
        from models.database_models import Guild

        guild = Guild.create(
            guild_id=123456789,
            name="Test Guild",
            settings='{"admin_roles": ["Admin"], "reminder_channel": "reminders"}',
        )

        # Test getter
        settings = guild.settings_dict
        assert settings["admin_roles"] == ["Admin"]
        assert settings["reminder_channel"] == "reminders"

        # Test setter
        new_settings = {"admin_roles": ["Admin", "Moderator"], "auto_delete": False}
        guild.settings_dict = new_settings
        assert guild.settings_dict == new_settings

    @pytest.mark.unit
    def test_guild_settings_invalid_json(self, isolated_database):
        """Test guild with invalid JSON in settings."""
        from models.database_models import Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild", settings="invalid json")

        # Should return empty dict for invalid JSON
        settings = guild.settings_dict
        assert settings == {}

    @pytest.mark.unit
    def test_guild_active_events_count(self, isolated_database, populated_database):
        """Test getting active events count."""
        from models.database_models import Event, Guild

        # Create guild
        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create some events
        Event.create(
            message_id=1001, channel_id=5001, guild=guild, title="Active Event 1", is_paused=False
        )
        Event.create(
            message_id=1002, channel_id=5001, guild=guild, title="Active Event 2", is_paused=False
        )
        Event.create(
            message_id=1003, channel_id=5001, guild=guild, title="Paused Event", is_paused=True
        )

        # Test count - should only count non-paused events
        assert guild.get_active_events_count() == 2

    @pytest.mark.unit
    def test_guild_total_events_count(self, isolated_database):
        """Test getting total events count."""
        from models.database_models import Event, Guild

        # Create guild
        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create events
        Event.create(
            message_id=1001, channel_id=5001, guild=guild, title="Event 1", is_paused=False
        )
        Event.create(message_id=1002, channel_id=5001, guild=guild, title="Event 2", is_paused=True)

        # Test total count
        assert guild.get_total_events_count() == 2

    @pytest.mark.unit
    def test_guild_validation_valid_data(self, isolated_database):
        """Test guild validation with valid data."""
        from models.database_models import Guild

        guild = Guild(guild_id=123456789, name="Valid Guild", settings='{"key": "value"}')

        errors = guild.validate_data()
        assert errors == []

    @pytest.mark.unit
    def test_guild_validation_invalid_data(self, isolated_database):
        """Test guild validation with invalid data."""
        from models.database_models import Guild

        guild = Guild(
            guild_id=0, name="", settings="invalid json"  # Invalid ID  # Empty name  # Invalid JSON
        )

        errors = guild.validate_data()
        assert len(errors) > 0
        assert any("guild_id" in error.lower() for error in errors)
        assert any("name" in error.lower() for error in errors)

    @pytest.mark.unit
    def test_guild_str_representation(self, isolated_database):
        """Test guild string representation."""
        from models.database_models import Guild

        guild = Guild(guild_id=123456789, name="Test Guild")
        assert str(guild) == "Guild(123456789, Test Guild)"


class TestUserModel:
    """Comprehensive tests for User model."""

    @pytest.mark.unit
    def test_user_creation_valid_data(self, isolated_database):
        """Test creating a user with valid data."""
        from models.database_models import Guild, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        user = User.create(user_id=987654321, guild=guild, username="TestUser", is_bot=False)

        assert user.user_id == 987654321
        assert user.guild == guild
        assert user.username == "TestUser"
        assert user.is_bot is False
        assert user.last_seen is not None

    @pytest.mark.unit
    def test_user_unique_constraint(self, isolated_database):
        """Test unique constraint on (user_id, guild)."""
        from models.database_models import Guild, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create first user
        User.create(user_id=987654321, guild=guild, username="User1")

        # Try to create duplicate user in same guild
        with pytest.raises(IntegrityError):
            User.create(user_id=987654321, guild=guild, username="User2")

    @pytest.mark.unit
    def test_user_different_guilds(self, isolated_database):
        """Test same user in different guilds."""
        from models.database_models import Guild, User

        guild1 = Guild.create(guild_id=111, name="Guild 1")
        guild2 = Guild.create(guild_id=222, name="Guild 2")

        # Same user ID in different guilds should work
        user1 = User.create(user_id=987654321, guild=guild1, username="User")
        user2 = User.create(user_id=987654321, guild=guild2, username="User")

        assert user1.guild != user2.guild

    @pytest.mark.unit
    def test_user_reaction_count(self, isolated_database):
        """Test getting user reaction count."""
        from models.database_models import Event, Guild, Reaction, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        user = User.create(user_id=987654321, guild=guild, username="TestUser")
        event = Event.create(message_id=1001, channel_id=5001, guild=guild, title="Test Event")

        # Create reactions
        Reaction.create(event=event, user_id=user.user_id, emoji="✅")
        Reaction.create(event=event, user_id=user.user_id, emoji="❌")

        assert user.get_reaction_count() == 2

    @pytest.mark.unit
    def test_user_validation_valid_data(self, isolated_database):
        """Test user validation with valid data."""
        from models.database_models import Guild, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        user = User(user_id=987654321, guild=guild, username="ValidUser", is_bot=False)

        errors = user.validate_data()
        assert errors == []

    @pytest.mark.unit
    def test_user_validation_invalid_data(self, isolated_database):
        """Test user validation with invalid data."""
        from models.database_models import Guild, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        user = User(
            user_id=0, guild=guild, username="", is_bot=False  # Invalid ID  # Empty username
        )

        errors = user.validate_data()
        assert len(errors) > 0
        assert any("user_id" in error.lower() for error in errors)
        assert any("username" in error.lower() for error in errors)


class TestEventModel:
    """Comprehensive tests for Event model."""

    @pytest.mark.unit
    def test_event_creation_valid_data(self, isolated_database):
        """Test creating an event with valid data."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            description="Test Description",
            interval_minutes=60.0,
            is_paused=False,
            required_reactions='["✅", "❌", "❓"]',
        )

        assert event.message_id == 555555555
        assert event.channel_id == 987654321
        assert event.guild == guild
        assert event.title == "Test Event"
        assert event.description == "Test Description"
        assert event.interval_minutes == 60.0
        assert event.is_paused is False

    @pytest.mark.unit
    def test_event_required_reactions_list(self, isolated_database):
        """Test required reactions list property."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            required_reactions='["👍", "👎", "🤔"]',
        )

        # Test getter
        reactions = event.required_reactions_list
        assert reactions == ["👍", "👎", "🤔"]

        # Test setter
        new_reactions = ["✅", "❌", "❓", "🔥"]
        event.required_reactions_list = new_reactions
        assert event.required_reactions_list == new_reactions

    @pytest.mark.unit
    def test_event_required_reactions_invalid_json(self, isolated_database):
        """Test event with invalid JSON in required_reactions."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            required_reactions="invalid json",
        )

        # Should return default reactions for invalid JSON
        reactions = event.required_reactions_list
        assert reactions == ["✅", "❌", "❓"]

    @pytest.mark.unit
    def test_event_is_due_for_reminder(self, isolated_database):
        """Test checking if event is due for reminder."""
        from datetime import datetime, timedelta

        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Event with old last_reminder (should be due)
        old_time = datetime.now() - timedelta(minutes=120)
        event_due = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Due Event",
            interval_minutes=60.0,
            last_reminder=old_time,
            is_paused=False,
        )

        # Event with recent last_reminder (should not be due)
        recent_time = datetime.now() - timedelta(minutes=30)
        event_not_due = Event.create(
            message_id=555555556,
            channel_id=987654321,
            guild=guild,
            title="Not Due Event",
            interval_minutes=60.0,
            last_reminder=recent_time,
            is_paused=False,
        )

        # Paused event (should not be due regardless)
        event_paused = Event.create(
            message_id=555555557,
            channel_id=987654321,
            guild=guild,
            title="Paused Event",
            interval_minutes=60.0,
            last_reminder=old_time,
            is_paused=True,
        )

        assert event_due.is_due_for_reminder is True
        assert event_not_due.is_due_for_reminder is False
        assert event_paused.is_due_for_reminder is False

    @pytest.mark.unit
    def test_event_mark_reminder_sent(self, isolated_database):
        """Test marking reminder as sent."""
        from datetime import datetime, timedelta

        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        old_time = datetime.now() - timedelta(minutes=120)

        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            last_reminder=old_time,
        )

        # Mark reminder sent
        before_mark = datetime.now()
        event.mark_reminder_sent()
        after_mark = datetime.now()

        # Should update last_reminder to current time
        assert before_mark <= event.last_reminder <= after_mark

    @pytest.mark.unit
    def test_event_get_missing_users(self, isolated_database):
        """Test getting users who haven't reacted."""
        from models.database_models import Event, Guild, Reaction, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create users
        user1 = User.create(user_id=111, guild=guild, username="User1", is_bot=False)
        user2 = User.create(user_id=222, guild=guild, username="User2", is_bot=False)
        user3 = User.create(user_id=333, guild=guild, username="User3", is_bot=False)
        bot_user = User.create(user_id=444, guild=guild, username="Bot", is_bot=True)

        # Create event
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        # Only user1 reacts
        Reaction.create(event=event, user_id=user1.user_id, emoji="✅")

        # Get missing users (should be user2 and user3, not bot)
        missing = event.get_missing_users()
        assert set(missing) == {user2.user_id, user3.user_id}
        assert user1.user_id not in missing
        assert bot_user.user_id not in missing

    @pytest.mark.unit
    def test_event_get_reaction_count(self, isolated_database):
        """Test getting reaction count."""
        from models.database_models import Event, Guild, Reaction

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        # Create reactions
        Reaction.create(event=event, user_id=111, emoji="✅")
        Reaction.create(event=event, user_id=222, emoji="❌")

        assert event.get_reaction_count() == 2

    @pytest.mark.unit
    def test_event_get_total_users_count(self, isolated_database):
        """Test getting total users count."""
        from models.database_models import Event, Guild, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create users
        User.create(user_id=111, guild=guild, username="User1", is_bot=False)
        User.create(user_id=222, guild=guild, username="User2", is_bot=False)
        User.create(user_id=333, guild=guild, username="Bot", is_bot=True)

        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        # Should count only non-bot users
        assert event.get_total_users_count() == 2

    @pytest.mark.unit
    def test_event_get_next_reminder_time(self, isolated_database):
        """Test calculating next reminder time."""
        from datetime import datetime, timedelta

        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        last_reminder = datetime.now() - timedelta(minutes=30)

        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            interval_minutes=60.0,
            last_reminder=last_reminder,
        )

        expected_next = last_reminder + timedelta(minutes=60)
        actual_next = event.get_next_reminder_time()

        # Should be very close (within a second)
        assert abs((actual_next - expected_next).total_seconds()) < 1


class TestReactionModel:
    """Comprehensive tests for Reaction model."""

    @pytest.mark.unit
    def test_reaction_creation_valid_data(self, isolated_database):
        """Test creating a reaction with valid data."""
        from models.database_models import Event, Guild, Reaction

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        reaction = Reaction.create(event=event, user_id=987654321, emoji="✅")

        assert reaction.event == event
        assert reaction.user_id == 987654321
        assert reaction.emoji == "✅"

    @pytest.mark.unit
    def test_reaction_unique_constraint(self, isolated_database):
        """Test unique constraint on (event, user_id, emoji)."""
        from models.database_models import Event, Guild, Reaction

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        # Create first reaction
        Reaction.create(event=event, user_id=987654321, emoji="✅")

        # Try to create duplicate reaction
        with pytest.raises(IntegrityError):
            Reaction.create(event=event, user_id=987654321, emoji="✅")


class TestReminderLogModel:
    """Comprehensive tests for ReminderLog model."""

    @pytest.mark.unit
    def test_reminder_log_creation(self, isolated_database):
        """Test creating a reminder log entry."""
        from models.database_models import Event, Guild, ReminderLog

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        log = ReminderLog.create(
            event=event,
            reminder_type="scheduled",
            users_notified=["111", "222", "333"],
            success=True,
        )

        assert log.event == event
        assert log.reminder_type == "scheduled"
        assert log.users_notified == ["111", "222", "333"]
        assert log.success is True


class TestModelSerialization:
    """Tests for JSON serialization/deserialization of models."""

    @pytest.mark.unit
    def test_guild_serialization(self, isolated_database):
        """Test Guild model JSON serialization."""
        from models.database_models import Guild

        guild = Guild.create(
            guild_id=123456789, name="Test Guild", settings='{"admin_roles": ["Admin"]}'
        )

        # Test serialization
        serialized = guild.to_dict()

        assert serialized["guild_id"] == 123456789
        assert serialized["name"] == "Test Guild"
        assert "created_at" in serialized
        assert "updated_at" in serialized

        # Test computed properties if included
        if "active_events_count" in serialized:
            assert isinstance(serialized["active_events_count"], int)

    @pytest.mark.unit
    def test_event_serialization(self, isolated_database):
        """Test Event model JSON serialization."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            description="Test Description",
            interval_minutes=60.0,
        )

        # Test serialization
        serialized = event.to_dict()

        assert serialized["message_id"] == 555555555
        assert serialized["channel_id"] == 987654321
        assert serialized["title"] == "Test Event"
        assert serialized["description"] == "Test Description"
        assert serialized["interval_minutes"] == 60.0

        # Test computed properties
        assert "is_due_for_reminder" in serialized
        assert "next_reminder_time" in serialized

    @pytest.mark.unit
    def test_model_from_dict(self, isolated_database):
        """Test creating models from dictionary data."""
        from models.database_models import Event, Guild

        # Test Guild creation from dict
        guild_data = {"guild_id": 123456789, "name": "Test Guild", "settings": '{"test": true}'}

        guild = Guild.from_dict(guild_data)
        assert guild.guild_id == 123456789
        assert guild.name == "Test Guild"

        # Save and test Event creation from dict
        guild.save()

        event_data = {
            "message_id": 555555555,
            "channel_id": 987654321,
            "guild_id": 123456789,
            "title": "Test Event",
            "interval_minutes": 60.0,
            "is_paused": False,
        }

        event = Event.from_dict(event_data, guild=guild)
        assert event.message_id == 555555555
        assert event.title == "Test Event"
        assert event.guild == guild


class TestModelValidation:
    """Tests for model validation functionality."""

    @pytest.mark.unit
    def test_base_model_full_clean(self, isolated_database):
        """Test full model validation."""
        from models.database_models import Guild

        # Valid guild
        valid_guild = Guild(guild_id=123456789, name="Valid Guild")

        # Should not raise exception
        valid_guild.full_clean()

        # Invalid guild
        invalid_guild = Guild(guild_id=0, name="")

        # Should raise validation error
        with pytest.raises(Exception):  # ValidationError or similar
            invalid_guild.full_clean()

    @pytest.mark.unit
    def test_model_custom_clean(self, isolated_database):
        """Test custom model cleaning logic."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create event with data that might need cleaning
        event = Event(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="  Test Event  ",  # With whitespace
            interval_minutes=-1.0,  # Invalid interval
        )

        # Test that clean method works
        event.clean()  # Should not raise exception

    @pytest.mark.unit
    def test_model_save_with_validation(self, isolated_database):
        """Test that save method updates timestamps."""
        from datetime import datetime

        from models.database_models import Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        original_updated = guild.updated_at

        # Wait a small amount and save again
        import time

        time.sleep(0.01)

        guild.name = "Updated Guild"
        guild.save()

        # updated_at should be newer
        assert guild.updated_at > original_updated


class TestModelRelationships:
    """Tests for model relationships and foreign keys."""

    @pytest.mark.unit
    def test_guild_events_relationship(self, isolated_database):
        """Test Guild -> Events relationship."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create events
        event1 = Event.create(message_id=1001, channel_id=5001, guild=guild, title="Event 1")
        event2 = Event.create(message_id=1002, channel_id=5001, guild=guild, title="Event 2")

        # Test backref
        events = list(guild.events)
        assert len(events) == 2
        assert event1 in events
        assert event2 in events

    @pytest.mark.unit
    def test_guild_users_relationship(self, isolated_database):
        """Test Guild -> Users relationship."""
        from models.database_models import Guild, User

        guild = Guild.create(guild_id=123456789, name="Test Guild")

        # Create users
        user1 = User.create(user_id=111, guild=guild, username="User1")
        user2 = User.create(user_id=222, guild=guild, username="User2")

        # Test backref
        users = list(guild.users)
        assert len(users) == 2
        assert user1 in users
        assert user2 in users

    @pytest.mark.unit
    def test_event_reactions_relationship(self, isolated_database):
        """Test Event -> Reactions relationship."""
        from models.database_models import Event, Guild, Reaction

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )

        # Create reactions
        reaction1 = Reaction.create(event=event, user_id=111, emoji="✅")
        reaction2 = Reaction.create(event=event, user_id=222, emoji="❌")

        # Test backref
        reactions = list(event.reactions)
        assert len(reactions) == 2
        assert reaction1 in reactions
        assert reaction2 in reactions

    @pytest.mark.unit
    def test_cascade_delete(self, isolated_database):
        """Test cascade delete behavior."""
        from models.database_models import Event, Guild, Reaction

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555, channel_id=987654321, guild=guild, title="Test Event"
        )
        Reaction.create(event=event, user_id=111, emoji="✅")

        # Delete event should cascade to reactions
        event_id = event.id
        event.delete_instance(recursive=True)

        # Reaction should be deleted
        assert Reaction.select().where(Reaction.event == event_id).count() == 0
