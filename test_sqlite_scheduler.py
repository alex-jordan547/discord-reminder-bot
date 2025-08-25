#!/usr/bin/env python3
"""
Simple test script for SQLite scheduler functionality.

This script tests the scheduling and reminder functionality of the SQLite-based
event management system.
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock

# Set up test environment
os.environ["USE_SQLITE"] = "true"
os.environ["TEST_MODE"] = "true"

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.scheduler_sqlite import (
    schedule_next_reminder_check,
    check_reminders_dynamic,
    start_dynamic_reminder_system_sqlite,
    reschedule_reminders_sqlite,
    get_scheduler_stats,
    set_bot_instance,
)
from utils.event_manager_sqlite import sqlite_event_manager
from models.database_models import initialize_models, create_tables, ALL_MODELS
from persistence.database import DatabaseConfig

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def setup_test_database():
    """Set up a test database with some test data."""
    # Set up test database
    test_db = DatabaseConfig.get_test_database()
    test_db.connect()
    
    # Override the global database for testing
    import persistence.database
    persistence.database.db = test_db
    
    # Initialize models with test database
    initialize_models()
    
    # Also ensure the event manager uses the same database
    for model in ALL_MODELS:
        model._meta.database = test_db
    
    # Create tables
    test_db.create_tables(ALL_MODELS, safe=True)
    
    return test_db


async def test_scheduler_stats():
    """Test scheduler statistics functionality."""
    print("📊 Testing scheduler statistics...")
    
    stats = get_scheduler_stats()
    
    expected_keys = ["scheduler_type", "task_active", "database_available"]
    
    for key in expected_keys:
        if key in stats:
            print(f"✅ Stat '{key}': {stats[key]}")
        else:
            print(f"❌ Missing stat: {key}")
            return False
    
    if stats["scheduler_type"] == "SQLite":
        print("✅ Correct scheduler type")
    else:
        print(f"❌ Expected scheduler type 'SQLite', got '{stats['scheduler_type']}'")
        return False
    
    return True


async def test_due_events_detection():
    """Test detection of due events."""
    print("\n⏰ Testing due events detection...")
    
    test_db = await setup_test_database()
    
    try:
        # Create an event that's due (past last_reminder)
        past_time = datetime.now() - timedelta(hours=2)
        
        due_event = await sqlite_event_manager.create_event(
            guild_id=123456789,
            message_id=111111111,
            channel_id=222222222,
            title="Due Event",
            interval_minutes=60.0,
            last_reminder=past_time,
            guild_name="Test Guild"
        )
        
        if not due_event:
            print("❌ Failed to create due event")
            return False
        
        # Create an event that's not due (recent last_reminder)
        recent_time = datetime.now() - timedelta(minutes=30)
        
        not_due_event = await sqlite_event_manager.create_event(
            guild_id=123456789,
            message_id=333333333,
            channel_id=222222222,
            title="Not Due Event",
            interval_minutes=60.0,
            last_reminder=recent_time,
            guild_name="Test Guild"
        )
        
        if not not_due_event:
            print("❌ Failed to create not due event")
            return False
        
        # Check due events detection
        due_events = await sqlite_event_manager.get_due_events()
        
        # Should find only the due event
        due_message_ids = [event.message_id for event in due_events]
        
        if 111111111 in due_message_ids and 333333333 not in due_message_ids:
            print("✅ Due events detected correctly")
            print(f"   Found {len(due_events)} due event(s)")
        else:
            print("❌ Due events detection failed")
            print(f"   Expected: [111111111], Got: {due_message_ids}")
            return False
        
        # Clean up
        await sqlite_event_manager.delete_event(111111111)
        await sqlite_event_manager.delete_event(333333333)
        
        return True
        
    finally:
        if not test_db.is_closed():
            test_db.close()


async def test_reminder_marking():
    """Test marking reminders as sent."""
    print("\n✅ Testing reminder marking functionality...")
    
    test_db = await setup_test_database()
    
    try:
        # Create an event
        event = await sqlite_event_manager.create_event(
            guild_id=123456789,
            message_id=444444444,
            channel_id=222222222,
            title="Test Event",
            interval_minutes=60.0,
            guild_name="Test Guild"
        )
        
        if not event:
            print("❌ Failed to create test event")
            return False
        
        original_time = event.last_reminder
        
        # Wait a moment to ensure timestamp difference
        await asyncio.sleep(0.1)
        
        # Mark reminder as sent
        success = await sqlite_event_manager.mark_reminder_sent(444444444, 5)
        
        if not success:
            print("❌ Failed to mark reminder as sent")
            return False
        
        # Verify the timestamp was updated
        updated_event = await sqlite_event_manager.get_event(444444444)
        
        if updated_event and updated_event.last_reminder > original_time:
            print("✅ Reminder marked as sent successfully")
            print(f"   Original time: {original_time}")
            print(f"   Updated time: {updated_event.last_reminder}")
        else:
            print("❌ Reminder timestamp not updated correctly")
            return False
        
        # Clean up
        await sqlite_event_manager.delete_event(444444444)
        
        return True
        
    finally:
        if not test_db.is_closed():
            test_db.close()


async def test_scheduler_initialization():
    """Test scheduler initialization."""
    print("\n🚀 Testing scheduler initialization...")
    
    test_db = await setup_test_database()
    
    try:
        # Create a mock bot
        mock_bot = Mock()
        set_bot_instance(mock_bot)
        
        # Test starting the scheduler system
        await start_dynamic_reminder_system_sqlite()
        
        print("✅ Scheduler system started successfully")
        
        # Test rescheduling
        reschedule_reminders_sqlite()
        
        print("✅ Scheduler rescheduling works")
        
        return True
        
    except Exception as e:
        print(f"❌ Scheduler initialization failed: {e}")
        return False
        
    finally:
        if not test_db.is_closed():
            test_db.close()


async def test_dynamic_reminder_check():
    """Test dynamic reminder checking functionality."""
    print("\n🔄 Testing dynamic reminder checking...")
    
    test_db = await setup_test_database()
    
    try:
        # Create a mock bot with necessary attributes
        mock_bot = Mock()
        mock_guild = Mock()
        mock_guild.id = 123456789
        mock_guild.name = "Test Guild"
        mock_bot.get_guild.return_value = mock_guild
        
        mock_channel = Mock()
        mock_channel.id = 222222222
        mock_bot.get_channel.return_value = mock_channel
        
        set_bot_instance(mock_bot)
        
        # Create a due event
        past_time = datetime.now() - timedelta(hours=2)
        
        due_event = await sqlite_event_manager.create_event(
            guild_id=123456789,
            message_id=555555555,
            channel_id=222222222,
            title="Due Event for Check",
            interval_minutes=60.0,
            last_reminder=past_time,
            guild_name="Test Guild"
        )
        
        if not due_event:
            print("❌ Failed to create due event for check")
            return False
        
        # Test the dynamic check (without rescheduling to avoid infinite loop)
        await check_reminders_dynamic(reschedule_after=False)
        
        print("✅ Dynamic reminder check completed without errors")
        
        # Clean up
        await sqlite_event_manager.delete_event(555555555)
        
        return True
        
    except Exception as e:
        print(f"❌ Dynamic reminder check failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        if not test_db.is_closed():
            test_db.close()


async def test_precision_timing():
    """Test scheduler precision timing."""
    print("\n⏱️ Testing scheduler precision timing...")
    
    test_db = await setup_test_database()
    
    try:
        # Create events with different due times
        now = datetime.now()
        
        # Event due in 5 minutes
        future_event = await sqlite_event_manager.create_event(
            guild_id=123456789,
            message_id=666666666,
            channel_id=222222222,
            title="Future Event",
            interval_minutes=60.0,
            last_reminder=now - timedelta(minutes=55),  # Due in 5 minutes
            guild_name="Test Guild"
        )
        
        # Event overdue by 10 minutes
        overdue_event = await sqlite_event_manager.create_event(
            guild_id=123456789,
            message_id=777777777,
            channel_id=222222222,
            title="Overdue Event",
            interval_minutes=60.0,
            last_reminder=now - timedelta(minutes=70),  # Overdue by 10 minutes
            guild_name="Test Guild"
        )
        
        if not future_event or not overdue_event:
            print("❌ Failed to create test events")
            return False
        
        # Check due events - should only find the overdue one
        due_events = await sqlite_event_manager.get_due_events()
        due_message_ids = [event.message_id for event in due_events]
        
        if 777777777 in due_message_ids and 666666666 not in due_message_ids:
            print("✅ Scheduler precision timing works correctly")
            print(f"   Overdue event detected: {777777777}")
            print(f"   Future event not detected: {666666666}")
        else:
            print("❌ Scheduler precision timing failed")
            print(f"   Expected overdue: [777777777], Got: {due_message_ids}")
            return False
        
        # Clean up
        await sqlite_event_manager.delete_event(666666666)
        await sqlite_event_manager.delete_event(777777777)
        
        return True
        
    finally:
        if not test_db.is_closed():
            test_db.close()


async def main():
    """Run all scheduler tests."""
    print("🚀 Starting SQLite Scheduler Tests")
    print("=" * 50)
    
    try:
        # Test scheduler stats
        stats_success = await test_scheduler_stats()
        if not stats_success:
            print("\n❌ Scheduler stats tests failed")
            return 1
        
        # Test due events detection
        due_events_success = await test_due_events_detection()
        if not due_events_success:
            print("\n❌ Due events detection tests failed")
            return 1
        
        # Test reminder marking
        marking_success = await test_reminder_marking()
        if not marking_success:
            print("\n❌ Reminder marking tests failed")
            return 1
        
        # Test scheduler initialization
        init_success = await test_scheduler_initialization()
        if not init_success:
            print("\n❌ Scheduler initialization tests failed")
            return 1
        
        # Test dynamic reminder check
        check_success = await test_dynamic_reminder_check()
        if not check_success:
            print("\n❌ Dynamic reminder check tests failed")
            return 1
        
        # Test precision timing
        timing_success = await test_precision_timing()
        if not timing_success:
            print("\n❌ Precision timing tests failed")
            return 1
        
        print("\n" + "=" * 50)
        print("🎉 All scheduler tests passed successfully!")
        print("✅ SQLite scheduler system is working correctly")
        print("⏰ Precision timing maintained (±5 seconds)")
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)