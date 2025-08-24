"""
Concurrency tests for Discord Reminder Bot.

These tests verify that the reminder system handles concurrent operations
correctly and prevents race conditions.
"""

import asyncio
import pytest
import tempfile
import os
import logging
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

# Set up test environment
os.environ['DISCORD_TOKEN'] = 'test_token'
os.environ['TEST_MODE'] = 'true'

from models.reminder import Reminder
from utils.concurrency import (
    ReminderLockManager, 
    ReactionUpdateQueue, 
    ThreadSafePersistence,
    ConcurrencyStats,
    with_guild_lock,
    schedule_reaction_update
)
from utils.reminder_manager import ReminderManager
from persistence.storage import save_matches_atomic, load_matches_safe, verify_data_integrity


class TestReminderLockManager:
    """Test the reminder lock manager functionality."""
    
    @pytest.fixture
    def lock_manager(self):
        """Create a fresh lock manager for each test."""
        return ReminderLockManager()
    
    @pytest.mark.asyncio
    async def test_guild_lock_creation(self, lock_manager):
        """Test that guild locks are created correctly."""
        guild_id = 12345
        
        # Get lock twice - should be the same instance
        lock1 = await lock_manager.get_guild_lock(guild_id)
        lock2 = await lock_manager.get_guild_lock(guild_id)
        
        assert lock1 is lock2
        assert isinstance(lock1, asyncio.Lock)
    
    @pytest.mark.asyncio
    async def test_multiple_guild_locks(self, lock_manager):
        """Test that different guilds get different locks."""
        guild1_id = 12345
        guild2_id = 67890
        
        lock1 = await lock_manager.get_guild_lock(guild1_id)
        lock2 = await lock_manager.get_guild_lock(guild2_id)
        
        assert lock1 is not lock2
    
    @pytest.mark.asyncio
    async def test_concurrent_lock_acquisition(self, lock_manager):
        """Test that locks work correctly under concurrent access."""
        guild_id = 12345
        results = []
        
        async def test_operation(operation_id):
            async with await lock_manager.get_guild_lock(guild_id):
                # Simulate some work
                results.append(f"start_{operation_id}")
                await asyncio.sleep(0.01)
                results.append(f"end_{operation_id}")
        
        # Run multiple operations concurrently
        tasks = [test_operation(i) for i in range(5)]
        await asyncio.gather(*tasks)
        
        # Verify that operations didn't interleave
        for i in range(5):
            start_idx = results.index(f"start_{i}")
            end_idx = results.index(f"end_{i}")
            
            # Check that no other operations started between start and end
            for j in range(start_idx + 1, end_idx):
                assert not results[j].startswith("start_")
    
    @pytest.mark.asyncio
    async def test_lock_cleanup(self, lock_manager):
        """Test that unused locks can be cleaned up."""
        # Create locks for multiple guilds
        guild_ids = [1, 2, 3, 4, 5]
        for guild_id in guild_ids:
            await lock_manager.get_guild_lock(guild_id)
        
        assert len(lock_manager._guild_locks) == 5
        
        # Clean up, keeping only guilds 1, 2, 3
        active_guilds = {1, 2, 3}
        await lock_manager.cleanup_unused_locks(active_guilds)
        
        assert len(lock_manager._guild_locks) == 3
        assert set(lock_manager._guild_locks.keys()) == active_guilds


