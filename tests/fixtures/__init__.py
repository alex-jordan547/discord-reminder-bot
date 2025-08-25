"""
Advanced Test Fixtures Package for Discord Reminder Bot.

This package provides comprehensive testing infrastructure with:
- FixtureManager: Intelligent fixture creation with relationships
- DiscordMockManager: Realistic Discord object mocks with validation
- TestDatabaseManager: Isolated database testing with automation

All managers work together to provide a robust, scalable testing foundation.
"""

from .discord_mock_manager import DiscordMockError, DiscordMockManager, InteractionTracker
from .fixture_manager import FixtureError, FixtureManager
from .test_database_manager import (
    DatabasePerformanceMonitor,
    DatabaseTestError,
    TestDatabaseManager,
    TransactionManager,
)

__all__ = [
    # Core managers
    "FixtureManager",
    "DiscordMockManager",
    "TestDatabaseManager",
    # Utility classes
    "TransactionManager",
    "InteractionTracker",
    "DatabasePerformanceMonitor",
    # Exceptions
    "FixtureError",
    "DiscordMockError",
    "DatabaseTestError",
]

# Version info
__version__ = "1.0.0"
__author__ = "Discord Reminder Bot Test Infrastructure"
