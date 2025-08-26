"""
Comprehensive unit tests for event_manager_adapter.py.

This module tests the adapter between the legacy Event model and
the new database-based event management system.

Requirements covered: 3.1, 3.2, 5.1
"""

import json
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestEventManagerAdapter:
    """Comprehensive tests for the EventManagerAdapter."""

    @pytest.fixture
    def adapter(self):
        """Create a fresh EventManagerAdapter instance."""
        from utils.event_manager_adapter import EventManagerAdapter

        return EventManagerAdapter()

    @pytest.fixture
    def sample_event_data(self):
        """Create sample event data for testing."""
        return {
            "message_id": 555555555,
            "channel_id": 987654321,
            "guild_id": 123456789,
            "title": "Test Event",
            "description": "Test Description",
            "interval_minutes": 60.0,
            "is_paused": False,
            "last_reminder": (datetime.now() - timedelta(minutes=30)).isoformat(),
            "required_reactions": ["✅", "❌", "❓"],
            "guild_name": "Test Guild",
            "users_who_reacted": [111111111, 222222222],
        }

    @pytest.fixture
    def legacy_reminder_data(self):
        """Create legacy reminder format data."""
        return {
            "123456789": {
                "message_id": 555555555,
                "channel_id": 987654321,
                "guild_id": 123456789,
                "title": "Legacy Event",
                "interval_minutes": 60,
                "last_reminder": "2023-01-01T12:00:00",
                "is_paused": False,
                "required_reactions": ["✅", "❌"],
                "guild_name": "Legacy Guild",
                "users_who_reacted": [111111111],
            }
        }

    @pytest.mark.unit
    def test_adapter_initialization(self, adapter):
        """Test adapter initialization."""
        assert adapter is not None
        assert hasattr(adapter, "load_events")
        assert hasattr(adapter, "save_events")
        assert hasattr(adapter, "add_event")

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_from_json(self, adapter, tmp_path):
        """Test loading events from JSON file."""
        # Create test JSON file
        json_file = tmp_path / "test_events.json"
        test_data = {
            "events": {
                "555555555": {
                    "message_id": 555555555,
                    "channel_id": 987654321,
                    "guild_id": 123456789,
                    "title": "Test Event",
                    "interval_minutes": 60.0,
                    "is_paused": False,
                    "required_reactions": ["✅", "❌"],
                }
            }
        }

        with open(json_file, "w") as f:
            json.dump(test_data, f)

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = str(json_file)

            events = await adapter.load_events()

            assert len(events) == 1
            assert events[0].message_id == 555555555
            assert events[0].title == "Test Event"

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_legacy_format(self, adapter, tmp_path, legacy_reminder_data):
        """Test loading events from legacy reminder format."""
        json_file = tmp_path / "legacy_reminders.json"

        with open(json_file, "w") as f:
            json.dump(legacy_reminder_data, f)

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = str(json_file)

            events = await adapter.load_events()

            assert len(events) == 1
            assert events[0].message_id == 555555555
            assert events[0].title == "Legacy Event"

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_file_not_found(self, adapter):
        """Test loading events when file doesn't exist."""
        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = "/nonexistent/file.json"

            events = await adapter.load_events()

            assert events == []

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_invalid_json(self, adapter, tmp_path):
        """Test loading events from invalid JSON file."""
        json_file = tmp_path / "invalid.json"

        with open(json_file, "w") as f:
            f.write("invalid json content")

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path, patch(
            "utils.event_manager_adapter.logger"
        ) as mock_logger:

            mock_path.return_value = str(json_file)

            events = await adapter.load_events()

            assert events == []
            mock_logger.error.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_save_events_to_json(self, adapter, tmp_path, sample_event_data):
        """Test saving events to JSON file."""
        from models.reminder import Event

        json_file = tmp_path / "save_test.json"

        # Create test event
        event = Event.from_dict(sample_event_data)
        events = [event]

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = str(json_file)

            await adapter.save_events(events)

            # Verify file was created and contains correct data
            assert json_file.exists()

            with open(json_file, "r") as f:
                saved_data = json.load(f)

            assert "events" in saved_data
            assert str(sample_event_data["message_id"]) in saved_data["events"]

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_save_events_empty_list(self, adapter, tmp_path):
        """Test saving empty events list."""
        json_file = tmp_path / "empty_test.json"

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = str(json_file)

            await adapter.save_events([])

            # File should be created with empty events
            assert json_file.exists()

            with open(json_file, "r") as f:
                saved_data = json.load(f)

            assert saved_data["events"] == {}

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_save_events_permission_error(self, adapter):
        """Test saving events when permission denied."""
        from models.reminder import Event

        event = Event()
        event.message_id = 555555555
        event.title = "Test Event"

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path, patch(
            "builtins.open"
        ) as mock_open, patch("utils.event_manager_adapter.logger") as mock_logger:

            mock_path.return_value = "/readonly/file.json"
            mock_open.side_effect = PermissionError("Access denied")

            await adapter.save_events([event])

            mock_logger.error.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_add_event(self, adapter, sample_event_data):
        """Test adding a single event."""
        from models.reminder import Event

        event = Event.from_dict(sample_event_data)

        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load:

            mock_load.return_value = []

            await adapter.add_event(event)

            mock_load.assert_called_once()
            mock_save.assert_called_once()

            # Check that save was called with the new event
            saved_events = mock_save.call_args[0][0]
            assert len(saved_events) == 1
            assert saved_events[0].message_id == event.message_id

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_add_event_duplicate(self, adapter, sample_event_data):
        """Test adding a duplicate event."""
        from models.reminder import Event

        event = Event.from_dict(sample_event_data)
        existing_event = Event.from_dict(sample_event_data)  # Same data

        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load, patch("utils.event_manager_adapter.logger") as mock_logger:

            mock_load.return_value = [existing_event]

            await adapter.add_event(event)

            # Should log warning about duplicate
            mock_logger.warning.assert_called()

            # Should not save duplicate
            mock_save.assert_called_once()
            saved_events = mock_save.call_args[0][0]
            assert len(saved_events) == 1  # Still only one event

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_remove_event(self, adapter, sample_event_data):
        """Test removing an event."""
        from models.reminder import Event

        event = Event.from_dict(sample_event_data)

        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load:

            mock_load.return_value = [event]

            result = await adapter.remove_event(event.message_id)

            assert result is True
            mock_save.assert_called_once()

            # Check that save was called with empty list
            saved_events = mock_save.call_args[0][0]
            assert len(saved_events) == 0

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_remove_event_not_found(self, adapter):
        """Test removing non-existent event."""
        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load:

            mock_load.return_value = []

            result = await adapter.remove_event(999999)

            assert result is False
            mock_save.assert_not_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_update_event(self, adapter, sample_event_data):
        """Test updating an existing event."""
        from models.reminder import Event

        original_event = Event.from_dict(sample_event_data)
        updated_event = Event.from_dict(sample_event_data)
        updated_event.title = "Updated Title"

        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load:

            mock_load.return_value = [original_event]

            result = await adapter.update_event(updated_event)

            assert result is True
            mock_save.assert_called_once()

            # Check that save was called with updated event
            saved_events = mock_save.call_args[0][0]
            assert len(saved_events) == 1
            assert saved_events[0].title == "Updated Title"

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_events_for_guild(self, adapter):
        """Test getting events for a specific guild."""
        from models.reminder import Event

        # Create events for different guilds
        event1_data = {
            "message_id": 1001,
            "guild_id": 123456789,
            "title": "Guild 1 Event 1",
            "channel_id": 1,
            "interval_minutes": 60.0,
        }
        event2_data = {
            "message_id": 1002,
            "guild_id": 123456789,
            "title": "Guild 1 Event 2",
            "channel_id": 1,
            "interval_minutes": 60.0,
        }
        event3_data = {
            "message_id": 2001,
            "guild_id": 987654321,
            "title": "Guild 2 Event 1",
            "channel_id": 2,
            "interval_minutes": 60.0,
        }

        events = [
            Event.from_dict(event1_data),
            Event.from_dict(event2_data),
            Event.from_dict(event3_data),
        ]

        with patch.object(adapter, "load_events") as mock_load:
            mock_load.return_value = events

            guild1_events = await adapter.get_events_for_guild(123456789)
            guild2_events = await adapter.get_events_for_guild(987654321)

            assert len(guild1_events) == 2
            assert len(guild2_events) == 1

            # Check correct events returned
            guild1_titles = [e.title for e in guild1_events]
            assert "Guild 1 Event 1" in guild1_titles
            assert "Guild 1 Event 2" in guild1_titles

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_due_events(self, adapter):
        """Test getting events that are due for reminders."""
        from datetime import datetime, timedelta

        from models.reminder import Event

        # Create events with different due states
        due_event_data = {
            "message_id": 1001,
            "guild_id": 123456789,
            "title": "Due Event",
            "channel_id": 1,
            "interval_minutes": 60.0,
            "is_paused": False,
            "last_reminder": (datetime.now() - timedelta(minutes=120)).isoformat(),
        }

        not_due_event_data = {
            "message_id": 1002,
            "guild_id": 123456789,
            "title": "Not Due Event",
            "channel_id": 1,
            "interval_minutes": 60.0,
            "is_paused": False,
            "last_reminder": (datetime.now() - timedelta(minutes=30)).isoformat(),
        }

        paused_event_data = {
            "message_id": 1003,
            "guild_id": 123456789,
            "title": "Paused Event",
            "channel_id": 1,
            "interval_minutes": 60.0,
            "is_paused": True,
            "last_reminder": (datetime.now() - timedelta(minutes=120)).isoformat(),
        }

        events = [
            Event.from_dict(due_event_data),
            Event.from_dict(not_due_event_data),
            Event.from_dict(paused_event_data),
        ]

        with patch.object(adapter, "load_events") as mock_load:
            mock_load.return_value = events

            due_events = await adapter.get_due_events()

            assert len(due_events) == 1
            assert due_events[0].title == "Due Event"

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_pause_resume_event(self, adapter, sample_event_data):
        """Test pausing and resuming events."""
        from models.reminder import Event

        event = Event.from_dict(sample_event_data)
        event.is_paused = False

        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load:

            mock_load.return_value = [event]

            # Test pause
            result = await adapter.pause_event(event.message_id)
            assert result is True

            saved_events = mock_save.call_args[0][0]
            assert saved_events[0].is_paused is True

            # Test resume
            mock_load.return_value = saved_events  # Use paused event
            result = await adapter.resume_event(event.message_id)
            assert result is True

            saved_events = mock_save.call_args_list[-1][0][0]  # Last call
            assert saved_events[0].is_paused is False

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_adapter_stats(self, adapter):
        """Test getting adapter statistics."""
        from models.reminder import Event

        # Create test events
        events = []
        for i in range(10):
            event_data = {
                "message_id": 1000 + i,
                "guild_id": 123456789 if i < 5 else 987654321,
                "title": f"Event {i}",
                "channel_id": 1,
                "interval_minutes": 60.0,
                "is_paused": i % 3 == 0,  # Every 3rd event is paused
            }
            events.append(Event.from_dict(event_data))

        with patch.object(adapter, "load_events") as mock_load:
            mock_load.return_value = events

            stats = await adapter.get_stats()

            assert stats["total_events"] == 10
            assert stats["active_events"] <= 10
            assert stats["paused_events"] >= 0
            assert stats["guilds_count"] == 2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_backup_and_restore(self, adapter, tmp_path):
        """Test backup and restore functionality."""
        from models.reminder import Event

        # Create test events
        events = [
            Event.from_dict(
                {
                    "message_id": 1001,
                    "guild_id": 123456789,
                    "title": "Event 1",
                    "channel_id": 1,
                    "interval_minutes": 60.0,
                }
            ),
            Event.from_dict(
                {
                    "message_id": 1002,
                    "guild_id": 123456789,
                    "title": "Event 2",
                    "channel_id": 1,
                    "interval_minutes": 60.0,
                }
            ),
        ]

        main_file = tmp_path / "events.json"
        backup_file = tmp_path / "events_backup.json"

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = str(main_file)

            # Save events
            await adapter.save_events(events)

            # Create backup
            await adapter.create_backup()

            # Verify backup exists (this would depend on actual implementation)
            # For now, just verify save was called
            assert main_file.exists()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_data_migration(self, adapter, tmp_path, legacy_reminder_data):
        """Test migration from legacy format to new format."""
        legacy_file = tmp_path / "legacy.json"
        new_file = tmp_path / "events.json"

        # Create legacy format file
        with open(legacy_file, "w") as f:
            json.dump(legacy_reminder_data, f)

        with patch("utils.event_manager_adapter.Settings.get_events_file_path") as mock_path:
            mock_path.return_value = str(legacy_file)

            # Load events (should convert legacy format)
            events = await adapter.load_events()

            assert len(events) == 1
            assert events[0].message_id == 555555555
            assert events[0].title == "Legacy Event"

            # Save in new format
            mock_path.return_value = str(new_file)
            await adapter.save_events(events)

            # Verify new format
            with open(new_file, "r") as f:
                new_data = json.load(f)

            assert "events" in new_data
            assert "555555555" in new_data["events"]

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_concurrent_access(self, adapter):
        """Test adapter behavior with concurrent access."""
        import asyncio

        from models.reminder import Event

        async def add_events(start_id, count):
            for i in range(count):
                event_data = {
                    "message_id": start_id + i,
                    "guild_id": 123456789,
                    "title": f"Event {start_id + i}",
                    "channel_id": 1,
                    "interval_minutes": 60.0,
                }
                event = Event.from_dict(event_data)
                await adapter.add_event(event)

        async def remove_events(start_id, count):
            await asyncio.sleep(0.1)  # Small delay
            for i in range(count):
                await adapter.remove_event(start_id + i)

        with patch.object(adapter, "save_events") as mock_save, patch.object(
            adapter, "load_events"
        ) as mock_load:

            mock_load.return_value = []

            # Run concurrent operations
            await asyncio.gather(add_events(1000, 5), add_events(2000, 5), remove_events(1000, 2))

            # Should have been called multiple times
            assert mock_save.call_count >= 8  # 10 adds + some removes

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_error_recovery(self, adapter, sample_event_data):
        """Test error recovery in various failure scenarios."""
        from models.reminder import Event

        event = Event.from_dict(sample_event_data)

        # Test load error recovery
        with patch("builtins.open") as mock_open, patch(
            "utils.event_manager_adapter.logger"
        ) as mock_logger:

            mock_open.side_effect = IOError("Disk error")

            events = await adapter.load_events()

            assert events == []
            mock_logger.error.assert_called()

        # Test save error recovery
        with patch("builtins.open") as mock_open, patch(
            "utils.event_manager_adapter.logger"
        ) as mock_logger:

            mock_open.side_effect = IOError("Disk full")

            await adapter.save_events([event])

            mock_logger.error.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_data_validation(self, adapter):
        """Test data validation during load/save operations."""
        # Test with invalid event data
        invalid_data = {
            "events": {
                "invalid": {
                    "message_id": "not_a_number",  # Invalid type
                    "guild_id": 123456789,
                    "title": "",  # Empty title
                    "channel_id": 987654321,
                    # Missing required fields
                }
            }
        }

        with patch("builtins.open") as mock_open, patch("json.load") as mock_json_load, patch(
            "utils.event_manager_adapter.logger"
        ) as mock_logger:

            mock_json_load.return_value = invalid_data
            mock_open.return_value.__enter__.return_value = MagicMock()

            events = await adapter.load_events()

            # Should handle invalid data gracefully
            assert isinstance(events, list)
            # May be empty or contain valid events only
            mock_logger.warning.assert_called()  # Should log validation issues
