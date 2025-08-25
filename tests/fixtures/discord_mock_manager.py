"""
Advanced Discord Mock Manager for comprehensive testing.

Provides realistic, coherent Discord object mocks with relationship validation,
interaction tracking, and automatic behavior simulation for robust testing.
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from unittest.mock import AsyncMock, MagicMock, PropertyMock

logger = logging.getLogger(__name__)


class DiscordMockError(Exception):
    """Raised when Discord mock creation or validation fails."""

    pass


class InteractionTracker:
    """Tracks interactions with Discord mocks for validation."""

    def __init__(self):
        self.interactions = []
        self.method_calls = {}
        self.async_calls = {}

    def record_call(self, obj_type: str, obj_id: int, method: str, args: tuple, kwargs: dict):
        """Record a method call on a Discord mock."""
        interaction = {
            "timestamp": datetime.now(),
            "object_type": obj_type,
            "object_id": obj_id,
            "method": method,
            "args": args,
            "kwargs": kwargs,
        }
        self.interactions.append(interaction)

        # Update call counts
        key = f"{obj_type}_{obj_id}_{method}"
        if key not in self.method_calls:
            self.method_calls[key] = 0
        self.method_calls[key] += 1

    def get_call_count(self, obj_type: str, obj_id: int, method: str) -> int:
        """Get the number of times a specific method was called."""
        key = f"{obj_type}_{obj_id}_{method}"
        return self.method_calls.get(key, 0)

    def get_interactions_for_object(self, obj_type: str, obj_id: int) -> List[Dict]:
        """Get all interactions for a specific object."""
        return [
            interaction
            for interaction in self.interactions
            if interaction["object_type"] == obj_type and interaction["object_id"] == obj_id
        ]

    def clear(self):
        """Clear all interaction tracking."""
        self.interactions.clear()
        self.method_calls.clear()
        self.async_calls.clear()


class DiscordMockManager:
    """
    Advanced Discord mock manager with realistic behavior and validation.

    Features:
    - Coherent object relationships (guild -> channels -> messages)
    - Realistic snowflake IDs and Discord-like behavior
    - Interaction tracking and validation
    - Automatic error simulation
    - Performance testing support
    """

    def __init__(self):
        """Initialize the Discord mock manager."""
        self.tracker = InteractionTracker()
        self._id_counter = 100000000000000000  # Discord-like snowflake start
        self._created_objects = {}
        self._relationships = {
            "guild_channels": {},  # guild_id -> [channel_ids]
            "guild_members": {},  # guild_id -> [user_ids]
            "channel_messages": {},  # channel_id -> [message_ids]
            "message_reactions": {},  # message_id -> [reaction_data]
        }

    def _generate_snowflake(self) -> int:
        """Generate a Discord-like snowflake ID."""
        self._id_counter += 1
        return self._id_counter

    def _create_mock_with_tracking(self, obj_type: str, obj_id: int) -> MagicMock:
        """Create a mock with interaction tracking."""
        mock = MagicMock()

        # Wrap methods to track calls
        original_getattr = mock.__getattribute__

        def tracked_getattr(name):
            attr = original_getattr(name)
            if callable(attr) and not name.startswith("_"):

                def tracked_method(*args, **kwargs):
                    self.tracker.record_call(obj_type, obj_id, name, args, kwargs)
                    return attr(*args, **kwargs)

                return tracked_method
            return attr

        mock.__getattribute__ = tracked_getattr
        return mock

    # =============================================================================
    # Bot Mocks
    # =============================================================================

    def create_bot_mock(self, **kwargs) -> MagicMock:
        """Create a realistic Discord bot mock."""
        bot_id = kwargs.get("id", self._generate_snowflake())

        bot = self._create_mock_with_tracking("bot", bot_id)

        # Basic properties
        bot.user = MagicMock()
        bot.user.id = bot_id
        bot.user.name = kwargs.get("name", "TestBot")
        bot.user.discriminator = "0000"
        bot.user.bot = True

        # Async methods with realistic behavior
        bot.fetch_channel = AsyncMock()
        bot.fetch_guild = AsyncMock()
        bot.fetch_user = AsyncMock()
        bot.get_channel = MagicMock()
        bot.get_guild = MagicMock()
        bot.get_user = MagicMock()

        # Configure fetch methods to return appropriate mocks
        async def fetch_guild_impl(guild_id):
            if guild_id in self._created_objects.get("guilds", {}):
                return self._created_objects["guilds"][guild_id]
            return None

        async def fetch_channel_impl(channel_id):
            if channel_id in self._created_objects.get("channels", {}):
                return self._created_objects["channels"][channel_id]
            return None

        async def fetch_user_impl(user_id):
            if user_id in self._created_objects.get("users", {}):
                return self._created_objects["users"][user_id]
            return None

        bot.fetch_guild.side_effect = fetch_guild_impl
        bot.fetch_channel.side_effect = fetch_channel_impl
        bot.fetch_user.side_effect = fetch_user_impl

        # Store reference
        if "bots" not in self._created_objects:
            self._created_objects["bots"] = {}
        self._created_objects["bots"][bot_id] = bot

        logger.debug(f"Created bot mock: {bot.user.name} (ID: {bot_id})")
        return bot

    # =============================================================================
    # Guild Mocks
    # =============================================================================

    def create_guild_mock(self, **kwargs) -> MagicMock:
        """Create a realistic Discord guild mock."""
        guild_id = kwargs.get("id", self._generate_snowflake())

        guild = self._create_mock_with_tracking("guild", guild_id)

        # Basic properties
        guild.id = guild_id
        guild.name = kwargs.get("name", f"Test Guild {guild_id}")
        guild.member_count = kwargs.get("member_count", 100)
        guild.description = kwargs.get("description", "A test guild")
        guild.owner_id = kwargs.get("owner_id", self._generate_snowflake())

        # Collections
        guild.channels = MagicMock()
        guild.members = MagicMock()
        guild.roles = MagicMock()

        # Async methods
        guild.fetch_member = AsyncMock()
        guild.fetch_channel = AsyncMock()
        guild.ban = AsyncMock()
        guild.unban = AsyncMock()
        guild.create_text_channel = AsyncMock()
        guild.create_voice_channel = AsyncMock()

        # Configure fetch methods
        async def fetch_member_impl(user_id):
            if guild_id in self._relationships["guild_members"]:
                if user_id in self._relationships["guild_members"][guild_id]:
                    return self._created_objects.get("users", {}).get(user_id)
            return None

        async def fetch_channel_impl(channel_id):
            if guild_id in self._relationships["guild_channels"]:
                if channel_id in self._relationships["guild_channels"][guild_id]:
                    return self._created_objects.get("channels", {}).get(channel_id)
            return None

        guild.fetch_member.side_effect = fetch_member_impl
        guild.fetch_channel.side_effect = fetch_channel_impl

        # Store reference
        if "guilds" not in self._created_objects:
            self._created_objects["guilds"] = {}
        self._created_objects["guilds"][guild_id] = guild

        # Initialize relationships
        self._relationships["guild_channels"][guild_id] = []
        self._relationships["guild_members"][guild_id] = []

        logger.debug(f"Created guild mock: {guild.name} (ID: {guild_id})")
        return guild

    # =============================================================================
    # Channel Mocks
    # =============================================================================

    def create_channel_mock(self, guild_mock: Optional[MagicMock] = None, **kwargs) -> MagicMock:
        """Create a realistic Discord channel mock."""
        channel_id = kwargs.get("id", self._generate_snowflake())

        channel = self._create_mock_with_tracking("channel", channel_id)

        # Basic properties
        channel.id = channel_id
        channel.name = kwargs.get("name", f"test-channel-{channel_id}")
        channel.type = kwargs.get("type", "text")
        channel.topic = kwargs.get("topic", "A test channel")
        channel.position = kwargs.get("position", 0)

        # Guild relationship
        if guild_mock:
            channel.guild = guild_mock
            channel.guild_id = guild_mock.id
            # Add to guild's channels relationship
            if guild_mock.id not in self._relationships["guild_channels"]:
                self._relationships["guild_channels"][guild_mock.id] = []
            self._relationships["guild_channels"][guild_mock.id].append(channel_id)
        else:
            channel.guild = None
            channel.guild_id = None

        # Permissions
        channel.permissions_for = MagicMock()

        # Async methods
        channel.send = AsyncMock()
        channel.fetch_message = AsyncMock()
        channel.purge = AsyncMock()
        channel.set_permissions = AsyncMock()

        # Configure send method to return message mock
        async def send_impl(content=None, **send_kwargs):
            message = self.create_message_mock(
                channel=channel, content=content or "", **send_kwargs
            )
            return message

        channel.send.side_effect = send_impl

        # Configure fetch_message
        async def fetch_message_impl(message_id):
            if channel_id in self._relationships["channel_messages"]:
                if message_id in self._relationships["channel_messages"][channel_id]:
                    return self._created_objects.get("messages", {}).get(message_id)
            return None

        channel.fetch_message.side_effect = fetch_message_impl

        # Store reference
        if "channels" not in self._created_objects:
            self._created_objects["channels"] = {}
        self._created_objects["channels"][channel_id] = channel

        # Initialize message relationship
        self._relationships["channel_messages"][channel_id] = []

        logger.debug(f"Created channel mock: {channel.name} (ID: {channel_id})")
        return channel

    # =============================================================================
    # User Mocks
    # =============================================================================

    def create_user_mock(self, **kwargs) -> MagicMock:
        """Create a realistic Discord user mock."""
        user_id = kwargs.get("id", self._generate_snowflake())

        user = self._create_mock_with_tracking("user", user_id)

        # Basic properties
        user.id = user_id
        user.name = kwargs.get("name", f"TestUser{user_id}")
        user.discriminator = kwargs.get("discriminator", "0001")
        user.display_name = kwargs.get("display_name", user.name)
        user.bot = kwargs.get("bot", False)
        user.avatar = kwargs.get("avatar")

        # Async methods
        user.send = AsyncMock()
        user.fetch_message = AsyncMock()

        # Store reference
        if "users" not in self._created_objects:
            self._created_objects["users"] = {}
        self._created_objects["users"][user_id] = user

        logger.debug(f"Created user mock: {user.name}#{user.discriminator} (ID: {user_id})")
        return user

    # =============================================================================
    # Message Mocks
    # =============================================================================

    def create_message_mock(self, channel: Optional[MagicMock] = None, **kwargs) -> MagicMock:
        """Create a realistic Discord message mock."""
        message_id = kwargs.get("id", self._generate_snowflake())

        message = self._create_mock_with_tracking("message", message_id)

        # Basic properties
        message.id = message_id
        message.content = kwargs.get("content", "Test message")
        message.created_at = kwargs.get("created_at", datetime.now())

        # Author (create user if not provided)
        if "author" in kwargs:
            message.author = kwargs["author"]
        else:
            message.author = self.create_user_mock(name=kwargs.get("author_name", "TestAuthor"))

        # Channel relationship
        if channel:
            message.channel = channel
            message.guild = getattr(channel, "guild", None)
            # Add to channel's messages relationship
            if channel.id not in self._relationships["channel_messages"]:
                self._relationships["channel_messages"][channel.id] = []
            self._relationships["channel_messages"][channel.id].append(message_id)

        # Reactions
        message.reactions = []

        # Async methods
        message.add_reaction = AsyncMock()
        message.remove_reaction = AsyncMock()
        message.clear_reactions = AsyncMock()
        message.edit = AsyncMock()
        message.delete = AsyncMock()

        # Configure reaction methods
        async def add_reaction_impl(emoji):
            reaction_data = {
                "emoji": str(emoji),
                "count": 1,
                "me": False,
                "users": [message.author],
            }

            # Check if reaction already exists
            for reaction in message.reactions:
                if str(reaction["emoji"]) == str(emoji):
                    reaction["count"] += 1
                    reaction["users"].append(message.author)
                    return

            message.reactions.append(reaction_data)

            # Track in relationships
            if message_id not in self._relationships["message_reactions"]:
                self._relationships["message_reactions"][message_id] = []
            self._relationships["message_reactions"][message_id].append(reaction_data)

        message.add_reaction.side_effect = add_reaction_impl

        # Store reference
        if "messages" not in self._created_objects:
            self._created_objects["messages"] = {}
        self._created_objects["messages"][message_id] = message

        logger.debug(
            f"Created message mock: ID {message_id} in channel {getattr(channel, 'name', 'Unknown')}"
        )
        return message

    # =============================================================================
    # Composite Mock Creation
    # =============================================================================

    def create_complete_server_mock(
        self, guild_name: str = "Test Server", channel_count: int = 3, user_count: int = 5
    ) -> Dict[str, Any]:
        """Create a complete server setup with guild, channels, and users."""

        # Create guild
        guild = self.create_guild_mock(name=guild_name)

        # Create channels
        channels = []
        for i in range(channel_count):
            channel = self.create_channel_mock(guild_mock=guild, name=f"test-channel-{i+1}")
            channels.append(channel)

        # Create users and add them to guild
        users = []
        for i in range(user_count):
            user = self.create_user_mock(name=f"TestUser{i+1}")
            users.append(user)

            # Add user to guild members
            if guild.id not in self._relationships["guild_members"]:
                self._relationships["guild_members"][guild.id] = []
            self._relationships["guild_members"][guild.id].append(user.id)

        # Create some sample messages
        messages = []
        for channel in channels:
            for user in users[:2]:  # Only first 2 users send messages
                message = self.create_message_mock(
                    channel=channel, author=user, content=f"Test message from {user.name}"
                )
                messages.append(message)

        result = {
            "guild": guild,
            "channels": channels,
            "users": users,
            "messages": messages,
            "metadata": {
                "guild_id": guild.id,
                "created_at": datetime.now(),
                "total_objects": 1 + len(channels) + len(users) + len(messages),
            },
        }

        logger.info(
            f"Created complete server mock: {guild_name} with {result['metadata']['total_objects']} objects"
        )
        return result

    # =============================================================================
    # Validation and Analysis
    # =============================================================================

    def validate_mock_relationships(self) -> Dict[str, Any]:
        """Validate that all mock relationships are coherent."""
        validation_report = {"valid": True, "errors": [], "warnings": [], "stats": {}}

        try:
            # Check guild-channel relationships
            for guild_id, channel_ids in self._relationships["guild_channels"].items():
                guild = self._created_objects.get("guilds", {}).get(guild_id)
                if not guild:
                    validation_report["errors"].append(f"Guild {guild_id} referenced but not found")
                    validation_report["valid"] = False
                    continue

                for channel_id in channel_ids:
                    channel = self._created_objects.get("channels", {}).get(channel_id)
                    if not channel:
                        validation_report["errors"].append(
                            f"Channel {channel_id} referenced but not found"
                        )
                        validation_report["valid"] = False
                    elif channel.guild_id != guild_id:
                        validation_report["errors"].append(
                            f"Channel {channel_id} guild_id mismatch"
                        )
                        validation_report["valid"] = False

            # Check channel-message relationships
            for channel_id, message_ids in self._relationships["channel_messages"].items():
                channel = self._created_objects.get("channels", {}).get(channel_id)
                if not channel:
                    validation_report["errors"].append(
                        f"Channel {channel_id} referenced but not found"
                    )
                    validation_report["valid"] = False
                    continue

                for message_id in message_ids:
                    message = self._created_objects.get("messages", {}).get(message_id)
                    if not message:
                        validation_report["errors"].append(
                            f"Message {message_id} referenced but not found"
                        )
                        validation_report["valid"] = False

            # Generate stats
            validation_report["stats"] = {
                "total_objects": sum(len(obj_dict) for obj_dict in self._created_objects.values()),
                "by_type": {
                    obj_type: len(obj_dict) for obj_type, obj_dict in self._created_objects.items()
                },
                "relationships": {
                    rel_type: len(rel_dict) for rel_type, rel_dict in self._relationships.items()
                },
            }

            if validation_report["valid"]:
                logger.debug("Mock relationship validation passed")
            else:
                logger.warning(
                    f"Mock relationship validation failed with {len(validation_report['errors'])} errors"
                )

        except Exception as e:
            validation_report["valid"] = False
            validation_report["errors"].append(f"Validation error: {e}")
            logger.error(f"Mock validation failed: {e}")

        return validation_report

    def get_interaction_report(self) -> Dict[str, Any]:
        """Get a detailed report of all Discord mock interactions."""
        return {
            "total_interactions": len(self.tracker.interactions),
            "method_calls": dict(self.tracker.method_calls),
            "interactions_by_type": {},
            "most_called_methods": sorted(
                self.tracker.method_calls.items(), key=lambda x: x[1], reverse=True
            )[:10],
        }

    # =============================================================================
    # Cleanup Management
    # =============================================================================

    def cleanup(self):
        """Clean up all created mocks and tracking data."""
        self._created_objects.clear()
        self._relationships.clear()
        self.tracker.clear()
        self._id_counter = 100000000000000000
        logger.debug("Discord mock manager cleaned up")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit with automatic cleanup."""
        self.cleanup()
