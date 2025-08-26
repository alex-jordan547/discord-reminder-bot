"""
Advanced Test Database Manager for isolated and controlled testing.

Provides complete database isolation, automatic population, transaction management,
and performance monitoring for robust database testing infrastructure.
"""

import json
import logging
import os
import shutil
import tempfile
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from peewee import DoesNotExist, IntegrityError, SqliteDatabase

from models.database_models import (
    ALL_MODELS,
    Event,
    Guild,
    Reaction,
    ReminderLog,
    User,
    initialize_models,
)
from persistence.database import get_database
from tests.fixtures.fixture_manager import FixtureManager

logger = logging.getLogger(__name__)


class DatabaseTestError(Exception):
    """Raised when database testing operations fail."""

    pass


class TransactionManager:
    """Manages database transactions for testing with rollback capability."""

    def __init__(self, database: SqliteDatabase):
        self.database = database
        self._transaction_stack = []
        self._savepoints = []

    @contextmanager
    def transaction(self, rollback_on_exit: bool = False):
        """Create a database transaction with optional rollback."""
        self.database.begin()
        self._transaction_stack.append({"rollback_on_exit": rollback_on_exit})

        try:
            yield self.database
            if rollback_on_exit:
                self.database.rollback()
                logger.debug("Transaction rolled back (as requested)")
            else:
                self.database.commit()
                logger.debug("Transaction committed")
        except Exception as e:
            self.database.rollback()
            logger.error(f"Transaction rolled back due to error: {e}")
            raise
        finally:
            if self._transaction_stack:
                self._transaction_stack.pop()

    @contextmanager
    def savepoint(self, name: Optional[str] = None):
        """Create a savepoint for partial rollback."""
        if name is None:
            name = f"sp_{len(self._savepoints)}"

        self.database.execute_sql(f"SAVEPOINT {name}")
        self._savepoints.append(name)

        try:
            yield name
        except Exception as e:
            self.database.execute_sql(f"ROLLBACK TO SAVEPOINT {name}")
            logger.error(f"Rolled back to savepoint {name} due to error: {e}")
            raise
        finally:
            self.database.execute_sql(f"RELEASE SAVEPOINT {name}")
            if name in self._savepoints:
                self._savepoints.remove(name)


class DatabasePerformanceMonitor:
    """Monitors database performance during testing."""

    def __init__(self):
        self.queries = []
        self.start_time = None
        self.end_time = None
        self._query_counts = {}
        self._slow_queries = []

    def start_monitoring(self):
        """Start performance monitoring."""
        self.start_time = time.time()
        self.queries.clear()
        self._query_counts.clear()
        self._slow_queries.clear()
        logger.debug("Database performance monitoring started")

    def stop_monitoring(self):
        """Stop performance monitoring and generate report."""
        self.end_time = time.time()
        logger.debug("Database performance monitoring stopped")
        return self.get_performance_report()

    def record_query(self, query: str, execution_time: float, params: Optional[tuple] = None):
        """Record a database query for performance analysis."""
        query_data = {
            "query": query,
            "execution_time": execution_time,
            "params": params,
            "timestamp": time.time(),
        }

        self.queries.append(query_data)

        # Track query types
        query_type = query.strip().split()[0].upper()
        if query_type not in self._query_counts:
            self._query_counts[query_type] = 0
        self._query_counts[query_type] += 1

        # Track slow queries (> 10ms)
        if execution_time > 0.01:
            self._slow_queries.append(query_data)

    def get_performance_report(self) -> Dict[str, Any]:
        """Generate a comprehensive performance report."""
        if not self.start_time or not self.end_time:
            return {"error": "Monitoring not properly started/stopped"}

        total_time = self.end_time - self.start_time
        query_times = [q["execution_time"] for q in self.queries]

        return {
            "monitoring_duration": total_time,
            "total_queries": len(self.queries),
            "queries_per_second": len(self.queries) / total_time if total_time > 0 else 0,
            "total_query_time": sum(query_times),
            "average_query_time": sum(query_times) / len(query_times) if query_times else 0,
            "slowest_query": max(query_times) if query_times else 0,
            "fastest_query": min(query_times) if query_times else 0,
            "slow_queries_count": len(self._slow_queries),
            "query_types": dict(self._query_counts),
            "slow_queries": self._slow_queries[:10],  # Top 10 slowest
        }


