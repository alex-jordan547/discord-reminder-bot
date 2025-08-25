"""
Concurrency management module for Discord Reminder Bot.

This module provides thread-safe operations and synchronization mechanisms
to prevent race conditions in the generalized reminder system.
"""

import asyncio
import logging
import threading
from datetime import datetime
from typing import Any, Dict, Set

from models.database_models import Event

# Get logger for this module
logger = logging.getLogger(__name__)


class ReminderLockManager:
    """
    Manages async locks for reminder operations to prevent race conditions.

    This class provides per-guild locking to ensure thread-safety when
    updating reminder data structures.
    """

    def __init__(self):
        """Initialize the lock manager."""
        self._guild_locks: Dict[int, asyncio.Lock] = {}
        self._lock_creation_lock = asyncio.Lock()

    async def get_guild_lock(self, guild_id: int) -> asyncio.Lock:
        """
        Get or create an async lock for a specific guild.

        Args:
            guild_id: The Discord guild ID

        Returns:
            asyncio.Lock: Lock for the specified guild
        """
        if guild_id not in self._guild_locks:
            async with self._lock_creation_lock:
                if guild_id not in self._guild_locks:
                    self._guild_locks[guild_id] = asyncio.Lock()

        return self._guild_locks[guild_id]

    async def cleanup_unused_locks(self, active_guild_ids: Set[int]) -> None:
        """
        Clean up locks for guilds that are no longer active.

        Args:
            active_guild_ids: Set of currently active guild IDs
        """
        async with self._lock_creation_lock:
            unused_guilds = set(self._guild_locks.keys()) - active_guild_ids
            for guild_id in unused_guilds:
                del self._guild_locks[guild_id]
                logger.debug(f"Cleaned up lock for inactive guild {guild_id}")


class ReactionUpdateQueue:
    """
    Manages a queue for processing reaction updates to prevent race conditions.

    This class ensures that reaction updates are processed sequentially
    per message, avoiding conflicts when multiple reactions occur simultaneously.
    """

    def __init__(self, delay: float = 1.0):
        """
        Initialize the reaction update queue.

        Args:
            delay: Debouncing delay in seconds (default: 1.0)
        """
        self.delay = delay
        self._pending_updates: Dict[int, asyncio.Task] = {}
        self._processing_lock = asyncio.Lock()

    async def schedule_update(self, message_id: int, update_function, *args, **kwargs) -> None:
        """
        Schedule a reaction update with debouncing.

        Args:
            message_id: The Discord message ID
            update_function: Function to call for the update
            *args: Arguments for the update function
            **kwargs: Keyword arguments for the update function
        """
        async with self._processing_lock:
            # Cancel any pending update for this message
            if message_id in self._pending_updates:
                self._pending_updates[message_id].cancel()
                logger.debug(f"Cancelled pending reaction update for message {message_id}")

            # Schedule new update
            self._pending_updates[message_id] = asyncio.create_task(
                self._delayed_update(message_id, update_function, *args, **kwargs)
            )
            logger.debug(
                f"Scheduled reaction update for message {message_id} with {self.delay}s delay"
            )

    async def _delayed_update(self, message_id: int, update_function, *args, **kwargs) -> None:
        """
        Execute the update after the debouncing delay.

        Args:
            message_id: The Discord message ID
            update_function: Function to call for the update
            *args: Arguments for the update function
            **kwargs: Keyword arguments for the update function
        """
        try:
            await asyncio.sleep(self.delay)
            await update_function(*args, **kwargs)
            logger.debug(f"Completed reaction update for message {message_id}")
        except asyncio.CancelledError:
            logger.debug(f"Reaction update cancelled for message {message_id}")
            raise
        except Exception as e:
            logger.error(f"Error during reaction update for message {message_id}: {e}")
        finally:
            # Clean up completed task
            async with self._processing_lock:
                self._pending_updates.pop(message_id, None)

    async def flush_all_updates(self) -> None:
        """Wait for all pending updates to complete."""
        pending_tasks = list(self._pending_updates.values())
        if pending_tasks:
            logger.info(f"Waiting for {len(pending_tasks)} pending reaction updates to complete")
            await asyncio.gather(*pending_tasks, return_exceptions=True)


