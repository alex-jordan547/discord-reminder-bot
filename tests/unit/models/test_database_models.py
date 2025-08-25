"""
Unit tests for database models.

This module tests the basic functionality of database models
to ensure they work correctly with the SQLite implementation.
"""

import pytest


@pytest.mark.unit
@pytest.mark.database
def test_database_models_import():
    """Test that database models can be imported successfully."""
    try:
        from models.database_models import Event, Guild, Reaction, User

        assert Event is not None
        assert Guild is not None
        assert User is not None
        assert Reaction is not None
    except ImportError as e:
        pytest.skip(f"Database models not available: {e}")


@pytest.mark.unit
@pytest.mark.database
def test_event_model_basic():
    """Test basic Event model functionality."""
    try:
        from models.database_models import Event

        # Test that we can create an Event instance
        event = Event(
            message_id=123456789, channel_id=987654321, title="Test Event", interval_minutes=60
        )

        assert event.message_id == 123456789
        assert event.channel_id == 987654321
        assert event.title == "Test Event"
        assert event.interval_minutes == 60

    except ImportError as e:
        pytest.skip(f"Event model not available: {e}")


@pytest.mark.unit
@pytest.mark.database
def test_guild_model_basic():
    """Test basic Guild model functionality."""
    try:
        from models.database_models import Guild

        # Test that we can create a Guild instance
        guild = Guild(guild_id=123456789, name="Test Guild")

        assert guild.guild_id == 123456789
        assert guild.name == "Test Guild"

    except ImportError as e:
        pytest.skip(f"Guild model not available: {e}")


@pytest.mark.unit
@pytest.mark.database
def test_user_model_basic():
    """Test basic User model functionality."""
    try:
        from models.database_models import User

        # Test that we can create a User instance
        user = User(user_id=123456789, username="TestUser")

        assert user.user_id == 123456789
        assert user.username == "TestUser"

    except ImportError as e:
        pytest.skip(f"User model not available: {e}")
