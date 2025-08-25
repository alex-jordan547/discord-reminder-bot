"""
Centralized pytest configuration and fixtures.

This module provides shared fixtures and configuration for all tests
in the Discord Reminder Bot test suite.
"""

import asyncio
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Generator
from unittest.mock import AsyncMock, Mock

import pytest
from peewee import SqliteDatabase

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Set up test environment
os.environ["TEST_MODE"] = "true"
os.environ["DISCORD_TOKEN"] = "test_token_for_pytest"
os.environ["SQLITE_STORAGE"] = "true"
os.environ["SQLITE_MIGRATION"] = "true"
os.environ["SQLITE_SCHEDULER"] = "true"
os.environ["SQLITE_CONCURRENCY"] = "true"
os.environ["SQLITE_MONITORING"] = "true"
os.environ["SQLITE_BACKUP"] = "true"
os.environ["LOG_LEVEL"] = "DEBUG"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_database():
    """Create a temporary SQLite database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)

    # Create database instance
    db = SqliteDatabase(path)

    yield db

    # Cleanup
    if not db.is_closed():
        db.close()
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def temp_json_file():
    """Create a temporary JSON file for testing."""
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)

    # Write empty JSON object
    with open(path, "w") as f:
        f.write("{}")

    yield path

    # Cleanup
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def mock_bot():
    """Create a mock Discord bot for testing."""
    bot = Mock()
    bot.user = Mock()
    bot.user.id = 123456789
    bot.user.name = "TestBot"

    # Mock async methods
    bot.fetch_channel = AsyncMock()
    bot.fetch_guild = AsyncMock()
    bot.fetch_user = AsyncMock()

    return bot


@pytest.fixture
def mock_guild():
    """Create a mock Discord guild for testing."""
    guild = Mock()
    guild.id = 123456789
    guild.name = "Test Guild"
    guild.member_count = 100

    # Mock async methods
    guild.fetch_member = AsyncMock()
    guild.fetch_channel = AsyncMock()

    return guild


@pytest.fixture
def mock_channel():
    """Create a mock Discord channel for testing."""
    channel = Mock()
    channel.id = 987654321
    channel.name = "test-channel"
    channel.guild = Mock()
    channel.guild.id = 123456789

    # Mock async methods
    channel.send = AsyncMock()
    channel.fetch_message = AsyncMock()

    return channel


@pytest.fixture
def mock_user():
    """Create a mock Discord user for testing."""
    user = Mock()
    user.id = 111111111
    user.name = "TestUser"
    user.discriminator = "1234"
    user.display_name = "Test User"

    return user


@pytest.fixture
def mock_message():
    """Create a mock Discord message for testing."""
    message = Mock()
    message.id = 555555555
    message.content = "Test message"
    message.author = Mock()
    message.author.id = 111111111
    message.channel = Mock()
    message.channel.id = 987654321
    message.guild = Mock()
    message.guild.id = 123456789

    # Mock async methods
    message.add_reaction = AsyncMock()
    message.remove_reaction = AsyncMock()
    message.edit = AsyncMock()

    return message


@pytest.fixture
def sample_event_data():
    """Provide sample event data for testing."""
    return {
        "message_id": 555555555,
        "channel_id": 987654321,
        "guild_id": 123456789,
        "title": "Test Event",
        "description": "This is a test event",
        "interval_minutes": 60.0,
        "is_paused": False,
        "required_reactions": ["✅", "❌"],
        "guild_name": "Test Guild",
    }


@pytest.fixture
def sample_reminder_data():
    """Provide sample reminder data for testing (legacy compatibility)."""
    return {
        "123456789": {
            "message_id": 555555555,
            "channel_id": 987654321,
            "guild_id": 123456789,
            "title": "Test Reminder",
            "interval_minutes": 60,
            "last_reminder": "2023-01-01T12:00:00",
            "is_paused": False,
            "required_reactions": ["✅", "❌"],
        }
    }


@pytest.fixture
def clean_database():
    """Ensure database is clean before and after test."""
    # Setup: Clean any existing test data
    try:
        from models.database_models import ALL_MODELS
        from persistence.database import get_database

        db = get_database()
        if not db.is_closed():
            # Clean all tables
            for model in reversed(ALL_MODELS):
                model.delete().execute()
    except Exception:
        pass  # Ignore cleanup errors

    yield

    # Teardown: Clean test data
    try:
        from models.database_models import ALL_MODELS
        from persistence.database import get_database

        db = get_database()
        if not db.is_closed():
            # Clean all tables
            for model in reversed(ALL_MODELS):
                model.delete().execute()
    except Exception:
        pass  # Ignore cleanup errors


@pytest.fixture(autouse=True)
def setup_test_environment():
    """Automatically set up test environment for all tests."""
    # Store original environment
    original_env = {}
    test_vars = [
        "TEST_MODE",
        "DISCORD_TOKEN",
        "SQLITE_STORAGE",
        "SQLITE_MIGRATION",
        "SQLITE_SCHEDULER",
        "SQLITE_CONCURRENCY",
        "SQLITE_MONITORING",
        "SQLITE_BACKUP",
        "LOG_LEVEL",
    ]

    for var in test_vars:
        original_env[var] = os.environ.get(var)

    # Set test environment
    os.environ.update(
        {
            "TEST_MODE": "true",
            "DISCORD_TOKEN": "test_token_for_pytest",
            "SQLITE_STORAGE": "true",
            "SQLITE_MIGRATION": "true",
            "SQLITE_SCHEDULER": "true",
            "SQLITE_CONCURRENCY": "true",
            "SQLITE_MONITORING": "true",
            "SQLITE_BACKUP": "true",
            "LOG_LEVEL": "DEBUG",
        }
    )

    yield

    # Restore original environment
    for var, value in original_env.items():
        if value is not None:
            os.environ[var] = value
        elif var in os.environ:
            del os.environ[var]


# Pytest markers
def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line("markers", "unit: Unit tests (fast, isolated)")
    config.addinivalue_line("markers", "integration: Integration tests (multiple components)")
    config.addinivalue_line("markers", "functional: Functional tests (end-to-end scenarios)")
    config.addinivalue_line("markers", "performance: Performance tests (timing, memory)")
    config.addinivalue_line("markers", "regression: Regression tests (prevent known issues)")
    config.addinivalue_line("markers", "slow: Slow tests (> 5 seconds)")
    config.addinivalue_line("markers", "database: Tests requiring database")
    config.addinivalue_line("markers", "discord: Tests requiring Discord mocks")
    config.addinivalue_line("markers", "manual: Manual tests (not run in CI)")


# Test collection customization
def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers automatically."""
    for item in items:
        # Add markers based on file path
        if "unit" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
        elif "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
        elif "performance" in str(item.fspath):
            item.add_marker(pytest.mark.performance)
        elif "regression" in str(item.fspath) or "fixes" in str(item.fspath):
            item.add_marker(pytest.mark.regression)

        # Add markers based on test name patterns
        if "database" in item.name.lower():
            item.add_marker(pytest.mark.database)
        if "discord" in item.name.lower() or "bot" in item.name.lower():
            item.add_marker(pytest.mark.discord)
        if "slow" in item.name.lower() or "performance" in item.name.lower():
            item.add_marker(pytest.mark.slow)
