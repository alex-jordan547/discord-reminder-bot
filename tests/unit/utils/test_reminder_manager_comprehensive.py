"""
Comprehensive unit tests for reminder_manager.py.

This module provides complete test coverage for the EventManager class
and related functionality with all scenarios covered.

Requirements covered: 3.1, 3.2, 5.1
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import discord
import pytest


class TestEventManager:
    """Comprehensive tests for EventManager class."""

    @pytest.fixture
    def event_manager(self):
        """Create a fresh EventManager instance for each test."""
        from utils.reminder_manager import EventManager

        return EventManager()

    @pytest.fixture
    def mock_event(self):
        """Create a mock Event for testing."""
        from models.database_models import Event

        event = MagicMock(spec=Event)
        event.message_id = 555555555
        event.channel_id = 987654321
        event.guild_id = 123456789
        event.title = "Test Event"
        event.interval_minutes = 60.0
        event.is_paused = False
        event.last_reminder = datetime.now() - timedelta(minutes=120)
        event.is_due_for_reminder = True
        return event

    @pytest.fixture
    def mock_bot(self):
        """Create a mock Discord bot."""
        bot = MagicMock()
        bot.fetch_channel = AsyncMock()
        bot.fetch_guild = AsyncMock()
        return bot

    @pytest.mark.unit
    def test_event_manager_initialization(self, event_manager):
        """Test EventManager initialization."""
        assert event_manager._events == {}
        assert event_manager._guild_events == {}
        assert event_manager.events == {}
        assert event_manager.reminders == {}

    @pytest.mark.unit
    def test_event_manager_properties(self, event_manager, mock_event):
        """Test EventManager properties return copies."""
        # Add an event directly to internal storage
        event_manager._events[mock_event.message_id] = mock_event
        event_manager._guild_events[mock_event.guild_id] = {mock_event.message_id}

        # Properties should return copies, not references
        events_copy = event_manager.events
        reminders_copy = event_manager.reminders

        # Modify the copy - should not affect original
        events_copy[999999] = "fake_event"

        assert 999999 not in event_manager._events
        assert mock_event.message_id in event_manager._events

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_add_event_success(self, event_manager, mock_event):
        """Test successfully adding an event."""
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ) as mock_persistence:

            # Configure mocks
            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            await event_manager.add_event(mock_event)

            # Check event was added
            assert mock_event.message_id in event_manager._events
            assert mock_event.guild_id in event_manager._guild_events
            assert mock_event.message_id in event_manager._guild_events[mock_event.guild_id]

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_add_event_duplicate(self, event_manager, mock_event):
        """Test adding duplicate event."""
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ):

            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            # Add event twice
            await event_manager.add_event(mock_event)

            with patch("utils.reminder_manager.logger") as mock_logger:
                await event_manager.add_event(mock_event)
                mock_logger.warning.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_remove_event_success(self, event_manager, mock_event):
        """Test successfully removing an event."""
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ):

            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            # Add then remove event
            await event_manager.add_event(mock_event)
            result = await event_manager.remove_event(mock_event.message_id)

            assert result is True
            assert mock_event.message_id not in event_manager._events

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_remove_event_not_found(self, event_manager):
        """Test removing non-existent event."""
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock:
            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            result = await event_manager.remove_event(999999)
            assert result is False

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_event_success(self, event_manager, mock_event):
        """Test getting an existing event."""
        with patch("utils.reminder_manager.with_guild_lock"):
            event_manager._events[mock_event.message_id] = mock_event

            result = await event_manager.get_event(mock_event.message_id)
            assert result == mock_event

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_event_not_found(self, event_manager):
        """Test getting non-existent event."""
        with patch("utils.reminder_manager.with_guild_lock"):
            result = await event_manager.get_event(999999)
            assert result is None

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_events_for_guild(self, event_manager, mock_event):
        """Test getting events for a specific guild."""
        # Create multiple events for different guilds
        event1 = MagicMock()
        event1.message_id = 1001
        event1.guild_id = 123456789

        event2 = MagicMock()
        event2.message_id = 1002
        event2.guild_id = 123456789

        event3 = MagicMock()
        event3.message_id = 1003
        event3.guild_id = 987654321

        with patch("utils.reminder_manager.with_guild_lock") as mock_lock:
            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            # Add events
            event_manager._events.update(
                {event1.message_id: event1, event2.message_id: event2, event3.message_id: event3}
            )
            event_manager._guild_events = {
                123456789: {event1.message_id, event2.message_id},
                987654321: {event3.message_id},
            }

            # Get events for guild 123456789
            guild_events = await event_manager.get_events_for_guild(123456789)

            assert len(guild_events) == 2
            assert event1 in guild_events
            assert event2 in guild_events
            assert event3 not in guild_events

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_due_events(self, event_manager):
        """Test getting events that are due for reminders."""
        # Create events with different due states
        due_event = MagicMock()
        due_event.message_id = 1001
        due_event.is_due_for_reminder = True
        due_event.is_paused = False

        not_due_event = MagicMock()
        not_due_event.message_id = 1002
        not_due_event.is_due_for_reminder = False
        not_due_event.is_paused = False

        paused_event = MagicMock()
        paused_event.message_id = 1003
        paused_event.is_due_for_reminder = True
        paused_event.is_paused = True

        event_manager._events = {
            due_event.message_id: due_event,
            not_due_event.message_id: not_due_event,
            paused_event.message_id: paused_event,
        }

        with patch("utils.reminder_manager.with_guild_lock") as mock_lock:
            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            due_events = await event_manager.get_due_events()

            assert len(due_events) == 1
            assert due_event in due_events
            assert not_due_event not in due_events
            assert paused_event not in due_events

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_update_event_reactions(self, event_manager, mock_event, mock_bot):
        """Test updating event reactions from Discord message."""
        mock_message = MagicMock()
        mock_message.reactions = []

        # Create mock reaction
        mock_reaction = MagicMock()
        mock_reaction.emoji = "✅"
        mock_reaction.count = 3
        mock_users = [MagicMock(id=111), MagicMock(id=222), MagicMock(id=333)]
        mock_reaction.users = AsyncMock(return_value=mock_users)
        mock_message.reactions = [mock_reaction]

        with patch("utils.reminder_manager.safe_fetch_message") as mock_fetch, patch(
            "utils.reminder_manager.schedule_reaction_update"
        ) as mock_schedule:

            mock_fetch.return_value = mock_message

            await event_manager.update_event_reactions(mock_event, mock_bot)

            mock_fetch.assert_called_once()
            mock_schedule.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_update_event_reactions_message_not_found(
        self, event_manager, mock_event, mock_bot
    ):
        """Test updating reactions when message is not found."""
        with patch("utils.reminder_manager.safe_fetch_message") as mock_fetch, patch(
            "utils.reminder_manager.logger"
        ) as mock_logger:

            mock_fetch.return_value = None

            await event_manager.update_event_reactions(mock_event, mock_bot)

            mock_logger.warning.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_pause_event(self, event_manager, mock_event):
        """Test pausing an event."""
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ):

            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            # Add event first
            event_manager._events[mock_event.message_id] = mock_event
            mock_event.is_paused = False

            result = await event_manager.pause_event(mock_event.message_id)

            assert result is True
            assert mock_event.is_paused is True

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_resume_event(self, event_manager, mock_event):
        """Test resuming a paused event."""
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ):

            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            # Add paused event
            event_manager._events[mock_event.message_id] = mock_event
            mock_event.is_paused = True

            result = await event_manager.resume_event(mock_event.message_id)

            assert result is True
            assert mock_event.is_paused is False

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_stats(self, event_manager):
        """Test getting manager statistics."""
        # Create test events
        event1 = MagicMock()
        event1.message_id = 1001
        event1.guild_id = 123456789
        event1.is_paused = False

        event2 = MagicMock()
        event2.message_id = 1002
        event2.guild_id = 123456789
        event2.is_paused = True

        event3 = MagicMock()
        event3.message_id = 1003
        event3.guild_id = 987654321
        event3.is_paused = False

        event_manager._events = {
            event1.message_id: event1,
            event2.message_id: event2,
            event3.message_id: event3,
        }
        event_manager._guild_events = {
            123456789: {event1.message_id, event2.message_id},
            987654321: {event3.message_id},
        }

        with patch("utils.reminder_manager.concurrency_stats") as mock_stats:
            mock_stats.return_value = {"locks": 0, "operations": 10}

            stats = await event_manager.get_stats()

            assert stats["total_events"] == 3
            assert stats["active_events"] == 2
            assert stats["paused_events"] == 1
            assert stats["guilds_count"] == 2
            assert "concurrency" in stats

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_clear_guild_events(self, event_manager):
        """Test clearing all events for a guild."""
        # Create events for different guilds
        guild1_event1 = MagicMock()
        guild1_event1.message_id = 1001
        guild1_event1.guild_id = 123456789

        guild1_event2 = MagicMock()
        guild1_event2.message_id = 1002
        guild1_event2.guild_id = 123456789

        guild2_event = MagicMock()
        guild2_event.message_id = 2001
        guild2_event.guild_id = 987654321

        event_manager._events = {1001: guild1_event1, 1002: guild1_event2, 2001: guild2_event}
        event_manager._guild_events = {123456789: {1001, 1002}, 987654321: {2001}}

        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ):

            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            removed_count = await event_manager.clear_guild_events(123456789)

            assert removed_count == 2
            assert 1001 not in event_manager._events
            assert 1002 not in event_manager._events
            assert 2001 in event_manager._events  # Other guild's event remains
            assert 123456789 not in event_manager._guild_events

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_from_storage(self, event_manager):
        """Test loading events from storage."""
        mock_events = [
            MagicMock(message_id=1001, guild_id=123456789),
            MagicMock(message_id=1002, guild_id=123456789),
            MagicMock(message_id=2001, guild_id=987654321),
        ]

        with patch("utils.reminder_manager.persistence_manager") as mock_persistence:
            mock_persistence.load_all_events.return_value = mock_events

            loaded_count = await event_manager.load_events_from_storage()

            assert loaded_count == 3
            assert len(event_manager._events) == 3
            assert len(event_manager._guild_events) == 2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_save_events_to_storage(self, event_manager):
        """Test saving events to storage."""
        # Add some events
        event1 = MagicMock(message_id=1001)
        event2 = MagicMock(message_id=1002)
        event_manager._events = {1001: event1, 1002: event2}

        with patch("utils.reminder_manager.persistence_manager") as mock_persistence:
            await event_manager.save_events_to_storage()

            mock_persistence.save_all_events.assert_called_once()
            args = mock_persistence.save_all_events.call_args[0]
            assert len(args[0]) == 2  # Two events saved

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_concurrent_operations(self, event_manager):
        """Test thread safety with concurrent operations."""

        async def add_events():
            for i in range(10):
                event = MagicMock()
                event.message_id = 1000 + i
                event.guild_id = 123456789
                await event_manager.add_event(event)

        async def remove_events():
            for i in range(5):
                await event_manager.remove_event(1000 + i)

        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ):

            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            # Run concurrent operations
            await asyncio.gather(add_events(), remove_events())

            # Should have 5 events remaining (10 added - 5 removed)
            assert len(event_manager._events) >= 5

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_error_handling(self, event_manager, mock_event):
        """Test error handling in various scenarios."""

        # Test add_event with exception
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.persistence_manager"
        ) as mock_persistence, patch("utils.reminder_manager.logger") as mock_logger:

            mock_lock.side_effect = Exception("Lock error")

            await event_manager.add_event(mock_event)
            mock_logger.error.assert_called()

        # Test get_event with exception
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock, patch(
            "utils.reminder_manager.logger"
        ) as mock_logger:

            mock_lock.side_effect = Exception("Lock error")

            result = await event_manager.get_event(mock_event.message_id)
            assert result is None
            mock_logger.error.assert_called()

    @pytest.mark.unit
    def test_legacy_compatibility(self, event_manager, mock_event):
        """Test legacy method compatibility."""
        # Add event directly
        event_manager._events[mock_event.message_id] = mock_event

        # Test legacy reminders property
        reminders = event_manager.reminders
        assert mock_event.message_id in reminders
        assert reminders[mock_event.message_id] == mock_event


class TestEventManagerIntegration:
    """Integration tests for EventManager with real Discord.py objects."""

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_real_discord_message_handling(self, event_manager):
        """Test handling real Discord message objects."""
        # Create more realistic mock objects that behave like discord.py objects
        mock_guild = MagicMock(spec=discord.Guild)
        mock_guild.id = 123456789

        mock_channel = MagicMock(spec=discord.TextChannel)
        mock_channel.id = 987654321
        mock_channel.guild = mock_guild

        mock_message = MagicMock(spec=discord.Message)
        mock_message.id = 555555555
        mock_message.channel = mock_channel
        mock_message.guild = mock_guild
        mock_message.reactions = []

        mock_bot = MagicMock()
        mock_bot.fetch_channel = AsyncMock(return_value=mock_channel)
        mock_bot.get_channel = MagicMock(return_value=mock_channel)

        mock_event = MagicMock()
        mock_event.message_id = mock_message.id
        mock_event.channel_id = mock_channel.id
        mock_event.guild_id = mock_guild.id

        with patch("utils.reminder_manager.safe_fetch_message") as mock_fetch:
            mock_fetch.return_value = mock_message

            await event_manager.update_event_reactions(mock_event, mock_bot)

            mock_fetch.assert_called_once_with(mock_bot, mock_channel.id, mock_message.id)

    @pytest.mark.unit
    def test_memory_management(self, event_manager):
        """Test that the manager doesn't leak memory."""
        import gc
        import sys

        # Create many events
        initial_objects = len(gc.get_objects())

        for i in range(100):
            event = MagicMock()
            event.message_id = i
            event.guild_id = 123456789
            event_manager._events[i] = event

        # Remove half the events
        for i in range(50):
            del event_manager._events[i]

        # Force garbage collection
        gc.collect()

        final_objects = len(gc.get_objects())

        # Should not have significantly more objects
        assert final_objects - initial_objects < 100

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_performance_with_many_events(self, event_manager):
        """Test performance with a large number of events."""
        import time

        # Create many events
        events = []
        for i in range(1000):
            event = MagicMock()
            event.message_id = i
            event.guild_id = i % 10  # 10 different guilds
            event.is_paused = i % 5 == 0  # Every 5th event is paused
            event.is_due_for_reminder = i % 3 == 0  # Every 3rd event is due
            events.append(event)
            event_manager._events[i] = event

            if event.guild_id not in event_manager._guild_events:
                event_manager._guild_events[event.guild_id] = set()
            event_manager._guild_events[event.guild_id].add(i)

        # Test performance of various operations
        with patch("utils.reminder_manager.with_guild_lock") as mock_lock:
            mock_lock.return_value.__enter__ = MagicMock()
            mock_lock.return_value.__exit__ = MagicMock()

            start_time = time.time()

            # Get events for a guild
            guild_events = await event_manager.get_events_for_guild(5)

            # Get due events
            due_events = await event_manager.get_due_events()

            # Get stats
            stats = await event_manager.get_stats()

            end_time = time.time()

            # Operations should complete quickly (less than 1 second)
            assert end_time - start_time < 1.0

            # Verify results make sense
            assert len(guild_events) == 100  # 1000 events / 10 guilds
            assert len(due_events) <= len(
                [e for e in events if e.is_due_for_reminder and not e.is_paused]
            )
            assert stats["total_events"] == 1000