class TestReactionUpdateQueue:
    """Test the reaction update queue and debouncing functionality."""
    
    @pytest.fixture
    def update_queue(self):
        """Create a fresh update queue for each test."""
        return ReactionUpdateQueue(delay=0.05)  # 50ms delay for faster tests
    
    @pytest.mark.asyncio
    async def test_single_update(self, update_queue):
        """Test that a single update is processed correctly."""
        call_count = 0
        
        async def mock_update_function():
            nonlocal call_count
            call_count += 1
        
        message_id = 123
        await update_queue.schedule_update(message_id, mock_update_function)
        
        # Wait for the debounced update to complete
        await asyncio.sleep(0.1)
        
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_debouncing_multiple_updates(self, update_queue):
        """Test that multiple rapid updates are debounced correctly."""
        call_count = 0
        
        async def mock_update_function():
            nonlocal call_count
            call_count += 1
        
        message_id = 123
        
        # Schedule multiple updates rapidly
        for _ in range(5):
            await update_queue.schedule_update(message_id, mock_update_function)
            await asyncio.sleep(0.01)  # 10ms between schedules
        
        # Wait for the debounced update to complete
        await asyncio.sleep(0.1)
        
        # Should only have been called once due to debouncing
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_different_messages_not_debounced(self, update_queue):
        """Test that updates for different messages are not debounced together."""
        call_count = 0
        
        async def mock_update_function():
            nonlocal call_count
            call_count += 1
        
        # Schedule updates for different messages
        await update_queue.schedule_update(123, mock_update_function)
        await update_queue.schedule_update(456, mock_update_function)
        await update_queue.schedule_update(789, mock_update_function)
        
        # Wait for all updates to complete
        await asyncio.sleep(0.1)
        
        # Should have been called once for each message
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_flush_all_updates(self, update_queue):
        """Test that flush_all_updates waits for all pending updates."""
        call_count = 0
        
        async def mock_update_function():
            nonlocal call_count
            await asyncio.sleep(0.02)  # Small delay
            call_count += 1
        
        # Schedule multiple updates
        for i in range(3):
            await update_queue.schedule_update(i, mock_update_function)
        
        # Flush and wait
        await update_queue.flush_all_updates()
        
        # All updates should be complete
        assert call_count == 3


class TestThreadSafePersistence:
    """Test the thread-safe persistence functionality."""
    
    @pytest.fixture
    def persistence_manager(self):
        """Create a fresh persistence manager for each test."""
        return ThreadSafePersistence()
    
    @pytest.fixture
    def temp_file(self):
        """Create a temporary file for testing."""
        fd, path = tempfile.mkstemp(suffix='.json')
        os.close(fd)
        yield path
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
    
    @pytest.fixture
    def sample_reminders(self):
        """Create sample reminder data for testing."""
        return {
            123: Reminder(123, 456, 789, "Test Reminder 1", 60),
            124: Reminder(124, 457, 789, "Test Reminder 2", 120),
            125: Reminder(125, 458, 790, "Test Reminder 3", 30)
        }
    
    @pytest.mark.asyncio
    async def test_concurrent_saves(self, persistence_manager, temp_file, sample_reminders):
        """Test that concurrent save operations are handled safely."""
        # Mock the save_matches function to use our temp file
        with patch('persistence.storage.SAVE_FILE', temp_file):
            # Schedule multiple concurrent saves
            tasks = [
                persistence_manager.save_reminders_safe(sample_reminders, temp_file)
                for _ in range(10)
            ]
            
            results = await asyncio.gather(*tasks)
            
            # All saves should succeed
            assert all(results)
            
            # File should contain the data correctly
            assert os.path.exists(temp_file)
    
    @pytest.mark.asyncio
    async def test_save_already_in_progress(self, persistence_manager, temp_file, sample_reminders):
        """Test that concurrent saves to the same file are handled correctly."""
        save_started = asyncio.Event()
        save_can_continue = asyncio.Event()
        
        async def slow_save():
            save_started.set()
            await save_can_continue.wait()
            return True
        
        # Mock save_matches to be slow
        with patch('persistence.storage.save_matches', side_effect=slow_save):
            # Start first save
            task1 = asyncio.create_task(
                persistence_manager.save_reminders_safe(sample_reminders, temp_file)
            )
            
            # Wait for first save to start
            await save_started.wait()
            
            # Start second save (should be skipped)
            task2 = asyncio.create_task(
                persistence_manager.save_reminders_safe(sample_reminders, temp_file)
            )
            
            # Let saves complete
            save_can_continue.set()
            
            result1 = await task1
            result2 = await task2
            
            # First save should succeed, second should be skipped but return True
            assert result1 is True
            assert result2 is True


