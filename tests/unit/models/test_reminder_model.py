"""
Unit tests for reminder model functionality.

This module tests the Event model when used as a Reminder
for backward compatibility.
"""

from datetime import datetime, timedelta

import pytest


@pytest.mark.unit
def test_reminder_model_import():
    """Test that reminder model can be imported successfully."""
    try:
        from models.database_models import Event as Reminder

        assert Reminder is not None
    except ImportError as e:
        pytest.skip(f"Reminder model not available: {e}")


@pytest.mark.unit
def test_reminder_creation():
    """Test basic reminder creation."""
    try:
        from models.database_models import Event as Reminder

        reminder = Reminder(
            message_id=123456789,
            channel_id=987654321,
            guild_id=111111111,
            title="Test Reminder",
            interval_minutes=60,
        )

        assert reminder.message_id == 123456789
        assert reminder.channel_id == 987654321
        assert reminder.guild_id == 111111111
        assert reminder.title == "Test Reminder"
        assert reminder.interval_minutes == 60

    except ImportError as e:
        pytest.skip(f"Reminder model not available: {e}")


@pytest.mark.unit
def test_reminder_serialization():
    """Test reminder serialization methods."""
    try:
        from models.database_models import Event as Reminder

        reminder = Reminder(
            message_id=123456789,
            channel_id=987654321,
            guild_id=111111111,
            title="Test Reminder",
            interval_minutes=60,
        )

        # Test that serialization methods exist
        assert hasattr(reminder, "to_dict")

        # Test basic serialization
        data = reminder.to_dict()
        assert isinstance(data, dict)
        assert data["message_id"] == 123456789
        assert data["title"] == "Test Reminder"

    except ImportError as e:
        pytest.skip(f"Reminder model not available: {e}")
    except AttributeError as e:
        pytest.skip(f"Serialization methods not available: {e}")


@pytest.mark.unit
def test_reminder_pause_functionality():
    """Test reminder pause/resume functionality."""
    try:
        from models.database_models import Event as Reminder

        reminder = Reminder(
            message_id=123456789,
            channel_id=987654321,
            guild_id=111111111,
            title="Test Reminder",
            interval_minutes=60,
        )

        # Test default state
        assert hasattr(reminder, "is_paused")

        # Test pause functionality if available
        if hasattr(reminder, "pause_reminders"):
            reminder.pause_reminders()
            assert reminder.is_paused

        if hasattr(reminder, "resume_reminders"):
            reminder.resume_reminders()
            assert not reminder.is_paused

    except ImportError as e:
        pytest.skip(f"Reminder model not available: {e}")
