"""
Performance tests for SQLite migration.

This module tests the performance characteristics of the SQLite implementation
compared to the JSON-based storage, scheduler accuracy, and scalability.
"""

import asyncio
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config.settings import Settings
from models.database_models import Event, Guild, User, Reaction, create_tables, drop_tables, initialize_models
from models.reminder import Event as JSONEvent
from persistence.database import get_database
from utils.event_manager_sqlite import sqlite_event_manager
from utils.reminder_manager import event_manager as json_event_manager
from utils.scheduler_sqlite import schedule_next_reminder_check, check_reminders_dynamic

# Configure logging for tests
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


class PerformanceTimer:
    """Context manager for measuring execution time."""
    
    def __init__(self, description: str = "Operation"):
        self.description = description
        self.start_time = None
        self.end_time = None
        self.duration = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.perf_counter()
        self.duration = self.end_time - self.start_time
        logger.info(f"{self.description}: {self.duration:.4f} seconds")


@pytest.fixture
def temp_json_file():
    """Create a temporary JSON file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        yield f.name
    os.unlink(f.name)


@pytest.fixture
def sample_json_data():
    """Generate sample JSON data for performance testing."""
    return {
        "123456789": {
            "message_id": 123456789,
            "channel_id": 987654321,
            "guild_id": 111222333,
            "title": "Test Event",
            "interval_minutes": 60,
            "is_paused": False,
            "last_reminder": "2024-01-01T12:00:00",
            "required_reactions": ["✅", "❌", "❓"],
            "users_who_reacted": [444555666, 777888999]
        }
    }


@pytest.fixture
def large_dataset():
    """Generate a large dataset for scalability testing."""
    data = {}
    base_time = datetime.now()
    
    for i in range(1000):  # 1000 events
        message_id = 1000000 + i
        guild_id = 111222333 + (i % 10)  # 10 different guilds
        
        data[str(message_id)] = {
            "message_id": message_id,
            "channel_id": 987654321 + (i % 5),  # 5 different channels per guild
            "guild_id": guild_id,
            "title": f"Performance Test Event {i}",
            "interval_minutes": 60 + (i % 120),  # Varying intervals
            "is_paused": i % 10 == 0,  # 10% paused
            "last_reminder": (base_time - timedelta(minutes=i % 180)).isoformat(),
            "required_reactions": ["✅", "❌", "❓"],
            "users_who_reacted": [444555666 + j for j in range(i % 20)]  # Varying reaction counts
        }
    
    return data


@pytest.fixture
def setup_sqlite_db():
    """Set up SQLite database for testing."""
    # Initialize models and create tables
    initialize_models()
    create_tables()
    
    yield
    
    # Clean up
    drop_tables()


@pytest.fixture
def setup_json_manager(temp_json_file, sample_json_data):
    """Set up JSON event manager for testing."""
    # Write sample data to file
    with open(temp_json_file, 'w') as f:
        json.dump(sample_json_data, f)
    
    # Configure settings to use temp file
    original_file = Settings.REMINDERS_SAVE_FILE
    Settings.REMINDERS_SAVE_FILE = temp_json_file
    
    yield json_event_manager
    
    # Restore original settings
    Settings.REMINDERS_SAVE_FILE = original_file


class TestPerformanceComparison:
    """Test performance comparison between SQLite and JSON implementations."""
    
    @pytest.mark.asyncio
    async def test_create_event_performance(self, setup_sqlite_db, setup_json_manager):
        """Compare event creation performance between SQLite and JSON."""
        num_events = 50  # Reduced for faster testing
        
        # Initialize JSON manager
        await setup_json_manager.load_from_storage()
        
        # Test SQLite creation
        sqlite_times = []
        for i in range(num_events):
            with PerformanceTimer() as timer:
                await sqlite_event_manager.create_event(
                    guild_id=111222333,
                    message_id=2000000 + i,
                    channel_id=987654321,
                    title=f"SQLite Test Event {i}",
                    interval_minutes=60
                )
            sqlite_times.append(timer.duration)
        
        # Test JSON creation
        json_times = []
        for i in range(num_events):
            event = JSONEvent(
                message_id=3000000 + i,
                channel_id=987654321,
                guild_id=111222333,
                title=f"JSON Test Event {i}",
                interval_minutes=60
            )
            with PerformanceTimer() as timer:
                await setup_json_manager.add_event(event)
            json_times.append(timer.duration)
        
        # Calculate averages
        avg_sqlite = sum(sqlite_times) / len(sqlite_times)
        avg_json = sum(json_times) / len(json_times)
        
        logger.info(f"Average SQLite creation time: {avg_sqlite:.6f}s")
        logger.info(f"Average JSON creation time: {avg_json:.6f}s")
        
        # SQLite should be reasonably fast (within 10x of JSON)
        assert avg_sqlite < avg_json * 10, f"SQLite too slow: {avg_sqlite:.6f}s vs JSON {avg_json:.6f}s"
    
    @pytest.mark.asyncio
    async def test_read_event_performance(self, setup_sqlite_db, setup_json_manager):
        """Compare event reading performance between SQLite and JSON."""
        # Initialize JSON manager
        await setup_json_manager.load_from_storage()
        
        # Create test events
        message_ids = []
        for i in range(50):  # Reduced for faster testing
            message_id = 4000000 + i
            message_ids.append(message_id)
            
            # Create in SQLite
            await sqlite_event_manager.create_event(
                guild_id=111222333,
                message_id=message_id,
                channel_id=987654321,
                title=f"Read Test Event {i}"
            )
            
            # Create in JSON
            event = JSONEvent(
                message_id=message_id + 1000000,
                channel_id=987654321,
                guild_id=111222333,
                title=f"JSON Read Test Event {i}"
            )
            await setup_json_manager.add_event(event)
        
        # Test SQLite reading
        with PerformanceTimer("SQLite read 50 events") as sqlite_timer:
            for message_id in message_ids:
                await sqlite_event_manager.get_event(message_id)
        
        # Test JSON reading
        with PerformanceTimer("JSON read 50 events") as json_timer:
            for message_id in message_ids:
                await setup_json_manager.get_event(message_id + 1000000)
        
        logger.info(f"SQLite read time: {sqlite_timer.duration:.6f}s")
        logger.info(f"JSON read time: {json_timer.duration:.6f}s")
        
        # Both should be reasonably fast
        assert sqlite_timer.duration < 1.0, "SQLite reads too slow"
        assert json_timer.duration < 1.0, "JSON reads too slow"
    
    @pytest.mark.asyncio
    async def test_query_due_events_performance(self, setup_sqlite_db, setup_json_manager):
        """Compare performance of finding due events."""
        # Initialize JSON manager
        await setup_json_manager.load_from_storage()
        
        # Create events with different due times
        current_time = datetime.now()
        
        for i in range(100):  # Reduced for faster testing
            # Half are due, half are not
            last_reminder = current_time - timedelta(minutes=90 if i % 2 == 0 else 30)
            
            # SQLite event
            await sqlite_event_manager.create_event(
                guild_id=111222333,
                message_id=5000000 + i,
                channel_id=987654321,
                title=f"Due Test Event {i}",
                interval_minutes=60,
                last_reminder=last_reminder
            )
            
            # JSON event
            event = JSONEvent(
                message_id=6000000 + i,
                channel_id=987654321,
                guild_id=111222333,
                title=f"JSON Due Test Event {i}",
                interval_minutes=60
            )
            # Set last_reminder after creation
            event.last_reminder = last_reminder
            await setup_json_manager.add_event(event)
        
        # Test SQLite query
        with PerformanceTimer("SQLite query due events") as sqlite_timer:
            sqlite_due = await sqlite_event_manager.get_due_events()
        
        # Test JSON query
        with PerformanceTimer("JSON query due events") as json_timer:
            json_due = await setup_json_manager.get_due_events()
        
        logger.info(f"SQLite found {len(sqlite_due)} due events in {sqlite_timer.duration:.6f}s")
        logger.info(f"JSON found {len(json_due)} due events in {json_timer.duration:.6f}s")
        
        # Both should find approximately the same number (50 due events)
        assert 40 <= len(sqlite_due) <= 60, f"SQLite found unexpected number: {len(sqlite_due)}"
        assert 40 <= len(json_due) <= 60, f"JSON found unexpected number: {len(json_due)}"
        
        # Query should be fast (under 100ms as per requirements)
        assert sqlite_timer.duration < 0.1, f"SQLite query too slow: {sqlite_timer.duration:.6f}s"


class TestSchedulerAccuracy:
    """Test scheduler accuracy and timing precision."""
    
    @pytest.mark.asyncio
    async def test_scheduler_timing_accuracy(self, setup_sqlite_db):
        """Test that scheduler maintains ±5 second accuracy."""
        # Create an event that should be due soon
        current_time = datetime.now()
        last_reminder = current_time - timedelta(minutes=59, seconds=58)  # Due in 2 seconds
        
        event = await sqlite_event_manager.create_event(
            guild_id=111222333,
            message_id=7000001,
            channel_id=987654321,
            title="Timing Test Event",
            interval_minutes=60,
            last_reminder=last_reminder
        )
        
        assert event is not None
        
        # Mock the bot and channel for reminder sending
        mock_bot = MagicMock()
        mock_channel = MagicMock()
        mock_message = MagicMock()
        mock_message.reactions = []
        
        mock_bot.get_channel.return_value = mock_channel
        mock_channel.fetch_message = AsyncMock(return_value=mock_message)
        
        # Wait for the event to become due and measure timing
        start_time = time.perf_counter()
        
        # Check if event is due (should be within 5 seconds)
        while True:
            due_events = await sqlite_event_manager.get_due_events()
            if any(e.message_id == 7000001 for e in due_events):
                break
            await asyncio.sleep(0.1)
            
            # Timeout after 10 seconds
            if time.perf_counter() - start_time > 10:
                pytest.fail("Event did not become due within 10 seconds")
        
        actual_time = time.perf_counter() - start_time
        expected_time = 2.0  # Should be due in ~2 seconds
        
        logger.info(f"Event became due after {actual_time:.2f}s (expected ~{expected_time:.2f}s)")
        
        # Should be within ±5 seconds of expected time
        assert abs(actual_time - expected_time) <= 5.0, \
            f"Timing accuracy failed: {actual_time:.2f}s vs expected {expected_time:.2f}s"
    
    @pytest.mark.asyncio
    async def test_scheduler_precision_multiple_events(self, setup_sqlite_db):
        """Test scheduler precision with multiple events due at different times."""
        current_time = datetime.now()
        expected_times = []
        
        # Create events due at 1, 3, and 5 second intervals
        for i, seconds in enumerate([1, 3, 5]):
            last_reminder = current_time - timedelta(minutes=59, seconds=60-seconds)
            expected_times.append(seconds)
            
            await sqlite_event_manager.create_event(
                guild_id=111222333,
                message_id=7000010 + i,
                channel_id=987654321,
                title=f"Precision Test Event {i}",
                interval_minutes=60,
                last_reminder=last_reminder
            )
        
        # Track when each event becomes due
        start_time = time.perf_counter()
        due_times = []
        found_events = set()
        
        while len(found_events) < 3:
            due_events = await sqlite_event_manager.get_due_events()
            current_elapsed = time.perf_counter() - start_time
            
            for event in due_events:
                if event.message_id not in found_events:
                    found_events.add(event.message_id)
                    due_times.append(current_elapsed)
                    logger.info(f"Event {event.message_id} became due at {current_elapsed:.2f}s")
            
            await asyncio.sleep(0.1)
            
            # Timeout after 15 seconds
            if current_elapsed > 15:
                break
        
        # Verify timing precision
        assert len(due_times) >= 2, "Not enough events became due for precision testing"
        
        for i, (actual, expected) in enumerate(zip(due_times, expected_times[:len(due_times)])):
            precision_error = abs(actual - expected)
            logger.info(f"Event {i}: expected {expected}s, actual {actual:.2f}s, error {precision_error:.2f}s")
            
            # Should be within ±5 seconds
            assert precision_error <= 5.0, \
                f"Event {i} timing precision failed: {precision_error:.2f}s error"


class TestScalabilityPerformance:
    """Test performance with large datasets."""
    
    @pytest.mark.asyncio
    async def test_large_dataset_performance(self, setup_sqlite_db, large_dataset):
        """Test performance with a large number of events."""
        # Load large dataset into SQLite
        load_start = time.perf_counter()
        
        for event_data in large_dataset.values():
            await sqlite_event_manager.create_event(
                guild_id=event_data['guild_id'],
                message_id=event_data['message_id'],
                channel_id=event_data['channel_id'],
                title=event_data['title'],
                interval_minutes=event_data['interval_minutes'],
                is_paused=event_data['is_paused'],
                last_reminder=datetime.fromisoformat(event_data['last_reminder'])
            )
        
        load_time = time.perf_counter() - load_start
        logger.info(f"Loaded {len(large_dataset)} events in {load_time:.2f}s")
        
        # Test query performance with large dataset
        with PerformanceTimer("Query due events from large dataset") as query_timer:
            due_events = await sqlite_event_manager.get_due_events()
        
        logger.info(f"Found {len(due_events)} due events from {len(large_dataset)} total")
        
        # Query should still be fast even with large dataset
        assert query_timer.duration < 0.5, \
            f"Large dataset query too slow: {query_timer.duration:.4f}s"
        
        # Test guild-specific queries
        test_guild_id = 111222333
        with PerformanceTimer("Query guild events from large dataset") as guild_timer:
            guild_events = await sqlite_event_manager.get_guild_events(test_guild_id)
        
        logger.info(f"Found {len(guild_events)} events for guild {test_guild_id}")
        
        # Guild query should be fast
        assert guild_timer.duration < 0.1, \
            f"Guild query too slow: {guild_timer.duration:.4f}s"
    
    @pytest.mark.asyncio
    async def test_concurrent_operations_performance(self, setup_sqlite_db):
        """Test performance under concurrent operations."""
        # Create base events
        for i in range(50):
            await sqlite_event_manager.create_event(
                guild_id=111222333,
                message_id=8000000 + i,
                channel_id=987654321,
                title=f"Concurrent Test Event {i}",
                interval_minutes=60
            )
        
        # Define concurrent operations
        async def create_events():
            for i in range(50, 100):
                await sqlite_event_manager.create_event(
                    guild_id=111222333,
                    message_id=8000000 + i,
                    channel_id=987654321,
                    title=f"Concurrent Create Event {i}",
                    interval_minutes=60
                )
        
        async def read_events():
            for i in range(50):
                await sqlite_event_manager.get_event(8000000 + i)
        
        async def query_due_events():
            for _ in range(10):
                await sqlite_event_manager.get_due_events()
                await asyncio.sleep(0.01)
        
        # Run concurrent operations
        start_time = time.perf_counter()
        
        await asyncio.gather(
            create_events(),
            read_events(),
            query_due_events()
        )
        
        total_time = time.perf_counter() - start_time
        logger.info(f"Concurrent operations completed in {total_time:.2f}s")
        
        # Should complete within reasonable time
        assert total_time < 5.0, f"Concurrent operations too slow: {total_time:.2f}s"
        
        # Verify data integrity after concurrent operations
        final_count = len(await sqlite_event_manager.get_guild_events(111222333))
        assert final_count == 100, f"Data integrity issue: expected 100 events, got {final_count}"
    
    @pytest.mark.asyncio
    async def test_memory_usage_large_dataset(self, setup_sqlite_db, large_dataset):
        """Test memory usage with large datasets."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Load large dataset
        for event_data in large_dataset.values():
            await sqlite_event_manager.create_event(
                guild_id=event_data['guild_id'],
                message_id=event_data['message_id'],
                channel_id=event_data['channel_id'],
                title=event_data['title'],
                interval_minutes=event_data['interval_minutes'],
                is_paused=event_data['is_paused'],
                last_reminder=datetime.fromisoformat(event_data['last_reminder'])
            )
        
        # Perform multiple operations
        for _ in range(10):
            await sqlite_event_manager.get_due_events()
            await sqlite_event_manager.get_guild_events(111222333)
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        logger.info(f"Memory usage: {initial_memory:.1f}MB -> {final_memory:.1f}MB (+{memory_increase:.1f}MB)")
        
        # Memory increase should be reasonable (less than 100MB for 1000 events)
        assert memory_increase < 100, f"Excessive memory usage: {memory_increase:.1f}MB"


