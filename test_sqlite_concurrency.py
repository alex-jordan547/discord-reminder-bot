#!/usr/bin/env python3
"""
Simple test script for SQLite concurrency functionality.

This script tests the concurrency management features of the SQLite-based
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

from utils.concurrency_sqlite import (
    ensure_database_connection,
    execute_with_retry,
    get_sqlite_concurrency_stats,
    schedule_sqlite_reaction_update,
    sqlite_concurrency_stats,
    sqlite_lock_manager,
    sqlite_reaction_queue,
    with_sqlite_guild_lock,
)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_lock_manager():
    """Test the SQLite lock manager functionality."""
    print("🔒 Testing SQLite lock manager...")

    # Test getting locks for different guilds
    lock1 = await sqlite_lock_manager.get_guild_lock(123456)
    lock2 = await sqlite_lock_manager.get_guild_lock(789012)
    lock3 = await sqlite_lock_manager.get_guild_lock(123456)  # Same guild

    # Verify that same guild gets same lock
    if lock1 is lock3:
        print("✅ Same guild returns same lock instance")
    else:
        print("❌ Same guild should return same lock instance")
        return False

    # Verify different guilds get different locks
    if lock1 is not lock2:
        print("✅ Different guilds get different locks")
    else:
        print("❌ Different guilds should get different locks")
        return False

    # Test transaction locks
    tx_lock1 = await sqlite_lock_manager.get_transaction_lock(123456)
    tx_lock2 = await sqlite_lock_manager.get_transaction_lock(123456)

    if tx_lock1 is tx_lock2:
        print("✅ Same guild returns same transaction lock")
    else:
        print("❌ Same guild should return same transaction lock")
        return False

    return True


async def test_guild_locking():
    """Test guild-specific locking functionality."""
    print("\n🏰 Testing guild-specific locking...")

    execution_order = []

    async def test_operation(guild_id: int, operation_id: str, delay: float = 0.1):
        """Test operation that records execution order."""
        execution_order.append(f"{operation_id}_start")
        await asyncio.sleep(delay)
        execution_order.append(f"{operation_id}_end")
        return f"result_{operation_id}"

    # Test that operations on the same guild are serialized
    tasks = [
        with_sqlite_guild_lock(123456, test_operation, 123456, "op1", 0.1),
        with_sqlite_guild_lock(123456, test_operation, 123456, "op2", 0.1),
        with_sqlite_guild_lock(123456, test_operation, 123456, "op3", 0.1),
    ]

    results = await asyncio.gather(*tasks)

    # Check that operations were serialized (no interleaving)
    expected_patterns = [
        ["op1_start", "op1_end", "op2_start", "op2_end", "op3_start", "op3_end"],
        ["op1_start", "op1_end", "op3_start", "op3_end", "op2_start", "op2_end"],
        ["op2_start", "op2_end", "op1_start", "op1_end", "op3_start", "op3_end"],
        ["op2_start", "op2_end", "op3_start", "op3_end", "op1_start", "op1_end"],
        ["op3_start", "op3_end", "op1_start", "op1_end", "op2_start", "op2_end"],
        ["op3_start", "op3_end", "op2_start", "op2_end", "op1_start", "op1_end"],
    ]

    if execution_order in expected_patterns:
        print("✅ Guild operations properly serialized")
        print(f"   Execution order: {execution_order}")
    else:
        print("❌ Guild operations not properly serialized")
        print(f"   Actual order: {execution_order}")
        return False

    return True


async def test_reaction_queue():
    """Test the reaction update queue functionality."""
    print("\n⚡ Testing reaction update queue...")

    update_calls = []

    async def mock_update_function(message_id: int, bot=None):
        """Mock update function that records calls."""
        update_calls.append(f"update_{message_id}")
        await asyncio.sleep(0.05)  # Simulate some work
        return True

    # Schedule multiple updates for the same message (should be debounced)
    await schedule_sqlite_reaction_update(123456, mock_update_function, 123456, None)
    await schedule_sqlite_reaction_update(123456, mock_update_function, 123456, None)
    await schedule_sqlite_reaction_update(123456, mock_update_function, 123456, None)

    # Schedule update for different message
    await schedule_sqlite_reaction_update(789012, mock_update_function, 789012, None)

    # Wait for debouncing delay plus some extra time
    await asyncio.sleep(1.5)

    # Check that debouncing worked (only one update per message)
    expected_calls = ["update_123456", "update_789012"]
    if sorted(update_calls) == sorted(expected_calls):
        print("✅ Reaction updates properly debounced")
        print(f"   Update calls: {update_calls}")
    else:
        print("❌ Reaction updates not properly debounced")
        print(f"   Expected: {expected_calls}")
        print(f"   Actual: {update_calls}")
        return False

    return True


async def test_statistics():
    """Test the statistics tracking functionality."""
    print("\n📊 Testing statistics tracking...")

    # Reset stats
    sqlite_concurrency_stats.reset_stats()

    # Increment some stats
    sqlite_concurrency_stats.increment_stat("reaction_updates_processed", 5)
    sqlite_concurrency_stats.increment_stat("lock_acquisitions", 3)
    sqlite_concurrency_stats.increment_stat("transaction_commits", 2)

    # Get stats
    stats = get_sqlite_concurrency_stats()

    # Verify stats
    expected_stats = {
        "reaction_updates_processed": 5,
        "lock_acquisitions": 3,
        "transaction_commits": 2,
    }

    for stat_name, expected_value in expected_stats.items():
        if stats.get(stat_name) == expected_value:
            print(f"✅ Stat '{stat_name}': {stats[stat_name]}")
        else:
            print(f"❌ Stat '{stat_name}': expected {expected_value}, got {stats.get(stat_name)}")
            return False

    return True


async def test_database_connection():
    """Test database connection management."""
    print("\n🗄️ Testing database connection management...")

    # Test database availability check
    is_available = await ensure_database_connection()

    if is_available:
        print("✅ Database connection available")
    else:
        print("❌ Database connection not available")
        return False

    return True


async def test_retry_mechanism():
    """Test the retry mechanism for database operations."""
    print("\n🔄 Testing retry mechanism...")

    attempt_count = 0

    async def failing_operation():
        """Operation that fails a few times then succeeds."""
        nonlocal attempt_count
        attempt_count += 1

        if attempt_count < 3:
            raise Exception(f"Simulated failure #{attempt_count}")

        return f"success_after_{attempt_count}_attempts"

    try:
        result = await execute_with_retry(failing_operation, max_retries=3, delay=0.1)

        if result == "success_after_3_attempts" and attempt_count == 3:
            print("✅ Retry mechanism worked correctly")
            print(f"   Result: {result}")
        else:
            print("❌ Retry mechanism didn't work as expected")
            print(f"   Result: {result}, Attempts: {attempt_count}")
            return False

    except Exception as e:
        print(f"❌ Retry mechanism failed: {e}")
        return False

    return True


async def main():
    """Run all concurrency tests."""
    print("🚀 Starting SQLite Concurrency Tests")
    print("=" * 50)

    try:
        # Test lock manager
        lock_success = await test_lock_manager()
        if not lock_success:
            print("\n❌ Lock manager tests failed")
            return 1

        # Test guild locking
        guild_lock_success = await test_guild_locking()
        if not guild_lock_success:
            print("\n❌ Guild locking tests failed")
            return 1

        # Test reaction queue
        reaction_queue_success = await test_reaction_queue()
        if not reaction_queue_success:
            print("\n❌ Reaction queue tests failed")
            return 1

        # Test statistics
        stats_success = await test_statistics()
        if not stats_success:
            print("\n❌ Statistics tests failed")
            return 1

        # Test database connection
        db_success = await test_database_connection()
        if not db_success:
            print("\n❌ Database connection tests failed")
            return 1

        # Test retry mechanism
        retry_success = await test_retry_mechanism()
        if not retry_success:
            print("\n❌ Retry mechanism tests failed")
            return 1

        print("\n" + "=" * 50)
        print("🎉 All concurrency tests passed successfully!")
        print("✅ SQLite concurrency system is working correctly")

        return 0

    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
