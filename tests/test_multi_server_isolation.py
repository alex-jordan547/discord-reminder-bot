"""
Multi-server isolation tests for SQLite migration.

This module tests that data is properly isolated between different Discord servers
and that concurrent operations between servers don't interfere with each other.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Set
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.database_models import Event, Guild, User, Reaction, create_tables, drop_tables, initialize_models
from utils.event_manager_sqlite import sqlite_event_manager

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
        pass  # Ignore errors if tables don't exist
    
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
        pass  # Ignore cleanup errors
    
    # Close connection
    db = get_database()
    if not db.is_closed():
        db.close()


class TestMultiServerIsolation:
    """Test data isolation between multiple Discord servers."""
    
    @pytest.mark.asyncio
    async def test_basic_guild_isolation(self, setup_sqlite_db):
        """Test that events are isolated by guild_id."""
        # Create events in different guilds
        guild1_id = 111111111
        guild2_id = 222222222
        guild3_id = 333333333
        
        # Create events for guild 1
        for i in range(5):
            await sqlite_event_manager.create_event(
                guild_id=guild1_id,
                message_id=1000000 + i,
                channel_id=100001,
                title=f"Guild 1 Event {i}",
                interval_minutes=60
            )
        
        # Create events for guild 2
        for i in range(3):
            await sqlite_event_manager.create_event(
                guild_id=guild2_id,
                message_id=2000000 + i,
                channel_id=200001,
                title=f"Guild 2 Event {i}",
                interval_minutes=120
            )
        
        # Create events for guild 3
        for i in range(7):
            await sqlite_event_manager.create_event(
                guild_id=guild3_id,
                message_id=3000000 + i,
                channel_id=300001,
                title=f"Guild 3 Event {i}",
                interval_minutes=90
            )
        
        # Test isolation - each guild should only see its own events
        guild1_events = await sqlite_event_manager.get_guild_reminders(guild1_id)
        guild2_events = await sqlite_event_manager.get_guild_reminders(guild2_id)
        guild3_events = await sqlite_event_manager.get_guild_reminders(guild3_id)
        
        assert len(guild1_events) == 5, f"Guild 1 should have 5 events, got {len(guild1_events)}"
        assert len(guild2_events) == 3, f"Guild 2 should have 3 events, got {len(guild2_events)}"
        assert len(guild3_events) == 7, f"Guild 3 should have 7 events, got {len(guild3_events)}"
        
        # Verify no cross-contamination
        guild1_message_ids = set(guild1_events.keys())
        guild2_message_ids = set(guild2_events.keys())
        guild3_message_ids = set(guild3_events.keys())
        
        assert guild1_message_ids.isdisjoint(guild2_message_ids), "Guild 1 and 2 events overlap"
        assert guild1_message_ids.isdisjoint(guild3_message_ids), "Guild 1 and 3 events overlap"
        assert guild2_message_ids.isdisjoint(guild3_message_ids), "Guild 2 and 3 events overlap"
        
        # Verify event details are correct
        for event in guild1_events.values():
            assert event.guild.guild_id == guild1_id, f"Event {event.message_id} has wrong guild_id"
            assert event.title.startswith("Guild 1"), f"Event {event.message_id} has wrong title"
        
        for event in guild2_events.values():
            assert event.guild.guild_id == guild2_id, f"Event {event.message_id} has wrong guild_id"
            assert event.title.startswith("Guild 2"), f"Event {event.message_id} has wrong title"
    
    @pytest.mark.asyncio
    async def test_user_isolation_between_guilds(self, setup_sqlite_db):
        """Test that users are isolated between guilds."""
        guild1_id = 111111111
        guild2_id = 222222222
        user_id = 999888777  # Same user in both guilds
        
        # Create events in both guilds
        event1 = await sqlite_event_manager.create_event(
            guild_id=guild1_id,
            message_id=4000001,
            channel_id=100001,
            title="Guild 1 User Test Event"
        )
        
        event2 = await sqlite_event_manager.create_event(
            guild_id=guild2_id,
            message_id=4000002,
            channel_id=200001,
            title="Guild 2 User Test Event"
        )
        
        # Create user records in both guilds (same user_id, different guilds)
        guild1_obj = Guild.get(Guild.guild_id == guild1_id)
        guild2_obj = Guild.get(Guild.guild_id == guild2_id)
        
        user1 = User.create(
            user_id=user_id,
            guild=guild1_obj,
            username="TestUser",
            is_bot=False
        )
        
        user2 = User.create(
            user_id=user_id,
            guild=guild2_obj,
            username="TestUser",
            is_bot=False
        )
        
        # Create reactions in both guilds
        Reaction.create(
            event=event1,
            user_id=user_id,
            emoji="✅"
        )
        
        Reaction.create(
            event=event2,
            user_id=user_id,
            emoji="❌"
        )
        
        # Verify isolation - each guild should only see its own user reactions
        guild1_reactions = list(Reaction.select().join(Event).join(Guild).where(Guild.guild_id == guild1_id))
        guild2_reactions = list(Reaction.select().join(Event).join(Guild).where(Guild.guild_id == guild2_id))
        
        assert len(guild1_reactions) == 1, f"Guild 1 should have 1 reaction, got {len(guild1_reactions)}"
        assert len(guild2_reactions) == 1, f"Guild 2 should have 1 reaction, got {len(guild2_reactions)}"
        
        assert guild1_reactions[0].emoji == "✅", "Guild 1 reaction should be ✅"
        assert guild2_reactions[0].emoji == "❌", "Guild 2 reaction should be ❌"
        
        # Verify user records are separate
        guild1_users = list(User.select().where(User.guild == guild1_obj))
        guild2_users = list(User.select().where(User.guild == guild2_obj))
        
        assert len(guild1_users) == 1, f"Guild 1 should have 1 user, got {len(guild1_users)}"
        assert len(guild2_users) == 1, f"Guild 2 should have 1 user, got {len(guild2_users)}"
        
        # Same user_id but different database records
        assert guild1_users[0].user_id == user_id
        assert guild2_users[0].user_id == user_id
        assert guild1_users[0].id != guild2_users[0].id  # Different database IDs
    
    @pytest.mark.asyncio
    async def test_concurrent_operations_different_guilds(self, setup_sqlite_db):
        """Test concurrent operations on different guilds don't interfere."""
        guild1_id = 111111111
        guild2_id = 222222222
        guild3_id = 333333333
        
        async def create_events_for_guild(guild_id: int, start_message_id: int, count: int):
            """Create events for a specific guild."""
            events_created = []
            for i in range(count):
                event = await sqlite_event_manager.create_event(
                    guild_id=guild_id,
                    message_id=start_message_id + i,
                    channel_id=guild_id + 1000,  # Unique channel per guild
                    title=f"Concurrent Event {i} for Guild {guild_id}",
                    interval_minutes=60 + i
                )
                if event:
                    events_created.append(event.message_id)
                await asyncio.sleep(0.001)  # Small delay to simulate real conditions
            return events_created
        
        async def update_events_for_guild(guild_id: int, start_message_id: int, count: int):
            """Update events for a specific guild."""
            updates_made = []
            for i in range(count):
                success = await sqlite_event_manager.update_event(
                    message_id=start_message_id + i,
                    title=f"Updated Event {i} for Guild {guild_id}",
                    interval_minutes=120 + i
                )
                if success:
                    updates_made.append(start_message_id + i)
                await asyncio.sleep(0.001)
            return updates_made
        
        # Run concurrent operations on different guilds
        results = await asyncio.gather(
            create_events_for_guild(guild1_id, 5000000, 20),
            create_events_for_guild(guild2_id, 6000000, 15),
            create_events_for_guild(guild3_id, 7000000, 25),
            return_exceptions=True
        )
        
        # Verify all operations completed successfully
        for result in results:
            assert not isinstance(result, Exception), f"Concurrent operation failed: {result}"
        
        guild1_created, guild2_created, guild3_created = results
        
        assert len(guild1_created) == 20, f"Guild 1 should have created 20 events, got {len(guild1_created)}"
        assert len(guild2_created) == 15, f"Guild 2 should have created 15 events, got {len(guild2_created)}"
        assert len(guild3_created) == 25, f"Guild 3 should have created 25 events, got {len(guild3_created)}"
        
        # Now run concurrent updates
        update_results = await asyncio.gather(
            update_events_for_guild(guild1_id, 5000000, 10),
            update_events_for_guild(guild2_id, 6000000, 8),
            update_events_for_guild(guild3_id, 7000000, 12),
            return_exceptions=True
        )
        
        # Verify updates completed successfully
        for result in update_results:
            assert not isinstance(result, Exception), f"Concurrent update failed: {result}"
        
        guild1_updated, guild2_updated, guild3_updated = update_results
        
        assert len(guild1_updated) == 10, f"Guild 1 should have updated 10 events, got {len(guild1_updated)}"
        assert len(guild2_updated) == 8, f"Guild 2 should have updated 8 events, got {len(guild2_updated)}"
        assert len(guild3_updated) == 12, f"Guild 3 should have updated 12 events, got {len(guild3_updated)}"
        
        # Verify final state isolation
        final_guild1_events = await sqlite_event_manager.get_guild_reminders(guild1_id)
        final_guild2_events = await sqlite_event_manager.get_guild_reminders(guild2_id)
        final_guild3_events = await sqlite_event_manager.get_guild_reminders(guild3_id)
        
        assert len(final_guild1_events) == 20
        assert len(final_guild2_events) == 15
        assert len(final_guild3_events) == 25
        
        # Verify no cross-contamination occurred
        all_message_ids = set()
        for events in [final_guild1_events, final_guild2_events, final_guild3_events]:
            guild_message_ids = set(events.keys())
            assert guild_message_ids.isdisjoint(all_message_ids), "Message ID collision between guilds"
            all_message_ids.update(guild_message_ids)
    
    @pytest.mark.asyncio
    async def test_due_events_isolation(self, setup_sqlite_db):
        """Test that due events queries respect guild isolation."""
        guild1_id = 111111111
        guild2_id = 222222222
        
        current_time = datetime.now()
        
        # Create due events in guild 1
        for i in range(5):
            await sqlite_event_manager.create_event(
                guild_id=guild1_id,
                message_id=8000000 + i,
                channel_id=100001,
                title=f"Guild 1 Due Event {i}",
                interval_minutes=60,
                last_reminder=current_time - timedelta(minutes=90)  # Due
            )
        
        # Create not-due events in guild 1
        for i in range(3):
            await sqlite_event_manager.create_event(
                guild_id=guild1_id,
                message_id=8000100 + i,
                channel_id=100001,
                title=f"Guild 1 Not Due Event {i}",
                interval_minutes=60,
                last_reminder=current_time - timedelta(minutes=30)  # Not due
            )
        
        # Create due events in guild 2
        for i in range(7):
            await sqlite_event_manager.create_event(
                guild_id=guild2_id,
                message_id=8000200 + i,
                channel_id=200001,
                title=f"Guild 2 Due Event {i}",
                interval_minutes=60,
                last_reminder=current_time - timedelta(minutes=90)  # Due
            )
        
        # Get all due events (should include both guilds)
        all_due_events = await sqlite_event_manager.get_due_events()
        
        # Separate by guild
        guild1_due = [e for e in all_due_events if e.guild.guild_id == guild1_id]
        guild2_due = [e for e in all_due_events if e.guild.guild_id == guild2_id]
        
        assert len(guild1_due) == 5, f"Guild 1 should have 5 due events, got {len(guild1_due)}"
        assert len(guild2_due) == 7, f"Guild 2 should have 7 due events, got {len(guild2_due)}"
        assert len(all_due_events) == 12, f"Total should be 12 due events, got {len(all_due_events)}"
        
        # Verify each event belongs to the correct guild
        for event in guild1_due:
            assert event.guild.guild_id == guild1_id, f"Event {event.message_id} has wrong guild"
            assert event.title.startswith("Guild 1"), f"Event {event.message_id} has wrong title"
        
        for event in guild2_due:
            assert event.guild.guild_id == guild2_id, f"Event {event.message_id} has wrong guild"
            assert event.title.startswith("Guild 2"), f"Event {event.message_id} has wrong title"
    
    @pytest.mark.asyncio
    async def test_reaction_updates_isolation(self, setup_sqlite_db):
        """Test that reaction updates don't affect other guilds."""
        guild1_id = 111111111
        guild2_id = 222222222
        
        # Create events in both guilds
        event1 = await sqlite_event_manager.create_event(
            guild_id=guild1_id,
            message_id=9000001,
            channel_id=100001,
            title="Guild 1 Reaction Test"
        )
        
        event2 = await sqlite_event_manager.create_event(
            guild_id=guild2_id,
            message_id=9000002,
            channel_id=200001,
            title="Guild 2 Reaction Test"
        )
        
        # Mock Discord bot and messages
        mock_bot = MagicMock()
        
        # Mock for guild 1
        mock_channel1 = MagicMock()
        mock_message1 = MagicMock()
        mock_reaction1 = MagicMock()
        mock_user1 = MagicMock()
        
        mock_user1.bot = False
        mock_user1.id = 111111
        mock_user1.display_name = "User1"
        
        mock_reaction1.emoji = "✅"
        mock_reaction1.users.return_value = AsyncMock()
        mock_reaction1.users.return_value.__aiter__ = AsyncMock(return_value=iter([mock_user1]))
        
        mock_message1.reactions = [mock_reaction1]
        mock_channel1.fetch_message = AsyncMock(return_value=mock_message1)
        
        # Mock for guild 2
        mock_channel2 = MagicMock()
        mock_message2 = MagicMock()
        mock_reaction2 = MagicMock()
        mock_user2 = MagicMock()
        
        mock_user2.bot = False
        mock_user2.id = 222222
        mock_user2.display_name = "User2"
        
        mock_reaction2.emoji = "❌"
        mock_reaction2.users.return_value = AsyncMock()
        mock_reaction2.users.return_value.__aiter__ = AsyncMock(return_value=iter([mock_user2]))
        
        mock_message2.reactions = [mock_reaction2]
        mock_channel2.fetch_message = AsyncMock(return_value=mock_message2)
        
        # Set up bot mock to return appropriate channels
        def get_channel_side_effect(channel_id):
            if channel_id == 100001:
                return mock_channel1
            elif channel_id == 200001:
                return mock_channel2
            return None
        
        mock_bot.get_channel.side_effect = get_channel_side_effect
        
        # Update reactions for both events
        success1 = await sqlite_event_manager.update_event_reactions_safe(9000001, mock_bot)
        success2 = await sqlite_event_manager.update_event_reactions_safe(9000002, mock_bot)
        
        assert success1, "Guild 1 reaction update should succeed"
        assert success2, "Guild 2 reaction update should succeed"
        
        # Verify isolation - each guild should only see its own reactions
        guild1_reactions = list(Reaction.select().join(Event).join(Guild).where(Guild.guild_id == guild1_id))
        guild2_reactions = list(Reaction.select().join(Event).join(Guild).where(Guild.guild_id == guild2_id))
        
        assert len(guild1_reactions) == 1, f"Guild 1 should have 1 reaction, got {len(guild1_reactions)}"
        assert len(guild2_reactions) == 1, f"Guild 2 should have 1 reaction, got {len(guild2_reactions)}"
        
        assert guild1_reactions[0].user_id == 111111, "Guild 1 reaction should be from user 111111"
        assert guild1_reactions[0].emoji == "✅", "Guild 1 reaction should be ✅"
        
        assert guild2_reactions[0].user_id == 222222, "Guild 2 reaction should be from user 222222"
        assert guild2_reactions[0].emoji == "❌", "Guild 2 reaction should be ❌"
        
        # Verify users are isolated
        guild1_users = list(User.select().join(Guild).where(Guild.guild_id == guild1_id))
        guild2_users = list(User.select().join(Guild).where(Guild.guild_id == guild2_id))
        
        assert len(guild1_users) == 1, f"Guild 1 should have 1 user, got {len(guild1_users)}"
        assert len(guild2_users) == 1, f"Guild 2 should have 1 user, got {len(guild2_users)}"
        
        assert guild1_users[0].user_id == 111111
        assert guild2_users[0].user_id == 222222
    
    @pytest.mark.asyncio
    async def test_cross_guild_query_prevention(self, setup_sqlite_db):
        """Test that cross-guild queries are prevented or isolated."""
        guild1_id = 111111111
        guild2_id = 222222222
        
        # Create events in both guilds
        for i in range(5):
            await sqlite_event_manager.create_event(
                guild_id=guild1_id,
                message_id=10000000 + i,
                channel_id=100001,
                title=f"Guild 1 Event {i}"
            )
        
        for i in range(3):
            await sqlite_event_manager.create_event(
                guild_id=guild2_id,
                message_id=10000100 + i,
                channel_id=200001,
                title=f"Guild 2 Event {i}"
            )
        
        # Test that guild-specific queries only return events for that guild
        guild1_events = await sqlite_event_manager.get_guild_reminders(guild1_id)
        guild2_events = await sqlite_event_manager.get_guild_reminders(guild2_id)
        
        # Verify counts
        assert len(guild1_events) == 5
        assert len(guild2_events) == 3
        
        # Verify no cross-contamination
        for message_id, event in guild1_events.items():
            assert event.guild.guild_id == guild1_id
            assert 10000000 <= message_id <= 10000004
        
        for message_id, event in guild2_events.items():
            assert event.guild.guild_id == guild2_id
            assert 10000100 <= message_id <= 10000102
        
        # Test that individual event queries work correctly
        guild1_event = await sqlite_event_manager.get_event(10000001)
        guild2_event = await sqlite_event_manager.get_event(10000101)
        
        assert guild1_event is not None
        assert guild1_event.guild.guild_id == guild1_id
        
        assert guild2_event is not None
        assert guild2_event.guild.guild_id == guild2_id
        
        # Test that non-existent events return None
        non_existent = await sqlite_event_manager.get_event(99999999)
        assert non_existent is None
    
    @pytest.mark.asyncio
    async def test_guild_deletion_isolation(self, setup_sqlite_db):
        """Test that deleting events from one guild doesn't affect others."""
        guild1_id = 111111111
        guild2_id = 222222222
        
        # Create events in both guilds
        guild1_message_ids = []
        guild2_message_ids = []
        
        for i in range(5):
            message_id = 11000000 + i
            guild1_message_ids.append(message_id)
            await sqlite_event_manager.create_event(
                guild_id=guild1_id,
                message_id=message_id,
                channel_id=100001,
                title=f"Guild 1 Event {i}"
            )
        
        for i in range(3):
            message_id = 11000100 + i
            guild2_message_ids.append(message_id)
            await sqlite_event_manager.create_event(
                guild_id=guild2_id,
                message_id=message_id,
                channel_id=200001,
                title=f"Guild 2 Event {i}"
            )
        
        # Verify initial state
        assert len(await sqlite_event_manager.get_guild_reminders(guild1_id)) == 5
        assert len(await sqlite_event_manager.get_guild_reminders(guild2_id)) == 3
        
        # Delete some events from guild 1
        for message_id in guild1_message_ids[:3]:  # Delete first 3 events
            success = await sqlite_event_manager.delete_event(message_id)
            assert success, f"Failed to delete event {message_id}"
        
        # Verify guild 1 has fewer events but guild 2 is unaffected
        guild1_events_after = await sqlite_event_manager.get_guild_reminders(guild1_id)
        guild2_events_after = await sqlite_event_manager.get_guild_reminders(guild2_id)
        
        assert len(guild1_events_after) == 2, f"Guild 1 should have 2 events, got {len(guild1_events_after)}"
        assert len(guild2_events_after) == 3, f"Guild 2 should still have 3 events, got {len(guild2_events_after)}"
        
        # Verify the correct events remain in guild 1
        remaining_message_ids = set(guild1_events_after.keys())
        expected_remaining = set(guild1_message_ids[3:])  # Last 2 events
        assert remaining_message_ids == expected_remaining
        
        # Verify guild 2 events are completely unaffected
        guild2_message_ids_after = set(guild2_events_after.keys())
        expected_guild2 = set(guild2_message_ids)
        assert guild2_message_ids_after == expected_guild2
        
        # Verify event details are still correct
        for event in guild2_events_after.values():
            assert event.guild.guild_id == guild2_id
            assert event.title.startswith("Guild 2")


