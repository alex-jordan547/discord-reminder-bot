#!/usr/bin/env python3
"""
Simple test script for SQLite EventManager functionality.

This script tests the basic CRUD operations of the SQLite-based
event management system.
"""

import asyncio
import logging
import os
import sys
from datetime import datetime

# Set up test environment
os.environ["USE_SQLITE"] = "true"
os.environ["TEST_MODE"] = "true"

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database_models import create_tables, get_table_info, initialize_models
from persistence.database import DatabaseConfig
from utils.event_manager_sqlite import sqlite_event_manager

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_basic_crud():
    """Test basic CRUD operations."""
    print("🧪 Testing SQLite EventManager CRUD operations...")

    # Set up test database
    test_db = DatabaseConfig.get_test_database()

    # Keep connection open for in-memory database
    test_db.connect()

    # Override the global database for testing
    import persistence.database

    persistence.database.db = test_db

    # Initialize models with test database
    initialize_models()

    # Also ensure the event manager uses the same database
    from models.database_models import ALL_MODELS

    for model in ALL_MODELS:
        model._meta.database = test_db

    # Create tables manually using the test database
    try:
        test_db.create_tables(ALL_MODELS, safe=True)

        # Debug: Check if tables exist immediately after creation
        tables = test_db.get_tables()
        print(f"📋 Tables created: {tables}")

        if len(tables) == 0:
            print("❌ No tables were created")
            return False

        print("✅ Database tables created successfully")
    except Exception as e:
        print(f"❌ Failed to create database tables: {e}")
        import traceback

        traceback.print_exc()
        return False

    # Test creating an event
    print("\n📝 Testing event creation...")
    event = await sqlite_event_manager.create_event(
        guild_id=123456789,
        message_id=987654321,
        channel_id=111222333,
        title="Test Event",
        description="This is a test event",
        interval_minutes=60.0,
        guild_name="Test Guild",
    )

    if event:
        print(f"✅ Created event: {event.title} (ID: {event.message_id})")
    else:
        print("❌ Failed to create event")
        return False

    # Test retrieving the event
    print("\n🔍 Testing event retrieval...")
    retrieved_event = await sqlite_event_manager.get_event(987654321)

    if retrieved_event and retrieved_event.title == "Test Event":
        print(f"✅ Retrieved event: {retrieved_event.title}")
    else:
        print("❌ Failed to retrieve event")
        return False

    # Test updating the event
    print("\n✏️ Testing event update...")
    update_success = await sqlite_event_manager.update_event(
        987654321, title="Updated Test Event", interval_minutes=120.0
    )

    if update_success:
        updated_event = await sqlite_event_manager.get_event(987654321)
        if updated_event.title == "Updated Test Event" and updated_event.interval_minutes == 120.0:
            print(
                f"✅ Updated event: {updated_event.title} (interval: {updated_event.interval_minutes}min)"
            )
        else:
            print("❌ Event update verification failed")
            return False
    else:
        print("❌ Failed to update event")
        return False

    # Test guild events retrieval
    print("\n🏰 Testing guild events retrieval...")
    guild_events = await sqlite_event_manager.get_guild_events(123456789)

    if len(guild_events) == 1 and guild_events[0].message_id == 987654321:
        print(f"✅ Retrieved {len(guild_events)} event(s) for guild")
    else:
        print(f"❌ Expected 1 guild event, got {len(guild_events)}")
        return False

    # Test pause/resume
    print("\n⏸️ Testing pause/resume functionality...")
    pause_success = await sqlite_event_manager.pause_event(987654321)
    if pause_success:
        paused_event = await sqlite_event_manager.get_event(987654321)
        if paused_event.is_paused:
            print("✅ Event paused successfully")
        else:
            print("❌ Event pause verification failed")
            return False
    else:
        print("❌ Failed to pause event")
        return False

    resume_success = await sqlite_event_manager.resume_event(987654321)
    if resume_success:
        resumed_event = await sqlite_event_manager.get_event(987654321)
        if not resumed_event.is_paused:
            print("✅ Event resumed successfully")
        else:
            print("❌ Event resume verification failed")
            return False
    else:
        print("❌ Failed to resume event")
        return False

    # Test statistics
    print("\n📊 Testing statistics...")
    stats = sqlite_event_manager.get_stats()
    if stats["total_events"] == 1 and stats["active_events"] == 1:
        print(f"✅ Statistics: {stats['total_events']} total, {stats['active_events']} active")
    else:
        print(f"❌ Unexpected statistics: {stats}")
        return False

    # Test deletion
    print("\n🗑️ Testing event deletion...")
    delete_success = await sqlite_event_manager.delete_event(987654321)

    if delete_success:
        deleted_event = await sqlite_event_manager.get_event(987654321)
        if deleted_event is None:
            print("✅ Event deleted successfully")
        else:
            print("❌ Event deletion verification failed")
            return False
    else:
        print("❌ Failed to delete event")
        return False

    # Verify empty state
    final_stats = sqlite_event_manager.get_stats()
    if final_stats["total_events"] == 0:
        print("✅ Database cleaned up successfully")
    else:
        print(f"❌ Expected 0 events after deletion, got {final_stats['total_events']}")
        return False

    # Close the test database connection
    if not test_db.is_closed():
        test_db.close()

    return True


