"""
Regression tests for SQLite migration.

This module runs comprehensive tests to ensure that all existing functionality
works correctly with the new SQLite implementation and that no regressions
have been introduced.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config.settings import Settings
from models.database_models import Event, Guild, User, Reaction, create_tables, drop_tables, initialize_models
from utils.event_manager_sqlite import sqlite_event_manager
from utils.scheduler_sqlite import check_reminders_dynamic, schedule_next_reminder_check

# Configure logging for tests
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


@pytest.fixture
def setup_sqlite_db():
    """Set up SQLite database for testing."""
    from persistence.database import get_database
    
    # Clean up any existing tables first
    try:
        drop_tables()
    except:
        pass
    
    # Close any existing connections
    db = get_database()
    if not db.is_closed():
        db.close()
    
    # Initialize models and create tables
    initialize_models()
    create_tables()
    
    yield
    
    # Clean up
    try:
        drop_tables()
    except:
        pass
    
    # Close connection
    db = get_database()
    if not db.is_closed():
        db.close()


class TestBasicEventOperations:
    """Test basic event CRUD operations work correctly."""
    
    @pytest.mark.asyncio
    async def test_create_event_functionality(self, setup_sqlite_db):
        """Test that event creation works with all parameters."""
        guild_id = 123456789
        message_id = 987654321
        channel_id = 555666777
        
        # Test basic creation
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=channel_id,
            title="Test Event",
            description="This is a test event",
            interval_minutes=120,
            is_paused=False
        )
        
        assert event is not None, "Event creation should succeed"
        assert event.message_id == message_id
        assert event.channel_id == channel_id
        assert event.guild.guild_id == guild_id
        assert event.title == "Test Event"
        assert event.description == "This is a test event"
        assert event.interval_minutes == 120
        assert event.is_paused == False
        
        # Test creation with minimal parameters
        event2 = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id + 1,
            channel_id=channel_id,
            title="Minimal Event"
        )
        
        assert event2 is not None
        assert event2.title == "Minimal Event"
        assert event2.interval_minutes == 60  # Default value
        assert event2.is_paused == False  # Default value
        
        # Test duplicate creation fails
        duplicate = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,  # Same message ID
            channel_id=channel_id,
            title="Duplicate Event"
        )
        
        assert duplicate is None, "Duplicate event creation should fail"
    
    @pytest.mark.asyncio
    async def test_get_event_functionality(self, setup_sqlite_db):
        """Test that event retrieval works correctly."""
        guild_id = 123456789
        message_id = 987654321
        
        # Test getting non-existent event
        non_existent = await sqlite_event_manager.get_event(999999999)
        assert non_existent is None, "Non-existent event should return None"
        
        # Create an event
        created_event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Retrieval Test Event",
            interval_minutes=90
        )
        
        assert created_event is not None
        
        # Test getting existing event
        retrieved_event = await sqlite_event_manager.get_event(message_id)
        assert retrieved_event is not None
        assert retrieved_event.message_id == message_id
        assert retrieved_event.title == "Retrieval Test Event"
        assert retrieved_event.interval_minutes == 90
        assert retrieved_event.guild.guild_id == guild_id
    
    @pytest.mark.asyncio
    async def test_update_event_functionality(self, setup_sqlite_db):
        """Test that event updates work correctly."""
        guild_id = 123456789
        message_id = 987654321
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Original Title",
            interval_minutes=60,
            is_paused=False
        )
        
        assert event is not None
        
        # Test updating title
        success = await sqlite_event_manager.update_event(
            message_id=message_id,
            title="Updated Title"
        )
        assert success, "Title update should succeed"
        
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.title == "Updated Title"
        
        # Test updating interval
        success = await sqlite_event_manager.update_event(
            message_id=message_id,
            interval_minutes=120
        )
        assert success, "Interval update should succeed"
        
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.interval_minutes == 120
        
        # Test updating pause status
        success = await sqlite_event_manager.update_event(
            message_id=message_id,
            is_paused=True
        )
        assert success, "Pause status update should succeed"
        
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.is_paused == True
        
        # Test updating multiple fields at once
        success = await sqlite_event_manager.update_event(
            message_id=message_id,
            title="Multi-Update Title",
            interval_minutes=180,
            is_paused=False,
            description="Updated description"
        )
        assert success, "Multi-field update should succeed"
        
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.title == "Multi-Update Title"
        assert updated_event.interval_minutes == 180
        assert updated_event.is_paused == False
        assert updated_event.description == "Updated description"
        
        # Test updating non-existent event
        success = await sqlite_event_manager.update_event(
            message_id=999999999,
            title="Should Fail"
        )
        assert not success, "Updating non-existent event should fail"
    
    @pytest.mark.asyncio
    async def test_delete_event_functionality(self, setup_sqlite_db):
        """Test that event deletion works correctly."""
        guild_id = 123456789
        message_id = 987654321
        
        # Test deleting non-existent event
        success = await sqlite_event_manager.delete_event(999999999)
        assert not success, "Deleting non-existent event should fail"
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="To Be Deleted"
        )
        
        assert event is not None
        
        # Verify event exists
        retrieved = await sqlite_event_manager.get_event(message_id)
        assert retrieved is not None
        
        # Delete the event
        success = await sqlite_event_manager.delete_event(message_id)
        assert success, "Event deletion should succeed"
        
        # Verify event is gone
        deleted = await sqlite_event_manager.get_event(message_id)
        assert deleted is None, "Deleted event should not be retrievable"
        
        # Test deleting already deleted event
        success = await sqlite_event_manager.delete_event(message_id)
        assert not success, "Deleting already deleted event should fail"


class TestEventManagement:
    """Test event management functionality."""
    
    @pytest.mark.asyncio
    async def test_pause_resume_functionality(self, setup_sqlite_db):
        """Test pause and resume functionality."""
        guild_id = 123456789
        message_id = 987654321
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Pause Test Event",
            is_paused=False
        )
        
        assert event is not None
        assert not event.is_paused
        
        # Test pause
        success = await sqlite_event_manager.pause_event(message_id)
        assert success, "Pause should succeed"
        
        paused_event = await sqlite_event_manager.get_event(message_id)
        assert paused_event.is_paused, "Event should be paused"
        
        # Test resume
        success = await sqlite_event_manager.resume_event(message_id)
        assert success, "Resume should succeed"
        
        resumed_event = await sqlite_event_manager.get_event(message_id)
        assert not resumed_event.is_paused, "Event should be resumed"
        
        # Test pause non-existent event
        success = await sqlite_event_manager.pause_event(999999999)
        assert not success, "Pausing non-existent event should fail"
        
        # Test resume non-existent event
        success = await sqlite_event_manager.resume_event(999999999)
        assert not success, "Resuming non-existent event should fail"
    
    @pytest.mark.asyncio
    async def test_interval_update_functionality(self, setup_sqlite_db):
        """Test interval update functionality."""
        guild_id = 123456789
        message_id = 987654321
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Interval Test Event",
            interval_minutes=60
        )
        
        assert event is not None
        assert event.interval_minutes == 60
        
        # Test valid interval update
        success = await sqlite_event_manager.update_event_interval(message_id, 120)
        assert success, "Interval update should succeed"
        
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.interval_minutes == 120
        
        # Test another valid interval
        success = await sqlite_event_manager.update_event_interval(message_id, 30)
        assert success, "Interval update should succeed"
        
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.interval_minutes == 30
        
        # Test updating non-existent event
        success = await sqlite_event_manager.update_event_interval(999999999, 60)
        assert not success, "Updating non-existent event should fail"
    
    @pytest.mark.asyncio
    async def test_guild_events_functionality(self, setup_sqlite_db):
        """Test guild-specific event retrieval."""
        guild1_id = 111111111
        guild2_id = 222222222
        
        # Create events in guild 1
        for i in range(3):
            event = await sqlite_event_manager.create_event(
                guild_id=guild1_id,
                message_id=1000000 + i,
                channel_id=100001,
                title=f"Guild 1 Event {i}"
            )
            assert event is not None
        
        # Create events in guild 2
        for i in range(2):
            event = await sqlite_event_manager.create_event(
                guild_id=guild2_id,
                message_id=2000000 + i,
                channel_id=200001,
                title=f"Guild 2 Event {i}"
            )
            assert event is not None
        
        # Test guild 1 events
        guild1_events = await sqlite_event_manager.get_guild_reminders(guild1_id)
        assert len(guild1_events) == 3, f"Guild 1 should have 3 events, got {len(guild1_events)}"
        
        for event in guild1_events.values():
            assert event.guild.guild_id == guild1_id
            assert event.title.startswith("Guild 1")
        
        # Test guild 2 events
        guild2_events = await sqlite_event_manager.get_guild_reminders(guild2_id)
        assert len(guild2_events) == 2, f"Guild 2 should have 2 events, got {len(guild2_events)}"
        
        for event in guild2_events.values():
            assert event.guild.guild_id == guild2_id
            assert event.title.startswith("Guild 2")
        
        # Test non-existent guild
        empty_guild_events = await sqlite_event_manager.get_guild_reminders(999999999)
        assert len(empty_guild_events) == 0, "Non-existent guild should have no events"


class TestDueEventsAndScheduling:
    """Test due events detection and scheduling functionality."""
    
    @pytest.mark.asyncio
    async def test_due_events_detection(self, setup_sqlite_db):
        """Test that due events are correctly identified."""
        guild_id = 123456789
        current_time = datetime.now()
        
        # Create events with different due times
        test_cases = [
            {
                'message_id': 1000001,
                'title': 'Overdue Event',
                'last_reminder': current_time - timedelta(minutes=90),
                'interval_minutes': 60,
                'should_be_due': True
            },
            {
                'message_id': 1000002,
                'title': 'Just Due Event',
                'last_reminder': current_time - timedelta(minutes=60),
                'interval_minutes': 60,
                'should_be_due': True
            },
            {
                'message_id': 1000003,
                'title': 'Not Due Event',
                'last_reminder': current_time - timedelta(minutes=30),
                'interval_minutes': 60,
                'should_be_due': False
            },
            {
                'message_id': 1000004,
                'title': 'Paused Due Event',
                'last_reminder': current_time - timedelta(minutes=90),
                'interval_minutes': 60,
                'is_paused': True,
                'should_be_due': False
            }
        ]
        
        # Create all test events
        for case in test_cases:
            event = await sqlite_event_manager.create_event(
                guild_id=guild_id,
                message_id=case['message_id'],
                channel_id=555666777,
                title=case['title'],
                interval_minutes=case['interval_minutes'],
                last_reminder=case['last_reminder'],
                is_paused=case.get('is_paused', False)
            )
            assert event is not None, f"Failed to create event: {case['title']}"
        
        # Get due events
        due_events = await sqlite_event_manager.get_due_events()
        due_message_ids = {event.message_id for event in due_events}
        
        # Verify due events detection
        for case in test_cases:
            if case['should_be_due']:
                assert case['message_id'] in due_message_ids, \
                    f"Event {case['title']} should be due but wasn't detected"
            else:
                assert case['message_id'] not in due_message_ids, \
                    f"Event {case['title']} should not be due but was detected"
        
        # Verify due events count
        expected_due_count = sum(1 for case in test_cases if case['should_be_due'])
        assert len(due_events) == expected_due_count, \
            f"Expected {expected_due_count} due events, got {len(due_events)}"
    
    @pytest.mark.asyncio
    async def test_reminder_marking(self, setup_sqlite_db):
        """Test marking reminders as sent."""
        guild_id = 123456789
        message_id = 987654321
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Reminder Test Event",
            last_reminder=datetime.now() - timedelta(minutes=90)
        )
        
        assert event is not None
        original_last_reminder = event.last_reminder
        
        # Mark reminder as sent
        success = await sqlite_event_manager.mark_reminder_sent(message_id, 5)
        assert success, "Marking reminder as sent should succeed"
        
        # Verify last_reminder was updated
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert updated_event.last_reminder > original_last_reminder, \
            "last_reminder should be updated"
        
        # Test marking non-existent event
        success = await sqlite_event_manager.mark_reminder_sent(999999999, 0)
        assert not success, "Marking non-existent event should fail"


class TestReactionHandling:
    """Test reaction handling functionality."""
    
    @pytest.mark.asyncio
    async def test_reaction_updates(self, setup_sqlite_db):
        """Test reaction update functionality."""
        guild_id = 123456789
        message_id = 987654321
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Reaction Test Event"
        )
        
        assert event is not None
        
        # Mock Discord bot and message
        mock_bot = MagicMock()
        mock_channel = MagicMock()
        mock_message = MagicMock()
        
        # Mock users and reactions
        mock_user1 = MagicMock()
        mock_user1.bot = False
        mock_user1.id = 111111
        mock_user1.display_name = "User1"
        
        mock_user2 = MagicMock()
        mock_user2.bot = False
        mock_user2.id = 222222
        mock_user2.display_name = "User2"
        
        mock_bot_user = MagicMock()
        mock_bot_user.bot = True
        mock_bot_user.id = 333333
        mock_bot_user.display_name = "BotUser"
        
        # Mock reactions
        mock_reaction1 = MagicMock()
        mock_reaction1.emoji = "✅"
        mock_reaction1.users.return_value = AsyncMock()
        mock_reaction1.users.return_value.__aiter__ = AsyncMock(return_value=iter([mock_user1, mock_bot_user]))
        
        mock_reaction2 = MagicMock()
        mock_reaction2.emoji = "❌"
        mock_reaction2.users.return_value = AsyncMock()
        mock_reaction2.users.return_value.__aiter__ = AsyncMock(return_value=iter([mock_user2]))
        
        mock_message.reactions = [mock_reaction1, mock_reaction2]
        mock_channel.fetch_message = AsyncMock(return_value=mock_message)
        mock_bot.get_channel.return_value = mock_channel
        
        # Update reactions
        success = await sqlite_event_manager.update_event_reactions_safe(message_id, mock_bot)
        assert success, "Reaction update should succeed"
        
        # Verify reactions were stored
        reactions = list(Reaction.select().join(Event).where(Event.message_id == message_id))
        assert len(reactions) == 2, f"Should have 2 reactions, got {len(reactions)}"
        
        # Verify reaction details
        reaction_data = {(r.user_id, r.emoji) for r in reactions}
        expected_reactions = {(111111, "✅"), (222222, "❌")}
        assert reaction_data == expected_reactions, "Reaction data should match expected"
        
        # Verify bot reactions are excluded
        bot_reactions = [r for r in reactions if r.user_id == 333333]
        assert len(bot_reactions) == 0, "Bot reactions should be excluded"
        
        # Test updating non-existent event
        success = await sqlite_event_manager.update_event_reactions_safe(999999999, mock_bot)
        assert not success, "Updating non-existent event should fail"


class TestStatisticsAndReporting:
    """Test statistics and reporting functionality."""
    
    @pytest.mark.asyncio
    async def test_manager_statistics(self, setup_sqlite_db):
        """Test event manager statistics."""
        guild_id = 123456789
        
        # Test empty statistics
        stats = sqlite_event_manager.get_stats()
        assert stats['total_events'] == 0
        assert stats['active_events'] == 0
        assert stats['paused_events'] == 0
        assert stats['guilds_with_events'] == 0
        
        # Create some events
        for i in range(5):
            await sqlite_event_manager.create_event(
                guild_id=guild_id,
                message_id=1000000 + i,
                channel_id=555666777,
                title=f"Stats Test Event {i}",
                is_paused=(i % 2 == 0)  # Alternate paused/active
            )
        
        # Test updated statistics
        stats = sqlite_event_manager.get_stats()
        assert stats['total_events'] == 5
        assert stats['active_events'] == 2  # Events 1 and 3 (not paused)
        assert stats['paused_events'] == 3  # Events 0, 2, and 4 (paused)
        assert stats['guilds_with_events'] == 1
        
        # Test legacy compatibility fields
        assert stats['total_reminders'] == 5
        assert stats['active_reminders'] == 2
        assert stats['paused_reminders'] == 3
        assert stats['guilds_with_reminders'] == 1
    
    @pytest.mark.asyncio
    async def test_event_properties(self, setup_sqlite_db):
        """Test event computed properties."""
        guild_id = 123456789
        message_id = 987654321
        
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Properties Test Event",
            interval_minutes=60,
            last_reminder=datetime.now() - timedelta(minutes=90)
        )
        
        assert event is not None
        
        # Test is_due_for_reminder property
        assert event.is_due_for_reminder, "Event should be due for reminder"
        
        # Test next_reminder_time property
        next_time = event.next_reminder_time
        assert isinstance(next_time, datetime), "next_reminder_time should be datetime"
        
        # Test with paused event
        await sqlite_event_manager.update_event(message_id, is_paused=True)
        paused_event = await sqlite_event_manager.get_event(message_id)
        assert not paused_event.is_due_for_reminder, "Paused event should not be due"
        
        # Test with not-due event
        await sqlite_event_manager.update_event(
            message_id, 
            is_paused=False,
            last_reminder=datetime.now() - timedelta(minutes=30)
        )
        not_due_event = await sqlite_event_manager.get_event(message_id)
        assert not not_due_event.is_due_for_reminder, "Recent event should not be due"


class TestLegacyCompatibility:
    """Test legacy compatibility methods."""
    
    @pytest.mark.asyncio
    async def test_legacy_method_names(self, setup_sqlite_db):
        """Test that legacy method names still work."""
        guild_id = 123456789
        message_id = 987654321
        
        # Test legacy add_reminder method
        from models.reminder import Event as JSONEvent
        json_event = JSONEvent(
            message_id=message_id,
            channel_id=555666777,
            guild_id=guild_id,
            title="Legacy Test Event",
            interval_minutes=60
        )
        
        success = await sqlite_event_manager.add_reminder(json_event)
        assert success, "Legacy add_reminder should work"
        
        # Test legacy get_reminder method
        retrieved = await sqlite_event_manager.get_reminder(message_id)
        assert retrieved is not None, "Legacy get_reminder should work"
        assert retrieved.title == "Legacy Test Event"
        
        # Test legacy get_guild_reminders method
        guild_reminders = await sqlite_event_manager.get_guild_reminders(guild_id)
        assert len(guild_reminders) == 1, "Legacy get_guild_reminders should work"
        assert message_id in guild_reminders
        
        # Test legacy get_due_reminders method
        # Make the event due
        await sqlite_event_manager.update_event(
            message_id,
            last_reminder=datetime.now() - timedelta(minutes=90)
        )
        
        due_reminders = await sqlite_event_manager.get_due_reminders()
        due_message_ids = {event.message_id for event in due_reminders}
        assert message_id in due_message_ids, "Legacy get_due_reminders should work"
        
        # Test legacy pause/resume methods
        success = await sqlite_event_manager.pause_reminder(message_id)
        assert success, "Legacy pause_reminder should work"
        
        paused_event = await sqlite_event_manager.get_reminder(message_id)
        assert paused_event.is_paused, "Event should be paused"
        
        success = await sqlite_event_manager.resume_reminder(message_id)
        assert success, "Legacy resume_reminder should work"
        
        resumed_event = await sqlite_event_manager.get_reminder(message_id)
        assert not resumed_event.is_paused, "Event should be resumed"
        
        # Test legacy update_reminder_interval method
        success = await sqlite_event_manager.update_reminder_interval(message_id, 120)
        assert success, "Legacy update_reminder_interval should work"
        
        updated_event = await sqlite_event_manager.get_reminder(message_id)
        assert updated_event.interval_minutes == 120
        
        # Test legacy remove_reminder method
        success = await sqlite_event_manager.remove_reminder(message_id)
        assert success, "Legacy remove_reminder should work"
        
        deleted_event = await sqlite_event_manager.get_reminder(message_id)
        assert deleted_event is None, "Event should be deleted"
    
    @pytest.mark.asyncio
    async def test_storage_compatibility_methods(self, setup_sqlite_db):
        """Test storage compatibility methods."""
        # Test load_from_storage (should be no-op for SQLite)
        success = await sqlite_event_manager.load_from_storage()
        assert success, "load_from_storage should always succeed for SQLite"
        
        # Test save (should be no-op for SQLite)
        success = await sqlite_event_manager.save()
        assert success, "save should always succeed for SQLite"


class TestErrorHandling:
    """Test error handling and edge cases."""
    
    @pytest.mark.asyncio
    async def test_invalid_parameters(self, setup_sqlite_db):
        """Test handling of invalid parameters."""
        guild_id = 123456789
        
        # Test creating event with invalid interval (should be validated by Settings)
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=1000001,
            channel_id=555666777,
            title="Invalid Interval Test",
            interval_minutes=-10  # Invalid negative interval
        )
        
        # Should still create event but with validated interval
        assert event is not None
        assert event.interval_minutes > 0, "Interval should be validated to positive value"
    
    @pytest.mark.asyncio
    async def test_concurrent_operations(self, setup_sqlite_db):
        """Test concurrent operations don't cause issues."""
        guild_id = 123456789
        
        async def create_events(start_id: int, count: int):
            """Create multiple events concurrently."""
            results = []
            for i in range(count):
                event = await sqlite_event_manager.create_event(
                    guild_id=guild_id,
                    message_id=start_id + i,
                    channel_id=555666777,
                    title=f"Concurrent Event {start_id + i}"
                )
                results.append(event is not None)
                await asyncio.sleep(0.001)  # Small delay
            return results
        
        # Run concurrent operations
        results = await asyncio.gather(
            create_events(1000000, 10),
            create_events(2000000, 10),
            create_events(3000000, 10)
        )
        
        # Verify all operations succeeded
        for result_list in results:
            assert all(result_list), "All concurrent operations should succeed"
        
        # Verify final state
        guild_events = await sqlite_event_manager.get_guild_reminders(guild_id)
        assert len(guild_events) == 30, "Should have 30 events total"


