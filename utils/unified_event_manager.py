"""
Unified event manager that integrates SQLite and JSON backends.

This module provides a single event manager interface that can
seamlessly switch between SQLite and JSON storage based on
feature flags and system health.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional, Union

from config.feature_flags import FeatureFlag, feature_flags
from config.settings import Settings
from utils.storage_adapter import StorageAdapter
from utils.system_integration import system_integrator

logger = logging.getLogger(__name__)


class UnifiedEventManager:
    """
    Unified event manager with automatic backend switching.

    This class provides a single interface for event management that
    can automatically switch between SQLite and JSON backends based
    on feature flags, system health, and error conditions.
    """

    def __init__(self):
        self._storage_adapter: Optional[StorageAdapter] = None
        self._current_manager = None
        self._fallback_manager = None
        self._initialized = False

        # Event data cache for consistency during backend switches
        self._event_cache: Dict[str, Any] = {}
        self._cache_dirty = False

    async def initialize(self) -> bool:
        """Initialize the unified event manager."""
        try:
            # Initialize system integrator
            if not system_integrator._initialized:
                await system_integrator.initialize()

            # Initialize storage adapter
            self._storage_adapter = StorageAdapter(
                json_path=Settings.REMINDERS_SAVE_FILE, sqlite_path=Settings.DATABASE_PATH
            )

            if not await self._storage_adapter.initialize():
                logger.error("Failed to initialize storage adapter")
                return False

            # Get appropriate event manager implementation
            self._current_manager = system_integrator.get_event_manager()
            if not self._current_manager:
                logger.error("No event manager implementation available")
                return False

            # Initialize the current manager
            if hasattr(self._current_manager, "initialize"):
                await self._current_manager.initialize()

            # Load initial data
            await self._load_initial_data()

            self._initialized = True
            logger.info(
                f"Unified event manager initialized with {self._storage_adapter.get_current_backend_type()} backend"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to initialize unified event manager: {e}")
            return False

    async def _load_initial_data(self) -> None:
        """Load initial event data from storage."""
        try:
            data = await self._storage_adapter.load_data()
            if data:
                self._event_cache = data
                logger.info(f"Loaded {len(data.get('events', {}))} events from storage")
            else:
                self._event_cache = {"events": {}, "metadata": {}}
                logger.info("No existing data found, starting with empty cache")
        except Exception as e:
            logger.error(f"Failed to load initial data: {e}")
            self._event_cache = {"events": {}, "metadata": {}}

    async def _sync_cache_to_storage(self) -> bool:
        """Sync the event cache to storage."""
        if not self._cache_dirty:
            return True

        try:
            success = await self._storage_adapter.save_data(self._event_cache)
            if success:
                self._cache_dirty = False
                logger.debug("Event cache synced to storage")
            return success
        except Exception as e:
            logger.error(f"Failed to sync cache to storage: {e}")
            return False

    async def _handle_backend_switch(self) -> bool:
        """Handle switching to a different backend."""
        try:
            # Sync current cache before switching
            await self._sync_cache_to_storage()

            # Get new manager implementation
            new_manager = system_integrator.get_event_manager()
            if new_manager and new_manager != self._current_manager:
                logger.info("Switching event manager backend")

                # Initialize new manager
                if hasattr(new_manager, "initialize"):
                    await new_manager.initialize()

                # Transfer data if needed
                await self._transfer_data_to_new_backend(new_manager)

                self._current_manager = new_manager
                return True

            return False
        except Exception as e:
            logger.error(f"Backend switch failed: {e}")
            return False

    async def _transfer_data_to_new_backend(self, new_manager) -> None:
        """Transfer data to a new backend manager."""
        try:
            # If the new manager has a bulk import method, use it
            if hasattr(new_manager, "import_events"):
                await new_manager.import_events(self._event_cache.get("events", {}))
            else:
                # Otherwise, add events one by one
                for event_id, event_data in self._event_cache.get("events", {}).items():
                    if hasattr(new_manager, "add_event"):
                        await new_manager.add_event(event_data)

            logger.info("Data transferred to new backend")
        except Exception as e:
            logger.error(f"Failed to transfer data to new backend: {e}")

    # Event Management Methods

    async def add_event(self, message_id: int, **kwargs) -> bool:
        """Add a new event to monitoring."""
        if not self._initialized:
            logger.error("Event manager not initialized")
            return False

        try:
            # Add to current manager
            if hasattr(self._current_manager, "add_event"):
                success = await self._current_manager.add_event(message_id, **kwargs)
            else:
                # Fallback to direct cache manipulation
                event_data = {"message_id": message_id, **kwargs}
                self._event_cache["events"][str(message_id)] = event_data
                success = True

            if success:
                # Update cache
                self._event_cache["events"][str(message_id)] = {"message_id": message_id, **kwargs}
                self._cache_dirty = True

                # Sync to storage
                await self._sync_cache_to_storage()

                logger.info(f"Event added: {message_id}")
                return True
            else:
                logger.error(f"Failed to add event: {message_id}")
                return False

        except Exception as e:
            logger.error(f"Error adding event {message_id}: {e}")

            # Try backend switch on error
            if await self._handle_backend_switch():
                return await self.add_event(message_id, **kwargs)

            return False

    async def remove_event(self, message_id: int) -> bool:
        """Remove an event from monitoring."""
        if not self._initialized:
            logger.error("Event manager not initialized")
            return False

        try:
            # Remove from current manager
            if hasattr(self._current_manager, "remove_event"):
                success = await self._current_manager.remove_event(message_id)
            else:
                # Fallback to direct cache manipulation
                if str(message_id) in self._event_cache["events"]:
                    del self._event_cache["events"][str(message_id)]
                    success = True
                else:
                    success = False

            if success:
                # Update cache
                if str(message_id) in self._event_cache["events"]:
                    del self._event_cache["events"][str(message_id)]
                    self._cache_dirty = True

                # Sync to storage
                await self._sync_cache_to_storage()

                logger.info(f"Event removed: {message_id}")
                return True
            else:
                logger.warning(f"Event not found for removal: {message_id}")
                return False

        except Exception as e:
            logger.error(f"Error removing event {message_id}: {e}")

            # Try backend switch on error
            if await self._handle_backend_switch():
                return await self.remove_event(message_id)

            return False

    async def get_event(self, message_id: int) -> Optional[Dict[str, Any]]:
        """Get event data by message ID."""
        if not self._initialized:
            logger.error("Event manager not initialized")
            return None

        try:
            # Try current manager first
            if hasattr(self._current_manager, "get_event"):
                event = await self._current_manager.get_event(message_id)
                if event:
                    return event

            # Fallback to cache
            return self._event_cache["events"].get(str(message_id))

        except Exception as e:
            logger.error(f"Error getting event {message_id}: {e}")
            return None

    async def get_all_events(self, guild_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get all events, optionally filtered by guild."""
        if not self._initialized:
            logger.error("Event manager not initialized")
            return []

        try:
            # Try current manager first
            if hasattr(self._current_manager, "get_all_events"):
                events = await self._current_manager.get_all_events(guild_id)
                if events:
                    return events

            # Fallback to cache
            all_events = list(self._event_cache["events"].values())

            if guild_id:
                return [event for event in all_events if event.get("guild_id") == guild_id]

            return all_events

        except Exception as e:
            logger.error(f"Error getting all events: {e}")
            return []

    async def update_event(self, message_id: int, **kwargs) -> bool:
        """Update an existing event."""
        if not self._initialized:
            logger.error("Event manager not initialized")
            return False

        try:
            # Update in current manager
            if hasattr(self._current_manager, "update_event"):
                success = await self._current_manager.update_event(message_id, **kwargs)
            else:
                # Fallback to direct cache manipulation
                if str(message_id) in self._event_cache["events"]:
                    self._event_cache["events"][str(message_id)].update(kwargs)
                    success = True
                else:
                    success = False

            if success:
                # Update cache
                if str(message_id) in self._event_cache["events"]:
                    self._event_cache["events"][str(message_id)].update(kwargs)
                    self._cache_dirty = True

                # Sync to storage
                await self._sync_cache_to_storage()

                logger.debug(f"Event updated: {message_id}")
                return True
            else:
                logger.warning(f"Event not found for update: {message_id}")
                return False

        except Exception as e:
            logger.error(f"Error updating event {message_id}: {e}")

            # Try backend switch on error
            if await self._handle_backend_switch():
                return await self.update_event(message_id, **kwargs)

            return False

    async def pause_event(self, message_id: int) -> bool:
        """Pause an event."""
        return await self.update_event(message_id, is_paused=True)

    async def resume_event(self, message_id: int) -> bool:
        """Resume an event."""
        return await self.update_event(message_id, is_paused=False)

    async def get_due_events(self) -> List[Dict[str, Any]]:
        """Get events that are due for reminders."""
        if not self._initialized:
            logger.error("Event manager not initialized")
            return []

        try:
            # Try current manager first
            if hasattr(self._current_manager, "get_due_events"):
                return await self._current_manager.get_due_events()

            # Fallback to basic implementation
            # This would need more sophisticated logic in a real implementation
            return []

        except Exception as e:
            logger.error(f"Error getting due events: {e}")
            return []

    # Storage and Backup Methods

    async def save_to_storage(self) -> bool:
        """Save all events to storage."""
        return await self._sync_cache_to_storage()

    async def load_from_storage(self) -> bool:
        """Load events from storage."""
        try:
            await self._load_initial_data()
            return True
        except Exception as e:
            logger.error(f"Failed to load from storage: {e}")
            return False

    async def backup_data(self) -> bool:
        """Create a backup of current data."""
        if not self._storage_adapter:
            return False

        return await self._storage_adapter.backup_data()

    async def validate_data_integrity(self) -> bool:
        """Validate data integrity."""
        if not self._storage_adapter:
            return False

        return await self._storage_adapter.validate_integrity()

    # Status and Monitoring Methods

    def get_status(self) -> Dict[str, Any]:
        """Get current status of the event manager."""
        return {
            "initialized": self._initialized,
            "backend_type": (
                self._storage_adapter.get_current_backend_type()
                if self._storage_adapter
                else "Unknown"
            ),
            "event_count": len(self._event_cache.get("events", {})),
            "cache_dirty": self._cache_dirty,
            "feature_flags": feature_flags.get_status_summary(),
            "system_status": system_integrator.get_system_status(),
        }

    def is_using_sqlite(self) -> bool:
        """Check if currently using SQLite backend."""
        return self._storage_adapter and self._storage_adapter.is_using_sqlite()

    def is_using_json(self) -> bool:
        """Check if currently using JSON backend."""
        return self._storage_adapter and self._storage_adapter.is_using_json()

    async def cleanup(self) -> None:
        """Cleanup resources."""
        try:
            # Sync any pending changes
            await self._sync_cache_to_storage()

            # Cleanup storage adapter
            if self._storage_adapter:
                await self._storage_adapter.cleanup()

            # Cleanup system integrator
            await system_integrator.cleanup()

            self._initialized = False
            logger.info("Unified event manager cleaned up")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")


# Global unified event manager instance
unified_event_manager = UnifiedEventManager()
