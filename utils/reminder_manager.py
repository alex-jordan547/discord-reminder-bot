"""
Thread-safe event management module for Discord Reminder Bot.

This module provides a centralized, thread-safe manager for handling
event operations with proper concurrency controls.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import discord

from config.settings import Settings
from models.reminder import Event
from utils.concurrency import (
    concurrency_stats,
    persistence_manager,
    schedule_reaction_update,
    with_guild_lock,
)
from utils.error_recovery import safe_fetch_message

# Get logger for this module
logger = logging.getLogger(__name__)


class EventManager:
    """
    Thread-safe manager for event operations.

    This class centralizes all event operations and ensures they are
    executed safely without race conditions.
    """

    def __init__(self):
        """Initialize the event manager."""
        self._events: Dict[int, Event] = {}
        self._guild_events: Dict[int, Set[int]] = {}  # guild_id -> set of message_ids

    @property
    def events(self) -> Dict[int, Event]:
        """Get a copy of all events."""
        return self._events.copy()
    
    @property
    def reminders(self) -> Dict[int, Event]:
        """Get a copy of all events (legacy compatibility)."""
        return self._events.copy()

    async def add_event(self, event: Event) -> bool:
        """
        Add a new event with thread-safety.

        Args:
            event: The Event instance to add

        Returns:
            bool: True if added successfully, False otherwise
        """

        async def _add_operation():
            self._events[event.message_id] = event

            # Update guild index
            if event.guild_id not in self._guild_events:
                self._guild_events[event.guild_id] = set()
            self._guild_events[event.guild_id].add(event.message_id)

            logger.info(
                f"Added event for message {event.message_id} in guild {event.guild_id}"
            )
            return True

        try:
            result = await with_guild_lock(event.guild_id, _add_operation)
            if result:
                await self._save_events_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to add event for message {event.message_id}: {e}")
            return False
    
    async def add_reminder(self, reminder: Event) -> bool:
        """Add a new event (legacy compatibility)."""
        return await self.add_event(reminder)

    async def remove_event(self, message_id: int) -> bool:
        """
        Remove an event with thread-safety.

        Args:
            message_id: The message ID of the event to remove

        Returns:
            bool: True if removed successfully, False if not found
        """
        if message_id not in self._events:
            return False

        event = self._events[message_id]
        guild_id = event.guild_id

        async def _remove_operation():
            del self._events[message_id]

            # Update guild index
            if guild_id in self._guild_events:
                self._guild_events[guild_id].discard(message_id)
                if not self._guild_events[guild_id]:
                    del self._guild_events[guild_id]

            logger.info(f"Removed event for message {message_id} from guild {guild_id}")
            return True

        try:
            result = await with_guild_lock(guild_id, _remove_operation)
            if result:
                await self._save_events_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to remove event for message {message_id}: {e}")
            return False
    
    async def remove_reminder(self, message_id: int) -> bool:
        """Remove an event (legacy compatibility)."""
        return await self.remove_event(message_id)

    async def get_event(self, message_id: int) -> Optional[Event]:
        """
        Get an event by message ID.

        Args:
            message_id: The message ID to look up

        Returns:
            Optional[Event]: The event if found, None otherwise
        """
        return self._events.get(message_id)
    
    async def get_reminder(self, message_id: int) -> Optional[Event]:
        """Get an event by message ID (legacy compatibility)."""
        return self._events.get(message_id)

    async def get_guild_events(self, guild_id: int) -> Dict[int, Event]:
        """
        Get all events for a specific guild.

        Args:
            guild_id: The guild ID

        Returns:
            Dict[int, Event]: Dictionary of message_id -> Event for the guild
        """
        if guild_id not in self._guild_events:
            return {}

        return {
            msg_id: self._events[msg_id]
            for msg_id in self._guild_events[guild_id]
            if msg_id in self._events
        }
    
    async def get_guild_reminders(self, guild_id: int) -> Dict[int, Event]:
        """Get all events for a specific guild (legacy compatibility)."""
        return await self.get_guild_events(guild_id)

    async def update_event_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """
        Update event reactions in a thread-safe manner.

        Args:
            message_id: The message ID to update
            bot: The Discord bot client

        Returns:
            bool: True if updated successfully, False otherwise
        """
        if message_id not in self._events:
            return False

        event = self._events[message_id]

        async def _update_operation():
            # Get the Discord message
            channel = bot.get_channel(event.channel_id)
            if not channel or not hasattr(channel, "fetch_message"):
                logger.error(f"Could not find text channel {event.channel_id}")
                return False

            message = await safe_fetch_message(channel, event.message_id)
            if not message:
                logger.error(f"Could not fetch message {event.message_id}")
                return False

            # Update reactions
            event.users_who_reacted.clear()
            for reaction in message.reactions:
                if reaction.emoji in event.required_reactions:
                    async for user in reaction.users():
                        if not user.bot:
                            event.users_who_reacted.add(user.id)

            logger.debug(
                f"Updated reactions for event {message_id}: "
                f"{len(event.users_who_reacted)} users"
            )
            return True

        try:
            result = await with_guild_lock(event.guild_id, _update_operation)
            if result:
                await self._save_events_safe()
                concurrency_stats.increment_stat("reaction_updates_processed")
            return result
        except Exception as e:
            logger.error(f"Failed to update reactions for message {message_id}: {e}")
            return False
    
    async def update_reminder_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """Update event reactions (legacy compatibility)."""
        return await self.update_event_reactions_safe(message_id, bot)

    async def schedule_reaction_update_debounced(
        self, message_id: int, bot: discord.Client
    ) -> None:
        """
        Schedule a debounced reaction update to prevent rapid successive updates.

        Args:
            message_id: The message ID to update
            bot: The Discord bot client
        """
        await schedule_reaction_update(
            message_id, self.update_event_reactions_safe, message_id, bot
        )
        concurrency_stats.increment_stat("reaction_updates_debounced")

    async def pause_event(self, message_id: int) -> bool:
        """
        Pause an event with thread-safety.

        Args:
            message_id: The message ID of the event to pause

        Returns:
            bool: True if paused successfully, False if not found
        """
        if message_id not in self._events:
            return False

        event = self._events[message_id]

        async def _pause_operation():
            event.is_paused = True
            logger.info(f"Paused event for message {message_id}")
            return True

        try:
            result = await with_guild_lock(event.guild_id, _pause_operation)
            if result:
                await self._save_events_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to pause event for message {message_id}: {e}")
            return False
    
    async def pause_reminder(self, message_id: int) -> bool:
        """Pause an event (legacy compatibility)."""
        return await self.pause_event(message_id)

    async def resume_event(self, message_id: int) -> bool:
        """
        Resume a paused event with thread-safety.

        Args:
            message_id: The message ID of the event to resume

        Returns:
            bool: True if resumed successfully, False if not found
        """
        if message_id not in self._events:
            return False

        event = self._events[message_id]

        async def _resume_operation():
            event.is_paused = False
            logger.info(f"Resumed event for message {message_id}")
            return True

        try:
            result = await with_guild_lock(event.guild_id, _resume_operation)
            if result:
                await self._save_events_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to resume event for message {message_id}: {e}")
            return False
    
    async def resume_reminder(self, message_id: int) -> bool:
        """Resume an event (legacy compatibility)."""
        return await self.resume_event(message_id)

    async def update_event_interval(self, message_id: int, new_interval_minutes: int) -> bool:
        """
        Update an event's interval with thread-safety.

        Args:
            message_id: The message ID of the event
            new_interval_minutes: New interval in minutes

        Returns:
            bool: True if updated successfully, False if not found
        """
        if message_id not in self._events:
            return False

        event = self._events[message_id]
        validated_interval = Settings.validate_interval_minutes(new_interval_minutes)

        async def _update_interval_operation():
            event.interval_minutes = validated_interval
            logger.info(
                f"Updated interval for event {message_id} to {validated_interval} minutes"
            )
            return True

        try:
            result = await with_guild_lock(event.guild_id, _update_interval_operation)
            if result:
                await self._save_events_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to update interval for event {message_id}: {e}")
            return False
    
    async def update_reminder_interval(self, message_id: int, new_interval_minutes: int) -> bool:
        """Update an event's interval (legacy compatibility)."""
        return await self.update_event_interval(message_id, new_interval_minutes)

    async def get_due_events(self) -> List[Event]:
        """
        Get all events that are due for notification.

        Returns:
            List[Event]: List of events that need to be sent
        """
        due_events = []
        current_time = datetime.now()

        for event in self._events.values():
            if not event.is_paused:
                next_reminder_time = event.get_next_reminder_time()
                if next_reminder_time <= current_time:
                    due_events.append(event)

        return due_events
    
    async def get_due_reminders(self) -> List[Event]:
        """Get all events that are due for notification (legacy compatibility)."""
        return await self.get_due_events()

    async def load_from_storage(self) -> bool:
        """
        Load events from storage with thread-safety.

        Returns:
            bool: True if loaded successfully, False otherwise
        """
        try:
            # Use the thread-safe persistence manager instead of the old system
            result = await persistence_manager.load_reminders_safe()
            if result:
                loaded_events = result

                self._events = loaded_events
                self._guild_events.clear()

                # Rebuild guild index
                for message_id, event in loaded_events.items():
                    if event.guild_id not in self._guild_events:
                        self._guild_events[event.guild_id] = set()
                    self._guild_events[event.guild_id].add(message_id)

                logger.info(f"Loaded {len(loaded_events)} events from storage")
                return True
            else:
                # No events found or empty file - this is normal for a fresh start
                logger.info("No existing events found - starting with empty event list")
                return True
        except Exception as e:
            logger.error(f"Failed to load events from storage: {e}")
            return False

    async def _save_events_safe(self) -> bool:
        """
        Save events to storage using thread-safe persistence.

        Returns:
            bool: True if saved successfully, False otherwise
        """
        try:
            result = await persistence_manager.save_reminders_safe(
                self._events, Settings.REMINDERS_SAVE_FILE
            )
            if result:
                concurrency_stats.increment_stat("save_operations")
            return result
        except Exception as e:
            logger.error(f"Failed to save events: {e}")
            return False
    
    async def _save_reminders_safe(self) -> bool:
        """Save events to storage (legacy compatibility)."""
        return await self._save_events_safe()

    async def save(self) -> bool:
        """
        Trigger a manual save of all events.

        Returns:
            bool: True if saved successfully, False otherwise
        """
        return await self._save_events_safe()

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the event manager.

        Returns:
            Dict[str, Any]: Statistics dictionary
        """
        active_events = sum(1 for e in self._events.values() if not e.is_paused)
        paused_events = sum(1 for e in self._events.values() if e.is_paused)

        return {
            "total_events": len(self._events),
            "active_events": active_events,
            "paused_events": paused_events,
            "guilds_with_events": len(self._guild_events),
            "average_events_per_guild": (
                len(self._events) / len(self._guild_events) if self._guild_events else 0
            ),
            # Legacy compatibility
            "total_reminders": len(self._events),
            "active_reminders": active_events,
            "paused_reminders": paused_events,
            "guilds_with_reminders": len(self._guild_events),
            "average_reminders_per_guild": (
                len(self._events) / len(self._guild_events) if self._guild_events else 0
            ),
        }


# Global instance for the application
event_manager = EventManager()

# Legacy compatibility
reminder_manager = event_manager
ReminderManager = EventManager