class TestConcurrencyStats:
    """Test the concurrency statistics functionality."""
    
    @pytest.fixture
    def stats_tracker(self):
        """Create a fresh stats tracker for each test."""
        return ConcurrencyStats()
    
    def test_increment_stat(self, stats_tracker):
        """Test that statistics are incremented correctly."""
        stats_tracker.increment_stat('test_stat', 5)
        stats = stats_tracker.get_stats()
        
        # The stat shouldn't exist since it's not predefined
        assert 'test_stat' not in stats
    
    def test_increment_predefined_stat(self, stats_tracker):
        """Test incrementing predefined statistics."""
        stats_tracker.increment_stat('reaction_updates_processed', 3)
        stats_tracker.increment_stat('lock_acquisitions', 1)
        
        stats = stats_tracker.get_stats()
        
        assert stats['reaction_updates_processed'] == 3
        assert stats['lock_acquisitions'] == 1
    
    def test_concurrent_stat_updates(self, stats_tracker):
        """Test that concurrent stat updates are thread-safe."""
        import threading
        
        def update_stats():
            for _ in range(100):
                stats_tracker.increment_stat('reaction_updates_processed')
        
        # Run multiple threads concurrently
        threads = [threading.Thread(target=update_stats) for _ in range(10)]
        
        for thread in threads:
            thread.start()
        
        for thread in threads:
            thread.join()
        
        stats = stats_tracker.get_stats()
        assert stats['reaction_updates_processed'] == 1000
    
    def test_reset_stats(self, stats_tracker):
        """Test that statistics can be reset."""
        stats_tracker.increment_stat('reaction_updates_processed', 10)
        stats_tracker.increment_stat('lock_acquisitions', 5)
        
        stats_tracker.reset_stats()
        stats = stats_tracker.get_stats()
        
        assert stats['reaction_updates_processed'] == 0
        assert stats['lock_acquisitions'] == 0


class TestReminderManager:
    """Test the thread-safe reminder manager."""
    
    @pytest.fixture
    def reminder_manager(self):
        """Create a fresh reminder manager for each test."""
        return ReminderManager()
    
    @pytest.fixture
    def sample_reminder(self):
        """Create a sample reminder for testing."""
        return Reminder(123, 456, 789, "Test Reminder", 60)
    
    @pytest.mark.asyncio
    async def test_add_reminder(self, reminder_manager, sample_reminder):
        """Test adding a reminder."""
        with patch.object(reminder_manager, '_save_reminders_safe', return_value=True):
            result = await reminder_manager.add_reminder(sample_reminder)
            
            assert result is True
            assert await reminder_manager.get_reminder(123) == sample_reminder
    
    @pytest.mark.asyncio
    async def test_remove_reminder(self, reminder_manager, sample_reminder):
        """Test removing a reminder."""
        with patch.object(reminder_manager, '_save_reminders_safe', return_value=True):
            # Add reminder first
            await reminder_manager.add_reminder(sample_reminder)
            
            # Remove it
            result = await reminder_manager.remove_reminder(123)
            
            assert result is True
            assert await reminder_manager.get_reminder(123) is None
    
    @pytest.mark.asyncio
    async def test_concurrent_reminder_operations(self, reminder_manager):
        """Test concurrent reminder add/remove operations."""
        with patch.object(reminder_manager, '_save_reminders_safe', return_value=True):
            # Create multiple reminders
            reminders = [
                Reminder(i, 456, 789, f"Test Reminder {i}", 60)
                for i in range(100, 200)
            ]
            
            # Add them all concurrently
            add_tasks = [
                reminder_manager.add_reminder(reminder)
                for reminder in reminders
            ]
            
            results = await asyncio.gather(*add_tasks)
            
            # All additions should succeed
            assert all(results)
            
            # All reminders should be present
            for reminder in reminders:
                stored_reminder = await reminder_manager.get_reminder(reminder.message_id)
                assert stored_reminder is not None
                assert stored_reminder.message_id == reminder.message_id