class ThreadSafePersistence:
    """
    Thread-safe persistence manager for reminder data.

    This class ensures that file operations are atomic and protected
    against concurrent modifications.
    """

    def __init__(self):
        """Initialize the persistence manager."""
        self._write_lock = asyncio.Lock()
        self._pending_saves: Set[str] = set()

    async def save_reminders_safe(self, reminders: Dict[int, Event], file_path: str) -> bool:
        """
        Save reminders to file in a thread-safe manner.

        Args:
            reminders: Dictionary of reminders to save
            file_path: Path to the save file

        Returns:
            bool: True if save was successful, False otherwise
        """
        async with self._write_lock:
            if file_path in self._pending_saves:
                logger.debug(f"Save already in progress for {file_path}, skipping")
                return True

            self._pending_saves.add(file_path)
            try:
                # Note: This method is deprecated with SQLite migration
                # Events are now saved automatically via ORM
                result = True
                if result:
                    logger.debug(f"Successfully saved {len(reminders)} reminders to {file_path}")
                else:
                    logger.error(f"Failed to save reminders to {file_path}")
                return result
            finally:
                self._pending_saves.discard(file_path)

    async def load_reminders_safe(self, file_path: str = None) -> Dict[int, Event]:
        """
        Load reminders from file in a thread-safe manner.

        Args:
            file_path: Path to the file to load from (optional, defaults to watched_reminders.json)

        Returns:
            Dict[int, Event]: Dictionary of loaded reminders
        """
        async with self._write_lock:
            try:
                # Note: This method is deprecated with SQLite migration
                # Events are now loaded via EventManager
                logger.debug("Loading reminders via SQLite (legacy method deprecated)")
                return {}
            except Exception as e:
                logger.error(f"Failed to load reminders from storage: {e}")
                return {}


class ConcurrencyStats:
    """
    Thread-safe statistics tracking for concurrency operations.

    This class tracks various metrics related to concurrent operations
    to help monitor system performance and detect issues.
    """

    def __init__(self):
        """Initialize the statistics tracker."""
        self._stats_lock = threading.Lock()
        self._stats = {
            "reaction_updates_processed": 0,
            "reaction_updates_debounced": 0,
            "lock_acquisitions": 0,
            "save_operations": 0,
            "concurrent_conflicts": 0,
            "last_update": datetime.now(),
        }

    def increment_stat(self, stat_name: str, increment: int = 1) -> None:
        """
        Thread-safely increment a statistic.

        Args:
            stat_name: Name of the statistic to increment
            increment: Amount to increment by (default: 1)
        """
        with self._stats_lock:
            if stat_name in self._stats:
                self._stats[stat_name] += increment
                self._stats["last_update"] = datetime.now()
            else:
                logger.warning(f"Unknown statistic: {stat_name}")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get a copy of current statistics.

        Returns:
            Dict[str, Any]: Copy of current statistics
        """
        with self._stats_lock:
            return self._stats.copy()

    def reset_stats(self) -> None:
        """Reset all statistics to zero."""
        with self._stats_lock:
            for key in self._stats:
                if key != "last_update":
                    self._stats[key] = 0
            self._stats["last_update"] = datetime.now()


# Global instances for the application
lock_manager = ReminderLockManager()
reaction_queue = ReactionUpdateQueue(delay=1.0)  # 1 second debouncing
persistence_manager = ThreadSafePersistence()
concurrency_stats = ConcurrencyStats()


async def with_guild_lock(guild_id: int, operation, *args, **kwargs):
    """
    Execute an operation with guild-specific locking.

    Args:
        guild_id: The Discord guild ID
        operation: Async function to execute
        *args: Arguments for the operation
        **kwargs: Keyword arguments for the operation

    Returns:
        Any: Result of the operation
    """
    lock = await lock_manager.get_guild_lock(guild_id)
    async with lock:
        concurrency_stats.increment_stat("lock_acquisitions")
        logger.debug(f"Acquired lock for guild {guild_id}")
        try:
            result = await operation(*args, **kwargs)
            return result
        finally:
            logger.debug(f"Released lock for guild {guild_id}")


async def schedule_reaction_update(message_id: int, update_func, *args, **kwargs) -> None:
    """
    Schedule a reaction update with debouncing to prevent race conditions.

    Args:
        message_id: The Discord message ID
        update_func: Function to execute for the update
        *args: Arguments for the update function
        **kwargs: Keyword arguments for the update function
    """
    concurrency_stats.increment_stat("reaction_updates_processed")
    await reaction_queue.schedule_update(message_id, update_func, *args, **kwargs)


def get_concurrency_stats() -> Dict[str, Any]:
    """
    Get current concurrency statistics.

    Returns:
        Dict[str, Any]: Current statistics
    """
    return concurrency_stats.get_stats()
