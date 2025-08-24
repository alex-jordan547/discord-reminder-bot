"""
Tests for reminder model functionality.
"""

import pytest
from datetime import datetime, timedelta
from models.reminder import Reminder


@pytest.fixture
def sample_reminder():
    """Create a sample reminder for testing."""
    return Reminder(
        message_id=123456789,
        channel_id=987654321,
        guild_id=111111111,
        title="Test Reminder",
        interval_minutes=60,
        required_reactions=["✅", "❌", "❓"]
    )


def test_reminder_creation(sample_reminder):
    """Test that reminder is created correctly."""
    assert sample_reminder.message_id == 123456789
    assert sample_reminder.channel_id == 987654321
    assert sample_reminder.guild_id == 111111111
    assert sample_reminder.title == "Test Reminder"
    assert sample_reminder.interval_minutes == 60
    assert sample_reminder.required_reactions == ["✅", "❌", "❓"]
    assert not sample_reminder.is_paused
    assert len(sample_reminder.users_who_reacted) == 0
    assert len(sample_reminder.all_users) == 0


def test_reminder_serialization(sample_reminder):
    """Test reminder serialization to dict."""
    data = sample_reminder.to_dict()

    assert isinstance(data, dict)
    assert data["message_id"] == 123456789
    assert data["channel_id"] == 987654321
    assert data["guild_id"] == 111111111
    assert data["title"] == "Test Reminder"
    assert data["interval_minutes"] == 60
    assert data["required_reactions"] == ["✅", "❌", "❓"]
    assert data["is_paused"] is False
    assert "last_reminder" in data
    assert "created_at" in data


def test_reminder_deserialization(sample_reminder):
    """Test reminder deserialization from dict."""
    data = sample_reminder.to_dict()
    restored_reminder = Reminder.from_dict(data)

    assert restored_reminder.message_id == sample_reminder.message_id
    assert restored_reminder.channel_id == sample_reminder.channel_id
    assert restored_reminder.guild_id == sample_reminder.guild_id
    assert restored_reminder.title == sample_reminder.title
    assert restored_reminder.interval_minutes == sample_reminder.interval_minutes
    assert restored_reminder.required_reactions == sample_reminder.required_reactions
    assert restored_reminder.is_paused == sample_reminder.is_paused


def test_reminder_due_logic(sample_reminder):
    """Test reminder due checking logic."""
    # Should not be due immediately after creation
    assert not sample_reminder.is_reminder_due()

    # Simulate time passing by modifying last_reminder
    sample_reminder.last_reminder = datetime.now() - timedelta(hours=2)
    assert sample_reminder.is_reminder_due()


def test_pause_unpause(sample_reminder):
    """Test pausing and unpausing reminders."""
    assert not sample_reminder.is_paused

    sample_reminder.pause_reminders()
    assert sample_reminder.is_paused

    sample_reminder.unpause_reminders()
    assert not sample_reminder.is_paused


def test_user_tracking(sample_reminder):
    """Test user reaction tracking."""
    user_id_1 = 111
    user_id_2 = 222

    # Add users to all_users
    sample_reminder.all_users.add(user_id_1)
    sample_reminder.all_users.add(user_id_2)

    # Initially, both users should be missing
    assert sample_reminder.get_missing_count() == 2
    assert sample_reminder.get_response_count() == 0

    # One user reacts
    sample_reminder.users_who_reacted.add(user_id_1)
    assert sample_reminder.get_missing_count() == 1
    assert sample_reminder.get_response_count() == 1

    # Both users react
    sample_reminder.users_who_reacted.add(user_id_2)
    assert sample_reminder.get_missing_count() == 0
    assert sample_reminder.get_response_count() == 2


def test_status_summary(sample_reminder):
    """Test status summary generation."""
    sample_reminder.all_users.add(111)
    sample_reminder.all_users.add(222)
    sample_reminder.users_who_reacted.add(111)

    status = sample_reminder.get_status_summary()

    assert status["title"] == "Test Reminder"
    assert status["message_id"] == 123456789
    assert status["response_count"] == 1
    assert status["missing_count"] == 1
    assert status["total_count"] == 2
    assert status["response_percentage"] == 50.0
    assert not status["is_paused"]
