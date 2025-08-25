"""
Database schema migration system for Discord Reminder Bot.

This module provides functionality for managing database schema versions
and applying migrations automatically when the bot starts.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional, Callable
from pathlib import Path

from peewee import (
    CharField,
    DateTimeField,
    IntegerField,
    TextField,
    DoesNotExist,
    Model,
)

from persistence.database import get_database
from persistence.database import get_database

# Get logger for this module
logger = logging.getLogger(__name__)


from peewee import Model

class SchemaVersion(Model):
    """
    Model to track database schema versions and applied migrations.
    """
    
    version = IntegerField(unique=True)
    name = CharField(max_length=200)
    description = TextField(null=True)
    applied_at = DateTimeField(default=datetime.now)
    
    class Meta:
        database = None  # Will be set dynamically
        indexes = (
            ('version',),
            ('applied_at',),
        )
    
    def __str__(self) -> str:
        return f"SchemaVersion({self.version}, {self.name})"


class Migration:
    """
    Represents a single database migration.
    """
    
    def __init__(
        self,
        version: int,
        name: str,
        description: str,
        up_func: Callable,
        down_func: Optional[Callable] = None
    ):
        self.version = version
        self.name = name
        self.description = description
        self.up_func = up_func
        self.down_func = down_func
    
    def apply(self) -> bool:
        """
        Apply this migration.
        
        Returns:
            bool: True if migration was applied successfully
        """
        try:
            logger.info(f"Applying migration {self.version}: {self.name}")
            self.up_func()
            
            # Record the migration
            SchemaVersion.create(
                version=self.version,
                name=self.name,
                description=self.description
            )
            
            logger.info(f"Migration {self.version} applied successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to apply migration {self.version}: {e}")
            return False
    
    def rollback(self) -> bool:
        """
        Rollback this migration.
        
        Returns:
            bool: True if migration was rolled back successfully
        """
        if not self.down_func:
            logger.error(f"Migration {self.version} has no rollback function")
            return False
        
        try:
            logger.info(f"Rolling back migration {self.version}: {self.name}")
            self.down_func()
            
            # Remove the migration record
            try:
                schema_version = SchemaVersion.get(SchemaVersion.version == self.version)
                schema_version.delete_instance()
            except DoesNotExist:
                logger.warning(f"Migration {self.version} was not recorded in schema_version table")
            
            logger.info(f"Migration {self.version} rolled back successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to rollback migration {self.version}: {e}")
            return False


class MigrationManager:
    """
    Manages database schema migrations.
    """
    
    def __init__(self):
        self.migrations: Dict[int, Migration] = {}
        self._register_migrations()
    
    def _register_migrations(self) -> None:
        """
        Register all available migrations.
        """
        # Migration 1: Initial schema creation
        self.register_migration(
            version=1,
            name="initial_schema",
            description="Create initial database tables",
            up_func=self._migration_001_initial_schema_up,
            down_func=self._migration_001_initial_schema_down
        )
        
        # Future migrations can be added here
        # Example:
        # self.register_migration(
        #     version=2,
        #     name="add_user_preferences",
        #     description="Add user preferences table",
        #     up_func=self._migration_002_user_preferences_up,
        #     down_func=self._migration_002_user_preferences_down
        # )
    
    def register_migration(
        self,
        version: int,
        name: str,
        description: str,
        up_func: Callable,
        down_func: Optional[Callable] = None
    ) -> None:
        """
        Register a new migration.
        
        Args:
            version: Migration version number
            name: Migration name
            description: Migration description
            up_func: Function to apply the migration
            down_func: Function to rollback the migration (optional)
        """
        if version in self.migrations:
            raise ValueError(f"Migration version {version} already exists")
        
        self.migrations[version] = Migration(
            version=version,
            name=name,
            description=description,
            up_func=up_func,
            down_func=down_func
        )
    
    def get_current_version(self) -> int:
        """
        Get the current database schema version.
        
        Returns:
            int: Current schema version (0 if no migrations applied)
        """
        try:
            # Ensure SchemaVersion table exists
            database = get_database()
            database.connect()
            
            # Set database for SchemaVersion model
            SchemaVersion._meta.database = database
            
            if not database.table_exists('schemaversion'):
                return 0
            
            latest = SchemaVersion.select().order_by(SchemaVersion.version.desc()).first()
            return latest.version if latest else 0
            
        except Exception as e:
            logger.warning(f"Could not determine current schema version: {e}")
            return 0
        finally:
            database = get_database()
            if database and not database.is_closed():
                database.close()
    
    def get_target_version(self) -> int:
        """
        Get the target schema version (highest available migration).
        
        Returns:
            int: Target schema version
        """
        return max(self.migrations.keys()) if self.migrations else 0
    
    def get_pending_migrations(self) -> List[Migration]:
        """
        Get list of migrations that need to be applied.
        
        Returns:
            List[Migration]: Migrations to apply, in order
        """
        current_version = self.get_current_version()
        target_version = self.get_target_version()
        
        pending = []
        for version in range(current_version + 1, target_version + 1):
            if version in self.migrations:
                pending.append(self.migrations[version])
        
        return sorted(pending, key=lambda m: m.version)
    
    def apply_migrations(self) -> bool:
        """
        Apply all pending migrations.
        
        Returns:
            bool: True if all migrations were applied successfully
        """
        pending = self.get_pending_migrations()
        
        if not pending:
            logger.info("No pending migrations to apply")
            return True
        
        logger.info(f"Applying {len(pending)} pending migrations")
        
        database = get_database()
        
        try:
            database.connect()
            
            # Set database for SchemaVersion model
            SchemaVersion._meta.database = database
            
            # Ensure SchemaVersion table exists
            database.create_tables([SchemaVersion], safe=True)
            
            # Apply migrations in a transaction
            with database.atomic():
                for migration in pending:
                    try:
                        if not migration.apply():
                            logger.error(f"Failed to apply migration {migration.version}")
                            return False
                    except Exception as e:
                        logger.error(f"Exception applying migration {migration.version}: {e}")
                        import traceback
                        logger.error(f"Traceback: {traceback.format_exc()}")
                        return False
            
            logger.info("All migrations applied successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to apply migrations: {e}")
            return False
        finally:
            if database and not database.is_closed():
                database.close()
    
    def rollback_to_version(self, target_version: int) -> bool:
        """
        Rollback database to a specific version.
        
        Args:
            target_version: Version to rollback to
            
        Returns:
            bool: True if rollback was successful
        """
        current_version = self.get_current_version()
        
        if target_version >= current_version:
            logger.info(f"Already at or below version {target_version}")
            return True
        
        # Get migrations to rollback (in reverse order)
        to_rollback = []
        for version in range(current_version, target_version, -1):
            if version in self.migrations:
                to_rollback.append(self.migrations[version])
        
        if not to_rollback:
            logger.info("No migrations to rollback")
            return True
        
        logger.info(f"Rolling back {len(to_rollback)} migrations")
        
        database = get_database()
        
        try:
            database.connect()
            
            # Rollback migrations in a transaction
            with database.atomic():
                for migration in to_rollback:
                    if not migration.rollback():
                        logger.error(f"Failed to rollback migration {migration.version}")
                        return False
            
            logger.info(f"Successfully rolled back to version {target_version}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to rollback migrations: {e}")
            return False
        finally:
            if database and not database.is_closed():
                database.close()
    
    def get_migration_status(self) -> Dict[str, any]:
        """
        Get detailed migration status information.
        
        Returns:
            Dict containing migration status details
        """
        current_version = self.get_current_version()
        target_version = self.get_target_version()
        pending = self.get_pending_migrations()
        
        # Get applied migrations
        applied = []
        try:
            database = get_database()
            database.connect()
            
            # Set database for SchemaVersion model
            SchemaVersion._meta.database = database
            
            if database.table_exists('schemaversion'):
                for schema_version in SchemaVersion.select().order_by(SchemaVersion.version):
                    applied.append({
                        'version': schema_version.version,
                        'name': schema_version.name,
                        'description': schema_version.description,
                        'applied_at': schema_version.applied_at.isoformat()
                    })
        except Exception as e:
            logger.warning(f"Could not get applied migrations: {e}")
        finally:
            database = get_database()
            if database and not database.is_closed():
                database.close()
        
        return {
            'current_version': current_version,
            'target_version': target_version,
            'needs_migration': len(pending) > 0,
            'pending_count': len(pending),
            'applied_migrations': applied,
            'pending_migrations': [
                {
                    'version': m.version,
                    'name': m.name,
                    'description': m.description
                }
                for m in pending
            ]
        }
    
    # Migration functions
    def _migration_001_initial_schema_up(self) -> None:
        """
        Migration 001: Create initial database schema.
        """
        from models.database_models import ALL_MODELS
        
        database = get_database()
        
        # Set database for SchemaVersion model
        SchemaVersion._meta.database = database
        
        # Create all tables
        database.create_tables(ALL_MODELS, safe=True)
        
        logger.info("Created initial database schema")
    
    def _migration_001_initial_schema_down(self) -> None:
        """
        Migration 001 rollback: Drop all tables.
        """
        from models.database_models import ALL_MODELS
        
        database = get_database()
        
        # Drop all tables in reverse order
        database.drop_tables(reversed(ALL_MODELS), safe=True)
        
        logger.info("Dropped all database tables")


# Global migration manager instance
migration_manager = MigrationManager()


def initialize_schema() -> bool:
    """
    Initialize the database schema by applying all pending migrations.
    
    Returns:
        bool: True if schema initialization was successful
    """
    try:
        logger.info("Initializing database schema")
        
        # For now, use simple table creation instead of complex migrations
        from models.database_models import create_tables
        success = create_tables()
        
        if success:
            logger.info("Schema initialized successfully using simple table creation")
        else:
            logger.error("Failed to initialize database schema")
        
        return success
        
    except Exception as e:
        logger.error(f"Error during schema initialization: {e}")
        return False


def get_schema_info() -> Dict[str, any]:
    """
    Get information about the current database schema.
    
    Returns:
        Dict containing schema information
    """
    return migration_manager.get_migration_status()


def rollback_schema(target_version: int) -> bool:
    """
    Rollback database schema to a specific version.
    
    Args:
        target_version: Version to rollback to
        
    Returns:
        bool: True if rollback was successful
    """
    return migration_manager.rollback_to_version(target_version)