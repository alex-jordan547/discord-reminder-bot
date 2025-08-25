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

# Import advanced fixture managers
from tests.fixtures import DiscordMockManager, FixtureManager, TestDatabaseManager

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


# =============================================================================
# Advanced Fixture Manager Fixtures
# =============================================================================


@pytest.fixture
def fixture_manager():
    """Provide a FixtureManager instance with automatic cleanup."""
    manager = FixtureManager()
    yield manager
    manager.cleanup()


@pytest.fixture
def discord_mock_manager():
    """Provide a DiscordMockManager instance with automatic cleanup."""
    manager = DiscordMockManager()
    yield manager
    manager.cleanup()


@pytest.fixture
def test_database_manager():
    """Provide a TestDatabaseManager instance with automatic cleanup."""
    manager = TestDatabaseManager(enable_performance_monitoring=True)
    yield manager
    manager.cleanup_all()


@pytest.fixture
def isolated_database(test_database_manager, request):
    """Provide an isolated test database for the current test."""
    test_id = f"{request.node.name}_{id(request)}"
    database = test_database_manager.create_test_database(test_id)
    yield database
    test_database_manager.cleanup_database(test_id)


@pytest.fixture
def populated_database(test_database_manager, request):
    """Provide a pre-populated test database with realistic data."""
    test_id = f"{request.node.name}_{id(request)}_populated"
    database = test_database_manager.create_test_database(test_id, populate=True)
    yield {
        "database": database,
        "fixture_manager": test_database_manager.get_fixture_manager(test_id),
        "transaction_manager": test_database_manager.get_transaction_manager(test_id),
    }
    test_database_manager.cleanup_database(test_id)


@pytest.fixture
def complete_discord_server(discord_mock_manager):
    """Provide a complete Discord server setup with guild, channels, and users."""
    return discord_mock_manager.create_complete_server_mock(
        guild_name="Test Server", channel_count=3, user_count=5
    )


@pytest.fixture
def realistic_event_scenario(fixture_manager):
    """Provide a realistic event scenario with multiple entities."""
    return fixture_manager.create_complete_scenario("standard")


@pytest.fixture
def transactional_test(populated_database):
    """Provide a transactional test context that rolls back automatically."""
    db_info = populated_database
    with db_info["transaction_manager"].transaction(rollback_on_exit=True):
        yield db_info


# =============================================================================
# Performance Testing Fixtures
# =============================================================================


@pytest.fixture
def performance_test_database(test_database_manager, request):
    """Provide a database optimized for performance testing."""
    test_id = f"{request.node.name}_perf_{id(request)}"
    database = test_database_manager.create_test_database(
        test_id,
        config="minimal",  # Fastest configuration
        populate=False,  # Don't populate for clean performance tests
    )
    yield database

    # Get performance stats before cleanup
    stats = test_database_manager.get_database_stats(test_id)
    if stats:
        print(f"\nPerformance test database stats: {stats}")

    test_database_manager.cleanup_database(test_id)


@pytest.fixture
def stress_test_scenario(fixture_manager):
    """Provide a stress test scenario with many entities."""
    return fixture_manager.create_complete_scenario("stress")


# =============================================================================
# Integration Testing Fixtures
# =============================================================================


@pytest.fixture
def full_integration_setup(discord_mock_manager, populated_database):
    """Provide a complete integration test setup."""
    server_setup = discord_mock_manager.create_complete_server_mock()

    return {
        "database": populated_database["database"],
        "fixture_manager": populated_database["fixture_manager"],
        "transaction_manager": populated_database["transaction_manager"],
        "discord_server": server_setup,
        "bot": server_setup["guild"],  # Main bot context
        "test_guild": server_setup["guild"],
        "test_channels": server_setup["channels"],
        "test_users": server_setup["users"],
        "test_messages": server_setup["messages"],
    }


# =============================================================================
# Validation and Debugging Fixtures
# =============================================================================


@pytest.fixture
def validated_mocks(discord_mock_manager):
    """Provide Discord mocks with automatic relationship validation."""
    server_setup = discord_mock_manager.create_complete_server_mock()

    yield server_setup

    # Validate relationships after test
    validation_report = discord_mock_manager.validate_mock_relationships()
    if not validation_report["valid"]:
        print(f"\nMock validation failed: {validation_report['errors']}")
        print(f"Warnings: {validation_report['warnings']}")


@pytest.fixture
def debug_database(populated_database, request):
    """Provide a database with debug logging and statistics."""
    db_info = populated_database

    # Log initial state
    initial_stats = {
        model.__name__: model.select().count()
        for model in [
            db_info["fixture_manager"].Guild,
            db_info["fixture_manager"].User,
            db_info["fixture_manager"].Event,
            db_info["fixture_manager"].Reaction,
        ]
        if hasattr(db_info["fixture_manager"], model.__name__)
    }

    print(f"\nDebug database initial state: {initial_stats}")

    yield db_info

    # Log final state
    final_stats = {
        model.__name__: model.select().count()
        for model in [
            db_info["fixture_manager"].Guild,
            db_info["fixture_manager"].User,
            db_info["fixture_manager"].Event,
            db_info["fixture_manager"].Reaction,
        ]
        if hasattr(db_info["fixture_manager"], model.__name__)
    }

    print(f"Debug database final state: {final_stats}")

    # Show fixture manager stats
    fixture_stats = db_info["fixture_manager"].get_fixture_stats()
    print(f"Fixture manager stats: {fixture_stats}")


# =============================================================================
# Scenario-Based Testing Fixtures
# =============================================================================


@pytest.fixture(params=["minimal", "standard", "complex"])
def scenario_database(fixture_manager, request):
    """Provide databases with different scenario complexities."""
    scenario_name = request.param
    scenario_data = fixture_manager.create_complete_scenario(scenario_name)

    return {
        "scenario_name": scenario_name,
        "scenario_data": scenario_data,
        "fixture_manager": fixture_manager,
        "metadata": scenario_data["metadata"],
    }
