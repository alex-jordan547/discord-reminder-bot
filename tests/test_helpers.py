"""
Helper utilities for test development.

This module provides common testing utilities and patterns
to make writing tests easier and more consistent.
"""

import asyncio
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock


class TestDataBuilder:
    """Builder pattern for creating test data consistently."""

    @staticmethod
    def event_data(
        message_id: int = 555555555,
        channel_id: int = 987654321,
        guild_id: int = 123456789,
        title: str = "Test Event",
        interval_minutes: float = 60.0,
        **kwargs,
    ) -> Dict[str, Any]:
        """Create consistent event data for tests."""
        base_data = {
            "message_id": message_id,
            "channel_id": channel_id,
            "guild_id": guild_id,
            "title": title,
            "description": f"Test description for {title}",
            "interval_minutes": interval_minutes,
            "is_paused": False,
            "required_reactions": ["✅", "❌"],
            "guild_name": "Test Guild",
            "created_at": datetime.now().isoformat(),
            "users_who_reacted": {},
        }
        base_data.update(kwargs)
        return base_data

    @staticmethod
    def discord_message(
        message_id: int = 555555555,
        content: str = "Test message",
        author_id: int = 111111111,
        channel_id: int = 987654321,
        guild_id: int = 123456789,
    ) -> MagicMock:
        """Create a mock Discord message with realistic structure."""
        message = MagicMock()
        message.id = message_id
        message.content = content

        # Author mock
        message.author = MagicMock()
        message.author.id = author_id
        message.author.name = "TestUser"
        message.author.display_name = "Test User"

        # Channel mock
        message.channel = MagicMock()
        message.channel.id = channel_id
        message.channel.name = "test-channel"

        # Guild mock
        message.guild = MagicMock()
        message.guild.id = guild_id
        message.guild.name = "Test Guild"

        # Async methods
        message.add_reaction = AsyncMock()
        message.remove_reaction = AsyncMock()
        message.edit = AsyncMock()

        return message

    @staticmethod
    def discord_guild(
        guild_id: int = 123456789, name: str = "Test Guild", member_count: int = 100
    ) -> MagicMock:
        """Create a mock Discord guild."""
        guild = MagicMock()
        guild.id = guild_id
        guild.name = name
        guild.member_count = member_count

        # Async methods
        guild.fetch_member = AsyncMock()
        guild.fetch_channel = AsyncMock()

        return guild


class AsyncTestHelper:
    """Helper for async test operations."""

    @staticmethod
    async def wait_for_condition(
        condition_func, timeout: float = 5.0, interval: float = 0.1
    ) -> bool:
        """Wait for a condition to become true."""
        start_time = asyncio.get_event_loop().time()

        while asyncio.get_event_loop().time() - start_time < timeout:
            if condition_func():
                return True
            await asyncio.sleep(interval)

        return False

    @staticmethod
    async def run_with_timeout(coro, timeout: float = 5.0):
        """Run a coroutine with a timeout."""
        return await asyncio.wait_for(coro, timeout=timeout)


class TempFileHelper:
    """Helper for temporary file operations in tests."""

    @staticmethod
    def create_temp_json(data: Dict[str, Any]) -> str:
        """Create a temporary JSON file with data."""
        import json

        fd, path = tempfile.mkstemp(suffix=".json")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f, indent=2)
            return path
        except Exception:
            os.close(fd)
            raise

    @staticmethod
    def create_temp_db() -> str:
        """Create a temporary database file."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        return path

    @staticmethod
    def cleanup_file(path: str):
        """Safely remove a temporary file."""
        try:
            if os.path.exists(path):
                os.unlink(path)
        except OSError:
            pass  # Ignore cleanup errors


class AssertionHelper:
    """Custom assertion helpers for common test patterns."""

    @staticmethod
    def assert_dict_subset(subset: Dict, full_dict: Dict):
        """Assert that subset is a subset of full_dict."""
        for key, value in subset.items():
            assert key in full_dict, f"Key '{key}' not found in dict"
            assert (
                full_dict[key] == value
            ), f"Value mismatch for key '{key}': expected {value}, got {full_dict[key]}"

    @staticmethod
    def assert_time_close(time1: datetime, time2: datetime, tolerance_seconds: float = 1.0):
        """Assert that two times are close within tolerance."""
        diff = abs((time1 - time2).total_seconds())
        assert (
            diff <= tolerance_seconds
        ), f"Times differ by {diff}s, tolerance is {tolerance_seconds}s"

    @staticmethod
    async def assert_async_raises(exception_type, coro):
        """Assert that an async operation raises a specific exception."""
        try:
            await coro
            assert False, f"Expected {exception_type.__name__} to be raised"
        except exception_type:
            pass  # Expected
        except Exception as e:
            assert False, f"Expected {exception_type.__name__}, but got {type(e).__name__}: {e}"


# Convenience functions for common patterns
def create_test_event(**kwargs) -> Dict[str, Any]:
    """Quick function to create test event data."""
    return TestDataBuilder.event_data(**kwargs)


def create_mock_message(**kwargs) -> MagicMock:
    """Quick function to create mock Discord message."""
    return TestDataBuilder.discord_message(**kwargs)


def create_mock_guild(**kwargs) -> MagicMock:
    """Quick function to create mock Discord guild."""
    return TestDataBuilder.discord_guild(**kwargs)