async def test_due_events():
    """Test due events functionality."""
    print("\n⏰ Testing due events functionality...")

    # Set up test database again
    test_db = DatabaseConfig.get_test_database()
    test_db.connect()

    # Override the global database for testing
    import persistence.database

    persistence.database.db = test_db

    # Initialize models with test database
    initialize_models()

    # Also ensure the event manager uses the same database
    from models.database_models import ALL_MODELS

    for model in ALL_MODELS:
        model._meta.database = test_db

    # Create tables
    test_db.create_tables(ALL_MODELS, safe=True)

    # Create an event with a past last_reminder to make it due
    past_time = datetime(2023, 1, 1, 12, 0, 0)  # Well in the past

    event = await sqlite_event_manager.create_event(
        guild_id=123456789,
        message_id=111111111,
        channel_id=222222222,
        title="Due Event",
        interval_minutes=60.0,
        last_reminder=past_time,
        guild_name="Test Guild",
    )

    if not event:
        print("❌ Failed to create due event")
        return False

    # Check if it's detected as due
    due_events = await sqlite_event_manager.get_due_events()

    if len(due_events) == 1 and due_events[0].message_id == 111111111:
        print("✅ Due event detected correctly")
    else:
        print(f"❌ Expected 1 due event, got {len(due_events)}")
        return False

    # Mark reminder as sent
    mark_success = await sqlite_event_manager.mark_reminder_sent(111111111, 5)

    if mark_success:
        print("✅ Reminder marked as sent")

        # Check that it's no longer due (should have updated timestamp)
        due_events_after = await sqlite_event_manager.get_due_events()
        if len(due_events_after) == 0:
            print("✅ Event no longer due after marking sent")
        else:
            print(f"❌ Expected 0 due events after marking sent, got {len(due_events_after)}")
            return False
    else:
        print("❌ Failed to mark reminder as sent")
        return False

    # Clean up
    await sqlite_event_manager.delete_event(111111111)

    # Close the test database connection
    if not test_db.is_closed():
        test_db.close()

    return True


async def test_database_info():
    """Test database information retrieval."""
    print("\n📋 Testing database information...")

    # Set up test database again
    test_db = DatabaseConfig.get_test_database()
    test_db.connect()

    # Override the global database for testing
    import persistence.database

    persistence.database.db = test_db

    # Initialize models with test database
    initialize_models()

    # Also ensure the event manager uses the same database
    from models.database_models import ALL_MODELS

    for model in ALL_MODELS:
        model._meta.database = test_db

    # Create tables
    test_db.create_tables(ALL_MODELS, safe=True)

    table_info = get_table_info()

    expected_tables = ["guild", "user", "event", "reaction", "reminderlog"]

    for table in expected_tables:
        if table in table_info:
            info = table_info[table]
            print(f"✅ Table '{table}': {info['row_count']} rows")
        else:
            print(f"❌ Missing table: {table}")
            return False

    # Close the test database connection
    if not test_db.is_closed():
        test_db.close()

    return True


async def main():
    """Run all tests."""
    print("🚀 Starting SQLite EventManager Tests")
    print("=" * 50)

    try:
        # Test basic CRUD operations
        crud_success = await test_basic_crud()

        if not crud_success:
            print("\n❌ CRUD tests failed")
            return 1

        # Test due events functionality
        due_events_success = await test_due_events()

        if not due_events_success:
            print("\n❌ Due events tests failed")
            return 1

        # Test database info
        db_info_success = await test_database_info()

        if not db_info_success:
            print("\n❌ Database info tests failed")
            return 1

        print("\n" + "=" * 50)
        print("🎉 All tests passed successfully!")
        print("✅ SQLite EventManager is working correctly")

        return 0

    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
