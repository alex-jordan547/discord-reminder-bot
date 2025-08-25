"""
Storage adapter with automatic fallback between SQLite and JSON.

This module provides a unified interface for data storage that can
automatically switch between SQLite and JSON backends based on
feature flags and error conditions.
"""

import logging
import os
from typing import Any, Dict, List, Optional, Protocol, Union
from abc import ABC, abstractmethod

from config.feature_flags import FeatureFlag, feature_flags

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    """Protocol defining the interface for storage backends."""
    
    async def initialize(self) -> bool:
        """Initialize the storage backend."""
        ...
    
    async def save_data(self, data: Dict[str, Any]) -> bool:
        """Save data to storage."""
        ...
    
    async def load_data(self) -> Optional[Dict[str, Any]]:
        """Load data from storage."""
        ...
    
    async def backup_data(self) -> bool:
        """Create a backup of current data."""
        ...
    
    async def validate_integrity(self) -> bool:
        """Validate data integrity."""
        ...
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        ...


class JSONStorageBackend:
    """JSON file storage backend."""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self._initialized = False
    
    async def initialize(self) -> bool:
        """Initialize JSON storage."""
        try:
            # JSON storage is always available
            self._initialized = True
            logger.info(f"JSON storage initialized: {self.file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize JSON storage: {e}")
            return False
    
    async def save_data(self, data: Dict[str, Any]) -> bool:
        """Save data to JSON file."""
        try:
            import json
            
            # Try async file operations first, fallback to sync
            try:
                import aiofiles
                async with aiofiles.open(self.file_path, 'w', encoding='utf-8') as f:
                    await f.write(json.dumps(data, indent=2, ensure_ascii=False))
            except ImportError:
                # Fallback to synchronous file operations
                with open(self.file_path, 'w', encoding='utf-8') as f:
                    f.write(json.dumps(data, indent=2, ensure_ascii=False))
            
            logger.debug(f"Data saved to JSON: {self.file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save data to JSON: {e}")
            return False
    
    async def load_data(self) -> Optional[Dict[str, Any]]:
        """Load data from JSON file."""
        try:
            import json
            
            if not os.path.exists(self.file_path):
                logger.info(f"JSON file not found: {self.file_path}")
                return {}
            
            # Try async file operations first, fallback to sync
            try:
                import aiofiles
                async with aiofiles.open(self.file_path, 'r', encoding='utf-8') as f:
                    content = await f.read()
                    data = json.loads(content)
            except ImportError:
                # Fallback to synchronous file operations
                with open(self.file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    data = json.loads(content)
            
            logger.debug(f"Data loaded from JSON: {self.file_path}")
            return data
        except Exception as e:
            logger.error(f"Failed to load data from JSON: {e}")
            return None
    
    async def backup_data(self) -> bool:
        """Create a backup of JSON file."""
        try:
            import shutil
            from datetime import datetime
            
            if not os.path.exists(self.file_path):
                return True  # Nothing to backup
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{self.file_path}.backup_{timestamp}"
            
            shutil.copy2(self.file_path, backup_path)
            logger.info(f"JSON backup created: {backup_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to create JSON backup: {e}")
            return False
    
    async def validate_integrity(self) -> bool:
        """Validate JSON file integrity."""
        try:
            data = await self.load_data()
            return data is not None
        except Exception as e:
            logger.error(f"JSON integrity validation failed: {e}")
            return False
    
    async def cleanup(self) -> None:
        """Cleanup JSON storage resources."""
        # No cleanup needed for JSON storage
        pass


class SQLiteStorageBackend:
    """SQLite database storage backend."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._initialized = False
        self._db = None
    
    async def initialize(self) -> bool:
        """Initialize SQLite storage."""
        try:
            try:
                from models.database_models import initialize_database
            except ImportError:
                from models.database_models_stub import initialize_database
            
            success = await initialize_database(self.db_path)
            if success:
                self._initialized = True
                logger.info(f"SQLite storage initialized: {self.db_path}")
                return True
            else:
                logger.error("Failed to initialize SQLite database")
                return False
        except Exception as e:
            logger.error(f"Failed to initialize SQLite storage: {e}")
            return False
    
    async def save_data(self, data: Dict[str, Any]) -> bool:
        """Save data to SQLite database."""
        try:
            try:
                from utils.event_manager_sqlite import EventManagerSQLite
            except ImportError:
                from utils.event_manager_sqlite_stub import EventManagerSQLite
            
            # Use SQLite event manager to save data
            event_manager = EventManagerSQLite()
            success = await event_manager.save_all_data(data)
            
            if success:
                logger.debug("Data saved to SQLite database")
                return True
            else:
                logger.error("Failed to save data to SQLite")
                return False
        except Exception as e:
            logger.error(f"Failed to save data to SQLite: {e}")
            return False
    
    async def load_data(self) -> Optional[Dict[str, Any]]:
        """Load data from SQLite database."""
        try:
            try:
                from utils.event_manager_sqlite import EventManagerSQLite
            except ImportError:
                from utils.event_manager_sqlite_stub import EventManagerSQLite
            
            # Use SQLite event manager to load data
            event_manager = EventManagerSQLite()
            data = await event_manager.load_all_data()
            
            if data is not None:
                logger.debug("Data loaded from SQLite database")
                return data
            else:
                logger.warning("No data found in SQLite database")
                return {}
        except Exception as e:
            logger.error(f"Failed to load data from SQLite: {e}")
            return None
    
    async def backup_data(self) -> bool:
        """Create a backup of SQLite database."""
        try:
            try:
                from utils.backup_rollback import BackupManager
            except ImportError:
                from utils.backup_rollback_stub import BackupManager
            
            backup_manager = BackupManager()
            success = await backup_manager.create_database_backup(self.db_path)
            
            if success:
                logger.info("SQLite backup created successfully")
                return True
            else:
                logger.error("Failed to create SQLite backup")
                return False
        except Exception as e:
            logger.error(f"Failed to create SQLite backup: {e}")
            return False
    
    async def validate_integrity(self) -> bool:
        """Validate SQLite database integrity."""
        try:
            try:
                from models.database_models import validate_database_integrity
            except ImportError:
                from models.database_models_stub import validate_database_integrity
            
            is_valid = await validate_database_integrity(self.db_path)
            if is_valid:
                logger.debug("SQLite database integrity validated")
                return True
            else:
                logger.error("SQLite database integrity check failed")
                return False
        except Exception as e:
            logger.error(f"SQLite integrity validation failed: {e}")
            return False
    
    async def cleanup(self) -> None:
        """Cleanup SQLite storage resources."""
        try:
            if self._db:
                self._db.close()
                self._db = None
            logger.debug("SQLite storage resources cleaned up")
        except Exception as e:
            logger.error(f"Failed to cleanup SQLite resources: {e}")


class StorageAdapter:
    """
    Unified storage adapter with automatic fallback.
    
    This class provides a single interface for data storage that can
    automatically switch between SQLite and JSON backends based on
    feature flags and error conditions.
    """
    
    def __init__(self, json_path: str, sqlite_path: str):
        self.json_path = json_path
        self.sqlite_path = sqlite_path
        
        self.json_backend = JSONStorageBackend(json_path)
        self.sqlite_backend = SQLiteStorageBackend(sqlite_path)
        
        self._current_backend: Optional[StorageBackend] = None
        self._fallback_backend: Optional[StorageBackend] = None
        
        self._initialized = False
    
    async def initialize(self) -> bool:
        """Initialize the storage adapter."""
        try:
            # Determine primary backend based on feature flags
            if feature_flags.is_enabled(FeatureFlag.SQLITE_STORAGE):
                primary_backend = self.sqlite_backend
                fallback_backend = self.json_backend
                logger.info("Using SQLite as primary storage backend")
            else:
                primary_backend = self.json_backend
                fallback_backend = self.sqlite_backend
                logger.info("Using JSON as primary storage backend")
            
            # Initialize primary backend
            if await primary_backend.initialize():
                self._current_backend = primary_backend
                self._fallback_backend = fallback_backend
                
                # Initialize fallback backend for safety
                await fallback_backend.initialize()
                
                self._initialized = True
                logger.info("Storage adapter initialized successfully")
                return True
            else:
                # Primary backend failed, try fallback
                logger.warning("Primary backend failed, attempting fallback")
                return await self._trigger_fallback("Primary backend initialization failed")
        
        except Exception as e:
            logger.error(f"Failed to initialize storage adapter: {e}")
            return False
    
    async def _trigger_fallback(self, reason: str) -> bool:
        """Trigger fallback to alternative storage backend."""
        try:
            if not self._fallback_backend:
                logger.error("No fallback backend available")
                return False
            
            # Trigger feature flag fallback
            if isinstance(self._current_backend, SQLiteStorageBackend):
                feature_flags.trigger_fallback(FeatureFlag.SQLITE_STORAGE, reason)
            
            # Switch to fallback backend
            if await self._fallback_backend.initialize():
                old_backend = self._current_backend
                self._current_backend = self._fallback_backend
                self._fallback_backend = old_backend
                
                logger.warning(f"Fallback successful: {reason}")
                return True
            else:
                logger.error("Fallback backend also failed")
                return False
        
        except Exception as e:
            logger.error(f"Fallback failed: {e}")
            return False
    
    async def save_data(self, data: Dict[str, Any]) -> bool:
        """Save data using current backend with fallback."""
        if not self._initialized or not self._current_backend:
            logger.error("Storage adapter not initialized")
            return False
        
        try:
            # Try primary backend
            if await self._current_backend.save_data(data):
                return True
            
            # Primary failed, try fallback
            logger.warning("Primary backend save failed, attempting fallback")
            if await self._trigger_fallback("Save operation failed"):
                return await self._current_backend.save_data(data)
            
            return False
        
        except Exception as e:
            logger.error(f"Save operation failed: {e}")
            return False
    
    async def load_data(self) -> Optional[Dict[str, Any]]:
        """Load data using current backend with fallback."""
        if not self._initialized or not self._current_backend:
            logger.error("Storage adapter not initialized")
            return None
        
        try:
            # Try primary backend
            data = await self._current_backend.load_data()
            if data is not None:
                return data
            
            # Primary failed, try fallback
            logger.warning("Primary backend load failed, attempting fallback")
            if await self._trigger_fallback("Load operation failed"):
                return await self._current_backend.load_data()
            
            return None
        
        except Exception as e:
            logger.error(f"Load operation failed: {e}")
            return None
    
    async def backup_data(self) -> bool:
        """Create backup using current backend."""
        if not self._initialized or not self._current_backend:
            logger.error("Storage adapter not initialized")
            return False
        
        try:
            return await self._current_backend.backup_data()
        except Exception as e:
            logger.error(f"Backup operation failed: {e}")
            return False
    
    async def validate_integrity(self) -> bool:
        """Validate data integrity using current backend."""
        if not self._initialized or not self._current_backend:
            logger.error("Storage adapter not initialized")
            return False
        
        try:
            is_valid = await self._current_backend.validate_integrity()
            if not is_valid:
                logger.warning("Data integrity check failed")
                # Don't trigger fallback for integrity issues, just report
            
            return is_valid
        except Exception as e:
            logger.error(f"Integrity validation failed: {e}")
            return False
    
    async def cleanup(self) -> None:
        """Cleanup all storage resources."""
        try:
            if self._current_backend:
                await self._current_backend.cleanup()
            if self._fallback_backend:
                await self._fallback_backend.cleanup()
            
            self._initialized = False
            logger.info("Storage adapter cleaned up")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
    
    def get_current_backend_type(self) -> str:
        """Get the type of current active backend."""
        if isinstance(self._current_backend, SQLiteStorageBackend):
            return "SQLite"
        elif isinstance(self._current_backend, JSONStorageBackend):
            return "JSON"
        else:
            return "Unknown"
    
    def is_using_sqlite(self) -> bool:
        """Check if currently using SQLite backend."""
        return isinstance(self._current_backend, SQLiteStorageBackend)
    
    def is_using_json(self) -> bool:
        """Check if currently using JSON backend."""
        return isinstance(self._current_backend, JSONStorageBackend)