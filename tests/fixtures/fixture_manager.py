"""
Advanced Fixture Manager for Discord Reminder Bot tests.

Provides centralized, intelligent fixture creation with relationships,
validation, and automatic cleanup for robust testing infrastructure.
"""

import asyncio
import logging
import random
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from unittest.mock import AsyncMock, MagicMock

from peewee import SqliteDatabase

from models.database_models import Event, Guild, Reaction, User, initialize_models
from tests.test_helpers import AssertionHelper, AsyncTestHelper, TempFileHelper

logger = logging.getLogger(__name__)


class FixtureError(Exception):
    """Raised when fixture creation or management fails."""

    pass


class FixtureManager:
    """
    Centralized fixture management with intelligent creation patterns.

    Features:
    - Factory methods for all model types
    - Automatic relationship management
    - Configurable data scenarios
    - Cleanup tracking and automation
    - Performance optimization
    """

    def __init__(self, database: Optional[SqliteDatabase] = None):
        """Initialize fixture manager with optional database."""
        self.database = database
        self._created_objects = []
        self._temp_files = []
        self._cleanup_hooks = []

        # Counters for unique IDs
        self._id_counters = {
            "guild": 100000000000000000,  # Discord snowflake format
            "user": 200000000000000000,
            "channel": 300000000000000000,
            "message": 400000000000000000,
            "event": 1,
        }

        # Default configurations for different test scenarios
        self.scenarios = {
            "minimal": {"guilds": 1, "users": 2, "events": 1},
            "standard": {"guilds": 2, "users": 5, "events": 3},
            "complex": {"guilds": 3, "users": 10, "events": 7},
            "stress": {"guilds": 5, "users": 25, "events": 20},
        }

    def get_unique_id(self, entity_type: str) -> int:
        """Generate unique IDs for different entity types."""
        if entity_type not in self._id_counters:
            raise FixtureError(f"Unknown entity type: {entity_type}")

        current_id = self._id_counters[entity_type]
        self._id_counters[entity_type] += 1
        return current_id

    # =============================================================================
    # Database Fixtures
    # =============================================================================

    def create_guild(self, **kwargs) -> Guild:
        """Create a Guild model with sensible defaults."""
        defaults = {
            "guild_id": self.get_unique_id("guild"),
            "name": f"Test Guild {self.get_unique_id('guild')}",
            "member_count": random.randint(10, 1000),
            "is_active": True,
        }
        defaults.update(kwargs)

        try:
            guild = Guild.create(**defaults)
            self._created_objects.append(("guild", guild.id))
            logger.debug(f"Created guild fixture: {guild.name} (ID: {guild.guild_id})")
            return guild
        except Exception as e:
            raise FixtureError(f"Failed to create guild fixture: {e}")

    def create_user(self, **kwargs) -> User:
        """Create a User model with sensible defaults."""
        defaults = {
            "user_id": self.get_unique_id("user"),
            "username": f"TestUser{self.get_unique_id('user')}",
            "display_name": f"Test User {self.get_unique_id('user')}",
            "is_bot": False,
        }
        defaults.update(kwargs)

        try:
            user = User.create(**defaults)
            self._created_objects.append(("user", user.id))
            logger.debug(f"Created user fixture: {user.username} (ID: {user.user_id})")
            return user
        except Exception as e:
            raise FixtureError(f"Failed to create user fixture: {e}")

    def create_event(self, guild: Optional[Guild] = None, **kwargs) -> Event:
        """Create an Event model with sensible defaults and relationships."""
        if guild is None:
            guild = self.create_guild()

        defaults = {
            "message_id": self.get_unique_id("message"),
            "channel_id": self.get_unique_id("channel"),
            "guild": guild,
            "title": f"Test Event {self.get_unique_id('event')}",
            "description": f"Test event description {self.get_unique_id('event')}",
            "interval_minutes": random.choice([60, 120, 360, 720, 1440]),
            "is_paused": False,
            "required_reactions": ["✅", "❌"],
        }
        defaults.update(kwargs)

        try:
            event = Event.create(**defaults)
            self._created_objects.append(("event", event.id))
            logger.debug(f"Created event fixture: {event.title} (ID: {event.message_id})")
            return event
        except Exception as e:
            raise FixtureError(f"Failed to create event fixture: {e}")

    def create_reaction(
        self, event: Optional[Event] = None, user: Optional[User] = None, **kwargs
    ) -> Reaction:
        """Create a Reaction model with sensible defaults and relationships."""
        if event is None:
            event = self.create_event()
        if user is None:
            user = self.create_user()

        defaults = {
            "event": event,
            "user": user,
            "emoji": random.choice(["✅", "❌", "🎯", "⭐", "🔥"]),
            "added_at": datetime.now(),
        }
        defaults.update(kwargs)

        try:
            reaction = Reaction.create(**defaults)
            self._created_objects.append(("reaction", reaction.id))
            logger.debug(f"Created reaction fixture: {reaction.emoji} by {user.username}")
            return reaction
        except Exception as e:
            raise FixtureError(f"Failed to create reaction fixture: {e}")

    # =============================================================================
    # Composite Fixtures (Multi-Entity)
    # =============================================================================

    def create_guild_with_users(
        self, user_count: int = 5, **guild_kwargs
    ) -> Tuple[Guild, List[User]]:
        """Create a guild with multiple users."""
        guild = self.create_guild(**guild_kwargs)
        users = [self.create_user() for _ in range(user_count)]

        logger.debug(f"Created guild with {user_count} users: {guild.name}")
        return guild, users

    def create_event_with_reactions(
        self, reaction_count: int = 3, unique_users: bool = True, **event_kwargs
    ) -> Tuple[Event, List[Reaction]]:
        """Create an event with multiple reactions."""
        event = self.create_event(**event_kwargs)

        reactions = []
        users_used = set()

        for _ in range(reaction_count):
            if unique_users:
                # Create new user for each reaction
                user = self.create_user()
            else:
                # Reuse users or create new ones
                if len(users_used) < reaction_count:
                    user = self.create_user()
                    users_used.add(user.user_id)
                else:
                    # Pick random existing user
                    existing_user_id = random.choice(list(users_used))
                    user = User.get(User.user_id == existing_user_id)

            reaction = self.create_reaction(event=event, user=user)
            reactions.append(reaction)

        logger.debug(f"Created event with {reaction_count} reactions: {event.title}")
        return event, reactions

    def create_complete_scenario(self, scenario_name: str = "standard") -> Dict[str, Any]:
        """
        Create a complete test scenario with multiple related entities.

        Returns a dictionary with all created entities for easy access.
        """
        if scenario_name not in self.scenarios:
            raise FixtureError(f"Unknown scenario: {scenario_name}")

        config = self.scenarios[scenario_name]
        scenario_data = {
            "guilds": [],
            "users": [],
            "events": [],
            "reactions": [],
            "metadata": {
                "scenario": scenario_name,
                "created_at": datetime.now(),
                "total_entities": 0,
            },
        }

        # Create guilds
        for _ in range(config["guilds"]):
            guild = self.create_guild()
            scenario_data["guilds"].append(guild)

        # Create users (distributed across guilds)
        for _ in range(config["users"]):
            user = self.create_user()
            scenario_data["users"].append(user)

        # Create events (distributed across guilds)
        for i in range(config["events"]):
            guild = scenario_data["guilds"][i % len(scenario_data["guilds"])]
            event = self.create_event(guild=guild)
            scenario_data["events"].append(event)

            # Add some reactions to events
            if scenario_data["users"]:
                reaction_count = random.randint(1, min(3, len(scenario_data["users"])))
                selected_users = random.sample(scenario_data["users"], reaction_count)

                for user in selected_users:
                    reaction = self.create_reaction(event=event, user=user)
                    scenario_data["reactions"].append(reaction)

        # Update metadata
        scenario_data["metadata"]["total_entities"] = (
            len(scenario_data["guilds"])
            + len(scenario_data["users"])
            + len(scenario_data["events"])
            + len(scenario_data["reactions"])
        )

        logger.info(
            f"Created complete scenario '{scenario_name}' with {scenario_data['metadata']['total_entities']} entities"
        )
        return scenario_data

    # =============================================================================
    # File and Temporary Resource Fixtures
    # =============================================================================

    def create_temp_database(self, initialize: bool = True) -> SqliteDatabase:
        """Create a temporary SQLite database for testing."""
        temp_path = TempFileHelper.create_temp_db()
        self._temp_files.append(temp_path)

        database = SqliteDatabase(temp_path)

        if initialize:
            # Initialize models with this database
            initialize_models(database)
            database.create_tables([Guild, User, Event, Reaction])

        logger.debug(f"Created temporary database: {temp_path}")
        return database

    def create_temp_json_file(self, data: Dict[str, Any]) -> str:
        """Create a temporary JSON file with test data."""
        temp_path = TempFileHelper.create_temp_json(data)
        self._temp_files.append(temp_path)
        return temp_path

    # =============================================================================
    # Validation and Assertion Helpers
    # =============================================================================

    def validate_fixture_relationships(self) -> bool:
        """Validate that all created fixtures have proper relationships."""
        try:
            # Check that all events have valid guilds
            events = Event.select()
            for event in events:
                if not event.guild:
                    logger.error(f"Event {event.id} has no guild relationship")
                    return False

            # Check that all reactions have valid events and users
            reactions = Reaction.select()
            for reaction in reactions:
                if not reaction.event or not reaction.user:
                    logger.error(f"Reaction {reaction.id} has invalid relationships")
                    return False

            logger.debug("All fixture relationships validated successfully")
            return True
        except Exception as e:
            logger.error(f"Fixture validation failed: {e}")
            return False

    def get_fixture_stats(self) -> Dict[str, Any]:
        """Get statistics about created fixtures."""
        stats = {
            "total_objects": len(self._created_objects),
            "temp_files": len(self._temp_files),
            "by_type": {},
            "creation_time": datetime.now(),
        }

        # Count by type
        for obj_type, obj_id in self._created_objects:
            if obj_type not in stats["by_type"]:
                stats["by_type"][obj_type] = 0
            stats["by_type"][obj_type] += 1

        return stats

    # =============================================================================
    # Cleanup Management
    # =============================================================================

    def add_cleanup_hook(self, cleanup_func, *args, **kwargs):
        """Add a custom cleanup function to be called during cleanup."""
        self._cleanup_hooks.append((cleanup_func, args, kwargs))

    def cleanup(self):
        """Clean up all created fixtures and temporary resources."""
        errors = []

        try:
            # Run custom cleanup hooks
            for cleanup_func, args, kwargs in self._cleanup_hooks:
                try:
                    cleanup_func(*args, **kwargs)
                except Exception as e:
                    errors.append(f"Cleanup hook failed: {e}")

            # Clean up database objects (in reverse dependency order)
            try:
                if Reaction.table_exists():
                    Reaction.delete().execute()
                if Event.table_exists():
                    Event.delete().execute()
                if User.table_exists():
                    User.delete().execute()
                if Guild.table_exists():
                    Guild.delete().execute()
            except Exception as e:
                errors.append(f"Database cleanup failed: {e}")

            # Clean up temporary files
            for temp_file in self._temp_files:
                try:
                    TempFileHelper.cleanup_file(temp_file)
                except Exception as e:
                    errors.append(f"File cleanup failed for {temp_file}: {e}")

            # Reset internal state
            self._created_objects.clear()
            self._temp_files.clear()
            self._cleanup_hooks.clear()

            if errors:
                logger.warning(f"Cleanup completed with {len(errors)} errors: {errors}")
            else:
                logger.debug("Fixture cleanup completed successfully")

        except Exception as e:
            logger.error(f"Critical cleanup failure: {e}")
            raise FixtureError(f"Cleanup failed: {e}")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit with automatic cleanup."""
        self.cleanup()