class TestDatabaseManager:
    """
    Advanced test database manager with complete isolation and automation.

    Features:
    - Complete database isolation per test
    - Automatic schema creation and migration
    - Fixture population with realistic data
    - Transaction management with rollback
    - Performance monitoring and analysis
    - Parallel test support with separate databases
    - Backup and restoration capabilities
    """

    def __init__(self, base_dir: Optional[str] = None, enable_performance_monitoring: bool = False):
        """Initialize the test database manager."""
        self.base_dir = Path(base_dir or tempfile.gettempdir()) / "test_databases"
        self.base_dir.mkdir(parents=True, exist_ok=True)

        self.enable_performance_monitoring = enable_performance_monitoring
        self.performance_monitor = DatabasePerformanceMonitor()

        self._databases = {}  # test_id -> database_info
        self._active_database = None
        self._cleanup_databases = []
        self._thread_lock = threading.Lock()

        # Default database configurations
        self.database_configs = {
            "minimal": {"enable_wal": False, "synchronous": "OFF"},
            "standard": {"enable_wal": True, "synchronous": "NORMAL"},
            "production": {"enable_wal": True, "synchronous": "FULL"},
        }

    def create_test_database(
        self, test_id: str, config: str = "standard", populate: bool = True, **kwargs
    ) -> SqliteDatabase:
        """
        Create an isolated test database with optional population.

        Args:
            test_id: Unique identifier for this test database
            config: Database configuration preset ('minimal', 'standard', 'production')
            populate: Whether to populate with fixture data
            **kwargs: Additional database configuration options
        """
        with self._thread_lock:
            if test_id in self._databases:
                logger.warning(f"Database for test {test_id} already exists")
                return self._databases[test_id]["database"]

            # Create database file
            db_path = self.base_dir / f"{test_id}_{int(time.time())}.db"
            database = SqliteDatabase(str(db_path))

            # Apply configuration
            db_config = self.database_configs.get(config, self.database_configs["standard"])
            db_config.update(kwargs)

            try:
                # Initialize database
                database.connect()

                # Apply configuration settings
                if db_config.get("enable_wal", True):
                    database.execute_sql("PRAGMA journal_mode=WAL")

                sync_mode = db_config.get("synchronous", "NORMAL")
                database.execute_sql(f"PRAGMA synchronous={sync_mode}")

                # Additional performance settings for testing
                database.execute_sql("PRAGMA cache_size=10000")  # 10MB cache
                database.execute_sql("PRAGMA temp_store=MEMORY")
                database.execute_sql("PRAGMA mmap_size=268435456")  # 256MB mmap

                # Initialize models
                initialize_models(database)

                # Create tables
                database.create_tables(ALL_MODELS, safe=True)

                # Store database info
                db_info = {
                    "database": database,
                    "path": db_path,
                    "config": db_config,
                    "created_at": datetime.now(),
                    "transaction_manager": TransactionManager(database),
                    "fixture_manager": None,
                }

                self._databases[test_id] = db_info
                self._cleanup_databases.append(test_id)

                # Populate with fixture data if requested
                if populate:
                    db_info["fixture_manager"] = self._populate_database(database)

                logger.info(f"Created test database for {test_id}: {db_path}")
                return database

            except Exception as e:
                # Cleanup on failure
                if database and not database.is_closed():
                    database.close()
                if db_path.exists():
                    db_path.unlink()
                raise DatabaseTestError(f"Failed to create test database for {test_id}: {e}")

    def _populate_database(self, database: SqliteDatabase) -> FixtureManager:
        """Populate database with realistic test data."""
        fixture_manager = FixtureManager(database)

        try:
            # Create a standard test scenario
            scenario_data = fixture_manager.create_complete_scenario("standard")

            logger.debug(
                f"Populated database with {scenario_data['metadata']['total_entities']} entities"
            )
            return fixture_manager

        except Exception as e:
            logger.error(f"Failed to populate database: {e}")
            raise DatabaseTestError(f"Database population failed: {e}")

    def get_database(self, test_id: str) -> Optional[SqliteDatabase]:
        """Get the database for a specific test."""
        db_info = self._databases.get(test_id)
        return db_info["database"] if db_info else None

    def get_transaction_manager(self, test_id: str) -> Optional[TransactionManager]:
        """Get the transaction manager for a specific test."""
        db_info = self._databases.get(test_id)
        return db_info["transaction_manager"] if db_info else None

    def get_fixture_manager(self, test_id: str) -> Optional[FixtureManager]:
        """Get the fixture manager for a specific test."""
        db_info = self._databases.get(test_id)
        return db_info["fixture_manager"] if db_info else None

    # =============================================================================
    # Data Management
    # =============================================================================

    def backup_database(self, test_id: str, backup_name: Optional[str] = None) -> str:
        """Create a backup of the test database."""
        db_info = self._databases.get(test_id)
        if not db_info:
            raise DatabaseTestError(f"Database not found for test {test_id}")

        if backup_name is None:
            backup_name = f"{test_id}_backup_{int(time.time())}"

        backup_path = self.base_dir / f"{backup_name}.db"

        try:
            shutil.copy2(db_info["path"], backup_path)
            logger.debug(f"Created backup of {test_id} at {backup_path}")
            return str(backup_path)
        except Exception as e:
            raise DatabaseTestError(f"Failed to backup database {test_id}: {e}")

    def restore_database(self, test_id: str, backup_path: str):
        """Restore a database from backup."""
        db_info = self._databases.get(test_id)
        if not db_info:
            raise DatabaseTestError(f"Database not found for test {test_id}")

        backup_path = Path(backup_path)
        if not backup_path.exists():
            raise DatabaseTestError(f"Backup file not found: {backup_path}")

        try:
            # Close current database
            if not db_info["database"].is_closed():
                db_info["database"].close()

            # Restore from backup
            shutil.copy2(backup_path, db_info["path"])

            # Reconnect
            db_info["database"].connect()
            initialize_models(db_info["database"])

            logger.debug(f"Restored database {test_id} from {backup_path}")
        except Exception as e:
            raise DatabaseTestError(f"Failed to restore database {test_id}: {e}")

    def clear_database(self, test_id: str):
        """Clear all data from a test database while keeping schema."""
        database = self.get_database(test_id)
        if not database:
            raise DatabaseTestError(f"Database not found for test {test_id}")

        try:
            with database.atomic():
                # Delete all data in reverse dependency order
                for model in reversed(ALL_MODELS):
                    if model.table_exists():
                        model.delete().execute()

            logger.debug(f"Cleared all data from database {test_id}")
        except Exception as e:
            raise DatabaseTestError(f"Failed to clear database {test_id}: {e}")

    def reset_database(self, test_id: str, repopulate: bool = True):
        """Reset database to initial state with optional repopulation."""
        self.clear_database(test_id)

        if repopulate:
            database = self.get_database(test_id)
            db_info = self._databases[test_id]
            db_info["fixture_manager"] = self._populate_database(database)
            logger.debug(f"Reset and repopulated database {test_id}")

    # =============================================================================
    # Testing Utilities
    # =============================================================================

    def execute_test_with_database(self, test_id: str, test_func, *args, **kwargs):
        """Execute a test function with an isolated database context."""
        database = self.create_test_database(test_id)

        # Start performance monitoring if enabled
        if self.enable_performance_monitoring:
            self.performance_monitor.start_monitoring()

        old_db = None
        try:
            # Temporarily set this as the active database
            old_db = get_database()
            self._active_database = database

            # Execute test
            result = test_func(*args, **kwargs)

            # Get performance report if monitoring was enabled
            if self.enable_performance_monitoring:
                perf_report = self.performance_monitor.stop_monitoring()
                return result, perf_report

            return result

        except Exception as e:
            logger.error(f"Test execution failed for {test_id}: {e}")
            raise
        finally:
            self._active_database = old_db

    def get_database_stats(self, test_id: str) -> Dict[str, Any]:
        """Get comprehensive statistics about a test database."""
        database = self.get_database(test_id)
        if not database:
            return {"error": f"Database not found for test {test_id}"}

        stats = {
            "test_id": test_id,
            "created_at": self._databases[test_id]["created_at"].isoformat(),
            "file_size": os.path.getsize(self._databases[test_id]["path"]),
            "table_stats": {},
            "total_records": 0,
        }

        try:
            for model in ALL_MODELS:
                if model.table_exists():
                    count = model.select().count()
                    stats["table_stats"][model.__name__] = count
                    stats["total_records"] += count

            # Database-specific stats
            cursor = database.execute_sql("PRAGMA database_list")
            db_info = cursor.fetchall()
            stats["database_info"] = db_info

            cursor = database.execute_sql("PRAGMA page_count")
            page_count = cursor.fetchone()[0]
            cursor = database.execute_sql("PRAGMA page_size")
            page_size = cursor.fetchone()[0]

            stats["database_size"] = page_count * page_size
            stats["page_count"] = page_count
            stats["page_size"] = page_size

        except Exception as e:
            stats["error"] = f"Failed to collect stats: {e}"

        return stats

    # =============================================================================
    # Context Managers
    # =============================================================================

    @contextmanager
    def database_context(self, test_id: str, **kwargs):
        """Context manager for automatic database setup and cleanup."""
        database = self.create_test_database(test_id, **kwargs)

        try:
            yield {
                "database": database,
                "transaction_manager": self.get_transaction_manager(test_id),
                "fixture_manager": self.get_fixture_manager(test_id),
            }
        finally:
            self.cleanup_database(test_id)

    @contextmanager
    def transaction_context(self, test_id: str, rollback_on_exit: bool = False):
        """Context manager for transactional testing."""
        transaction_manager = self.get_transaction_manager(test_id)
        if not transaction_manager:
            raise DatabaseTestError(f"No transaction manager for test {test_id}")

        with transaction_manager.transaction(rollback_on_exit=rollback_on_exit):
            yield transaction_manager

    # =============================================================================
    # Cleanup Management
    # =============================================================================

    def cleanup_database(self, test_id: str):
        """Clean up a specific test database."""
        with self._thread_lock:
            db_info = self._databases.get(test_id)
            if not db_info:
                return

            try:
                # Clean up fixture manager
                if db_info["fixture_manager"]:
                    db_info["fixture_manager"].cleanup()

                # Close database
                if not db_info["database"].is_closed():
                    db_info["database"].close()

                # Remove database file
                if db_info["path"].exists():
                    db_info["path"].unlink()

                # Remove from tracking
                del self._databases[test_id]
                if test_id in self._cleanup_databases:
                    self._cleanup_databases.remove(test_id)

                logger.debug(f"Cleaned up test database {test_id}")

            except Exception as e:
                logger.error(f"Failed to cleanup database {test_id}: {e}")

    def cleanup_all(self):
        """Clean up all test databases."""
        cleanup_list = list(self._cleanup_databases)
        for test_id in cleanup_list:
            try:
                self.cleanup_database(test_id)
            except Exception as e:
                logger.error(f"Failed to cleanup database {test_id}: {e}")

        logger.debug(f"Cleaned up {len(cleanup_list)} test databases")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit with automatic cleanup."""
        self.cleanup_all()
