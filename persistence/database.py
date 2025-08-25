"""
Database configuration and connection management for Discord Reminder Bot.

This module provides the database connection setup and configuration
for the SQLite database using Pewee ORM.
"""

import logging
import os
from pathlib import Path
from typing import Optional

from peewee import SqliteDatabase

# Get logger for this module
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_NAME = "discord_bot.db"
DATABASE_PATH = Path(DATABASE_NAME)

# Global database instance
db: Optional[SqliteDatabase] = None


def get_database_path() -> str:
    """
    Get the database file path based on environment configuration.
    
    Returns:
        str: Path to the database file
    """
    # Allow override via environment variable
    db_path = os.getenv("DATABASE_PATH", DATABASE_NAME)
    
    # Ensure the directory exists
    db_file = Path(db_path)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    
    return str(db_file)


def get_database() -> SqliteDatabase:
    """
    Get or create the database connection instance.
    
    Returns:
        SqliteDatabase: The database connection instance
    """
    global db
    
    if db is None:
        db_path = get_database_path()
        
        # Create database with optimized settings
        db = SqliteDatabase(
            db_path,
            pragmas={
                'journal_mode': 'wal',  # Write-Ahead Logging for better concurrency
                'cache_size': -1 * 64000,  # 64MB cache
                'foreign_keys': 1,  # Enable foreign key constraints
                'ignore_check_constraints': 0,  # Enable check constraints
                'synchronous': 0,  # Asynchronous writes for better performance
            }
        )
        
        logger.info(f"Database configured at: {db_path}")
    
    return db


def initialize_database() -> bool:
    """
    Initialize the database connection and verify it's working.
    
    Returns:
        bool: True if initialization was successful, False otherwise
    """
    try:
        database = get_database()
        
        # Test the connection
        database.connect()
        
        # Verify we can execute a simple query
        database.execute_sql('SELECT 1')
        
        logger.info("Database connection initialized successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        return False
    finally:
        # Close the connection after testing
        if db and not db.is_closed():
            db.close()


def close_database() -> None:
    """
    Close the database connection if it's open.
    """
    global db
    
    if db and not db.is_closed():
        db.close()
        logger.debug("Database connection closed")


def get_database_info() -> dict:
    """
    Get information about the current database configuration.
    
    Returns:
        dict: Database configuration information
    """
    db_path = get_database_path()
    db_exists = Path(db_path).exists()
    
    info = {
        'database_path': db_path,
        'database_exists': db_exists,
        'database_name': DATABASE_NAME,
    }
    
    if db_exists:
        try:
            # Get file size
            file_size = Path(db_path).stat().st_size
            info['database_size_bytes'] = file_size
            info['database_size_mb'] = round(file_size / (1024 * 1024), 2)
        except Exception as e:
            logger.warning(f"Could not get database file info: {e}")
            info['database_size_bytes'] = None
            info['database_size_mb'] = None
    
    return info


def is_database_available() -> bool:
    """
    Check if the database is available and accessible.
    
    Returns:
        bool: True if database is available, False otherwise
    """
    try:
        database = get_database()
        database.connect()
        database.execute_sql('SELECT 1')
        return True
    except Exception as e:
        logger.warning(f"Database not available: {e}")
        return False
    finally:
        if db and not db.is_closed():
            db.close()


# Environment-specific configurations
class DatabaseConfig:
    """
    Database configuration class for different environments.
    """
    
    @staticmethod
    def is_test_mode() -> bool:
        """
        Check if we're running in test mode.
        
        Returns:
            bool: True if in test mode
        """
        return os.getenv("TEST_MODE", "false").lower() in ["true", "1", "yes", "on"]
    
    @staticmethod
    def get_test_database() -> SqliteDatabase:
        """
        Get a test database instance (in-memory).
        
        Returns:
            SqliteDatabase: In-memory database for testing
        """
        return SqliteDatabase(
            ':memory:',
            pragmas={
                'foreign_keys': 1,
                'ignore_check_constraints': 0,
            }
        )
    
    @staticmethod
    def get_production_database() -> SqliteDatabase:
        """
        Get the production database instance.
        
        Returns:
            SqliteDatabase: Production database instance
        """
        return get_database()
    
    @classmethod
    def get_configured_database(cls) -> SqliteDatabase:
        """
        Get the appropriate database instance based on environment.
        
        Returns:
            SqliteDatabase: Configured database instance
        """
        if cls.is_test_mode():
            logger.info("Using in-memory database for testing")
            return cls.get_test_database()
        else:
            return cls.get_production_database()