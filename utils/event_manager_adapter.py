"""
Event Manager Adapter for Discord Reminder Bot.

This module provides a compatibility layer that allows the bot to work
with either the JSON-based or SQLite-based event management system
based on configuration settings.
"""

import logging
import os
from typing import Any, Dict, List, Optional, Union

import discord
from discord.ext import commands

from config.settings import Settings

# Get logger for this module
logger = logging.getLogger(__name__)

# Global event manager instance
_event_manager = None


def get_event_manager():
    """
    Get the appropriate event manager based on configuration.

    Returns:
        EventManager: Either SQLite or JSON-based event manager
    """
    global _event_manager

    if _event_manager is None:
        # Check if SQLite should be used
        use_sqlite = os.getenv("USE_SQLITE", "false").lower() in ["true", "1", "yes", "on"]

        if use_sqlite:
            logger.info("Using SQLite-based event manager")
            from utils.event_manager_sqlite import sqlite_event_manager

            _event_manager = sqlite_event_manager
        else:
            logger.info("Using JSON-based event manager")
            from utils.reminder_manager import event_manager

            _event_manager = event_manager

    return _event_manager


def get_scheduler_functions():
    """
    Get the appropriate scheduler functions based on configuration.

    Returns:
        tuple: (start_function, reschedule_function, set_bot_function)
    """
    use_sqlite = os.getenv("USE_SQLITE", "false").lower() in ["true", "1", "yes", "on"]

    if use_sqlite:
        from utils.scheduler_sqlite import (
            reschedule_reminders_sqlite,
            set_bot_instance,
            start_dynamic_reminder_system_sqlite,
        )

        return (
            start_dynamic_reminder_system_sqlite,
            reschedule_reminders_sqlite,
            set_bot_instance,
        )
    else:
        from commands.handlers import (
            reschedule_reminders,
            start_dynamic_reminder_system,
        )

        # JSON version doesn't need set_bot_instance
        return (
            start_dynamic_reminder_system,
            reschedule_reminders,
            lambda bot: None,
        )


