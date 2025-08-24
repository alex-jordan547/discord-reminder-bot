"""
Thread-safe reminder management module for Discord Reminder Bot.

This module provides a centralized, thread-safe manager for handling
reminder operations with proper concurrency controls.
"""

import asyncio
import logging
from typing import Dict, Set, Optional, List, Any
from datetime import datetime

import discord

from models.reminder import Reminder
from utils.concurrency import (
    with_guild_lock,
    schedule_reaction_update,
    persistence_manager,
    concurrency_stats,
)
from utils.error_recovery import safe_fetch_message
from config.settings import Settings

# Get logger for this module
logger = logging.getLogger(__name__)


class ReminderManager:
    """
    Thread-safe manager for reminder operations.

    This class centralizes all reminder operations and ensures they are
    executed safely without race conditions.
    """

    def __init__(self):
        """Initialize the reminder manager."""
        self._reminders: Dict[int, Reminder] = {}
        self._guild_reminders: Dict[int, Set[int]] = {}  # guild_id -> set of message_ids

    @property
    def reminders(self) -> Dict[int, Reminder]:
        """Get a copy of all reminders."""
        return self._reminders.copy()

    async def add_reminder(self, reminder: Reminder) -> bool:
        """
        Add a new reminder with thread-safety.

        Args:
            reminder: The Reminder instance to add

        Returns:
            bool: True if added successfully, False otherwise
        """

        async def _add_operation():
            self._reminders[reminder.message_id] = reminder

            # Update guild index
            if reminder.guild_id not in self._guild_reminders:
                self._guild_reminders[reminder.guild_id] = set()
            self._guild_reminders[reminder.guild_id].add(reminder.message_id)

            logger.info(
                f"Added reminder for message {reminder.message_id} in guild {reminder.guild_id}"
            )
            return True

        try:
            result = await with_guild_lock(reminder.guild_id, _add_operation)
            if result:
                await self._save_reminders_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to add reminder for message {reminder.message_id}: {e}")
            return False

    async def remove_reminder(self, message_id: int) -> bool:
        """
        Remove a reminder with thread-safety.

        Args:
            message_id: The message ID of the reminder to remove

        Returns:
            bool: True if removed successfully, False if not found
        """
        if message_id not in self._reminders:
            return False

        reminder = self._reminders[message_id]
        guild_id = reminder.guild_id

        async def _remove_operation():
            del self._reminders[message_id]

            # Update guild index
            if guild_id in self._guild_reminders:
                self._guild_reminders[guild_id].discard(message_id)
                if not self._guild_reminders[guild_id]:
                    del self._guild_reminders[guild_id]

            logger.info(f"Removed reminder for message {message_id} from guild {guild_id}")
            return True

        try:
            result = await with_guild_lock(guild_id, _remove_operation)
            if result:
                await self._save_reminders_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to remove reminder for message {message_id}: {e}")
            return False

    async def get_reminder(self, message_id: int) -> Optional[Reminder]:
        """
        Get a reminder by message ID.

        Args:
            message_id: The message ID to look up

        Returns:
            Optional[Reminder]: The reminder if found, None otherwise
        """
        return self._reminders.get(message_id)

    async def get_guild_reminders(self, guild_id: int) -> Dict[int, Reminder]:
        """
        Get all reminders for a specific guild.

        Args:
            guild_id: The guild ID

        Returns:
            Dict[int, Reminder]: Dictionary of message_id -> Reminder for the guild
        """
        if guild_id not in self._guild_reminders:
            return {}

        return {
            msg_id: self._reminders[msg_id]
            for msg_id in self._guild_reminders[guild_id]
            if msg_id in self._reminders
        }

    async def update_reminder_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """
        Update reminder reactions in a thread-safe manner.

        Args:
            message_id: The message ID to update
            bot: The Discord bot client

        Returns:
            bool: True if updated successfully, False otherwise
        """
        if message_id not in self._reminders:
            return False

        reminder = self._reminders[message_id]

        async def _update_operation():
            # Get the Discord message
            channel = bot.get_channel(reminder.channel_id)
            if not channel or not hasattr(channel, "fetch_message"):
                logger.error(f"Could not find text channel {reminder.channel_id}")
                return False

            message = await safe_fetch_message(channel, reminder.message_id)
            if not message:
                logger.error(f"Could not fetch message {reminder.message_id}")
                return False

            # Update reactions
            reminder.users_who_reacted.clear()
            for reaction in message.reactions:
                if reaction.emoji in reminder.required_reactions:
                    async for user in reaction.users():
                        if not user.bot:
                            reminder.users_who_reacted.add(user.id)

            logger.debug(
                f"Updated reactions for reminder {message_id}: {len(reminder.users_who_reacted)} users"
            )
            return True

        try:
            result = await with_guild_lock(reminder.guild_id, _update_operation)
            if result:
                await self._save_reminders_safe()
                concurrency_stats.increment_stat("reaction_updates_processed")
            return result
        except Exception as e:
            logger.error(f"Failed to update reactions for message {message_id}: {e}")
            return False

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
            message_id, self.update_reminder_reactions_safe, message_id, bot
        )
        concurrency_stats.increment_stat("reaction_updates_debounced")

    async def pause_reminder(self, message_id: int) -> bool:
        """
        Pause a reminder with thread-safety.

        Args:
            message_id: The message ID of the reminder to pause

        Returns:
            bool: True if paused successfully, False if not found
        """
        if message_id not in self._reminders:
            return False

        reminder = self._reminders[message_id]

        async def _pause_operation():
            reminder.is_paused = True
            logger.info(f"Paused reminder for message {message_id}")
            return True

        try:
            result = await with_guild_lock(reminder.guild_id, _pause_operation)
            if result:
                await self._save_reminders_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to pause reminder for message {message_id}: {e}")
            return False

    async def resume_reminder(self, message_id: int) -> bool:
        """
        Resume a paused reminder with thread-safety.

        Args:
            message_id: The message ID of the reminder to resume

        Returns:
            bool: True if resumed successfully, False if not found
        """
        if message_id not in self._reminders:
            return False

        reminder = self._reminders[message_id]

        async def _resume_operation():
            reminder.is_paused = False
            logger.info(f"Resumed reminder for message {message_id}")
            return True

        try:
            result = await with_guild_lock(reminder.guild_id, _resume_operation)
            if result:
                await self._save_reminders_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to resume reminder for message {message_id}: {e}")
            return False

    async def update_reminder_interval(self, message_id: int, new_interval_minutes: int) -> bool:
        """
        Update a reminder's interval with thread-safety.

        Args:
            message_id: The message ID of the reminder
            new_interval_minutes: New interval in minutes

        Returns:
            bool: True if updated successfully, False if not found
        """
        if message_id not in self._reminders:
            return False

        reminder = self._reminders[message_id]
        validated_interval = Settings.validate_interval_minutes(new_interval_minutes)

        async def _update_interval_operation():
            reminder.interval_minutes = validated_interval
            logger.info(
                f"Updated interval for reminder {message_id} to {validated_interval} minutes"
            )
            return True

        try:
            result = await with_guild_lock(reminder.guild_id, _update_interval_operation)
            if result:
                await self._save_reminders_safe()
            return result
        except Exception as e:
            logger.error(f"Failed to update interval for reminder {message_id}: {e}")
            return False

    async def get_due_reminders(self) -> List[Reminder]:
        """
        Get all reminders that are due for notification.

        Returns:
            List[Reminder]: List of reminders that need to be sent
        """
        due_reminders = []
        current_time = datetime.now()

        for reminder in self._reminders.values():
            if not reminder.is_paused:
                next_reminder_time = reminder.get_next_reminder_time()
                if next_reminder_time <= current_time:
                    due_reminders.append(reminder)

        return due_reminders

    async def load_from_storage(self) -> bool:
        """
        Load reminders from storage with thread-safety.

        Returns:
            bool: True if loaded successfully, False otherwise
        """
        try:
            # Use the thread-safe persistence manager instead of the old system
            result = await persistence_manager.load_reminders_safe()
            if result:
                loaded_reminders = result

                self._reminders = loaded_reminders
                self._guild_reminders.clear()

                # Rebuild guild index
                for message_id, reminder in loaded_reminders.items():
                    if reminder.guild_id not in self._guild_reminders:
                        self._guild_reminders[reminder.guild_id] = set()
                    self._guild_reminders[reminder.guild_id].add(message_id)

                logger.info(f"Loaded {len(loaded_reminders)} reminders from storage")
                return True
            else:
                # No reminders found or empty file - this is normal for a fresh start
                logger.info("No existing reminders found - starting with empty reminder list")
                return True
        except Exception as e:
            logger.error(f"Failed to load reminders from storage: {e}")
            return False

    async def _save_reminders_safe(self) -> bool:
        """
        Save reminders to storage using thread-safe persistence.

        Returns:
            bool: True if saved successfully, False otherwise
        """
        try:
            result = await persistence_manager.save_reminders_safe(
                self._reminders, Settings.REMINDERS_SAVE_FILE
            )
            if result:
                concurrency_stats.increment_stat("save_operations")
            return result
        except Exception as e:
            logger.error(f"Failed to save reminders: {e}")
            return False

    async def save(self) -> bool:
        """
        Trigger a manual save of all reminders.

        Returns:
            bool: True if saved successfully, False otherwise
        """
        return await self._save_reminders_safe()

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the reminder manager.

        Returns:
            Dict[str, Any]: Statistics dictionary
        """
        active_reminders = sum(1 for r in self._reminders.values() if not r.is_paused)
        paused_reminders = sum(1 for r in self._reminders.values() if r.is_paused)

        return {
            "total_reminders": len(self._reminders),
            "active_reminders": active_reminders,
            "paused_reminders": paused_reminders,
            "guilds_with_reminders": len(self._guild_reminders),
            "average_reminders_per_guild": (
                len(self._reminders) / len(self._guild_reminders) if self._guild_reminders else 0
            ),
        }


# Global instance for the application
reminder_manager = ReminderManager()