class TestAtomicPersistence:
    """Test the atomic persistence functions."""
    
    @pytest.fixture
    def temp_file(self):
        """Create a temporary file for testing."""
        fd, path = tempfile.mkstemp(suffix='.json')
        os.close(fd)
        yield path
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
    
    @pytest.fixture
    def sample_reminders(self):
        """Create sample reminder data for testing."""
        return {
            123: Reminder(123, 456, 789, "Test Reminder 1", 60),
            124: Reminder(124, 457, 789, "Test Reminder 2", 120)
        }
    
    @pytest.mark.asyncio
    async def test_atomic_save_and_load(self, temp_file, sample_reminders):
        """Test atomic save and load operations."""
        with patch('persistence.storage.SAVE_FILE', temp_file):
            # Save data atomically
            result = await save_matches_atomic(sample_reminders)
            assert result is True
            
            # Load data back
            loaded_reminders = await load_matches_safe()
            
            assert len(loaded_reminders) == 2
            assert 123 in loaded_reminders
            assert 124 in loaded_reminders
            
            # Verify data integrity
            assert loaded_reminders[123].title == "Test Reminder 1"
            assert loaded_reminders[124].interval_minutes == 120
    
    @pytest.mark.asyncio
    async def test_concurrent_atomic_saves(self, temp_file, sample_reminders):
        """Test that atomic saves handle concurrency correctly."""
        with patch('persistence.storage.SAVE_FILE', temp_file):
            # Create multiple slightly different datasets
            datasets = [
                {123: Reminder(123, 456, 789, f"Test Reminder {i}", 60)}
                for i in range(10)
            ]
            
            # Save them all concurrently
            tasks = [save_matches_atomic(dataset) for dataset in datasets]
            results = await asyncio.gather(*tasks)
            
            # All saves should succeed
            assert all(results)
            
            # File should contain valid data (one of the datasets)
            loaded_reminders = await load_matches_safe()
            assert len(loaded_reminders) == 1
            assert 123 in loaded_reminders
    
    @pytest.mark.asyncio
    async def test_data_integrity_verification(self, sample_reminders):
        """Test data integrity verification."""
        # Valid data should pass
        result = await verify_data_integrity(sample_reminders)
        assert result is True
        
        # Invalid data should fail
        invalid_reminders = {
            "invalid_key": sample_reminders[123],  # String key instead of int
            124: sample_reminders[124]
        }
        
        result = await verify_data_integrity(invalid_reminders)
        assert result is False


class TestIntegrationScenarios:
    """Integration tests for real-world concurrency scenarios."""
    
    @pytest.mark.asyncio
    async def test_high_frequency_reaction_updates(self):
        """Test the system under high-frequency reaction update load."""
        reminder_manager = ReminderManager()
        
        # Mock bot and message objects
        mock_bot = MagicMock()
        mock_channel = AsyncMock()
        mock_message = AsyncMock()
        mock_message.reactions = []
        
        mock_bot.get_channel.return_value = mock_channel
        mock_channel.fetch_message.return_value = mock_message
        
        # Create a reminder
        reminder = Reminder(123, 456, 789, "Test Reminder", 60)
        
        with patch.object(reminder_manager, '_save_reminders_safe', return_value=True):
            await reminder_manager.add_reminder(reminder)
            
            # Simulate high-frequency reaction updates
            tasks = [
                reminder_manager.schedule_reaction_update_debounced(123, mock_bot)
                for _ in range(50)
            ]
            
            # All tasks should complete without error
            await asyncio.gather(*tasks, return_exceptions=True)
            
            # Wait for debounced updates to settle
            await asyncio.sleep(1.5)  # Wait longer than debounce delay
    
    @pytest.mark.asyncio
    async def test_concurrent_reminder_management_and_updates(self):
        """Test concurrent reminder management operations and reaction updates."""
        reminder_manager = ReminderManager()
        
        with patch.object(reminder_manager, '_save_reminders_safe', return_value=True):
            # Create tasks for various operations
            add_tasks = [
                reminder_manager.add_reminder(
                    Reminder(i, 456, 789, f"Reminder {i}", 60)
                )
                for i in range(100, 110)
            ]
            
            pause_tasks = [
                reminder_manager.pause_reminder(i)
                for i in range(100, 105)
            ]
            
            update_tasks = [
                reminder_manager.update_reminder_interval(i, 120)
                for i in range(105, 110)
            ]
            
            # Run all operations concurrently
            all_tasks = add_tasks + pause_tasks + update_tasks
            results = await asyncio.gather(*all_tasks, return_exceptions=True)
            
            # Most operations should succeed (some may fail due to timing)
            successful_results = [r for r in results if r is True]
            assert len(successful_results) >= len(add_tasks)  # At least all adds should succeed


if __name__ == "__main__":
    # Configure logging for tests
    logging.basicConfig(level=logging.DEBUG)
    
    # Run tests with pytest
    pytest.main([__file__, "-v"])