class EventManagerAdapter:
    """
    Adapter class that provides a unified interface for both
    JSON and SQLite event managers.
    """

    def __init__(self):
        """Initialize the adapter."""
        self._manager = get_event_manager()
        self._use_sqlite = os.getenv("USE_SQLITE", "false").lower() in ["true", "1", "yes", "on"]

    @property
    def manager(self):
        """Get the underlying event manager."""
        return self._manager

    @property
    def is_sqlite(self) -> bool:
        """Check if using SQLite backend."""
        return self._use_sqlite

    @property
    def is_json(self) -> bool:
        """Check if using JSON backend."""
        return not self._use_sqlite

    # Unified interface methods
    async def add_event(self, event_data) -> bool:
        """Add a new event."""
        if self._use_sqlite:
            # Convert old Event object to SQLite parameters if needed
            if hasattr(event_data, "message_id"):
                return (
                    await self._manager.create_event(
                        guild_id=event_data.guild_id,
                        message_id=event_data.message_id,
                        channel_id=event_data.channel_id,
                        title=event_data.title,
                        interval_minutes=event_data.interval_minutes,
                        is_paused=event_data.is_paused,
                        last_reminder=event_data.last_reminder,
                        required_reactions=event_data.required_reactions,
                    )
                    is not None
                )
            else:
                return False
        else:
            return await self._manager.add_event(event_data)

    async def remove_event(self, message_id: int) -> bool:
        """Remove an event."""
        if self._use_sqlite:
            return await self._manager.delete_event(message_id)
        else:
            return await self._manager.remove_event(message_id)

    async def get_event(self, message_id: int) -> Optional[Any]:
        """Get an event by message ID."""
        return await self._manager.get_event(message_id)

    async def get_guild_events(self, guild_id: int) -> Union[List[Any], Dict[int, Any]]:
        """Get all events for a guild."""
        if self._use_sqlite:
            events = await self._manager.get_guild_events(guild_id)
            # Convert to dict for compatibility with JSON version
            return {event.message_id: event for event in events}
        else:
            return await self._manager.get_guild_events(guild_id)

    async def get_due_events(self) -> List[Any]:
        """Get all events that are due for notification."""
        return await self._manager.get_due_events()

    async def pause_event(self, message_id: int) -> bool:
        """Pause an event."""
        return await self._manager.pause_event(message_id)

    async def resume_event(self, message_id: int) -> bool:
        """Resume an event."""
        return await self._manager.resume_event(message_id)

    async def update_event_interval(self, message_id: int, new_interval_minutes: float) -> bool:
        """Update an event's interval."""
        return await self._manager.update_event_interval(message_id, new_interval_minutes)

    async def update_event_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """Update event reactions safely."""
        return await self._manager.update_event_reactions_safe(message_id, bot)

    async def schedule_reaction_update_debounced(
        self, message_id: int, bot: discord.Client
    ) -> None:
        """Schedule a debounced reaction update."""
        return await self._manager.schedule_reaction_update_debounced(message_id, bot)

    async def load_from_storage(self) -> bool:
        """Load events from storage."""
        return await self._manager.load_from_storage()

    async def save(self) -> bool:
        """Save events to storage."""
        return await self._manager.save()

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics."""
        stats = self._manager.get_stats()
        stats["backend_type"] = "SQLite" if self._use_sqlite else "JSON"
        return stats

    # Legacy compatibility properties
    @property
    def events(self) -> Dict[int, Any]:
        """Get events (legacy compatibility)."""
        if self._use_sqlite:
            # For SQLite, we need to query the database
            try:
                from models.database_models import Event

                events = Event.select()
                return {event.message_id: event for event in events}
            except Exception as e:
                logger.error(f"Failed to get events from SQLite: {e}")
                return {}
        else:
            return self._manager.events

    @property
    def reminders(self) -> Dict[int, Any]:
        """Get reminders (legacy compatibility)."""
        return self.events

    # Legacy method aliases
    async def add_reminder(self, reminder) -> bool:
        """Add a reminder (legacy compatibility)."""
        return await self.add_event(reminder)

    async def remove_reminder(self, message_id: int) -> bool:
        """Remove a reminder (legacy compatibility)."""
        return await self.remove_event(message_id)

    async def get_reminder(self, message_id: int) -> Optional[Any]:
        """Get a reminder (legacy compatibility)."""
        return await self.get_event(message_id)

    async def get_guild_reminders(self, guild_id: int) -> Union[List[Any], Dict[int, Any]]:
        """Get guild reminders (legacy compatibility)."""
        return await self.get_guild_events(guild_id)

    async def get_due_reminders(self) -> List[Any]:
        """Get due reminders (legacy compatibility)."""
        return await self.get_due_events()

    async def pause_reminder(self, message_id: int) -> bool:
        """Pause a reminder (legacy compatibility)."""
        return await self.pause_event(message_id)

    async def resume_reminder(self, message_id: int) -> bool:
        """Resume a reminder (legacy compatibility)."""
        return await self.resume_event(message_id)

    async def update_reminder_interval(self, message_id: int, new_interval_minutes: float) -> bool:
        """Update reminder interval (legacy compatibility)."""
        return await self.update_event_interval(message_id, new_interval_minutes)

    async def update_reminder_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """Update reminder reactions (legacy compatibility)."""
        return await self.update_event_reactions_safe(message_id, bot)


# Global adapter instance
event_manager_adapter = EventManagerAdapter()

# Legacy compatibility - export as the expected names
event_manager = event_manager_adapter
reminder_manager = event_manager_adapter


def setup_event_manager_for_bot(bot: commands.Bot) -> None:
    """
    Set up the event manager for the bot instance.

    Args:
        bot: The Discord bot instance
    """
    # Set the event manager on the bot for compatibility
    bot.event_manager = event_manager_adapter
    bot.reminder_manager = event_manager_adapter  # Legacy compatibility

    # Set up scheduler functions
    start_func, reschedule_func, set_bot_func = get_scheduler_functions()

    # Set bot instance for scheduler if needed
    set_bot_func(bot)

    # Add scheduler functions to bot
    bot.start_dynamic_reminder_system = start_func
    bot.reschedule_reminders = reschedule_func

    logger.info(
        f"Event manager configured for bot (backend: {'SQLite' if event_manager_adapter.is_sqlite else 'JSON'})"
    )


def get_backend_info() -> Dict[str, Any]:
    """
    Get information about the current backend configuration.

    Returns:
        Dict[str, Any]: Backend information
    """
    use_sqlite = os.getenv("USE_SQLITE", "false").lower() in ["true", "1", "yes", "on"]

    info = {
        "backend_type": "SQLite" if use_sqlite else "JSON",
        "use_sqlite": use_sqlite,
        "environment_variable": os.getenv("USE_SQLITE", "false"),
    }

    if use_sqlite:
        try:
            # Get database information
            import os

            db_path = "discord_bot.db"  # Default path

            if os.path.exists(db_path):
                db_size = os.path.getsize(db_path) / (1024 * 1024)  # MB
                info.update(
                    {
                        "database_path": db_path,
                        "database_size": round(db_size, 2),
                        "database_exists": True,
                    }
                )
            else:
                info.update({"database_path": db_path, "database_exists": False})

        except Exception as e:
            info["database_error"] = str(e)

    return info
