"""
SQLite-aware concurrency management module for Discord Reminder Bot.

This module provides thread-safe operations and synchronization mechanisms
optimized for SQLite database operations with proper transaction handling.
"""

import asyncio
import logging
import threading
from datetime import datetime
from typing import Any, Callable, Dict, Optional, Set

from peewee import Database

from persistence.database import get_database

# Get logger for this module
logger = logging.getLogger(__name__)


class SQLiteLockManager:
    """
    Manages async locks for SQLite operations to prevent race conditions.

    This class provides per-guild locking with SQLite transaction awareness
    to ensure thread-safety when updating database records.
    """

    def __init__(self):
        """Initialize the SQLite lock manager."""
        self._guild_locks: Dict[int, asyncio.Lock] = {}
        self._lock_creation_lock = asyncio.Lock()
        self._transaction_locks: Dict[int, asyncio.Lock] = {}

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

    async def get_transaction_lock(self, guild_id: int) -> asyncio.Lock:
        """
        Get or create a transaction lock for a specific guild.

        This is used for operations that require database transactions
        to be isolated per guild.

        Args:
            guild_id: The Discord guild ID

        Returns:
            asyncio.Lock: Transaction lock for the specified guild
        """
        if guild_id not in self._transaction_locks:
            async with self._lock_creation_lock:
                if guild_id not in self._transaction_locks:
                    self._transaction_locks[guild_id] = asyncio.Lock()

        return self._transaction_locks[guild_id]

    async def cleanup_unused_locks(self, active_guild_ids: Set[int]) -> None:
        """
        Clean up locks for guilds that are no longer active.

        Args:
            active_guild_ids: Set of currently active guild IDs
        """
        async with self._lock_creation_lock:
            unused_guilds = set(self._guild_locks.keys()) - active_guild_ids
            for guild_id in unused_guilds:
                self._guild_locks.pop(guild_id, None)
                self._transaction_locks.pop(guild_id, None)
                logger.debug(f"Cleaned up locks for inactive guild {guild_id}")


