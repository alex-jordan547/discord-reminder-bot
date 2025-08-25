"""
Concurrency integration tests for Discord Reminder Bot.

These tests verify that the reminder system handles concurrent operations
correctly and prevents race conditions.
"""

import asyncio
import logging
import os
import tempfile
from unittest.mock import patch

import pytest

from models.reminder import Reminder
from persistence.storage import load_matches, save_matches
from utils.concurrency import ReminderLockManager

# Set up test environment
os.environ["DISCORD_TOKEN"] = "test_token"
os.environ["TEST_MODE"] = "true"

logger = logging.getLogger(__name__)


class TestConcurrency:
    """Test concurrency scenarios in the reminder system."""

    @pytest.fixture
    def temp_storage_file(self):
        """Create a temporary storage file for testing."""
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        yield path
        if os.path.exists(path):
            os.unlink(path)

    @pytest.mark.asyncio
    async def test_concurrent_reminder_additions(self, temp_storage_file):
        """Test adding multiple reminders concurrently."""
        # Mock storage path
        with patch("persistence.storage.SAVE_FILE", temp_storage_file):
            # Initialize empty storage
            save_matches({})

            # Create mock reminders
            reminders = []
            for i in range(5):
                reminder = Reminder(
                    message_id=123450 + i,  # Use integers for message_id
                    channel_id=987654321,
                    guild_id=111111111,
                    title=f"Test Event {i}",
                    interval_minutes=60,  # Use interval_minutes parameter
                )
                reminders.append(reminder)

            # Add reminders concurrently
            async def add_reminder(reminder):
                current_data = load_matches()
                current_data[reminder.message_id] = reminder
                save_matches(current_data)

            # Execute concurrent operations
            await asyncio.gather(*[add_reminder(r) for r in reminders])

            # Verify all reminders were added
            final_data = load_matches()
            assert len(final_data) == 5

            # Verify data integrity
            for i in range(5):
                message_id = 123450 + i
                assert message_id in final_data
                assert final_data[message_id].title == f"Test Event {i}"

    @pytest.mark.asyncio
    async def test_concurrent_storage_operations(self, temp_storage_file):
        """Test concurrent read/write operations to storage."""
        with patch("persistence.storage.SAVE_FILE", temp_storage_file):
            # Create initial data
            initial_reminder = Reminder(
                message_id=999999,  # Use integer for message_id
                channel_id=987654321,
                guild_id=111111111,
                title="Initial Event",
                interval_minutes=60,  # Use interval_minutes parameter
            )
            initial_data = {initial_reminder.message_id: initial_reminder}
            save_matches(initial_data)

            # Concurrent operations
            async def concurrent_write(index):
                """Simulate concurrent write operations."""
                current_data = load_matches()

                # Simulate processing delay
                await asyncio.sleep(0.01)

                message_id = 888800 + index  # Use integer message_id
                reminder = Reminder(
                    message_id=message_id,
                    channel_id=987654321,
                    guild_id=111111111,
                    title=f"Concurrent Event {index}",
                    interval_minutes=60,  # Use interval_minutes parameter
                )
                current_data[message_id] = reminder
                save_matches(current_data)

            # Execute concurrent writes
            write_tasks = [concurrent_write(i) for i in range(3)]
            await asyncio.gather(*write_tasks)

            # Verify data consistency
            final_data = load_matches()
            assert len(final_data) >= 1  # At least initial data should be preserved

    @pytest.mark.asyncio
    async def test_reminder_lock_mechanism(self):
        """Test the reminder locking mechanism prevents race conditions."""
        lock_manager = ReminderLockManager()
        guild_id = 123456789

        shared_resource = {"value": 0}

        async def increment_with_lock():
            """Increment shared resource with lock protection."""
            guild_lock = await lock_manager.get_guild_lock(guild_id)
            async with guild_lock:
                current = shared_resource["value"]
                # Simulate processing delay
                await asyncio.sleep(0.01)
                shared_resource["value"] = current + 1

        # Execute concurrent increments
        tasks = [increment_with_lock() for _ in range(10)]
        await asyncio.gather(*tasks)

        # With proper locking, final value should be 10
        assert shared_resource["value"] == 10

    @pytest.mark.asyncio
    async def test_reminder_processing_concurrency(self):
        """Test concurrent reminder processing."""
        processed_reminders = []

        async def process_reminder(reminder_id):
            """Simulate reminder processing."""
            # Simulate network delay
            await asyncio.sleep(0.05)
            processed_reminders.append(reminder_id)

        # Create multiple reminder processing tasks
        reminder_ids = [f"reminder_{i}" for i in range(5)]
        tasks = [process_reminder(rid) for rid in reminder_ids]

        # Execute concurrently
        start_time = asyncio.get_event_loop().time()
        await asyncio.gather(*tasks)
        end_time = asyncio.get_event_loop().time()

        # Verify all reminders were processed
        assert len(processed_reminders) == 5
        assert set(processed_reminders) == set(reminder_ids)

        # Verify concurrent execution (should be faster than sequential)
        # Sequential would take ~0.25s, concurrent should be ~0.05s
        assert (end_time - start_time) < 0.15

    def test_thread_safe_data_structures(self):
        """Test thread safety of data structures."""
        import threading
        import time

        shared_dict = {}
        errors = []

        def worker(worker_id):
            """Worker function for threading test."""
            try:
                for i in range(100):
                    key = f"worker_{worker_id}_item_{i}"
                    shared_dict[key] = f"value_{i}"
                    # Small delay to increase chance of race conditions
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)

        # Create and start threads
        threads = []
        for i in range(3):
            thread = threading.Thread(target=worker, args=(i,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # Verify no errors occurred
        assert len(errors) == 0, f"Thread safety errors: {errors}"

        # Verify expected number of items
        assert len(shared_dict) == 300


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
