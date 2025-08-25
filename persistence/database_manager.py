"""
Database manager for Discord Reminder Bot.

This module provides high-level database management functionality,
including initialization, health checks, and maintenance operations.
"""

import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

from persistence.database import (
    get_database,
    initialize_database,
    close_database,
    get_database_info,
    is_database_available,
    DatabaseConfig
)
from models.database_models import create_tables, drop_tables, get_table_info, ALL_MODELS

# Get logger for this module
logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    High-level database manager for the Discord Reminder Bot.
    
    Handles database initialization, health monitoring, and maintenance.
    """
    
    def __init__(self):
        self._initialized = False
        self._database = None
    
    async def initialize(self) -> bool:
        """
        Initialize the database system.
        
        Returns:
            bool: True if initialization was successful
        """
        try:
            logger.info("Initializing database system...")
            
            # Get the appropriate database instance
            self._database = DatabaseConfig.get_configured_database()
            
            # Initialize the database connection
            if not initialize_database():
                logger.error("Failed to initialize database connection")
                return False
            
            # Create tables if they don't exist
            if not create_tables():
                logger.error("Failed to create database tables")
                return False
            
            # Verify the database is working
            if not is_database_available():
                logger.error("Database is not available after initialization")
                return False
            
            self._initialized = True
            logger.info("Database system initialized successfully")
            
            # Log database information
            db_info = get_database_info()
            logger.info(f"Database path: {db_info['database_path']}")
            if db_info.get('database_size_mb'):
                logger.info(f"Database size: {db_info['database_size_mb']} MB")
            
            # Log table information
            table_info = get_table_info()
            total_records = sum(info.get('row_count', 0) for info in table_info.values() if isinstance(info, dict))
            logger.info(f"Total records in database: {total_records}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize database system: {e}")
            return False
    
    async def shutdown(self) -> None:
        """
        Shutdown the database system gracefully.
        """
        try:
            logger.info("Shutting down database system...")
            close_database()
            self._initialized = False
            logger.info("Database system shutdown complete")
        except Exception as e:
            logger.error(f"Error during database shutdown: {e}")
    
    def is_initialized(self) -> bool:
        """
        Check if the database system is initialized.
        
        Returns:
            bool: True if initialized
        """
        return self._initialized
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform a comprehensive health check of the database system.
        
        Returns:
            Dict[str, Any]: Health check results
        """
        health = {
            'status': 'unknown',
            'initialized': self._initialized,
            'database_available': False,
            'tables_exist': False,
            'database_info': {},
            'table_info': {},
            'errors': []
        }
        
        try:
            # Check if database is available
            health['database_available'] = is_database_available()
            
            if health['database_available']:
                # Get database information
                health['database_info'] = get_database_info()
                
                # Get table information
                health['table_info'] = get_table_info()
                
                # Check if all tables exist
                expected_tables = len(ALL_MODELS)
                existing_tables = sum(1 for info in health['table_info'].values() 
                                    if isinstance(info, dict) and info.get('exists', False))
                health['tables_exist'] = existing_tables == expected_tables
                
                # Determine overall status
                if health['initialized'] and health['tables_exist']:
                    health['status'] = 'healthy'
                elif health['tables_exist']:
                    health['status'] = 'degraded'
                else:
                    health['status'] = 'unhealthy'
                    health['errors'].append('Not all tables exist')
            else:
                health['status'] = 'unhealthy'
                health['errors'].append('Database not available')
                
        except Exception as e:
            health['status'] = 'error'
            health['errors'].append(f"Health check failed: {e}")
            logger.error(f"Database health check failed: {e}")
        
        return health
    
    async def backup_database(self, backup_path: Optional[str] = None) -> bool:
        """
        Create a backup of the database.
        
        Args:
            backup_path: Optional custom backup path
            
        Returns:
            bool: True if backup was successful
        """
        try:
            if not self._initialized:
                logger.error("Database not initialized, cannot create backup")
                return False
            
            db_info = get_database_info()
            source_path = db_info['database_path']
            
            if not Path(source_path).exists():
                logger.error(f"Source database file does not exist: {source_path}")
                return False
            
            # Generate backup path if not provided
            if backup_path is None:
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_path = f"discord_bot_backup_{timestamp}.db"
            
            # Copy the database file
            import shutil
            shutil.copy2(source_path, backup_path)
            
            logger.info(f"Database backup created: {backup_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create database backup: {e}")
            return False
    
    async def optimize_database(self) -> bool:
        """
        Optimize the database by running maintenance operations.
        
        Returns:
            bool: True if optimization was successful
        """
        try:
            if not self._initialized:
                logger.error("Database not initialized, cannot optimize")
                return False
            
            database = get_database()
            database.connect()
            
            try:
                # Run VACUUM to reclaim space and defragment
                logger.info("Running database VACUUM...")
                database.execute_sql('VACUUM')
                
                # Analyze tables for query optimization
                logger.info("Running database ANALYZE...")
                database.execute_sql('ANALYZE')
                
                logger.info("Database optimization completed")
                return True
                
            finally:
                if not database.is_closed():
                    database.close()
                    
        except Exception as e:
            logger.error(f"Failed to optimize database: {e}")
            return False
    
    async def reset_database(self) -> bool:
        """
        Reset the database by dropping and recreating all tables.
        WARNING: This will delete all data!
        
        Returns:
            bool: True if reset was successful
        """
        try:
            logger.warning("Resetting database - ALL DATA WILL BE LOST!")
            
            # Drop all tables
            if not drop_tables():
                logger.error("Failed to drop tables during reset")
                return False
            
            # Recreate all tables
            if not create_tables():
                logger.error("Failed to recreate tables during reset")
                return False
            
            logger.warning("Database reset completed - all data has been deleted")
            return True
            
        except Exception as e:
            logger.error(f"Failed to reset database: {e}")
            return False
    
    def get_status_summary(self) -> str:
        """
        Get a human-readable status summary.
        
        Returns:
            str: Status summary string
        """
        if not self._initialized:
            return "❌ Database not initialized"
        
        try:
            if is_database_available():
                db_info = get_database_info()
                table_info = get_table_info()
                
                total_records = sum(info.get('row_count', 0) for info in table_info.values() 
                                  if isinstance(info, dict))
                
                size_info = ""
                if db_info.get('database_size_mb'):
                    size_info = f" ({db_info['database_size_mb']} MB)"
                
                return f"✅ Database healthy - {total_records} records{size_info}"
            else:
                return "⚠️ Database unavailable"
                
        except Exception as e:
            return f"❌ Database error: {e}"


# Global database manager instance
_db_manager: Optional[DatabaseManager] = None


def get_database_manager() -> DatabaseManager:
    """
    Get the global database manager instance.
    
    Returns:
        DatabaseManager: The database manager instance
    """
    global _db_manager
    
    if _db_manager is None:
        _db_manager = DatabaseManager()
    
    return _db_manager


async def initialize_database_system() -> bool:
    """
    Initialize the database system using the global manager.
    
    Returns:
        bool: True if initialization was successful
    """
    manager = get_database_manager()
    return await manager.initialize()


async def shutdown_database_system() -> None:
    """
    Shutdown the database system using the global manager.
    """
    manager = get_database_manager()
    await manager.shutdown()