class TestComplexScenarios:
    """Test complex real-world scenarios."""
    
    @pytest.mark.asyncio
    async def test_full_event_lifecycle(self, setup_sqlite_db):
        """Test complete event lifecycle from creation to deletion."""
        guild_id = 123456789
        message_id = 987654321
        
        # 1. Create event
        event = await sqlite_event_manager.create_event(
            guild_id=guild_id,
            message_id=message_id,
            channel_id=555666777,
            title="Lifecycle Test Event",
            interval_minutes=60
        )
        
        assert event is not None
        assert not event.is_paused
        
        # 2. Update event details
        success = await sqlite_event_manager.update_event(
            message_id,
            title="Updated Lifecycle Event",
            description="This event has been updated",
            interval_minutes=120
        )
        assert success
        
        # 3. Pause event
        success = await sqlite_event_manager.pause_event(message_id)
        assert success
        
        paused_event = await sqlite_event_manager.get_event(message_id)
        assert paused_event.is_paused
        
        # 4. Resume event
        success = await sqlite_event_manager.resume_event(message_id)
        assert success
        
        resumed_event = await sqlite_event_manager.get_event(message_id)
        assert not resumed_event.is_paused
        
        # 5. Make event due and mark reminder sent
        await sqlite_event_manager.update_event(
            message_id,
            last_reminder=datetime.now() - timedelta(minutes=150)
        )
        
        due_events = await sqlite_event_manager.get_due_events()
        due_message_ids = {event.message_id for event in due_events}
        assert message_id in due_message_ids
        
        success = await sqlite_event_manager.mark_reminder_sent(message_id, 5)
        assert success
        
        # 6. Verify event is no longer due
        updated_event = await sqlite_event_manager.get_event(message_id)
        assert not updated_event.is_due_for_reminder
        
        # 7. Delete event
        success = await sqlite_event_manager.delete_event(message_id)
        assert success
        
        deleted_event = await sqlite_event_manager.get_event(message_id)
        assert deleted_event is None
    
    @pytest.mark.asyncio
    async def test_multi_guild_scenario(self, setup_sqlite_db):
        """Test scenario with multiple guilds and complex operations."""
        guild_ids = [111111111, 222222222, 333333333]
        events_per_guild = 5
        
        # Create events in multiple guilds
        all_message_ids = []
        for guild_id in guild_ids:
            for i in range(events_per_guild):
                message_id = guild_id + i
                all_message_ids.append(message_id)
                
                event = await sqlite_event_manager.create_event(
                    guild_id=guild_id,
                    message_id=message_id,
                    channel_id=guild_id + 1000,
                    title=f"Guild {guild_id} Event {i}",
                    interval_minutes=60 + (i * 10),
                    is_paused=(i % 3 == 0)  # Every 3rd event is paused
                )
                assert event is not None
        
        # Verify guild isolation
        for guild_id in guild_ids:
            guild_events = await sqlite_event_manager.get_guild_reminders(guild_id)
            assert len(guild_events) == events_per_guild
            
            for event in guild_events.values():
                assert event.guild.guild_id == guild_id
                assert event.title.startswith(f"Guild {guild_id}")
        
        # Test due events across guilds
        # Make some events due
        current_time = datetime.now()
        for i, message_id in enumerate(all_message_ids[:7]):  # First 7 events
            await sqlite_event_manager.update_event(
                message_id,
                last_reminder=current_time - timedelta(minutes=90)
            )
        
        due_events = await sqlite_event_manager.get_due_events()
        # Should find due events that are not paused
        # Events 0, 3, 6 are paused, so we expect 4 due events (1, 2, 4, 5)
        expected_due = 4
        actual_due = len([e for e in due_events if not e.is_paused])
        assert actual_due == expected_due, f"Expected {expected_due} due events, got {actual_due}"
        
        # Test statistics
        stats = sqlite_event_manager.get_stats()
        total_events = len(guild_ids) * events_per_guild
        paused_events = len(guild_ids) * 2  # 2 paused per guild (events 0 and 3)
        active_events = total_events - paused_events
        
        assert stats['total_events'] == total_events
        assert stats['paused_events'] == paused_events
        assert stats['active_events'] == active_events
        assert stats['guilds_with_events'] == len(guild_ids)


if __name__ == "__main__":
    # Run regression tests
    pytest.main([__file__, "-v", "-s"])