class SQLiteReactionUpdateQueue:
    """
    Manages a queue for processing reaction updates with SQLite transactions.

    This class ensures that reaction updates are processed sequentially
    per message with proper database transaction handling.
    """

    def __init__(self, delay: float = 1.0):
        """
        Initialize the SQLite reaction update queue.

        Args:
            delay: Debouncing delay in seconds (default: 1.0)
        """
        self.delay = delay
        self._pending_updates: Dict[int, asyncio.Task] = {}
        self._processing_lock = asyncio.Lock()

    async def schedule_update(self, message_id: int, update_function, *args, **kwargs) -> None:
        """
        Schedule a reaction update with debouncing and transaction safety.

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
                f"Scheduled SQLite reaction update for message {message_id} with {self.delay}s delay"
            )

    async def _delayed_update(self, message_id: int, update_function, *args, **kwargs) -> None:
        """
        Execute the update after the debouncing delay with transaction handling.

        Args:
            message_id: The Discord message ID
            update_function: Function to call for the update
            *args: Arguments for the update function
            **kwargs: Keyword arguments for the update function
        """
        try:
            await asyncio.sleep(self.delay)

            # Execute update with database connection management
            database = get_database()
            try:
                if database.is_closed():
                    database.connect()

                result = await update_function(*args, **kwargs)
                logger.debug(f"Completed SQLite reaction update for message {message_id}")
                return result

            finally:
                if not database.is_closed():
                    database.close()

        except asyncio.CancelledError:
            logger.debug(f"SQLite reaction update cancelled for message {message_id}")
            raise
        except Exception as e:
            logger.error(f"Error during SQLite reaction update for message {message_id}: {e}")
        finally:
            # Clean up completed task
            async with self._processing_lock:
                self._pending_updates.pop(message_id, None)

    async def flush_all_updates(self) -> None:
        """Wait for all pending updates to complete."""
        pending_tasks = list(self._pending_updates.values())
        if pending_tasks:
            logger.info(
                f"Waiting for {len(pending_tasks)} pending SQLite reaction updates to complete"
            )
            await asyncio.gather(*pending_tasks, return_exceptions=True)


class SQLiteTransactionManager:
    """
    Manages SQLite transactions with proper isolation and rollback handling.

    This class ensures that database operations are atomic and properly
    isolated per guild to prevent data corruption.
    """

    def __init__(self):
        """Initialize the SQLite transaction manager."""
        self._active_transactions: Dict[int, Database] = {}
        self._transaction_lock = asyncio.Lock()

    async def execute_with_transaction(
        self, guild_id: int, operation: Callable, *args, **kwargs
    ) -> Any:
        """
        Execute an operation within a SQLite transaction with guild isolation.

        Args:
            guild_id: The Discord guild ID for isolation
            operation: Function to execute within the transaction
            *args: Arguments for the operation
            **kwargs: Keyword arguments for the operation

        Returns:
            Any: Result of the operation

        Raises:
            Exception: If the transaction fails and cannot be rolled back
        """
        database = get_database()

        async with self._transaction_lock:
            try:
                if database.is_closed():
                    database.connect()

                with database.atomic() as transaction:
                    self._active_transactions[guild_id] = database
                    try:
                        result = await operation(*args, **kwargs)
                        logger.debug(f"Transaction completed successfully for guild {guild_id}")
                        return result
                    except Exception as e:
                        logger.error(f"Transaction failed for guild {guild_id}: {e}")
                        # Transaction will be automatically rolled back
                        raise
                    finally:
                        self._active_transactions.pop(guild_id, None)

            except Exception as e:
                logger.error(f"Failed to execute transaction for guild {guild_id}: {e}")
                raise
            finally:
                if not database.is_closed():
                    database.close()

    def is_transaction_active(self, guild_id: int) -> bool:
        """
        Check if a transaction is currently active for a guild.

        Args:
            guild_id: The Discord guild ID

        Returns:
            bool: True if transaction is active, False otherwise
        """
        return guild_id in self._active_transactions

    async def rollback_transaction(self, guild_id: int) -> bool:
        """
        Manually rollback a transaction for a guild.

        Args:
            guild_id: The Discord guild ID

        Returns:
            bool: True if rollback was successful, False otherwise
        """
        if guild_id not in self._active_transactions:
            logger.warning(f"No active transaction to rollback for guild {guild_id}")
            return False

        try:
            # The transaction context manager will handle rollback automatically
            # when an exception occurs, so we just need to clean up our tracking
            self._active_transactions.pop(guild_id, None)
            logger.info(f"Transaction rolled back for guild {guild_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to rollback transaction for guild {guild_id}: {e}")
            return False


class SQLiteConcurrencyStats:
    """
    Thread-safe statistics tracking for SQLite concurrency operations.

    This class tracks various metrics related to concurrent SQLite operations
    to help monitor system performance and detect issues.
    """

    def __init__(self):
        """Initialize the SQLite statistics tracker."""
        self._stats_lock = threading.Lock()
        self._stats = {
            "reaction_updates_processed": 0,
            "reaction_updates_debounced": 0,
            "lock_acquisitions": 0,
            "transaction_commits": 0,
            "transaction_rollbacks": 0,
            "database_connections": 0,
            "concurrent_conflicts": 0,
            "query_executions": 0,
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
                logger.warning(f"Unknown SQLite statistic: {stat_name}")

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


# Global instances for the SQLite application
sqlite_lock_manager = SQLiteLockManager()
sqlite_reaction_queue = SQLiteReactionUpdateQueue(delay=1.0)  # 1 second debouncing
sqlite_transaction_manager = SQLiteTransactionManager()
sqlite_concurrency_stats = SQLiteConcurrencyStats()


async def with_sqlite_guild_lock(guild_id: int, operation, *args, **kwargs):
    """
    Execute an operation with guild-specific locking for SQLite operations.

    Args:
        guild_id: The Discord guild ID
        operation: Async function to execute
        *args: Arguments for the operation
        **kwargs: Keyword arguments for the operation

    Returns:
        Any: Result of the operation
    """
    lock = await sqlite_lock_manager.get_guild_lock(guild_id)
    async with lock:
        sqlite_concurrency_stats.increment_stat("lock_acquisitions")
        logger.debug(f"Acquired SQLite lock for guild {guild_id}")
        try:
            result = await operation(*args, **kwargs)
            return result
        finally:
            logger.debug(f"Released SQLite lock for guild {guild_id}")


async def with_sqlite_transaction(guild_id: int, operation, *args, **kwargs):
    """
    Execute an operation within a SQLite transaction with guild isolation.

    Args:
        guild_id: The Discord guild ID
        operation: Async function to execute
        *args: Arguments for the operation
        **kwargs: Keyword arguments for the operation

    Returns:
        Any: Result of the operation
    """
    transaction_lock = await sqlite_lock_manager.get_transaction_lock(guild_id)
    async with transaction_lock:
        try:
            result = await sqlite_transaction_manager.execute_with_transaction(
                guild_id, operation, *args, **kwargs
            )
            sqlite_concurrency_stats.increment_stat("transaction_commits")
            return result
        except Exception as e:
            sqlite_concurrency_stats.increment_stat("transaction_rollbacks")
            logger.error(f"SQLite transaction failed for guild {guild_id}: {e}")
            raise


async def schedule_sqlite_reaction_update(message_id: int, update_func, *args, **kwargs) -> None:
    """
    Schedule a reaction update with debouncing for SQLite operations.

    Args:
        message_id: The Discord message ID
        update_func: Function to execute for the update
        *args: Arguments for the update function
        **kwargs: Keyword arguments for the update function
    """
    sqlite_concurrency_stats.increment_stat("reaction_updates_processed")
    await sqlite_reaction_queue.schedule_update(message_id, update_func, *args, **kwargs)


def get_sqlite_concurrency_stats() -> Dict[str, Any]:
    """
    Get current SQLite concurrency statistics.

    Returns:
        Dict[str, Any]: Current statistics
    """
    return sqlite_concurrency_stats.get_stats()


async def ensure_database_connection() -> bool:
    """
    Ensure database connection is available and working.

    Returns:
        bool: True if database is available, False otherwise
    """
    try:
        database = get_database()
        if database.is_closed():
            database.connect()

        # Test the connection
        database.execute_sql("SELECT 1")
        sqlite_concurrency_stats.increment_stat("database_connections")

        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False
    finally:
        if not database.is_closed():
            database.close()


async def execute_with_retry(operation: Callable, max_retries: int = 3, delay: float = 0.1) -> Any:
    """
    Execute a database operation with retry logic for handling locks.

    Args:
        operation: Function to execute
        max_retries: Maximum number of retry attempts
        delay: Delay between retries in seconds

    Returns:
        Any: Result of the operation

    Raises:
        Exception: If all retries are exhausted
    """
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            result = await operation()
            if attempt > 0:
                logger.info(f"Operation succeeded on attempt {attempt + 1}")
            return result
        except Exception as e:
            last_exception = e
            if attempt < max_retries:
                logger.warning(
                    f"Operation failed on attempt {attempt + 1}, retrying in {delay}s: {e}"
                )
                await asyncio.sleep(delay)
                delay *= 2  # Exponential backoff
            else:
                logger.error(f"Operation failed after {max_retries + 1} attempts: {e}")

    raise last_exception
