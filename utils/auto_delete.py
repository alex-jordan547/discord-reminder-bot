"""
Auto-deletion management for Discord Reminder Bot.

This module handles the automatic deletion of reminder messages
after a configurable delay to prevent channel pollution.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Set, Optional
from dataclasses import dataclass

import discord

from config.settings import Settings

# Get logger for this module
logger = logging.getLogger(__name__)


@dataclass
class PendingDeletion:
    """Represents a message scheduled for deletion."""
    message_id: int
    channel_id: int
    guild_id: int
    deletion_time: datetime
    task: Optional[asyncio.Task] = None


class AutoDeleteManager:
    """
    Manages automatic deletion of reminder messages.

    This manager schedules messages for deletion after a configurable
    delay and handles cleanup to prevent channel pollution.
    """

    def __init__(self, bot: discord.Client):
        """Initialize the auto-delete manager."""
        self.bot = bot
        self._pending_deletions: Dict[int, PendingDeletion] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._shutdown = False

    async def start(self):
        """Start the auto-delete manager and its cleanup task."""
        if not Settings.AUTO_DELETE_REMINDERS:
            logger.info("Auto-deletion disabled, manager will not start")
            return

        logger.info(f"Starting auto-delete manager (delay: {Settings.format_auto_delete_display(Settings.AUTO_DELETE_DELAY_HOURS)})")
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        """Stop the auto-delete manager and cancel all pending deletions."""
        logger.info("Stopping auto-delete manager...")
        self._shutdown = True

        # Cancel all pending deletion tasks
        for pending in self._pending_deletions.values():
            if pending.task and not pending.task.done():
                pending.task.cancel()

        # Cancel the cleanup task
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()

        self._pending_deletions.clear()
        logger.info("Auto-delete manager stopped")

    async def schedule_deletion(self, message: discord.Message, delay_hours: Optional[float] = None) -> bool:
        """
        Schedule a message for automatic deletion.

        Args:
            message: Discord message to schedule for deletion
            delay_hours: Custom delay in hours (uses default if None)

        Returns:
            bool: True if scheduled successfully, False otherwise
        """
        if not Settings.AUTO_DELETE_REMINDERS:
            return False

        if delay_hours is None:
            delay_hours = Settings.AUTO_DELETE_DELAY_HOURS

        # Validate the delay
        delay_hours = Settings.validate_auto_delete_hours(delay_hours)
        deletion_time = datetime.now() + timedelta(hours=delay_hours)

        # Cancel existing deletion if any
        await self.cancel_deletion(message.id)

        # Create the deletion task
        deletion_task = asyncio.create_task(
            self._delete_message_after_delay(message, delay_hours)
        )

        # Store the pending deletion
        pending = PendingDeletion(
            message_id=message.id,
            channel_id=message.channel.id,
            guild_id=message.guild.id if message.guild else 0,
            deletion_time=deletion_time,
            task=deletion_task
        )

        self._pending_deletions[message.id] = pending

        logger.info(
            f"Scheduled message {message.id} for deletion in "
            f"{Settings.format_auto_delete_display(delay_hours)} "
            f"(at {deletion_time.strftime('%Y-%m-%d %H:%M:%S')})"
        )

        return True

    async def cancel_deletion(self, message_id: int) -> bool:
        """
        Cancel a scheduled deletion.

        Args:
            message_id: ID of the message to cancel deletion for

        Returns:
            bool: True if cancellation was successful, False if not found
        """
        if message_id not in self._pending_deletions:
            return False

        pending = self._pending_deletions[message_id]

        # Cancel the task
        if pending.task and not pending.task.done():
            pending.task.cancel()

        # Remove from pending deletions
        del self._pending_deletions[message_id]

        logger.info(f"Cancelled scheduled deletion for message {message_id}")
        return True

    async def update_deletion_delay(self, message_id: int, new_delay_hours: float) -> bool:
        """
        Update the deletion delay for a scheduled message.

        Args:
            message_id: ID of the message to update
            new_delay_hours: New delay in hours

        Returns:
            bool: True if update was successful, False if message not found
        """
        if message_id not in self._pending_deletions:
            return False

        pending = self._pending_deletions[message_id]

        # Get the original message
        try:
            channel = self.bot.get_channel(pending.channel_id)
            if not channel:
                return False

            message = await channel.fetch_message(message_id)
            if not message:
                return False

            # Cancel current deletion and schedule new one
            await self.cancel_deletion(message_id)
            return await self.schedule_deletion(message, new_delay_hours)

        except Exception as e:
            logger.error(f"Failed to update deletion delay for message {message_id}: {e}")
            return False

    def get_pending_count(self) -> int:
        """Get the number of messages scheduled for deletion."""
        return len(self._pending_deletions)

    def get_pending_deletions(self) -> Dict[int, datetime]:
        """Get a dictionary of message IDs and their scheduled deletion times."""
        return {
            msg_id: pending.deletion_time
            for msg_id, pending in self._pending_deletions.items()
        }

    async def _delete_message_after_delay(self, message: discord.Message, delay_hours: float):
        """
        Internal method to delete a message after the specified delay.

        Args:
            message: Discord message to delete
            delay_hours: Delay in hours before deletion
        """
        try:
            # Wait for the specified delay
            delay_seconds = delay_hours * 3600
            await asyncio.sleep(delay_seconds)

            # Check if we've been shut down
            if self._shutdown:
                return

            # Try to delete the message
            try:
                await message.delete()
                logger.info(f"Auto-deleted reminder message {message.id}")
            except discord.NotFound:
                logger.debug(f"Message {message.id} already deleted")
            except discord.Forbidden:
                logger.warning(f"No permission to delete message {message.id}")
            except Exception as e:
                logger.error(f"Failed to delete message {message.id}: {e}")

        except asyncio.CancelledError:
            logger.debug(f"Deletion task cancelled for message {message.id}")
        except Exception as e:
            logger.error(f"Unexpected error in deletion task for message {message.id}: {e}")
        finally:
            # Clean up the pending deletion entry
            self._pending_deletions.pop(message.id, None)

    async def _cleanup_loop(self):
        """
        Background task to clean up expired deletion entries.
        Runs every hour to remove stale entries.
        """
        try:
            while not self._shutdown:
                await asyncio.sleep(3600)  # Run every hour

                if self._shutdown:
                    break

                # Clean up completed or failed tasks
                to_remove = []
                for message_id, pending in self._pending_deletions.items():
                    if pending.task and pending.task.done():
                        to_remove.append(message_id)

                for message_id in to_remove:
                    self._pending_deletions.pop(message_id, None)

                if to_remove:
                    logger.debug(f"Cleaned up {len(to_remove)} completed deletion tasks")

        except asyncio.CancelledError:
            logger.debug("Auto-delete cleanup loop cancelled")
        except Exception as e:
            logger.error(f"Error in auto-delete cleanup loop: {e}")


# Global instance (initialized when bot starts)
auto_delete_manager: Optional[AutoDeleteManager] = None


def init_auto_delete_manager(bot: discord.Client) -> AutoDeleteManager:
    """
    Initialize the global auto-delete manager.

    Args:
        bot: Discord bot instance

    Returns:
        AutoDeleteManager: The initialized manager
    """
    global auto_delete_manager
    auto_delete_manager = AutoDeleteManager(bot)
    return auto_delete_manager


def get_auto_delete_manager() -> Optional[AutoDeleteManager]:
    """
    Get the global auto-delete manager instance.

    Returns:
        AutoDeleteManager or None: The manager instance if initialized
    """
    return auto_delete_manager
