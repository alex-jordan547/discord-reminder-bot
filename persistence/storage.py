"""
Compatibility layer for old storage system.

This module provides backward compatibility for tests that still use
the old load_matches/save_matches API.
"""

import asyncio
import logging
from typing import Any, Dict, Optional

from utils.storage_adapter import storage_adapter

logger = logging.getLogger(__name__)

# Mock SAVE_FILE for tests that patch it
SAVE_FILE = "watched_reminders.json"


def load_matches() -> Dict[str, Any]:
    """
    Load matches using the old API (synchronous).

    This is a compatibility function that wraps the new async storage adapter.
    """
    try:
        # Run the async function in the current event loop or create a new one
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If we're already in an async context, we can't use run()
                # This is a limitation of the compatibility layer
                logger.warning("load_matches called from async context - returning empty dict")
                return {}
            else:
                return loop.run_until_complete(storage_adapter.load_data()) or {}
        except RuntimeError:
            # No event loop, create a new one
            return asyncio.run(storage_adapter.load_data()) or {}
    except Exception as e:
        logger.error(f"Error in load_matches compatibility function: {e}")
        return {}


def save_matches(data: Dict[str, Any]) -> bool:
    """
    Save matches using the old API (synchronous).

    This is a compatibility function that wraps the new async storage adapter.
    """
    try:
        # Run the async function in the current event loop or create a new one
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If we're already in an async context, we can't use run()
                # This is a limitation of the compatibility layer
                logger.warning("save_matches called from async context - returning False")
                return False
            else:
                return loop.run_until_complete(storage_adapter.save_data(data))
        except RuntimeError:
            # No event loop, create a new one
            return asyncio.run(storage_adapter.save_data(data))
    except Exception as e:
        logger.error(f"Error in save_matches compatibility function: {e}")
        return False


# Async versions for better compatibility
async def load_matches_async() -> Dict[str, Any]:
    """Load matches asynchronously."""
    try:
        data = await storage_adapter.load_data()
        return data or {}
    except Exception as e:
        logger.error(f"Error in load_matches_async: {e}")
        return {}


async def save_matches_async(data: Dict[str, Any]) -> bool:
    """Save matches asynchronously."""
    try:
        return await storage_adapter.save_data(data)
    except Exception as e:
        logger.error(f"Error in save_matches_async: {e}")
        return False