class TestPerformanceRegression:
    """Test for performance regressions."""
    
    @pytest.mark.asyncio
    async def test_response_time_requirements(self, setup_sqlite_db):
        """Test that response times meet requirements."""
        # Create test events
        for i in range(100):
            await sqlite_event_manager.create_event(
                guild_id=111222333,
                message_id=9000000 + i,
                channel_id=987654321,
                title=f"Response Time Test Event {i}",
                interval_minutes=60
            )
        
        # Test individual operation response times
        operations = []
        
        # Test event creation
        with PerformanceTimer() as timer:
            await sqlite_event_manager.create_event(
                guild_id=111222333,
                message_id=9000100,
                channel_id=987654321,
                title="Response Time Create Test"
            )
        operations.append(("create_event", timer.duration))
        
        # Test event retrieval
        with PerformanceTimer() as timer:
            await sqlite_event_manager.get_event(9000100)
        operations.append(("get_event", timer.duration))
        
        # Test due events query
        with PerformanceTimer() as timer:
            await sqlite_event_manager.get_due_events()
        operations.append(("get_due_events", timer.duration))
        
        # Test guild events query
        with PerformanceTimer() as timer:
            await sqlite_event_manager.get_guild_events(111222333)
        operations.append(("get_guild_events", timer.duration))
        
        # Verify response times meet requirements
        for operation, duration in operations:
            logger.info(f"{operation}: {duration:.6f}s")
            
            if operation == "get_due_events":
                # Due events query must be under 100ms per requirements
                assert duration < 0.1, f"{operation} too slow: {duration:.6f}s"
            else:
                # Other operations should be reasonably fast
                assert duration < 0.5, f"{operation} too slow: {duration:.6f}s"
    
    @pytest.mark.asyncio
    async def test_scheduler_cpu_usage(self, setup_sqlite_db):
        """Test that scheduler doesn't consume excessive CPU."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        
        # Create an event that won't be due for a while
        await sqlite_event_manager.create_event(
            guild_id=111222333,
            message_id=9000200,
            channel_id=987654321,
            title="CPU Usage Test Event",
            interval_minutes=1440,  # 24 hours
            last_reminder=datetime.now()
        )
        
        # Monitor CPU usage during scheduler operation
        cpu_samples = []
        
        # Start monitoring
        for _ in range(10):
            cpu_percent = process.cpu_percent(interval=0.1)
            cpu_samples.append(cpu_percent)
            
            # Trigger scheduler check
            await sqlite_event_manager.get_due_events()
        
        avg_cpu = sum(cpu_samples) / len(cpu_samples)
        max_cpu = max(cpu_samples)
        
        logger.info(f"CPU usage - Average: {avg_cpu:.2f}%, Max: {max_cpu:.2f}%")
        
        # CPU usage should be minimal when no events are due
        assert avg_cpu < 10.0, f"Average CPU usage too high: {avg_cpu:.2f}%"
        assert max_cpu < 20.0, f"Peak CPU usage too high: {max_cpu:.2f}%"


if __name__ == "__main__":
    # Run performance tests
    pytest.main([__file__, "-v", "-s"])