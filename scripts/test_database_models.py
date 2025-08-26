#!/usr/bin/env python3
"""
Test script for database models.

This script tests basic CRUD operations on the database models
to verify they work correctly.
"""

import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from models.database_models import Event, Guild, Reaction, ReminderLog, User, initialize_models
from persistence.database_manager import get_database_manager


async def test_basic_crud():
    """
    Test basic CRUD operations on all models.
    """
    print("🧪 Testing basic CRUD operations...")

    try:
        # Initialize models
        initialize_models()

        # Test Guild creation
        print("  📊 Testing Guild model...")
        guild = Guild.create(guild_id=123456789, name="Test Server", settings='{"test": true}')
        print(f"    ✅ Created guild: {guild}")

        # Test settings property
        settings = guild.settings_dict
        print(f"    ✅ Guild settings: {settings}")

        # Test User creation
        print("  👤 Testing User model...")
        user = User.create(user_id=987654321, guild=guild, username="TestUser", is_bot=False)
        print(f"    ✅ Created user: {user}")

        # Test Event creation
        print("  📅 Testing Event model...")
        event = Event.create(
            message_id=555666777,
            channel_id=111222333,
            guild=guild,
            title="Test Event",
            description="This is a test event",
            interval_minutes=60.0,
            is_paused=False,
        )
        print(f"    ✅ Created event: {event}")

        # Test required_reactions property
        reactions = event.required_reactions_list
        print(f"    ✅ Event reactions: {reactions}")

        # Test Reaction creation
        print("  👍 Testing Reaction model...")
        reaction = Reaction.create(event=event, user_id=user.user_id, emoji="✅")
        print(f"    ✅ Created reaction: {reaction}")

        # Test ReminderLog creation
        print("  📝 Testing ReminderLog model...")
        reminder_log = ReminderLog.create(
            event=event,
            scheduled_at=datetime.now(),
            sent_at=datetime.now(),
            users_notified=1,
            status="sent",
        )
        print(f"    ✅ Created reminder log: {reminder_log}")

        # Test queries
        print("  🔍 Testing queries...")

        # Query guild events
        guild_events = list(guild.events)
        print(f"    ✅ Guild has {len(guild_events)} events")

        # Query event reactions
        event_reactions = list(event.reactions)
        print(f"    ✅ Event has {len(event_reactions)} reactions")

        # Query event reminder logs
        event_logs = list(event.reminder_logs)
        print(f"    ✅ Event has {len(event_logs)} reminder logs")

        # Test updates
        print("  ✏️ Testing updates...")
        event.title = "Updated Test Event"
        event.save()
        print(f"    ✅ Updated event title: {event.title}")

        # Test due reminder check
        is_due = event.is_due_for_reminder
        print(f"    ✅ Event due for reminder: {is_due}")

        # Test mark reminder sent
        event.mark_reminder_sent()
        print(f"    ✅ Marked reminder sent, last_reminder: {event.last_reminder}")

        print("✅ All CRUD tests passed!")
        return True

    except Exception as e:
        print(f"❌ CRUD test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


async def test_data_integrity():
    """
    Test data integrity and constraints.
    """
    print("🔒 Testing data integrity...")

    try:
        # Test unique constraints
        print("  🔑 Testing unique constraints...")

        # Try to create duplicate message_id (should fail)
        try:
            guild = Guild.get(Guild.guild_id == 123456789)
            Event.create(
                message_id=555666777,  # Same as before
                channel_id=999888777,
                guild=guild,
                title="Duplicate Event",
            )
            print("    ❌ Duplicate message_id should have failed!")
            return False
        except Exception:
            print("    ✅ Duplicate message_id correctly rejected")

        # Test foreign key relationships
        print("  🔗 Testing foreign key relationships...")

        # Get existing event
        event = Event.get(Event.message_id == 555666777)

        # Verify guild relationship
        assert event.guild.guild_id == 123456789
        print("    ✅ Event -> Guild relationship works")

        # Verify reaction relationship
        reaction = Reaction.get(Reaction.event == event)
        assert reaction.event.message_id == event.message_id
        print("    ✅ Reaction -> Event relationship works")

        print("✅ All integrity tests passed!")
        return True

    except Exception as e:
        print(f"❌ Integrity test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    """
    Main test function.
    """
    # Setup basic logging
    logging.basicConfig(
        level=logging.WARNING,  # Reduce noise
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    print("🧪 Testing Database Models")
    print("=" * 30)

    try:
        # Initialize database
        db_manager = get_database_manager()
        success = await db_manager.initialize()

        if not success:
            print("❌ Failed to initialize database")
            return 1

        # Run tests
        crud_success = await test_basic_crud()
        integrity_success = await test_data_integrity()

        if crud_success and integrity_success:
            print("\n🎉 All tests passed!")
            return 0
        else:
            print("\n❌ Some tests failed!")
            return 1

    except Exception as e:
        print(f"💥 Test suite failed: {e}")
        return 1

    finally:
        # Shutdown database
        db_manager = get_database_manager()
        await db_manager.shutdown()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
