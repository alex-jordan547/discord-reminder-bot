"""
Schema management utilities for Discord Reminder Bot.

This module provides high-level functions for managing database schema
initialization and migrations.
"""

import logging
from typing import Any, Dict

from models.database_models import create_tables, get_table_info, initialize_models
from models.migrations import get_schema_info, initialize_schema
from persistence.database import initialize_database

# Get logger for this module
logger = logging.getLogger(__name__)


def setup_database() -> bool:
    """
    Complete database setup including connection, schema, and migrations.

    Returns:
        bool: True if setup was successful
    """
    try:
        logger.info("Starting database setup")

        # Step 1: Initialize database connection
        if not initialize_database():
            logger.error("Failed to initialize database connection")
            return False

        # Step 2: Initialize models with database connection
        initialize_models()
        logger.info("Models initialized with database connection")

        # Step 3: Apply schema migrations
        try:
            if not initialize_schema():
                logger.error("Failed to initialize database schema")
                return False
        except Exception as e:
            logger.error(f"Exception during schema initialization: {e}")
            import traceback

            logger.error(f"Traceback: {traceback.format_exc()}")
            return False

        logger.info("Database setup completed successfully")
        return True

    except Exception as e:
        logger.error(f"Database setup failed: {e}")
        return False


def get_database_status() -> Dict[str, Any]:
    """
    Get comprehensive database status information.

    Returns:
        Dict containing database status details
    """
    try:
        # Get basic database info
        from persistence.database import get_database_info, is_database_available

        status = {
            "database_available": is_database_available(),
            "database_info": get_database_info(),
            "schema_info": get_schema_info(),
            "table_info": get_table_info(),
        }

        return status

    except Exception as e:
        logger.error(f"Failed to get database status: {e}")
        return {"database_available": False, "error": str(e)}


def verify_database_integrity() -> bool:
    """
    Verify database integrity and schema consistency.

    Returns:
        bool: True if database is healthy
    """
    try:
        logger.info("Verifying database integrity")

        # Check if database is available
        from persistence.database import is_database_available

        if not is_database_available():
            logger.error("Database is not available")
            return False

        # Check schema version
        schema_info = get_schema_info()
        if schema_info.get("needs_migration", False):
            logger.warning("Database schema needs migration")
            return False

        # Check table existence and basic structure
        table_info = get_table_info()
        expected_tables = ["guild", "user", "event", "reaction", "reminderlog", "schemaversion"]

        for table_name in expected_tables:
            if table_name not in table_info:
                logger.error(f"Missing table: {table_name}")
                return False

            if not table_info[table_name].get("exists", False):
                logger.error(f"Table {table_name} does not exist")
                return False

        logger.info("Database integrity verification passed")
        return True

    except Exception as e:
        logger.error(f"Database integrity verification failed: {e}")
        return False


def reset_database() -> bool:
    """
    Reset the database by dropping all tables and recreating schema.
    Use with extreme caution!

    Returns:
        bool: True if reset was successful
    """
    try:
        logger.warning("Resetting database - all data will be lost!")

        # Drop all tables
        from models.database_models import drop_tables

        if not drop_tables():
            logger.error("Failed to drop tables")
            return False

        # Recreate schema
        if not setup_database():
            logger.error("Failed to recreate database schema")
            return False

        logger.warning("Database reset completed")
        return True

    except Exception as e:
        logger.error(f"Database reset failed: {e}")
        return False


def create_backup_info() -> Dict[str, Any]:
    """
    Create backup information for the current database state.

    Returns:
        Dict containing backup metadata
    """
    from datetime import datetime

    from persistence.database import get_database_info

    return {
        "backup_timestamp": datetime.now().isoformat(),
        "database_info": get_database_info(),
        "schema_info": get_schema_info(),
        "table_info": get_table_info(),
    }