class TestConcurrencyBetweenGuilds:
    """Test concurrent operations between different guilds."""
    
    @pytest.mark.asyncio
    async def test_high_concurrency_different_guilds(self, setup_sqlite_db):
        """Test high concurrency operations across multiple guilds."""
        num_guilds = 5
        events_per_guild = 20
        
        async def guild_operations(guild_id: int):
            """Perform various operations for a single guild."""
            operations_completed = {
                'created': 0,
                'updated': 0,
                'queried': 0,
                'deleted': 0
            }
            
            # Create events
            message_ids = []
            for i in range(events_per_guild):
                message_id = guild_id * 1000000 + i
                event = await sqlite_event_manager.create_event(
                    guild_id=guild_id,
                    message_id=message_id,
                    channel_id=guild_id + 1000,
                    title=f"Guild {guild_id} Event {i}",
                    interval_minutes=60 + i
                )
                if event:
                    message_ids.append(message_id)
                    operations_completed['created'] += 1
                
                # Small delay to simulate real conditions
                await asyncio.sleep(0.001)
            
            # Update some events
            for i in range(events_per_guild // 2):
                message_id = message_ids[i]
                success = await sqlite_event_manager.update_event(
                    message_id=message_id,
                    title=f"Updated Guild {guild_id} Event {i}",
                    interval_minutes=120 + i
                )
                if success:
                    operations_completed['updated'] += 1
                await asyncio.sleep(0.001)
            
            # Query events multiple times
            for _ in range(10):
                events = await sqlite_event_manager.get_guild_reminders(guild_id)
                if events:
                    operations_completed['queried'] += 1
                await asyncio.sleep(0.001)
            
            # Delete some events
            for i in range(events_per_guild // 4):
                message_id = message_ids[i]
                success = await sqlite_event_manager.delete_event(message_id)
                if success:
                    operations_completed['deleted'] += 1
                await asyncio.sleep(0.001)
            
            return operations_completed
        
        # Run operations for all guilds concurrently
        guild_ids = [100000 + i for i in range(num_guilds)]
        
        start_time = asyncio.get_event_loop().time()
        results = await asyncio.gather(
            *[guild_operations(guild_id) for guild_id in guild_ids],
            return_exceptions=True
        )
        end_time = asyncio.get_event_loop().time()
        
        # Verify no exceptions occurred
        for i, result in enumerate(results):
            assert not isinstance(result, Exception), f"Guild {guild_ids[i]} operations failed: {result}"
        
        # Verify operation counts
        total_operations = {
            'created': 0,
            'updated': 0,
            'queried': 0,
            'deleted': 0
        }
        
        for result in results:
            for op_type, count in result.items():
                total_operations[op_type] += count
        
        logger.info(f"Concurrent operations completed in {end_time - start_time:.2f}s")
        logger.info(f"Total operations: {total_operations}")
        
        # Verify expected operation counts
        assert total_operations['created'] == num_guilds * events_per_guild
        assert total_operations['updated'] == num_guilds * (events_per_guild // 2)
        assert total_operations['queried'] == num_guilds * 10
        assert total_operations['deleted'] == num_guilds * (events_per_guild // 4)
        
        # Verify final state isolation
        for guild_id in guild_ids:
            guild_events = await sqlite_event_manager.get_guild_reminders(guild_id)
            expected_remaining = events_per_guild - (events_per_guild // 4)
            assert len(guild_events) == expected_remaining, \
                f"Guild {guild_id} should have {expected_remaining} events, got {len(guild_events)}"
            
            # Verify all events belong to the correct guild
            for event in guild_events.values():
                assert event.guild.guild_id == guild_id, \
                    f"Event {event.message_id} belongs to wrong guild: {event.guild.guild_id}"
    
    @pytest.mark.asyncio
    async def test_stress_test_isolation(self, setup_sqlite_db):
        """Stress test isolation under heavy concurrent load."""
        num_guilds = 10
        operations_per_guild = 50
        
        async def stress_operations(guild_id: int):
            """Perform stress operations for a guild."""
            # Rapid create/update/delete cycle
            for cycle in range(5):
                # Create batch
                message_ids = []
                for i in range(operations_per_guild // 5):
                    message_id = guild_id * 1000000 + cycle * 1000 + i
                    event = await sqlite_event_manager.create_event(
                        guild_id=guild_id,
                        message_id=message_id,
                        channel_id=guild_id + 1000,
                        title=f"Stress Guild {guild_id} Cycle {cycle} Event {i}"
                    )
                    if event:
                        message_ids.append(message_id)
                
                # Update batch
                for message_id in message_ids[:len(message_ids)//2]:
                    await sqlite_event_manager.update_event(
                        message_id=message_id,
                        title=f"Updated Stress Event {message_id}"
                    )
                
                # Query multiple times
                for _ in range(3):
                    await sqlite_event_manager.get_guild_reminders(guild_id)
                    await sqlite_event_manager.get_due_events()
                
                # Delete some
                for message_id in message_ids[:len(message_ids)//3]:
                    await sqlite_event_manager.delete_event(message_id)
            
            return guild_id
        
        # Run stress test
        guild_ids = [200000 + i for i in range(num_guilds)]
        
        start_time = asyncio.get_event_loop().time()
        results = await asyncio.gather(
            *[stress_operations(guild_id) for guild_id in guild_ids],
            return_exceptions=True
        )
        end_time = asyncio.get_event_loop().time()
        
        # Verify no exceptions
        for i, result in enumerate(results):
            assert not isinstance(result, Exception), f"Stress test failed for guild {guild_ids[i]}: {result}"
        
        logger.info(f"Stress test completed in {end_time - start_time:.2f}s")
        
        # Verify data integrity and isolation
        all_events_by_guild = {}
        for guild_id in guild_ids:
            guild_events = await sqlite_event_manager.get_guild_reminders(guild_id)
            all_events_by_guild[guild_id] = guild_events
            
            # Verify all events belong to correct guild
            for event in guild_events.values():
                assert event.guild.guild_id == guild_id, \
                    f"Event {event.message_id} belongs to wrong guild"
        
        # Verify no cross-contamination
        all_message_ids = set()
        for guild_id, events in all_events_by_guild.items():
            guild_message_ids = set(events.keys())
            
            # Check for duplicates across guilds
            intersection = guild_message_ids.intersection(all_message_ids)
            assert len(intersection) == 0, f"Message ID collision detected: {intersection}"
            
            all_message_ids.update(guild_message_ids)
        
        logger.info(f"Stress test verified: {len(all_message_ids)} unique events across {num_guilds} guilds")


if __name__ == "__main__":
    # Run multi-server isolation tests
    pytest.main([__file__, "-v", "-s"])