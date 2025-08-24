"""
Storage and persistence module for Discord Reminder Bot.

This module handles saving and loading match reminder data to/from JSON files.
It provides functions to persist the application state across restarts.
"""

import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional

from models.reminder import Reminder

# Constants
SAVE_FILE = 'watched_reminders.json'

# Get logger for this module
logger = logging.getLogger(__name__)

# Global lock for file operations to prevent race conditions
_file_lock = asyncio.Lock()


def save_matches(watched_matches: Dict[int, Reminder]) -> bool:
    """
    Save the watched matches dictionary to a JSON file.

    Args:
        watched_matches: Dictionary mapping message IDs to Reminder instances

    Returns:
        bool: True if save was successful, False otherwise
    """
    try:
        # Convert Reminder instances to dictionaries for JSON serialization
        data = {str(k): v.to_dict() for k, v in watched_matches.items()}

        with open(SAVE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.debug(f"Successfully saved {len(watched_matches)} matches to {SAVE_FILE}")
        return True

    except IOError as e:
        logger.error(f"Failed to save matches to {SAVE_FILE}: {e}")
        return False
    except json.JSONEncodeError as e:
        logger.error(f"Failed to encode matches to JSON: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error while saving matches: {e}")
        return False


def load_matches() -> Dict[int, Reminder]:
    """
    Load watched matches from the JSON save file.

    This function now includes automatic migration for older data formats.

    Returns:
        Dict[int, Reminder]: Dictionary mapping message IDs to Reminder instances
        Returns empty dict if file doesn't exist or loading fails
    """
    try:
        # Check if migration is needed and run it
        from utils.migration import check_migration_needed, run_migration

        if check_migration_needed():
            logger.info("Data migration needed - running migration...")
            if not run_migration():
                logger.error("Migration failed - proceeding with original data")

        with open(SAVE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Convert dictionaries back to Reminder instances
        watched_matches = {int(k): Reminder.from_dict(v) for k, v in data.items()}

        logger.info(f"Successfully loaded {len(watched_matches)} matches from {SAVE_FILE}")
        return watched_matches

    except FileNotFoundError:
        logger.info(f"No save file found at {SAVE_FILE}, starting with empty matches")
        return {}
    except json.decoder.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON from {SAVE_FILE}: {e}")
        return {}
    except KeyError as e:
        logger.error(f"Invalid data structure in {SAVE_FILE}, missing key: {e}")
        return {}
    except Exception as e:
        logger.error(f"Unexpected error while loading matches: {e}")
        return {}


def backup_matches(watched_matches: Dict[int, Reminder], backup_suffix: Optional[str] = None) -> bool:
    """
    Create a backup of the current matches data.

    Args:
        watched_matches: Dictionary mapping message IDs to Reminder instances
        backup_suffix: Optional suffix for the backup file name

    Returns:
        bool: True if backup was successful, False otherwise
    """
    try:
        if backup_suffix:
            backup_file = f"watched_matches_{backup_suffix}.json"
        else:
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = f"watched_matches_backup_{timestamp}.json"

        # Convert Reminder instances to dictionaries for JSON serialization
        data = {str(k): v.to_dict() for k, v in watched_matches.items()}

        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.info(f"Successfully created backup: {backup_file}")
        return True

    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
        return False


async def save_matches_atomic(watched_matches: Dict[int, Reminder]) -> bool:
    """
    Save the watched matches dictionary atomically to prevent corruption.

    This function uses atomic file operations and locks to ensure thread-safety
    and prevents data corruption during concurrent operations.

    Args:
        watched_matches: Dictionary mapping message IDs to Reminder instances

    Returns:
        bool: True if save was successful, False otherwise
    """
    async with _file_lock:
        try:
            # Convert Reminder instances to dictionaries for JSON serialization
            data = {str(k): v.to_dict() for k, v in watched_matches.items()}

            # Create temporary file in same directory to ensure atomic operation
            save_path = Path(SAVE_FILE)
            temp_file = None

            try:
                # Create temporary file
                with tempfile.NamedTemporaryFile(
                    mode='w',
                    encoding='utf-8',
                    dir=save_path.parent,
                    prefix=f"{save_path.stem}_temp_",
                    suffix=save_path.suffix,
                    delete=False
                ) as temp_file:
                    json.dump(data, temp_file, indent=2, ensure_ascii=False)
                    temp_file_path = temp_file.name

                # Atomic move - this is atomic on most filesystems
                os.replace(temp_file_path, SAVE_FILE)

                logger.debug(f"Atomically saved {len(watched_matches)} reminders to {SAVE_FILE}")
                return True

            except Exception as e:
                # Clean up temporary file if something went wrong
                if temp_file and os.path.exists(temp_file.name):
                    try:
                        os.unlink(temp_file.name)
                    except OSError:
                        pass  # If we can't delete, it's not critical
                raise e

        except IOError as e:
            logger.error(f"Failed to save reminders to {SAVE_FILE}: {e}")
            return False
        except json.JSONEncodeError as e:
            logger.error(f"Failed to encode reminders to JSON: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error while saving reminders: {e}")
            return False


async def load_matches_safe() -> Dict[int, Reminder]:
    """
    Load watched matches from the JSON save file with safety checks.

    This function includes retry logic and validation to handle
    concurrent access and potential file corruption.

    Returns:
        Dict[int, Reminder]: Dictionary mapping message IDs to Reminder instances
        Returns empty dict if file doesn't exist or loading fails
    """
    max_retries = 3
    retry_delay = 0.1  # 100ms

    for attempt in range(max_retries):
        try:
            # Check if migration is needed and run it
            from utils.migration import check_migration_needed, run_migration

            if check_migration_needed():
                logger.info("Data migration needed - running migration...")
                if not run_migration():
                    logger.error("Migration failed - proceeding with original data")

            async with _file_lock:
                with open(SAVE_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Validate data structure
                if not isinstance(data, dict):
                    raise ValueError("Invalid data structure: expected dictionary")

                # Convert dictionaries back to Reminder instances with validation
                watched_matches = {}
                for k, v in data.items():
                    try:
                        message_id = int(k)
                        reminder = Reminder.from_dict(v)
                        watched_matches[message_id] = reminder
                    except (ValueError, KeyError, TypeError) as e:
                        logger.warning(f"Skipping invalid reminder data for key {k}: {e}")
                        continue

                logger.info(f"Successfully loaded {len(watched_matches)} reminders from {SAVE_FILE}")
                return watched_matches

        except FileNotFoundError:
            logger.info(f"No save file found at {SAVE_FILE}, starting with empty reminders")
            return {}
        except json.decoder.JSONDecodeError as e:
            if attempt < max_retries - 1:
                logger.warning(f"JSON decode error on attempt {attempt + 1}, retrying: {e}")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                continue
            else:
                logger.error(f"Failed to decode JSON from {SAVE_FILE} after {max_retries} attempts: {e}")
                return {}
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"Error loading reminders on attempt {attempt + 1}, retrying: {e}")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                continue
            else:
                logger.error(f"Failed to load reminders after {max_retries} attempts: {e}")
                return {}

    return {}  # Fallback


async def verify_data_integrity(watched_matches: Dict[int, Reminder]) -> bool:
    """
    Verify the integrity of reminder data.

    Args:
        watched_matches: Dictionary of reminders to verify

    Returns:
        bool: True if data is valid, False otherwise
    """
    try:
        for message_id, reminder in watched_matches.items():
            # Basic type checks
            if not isinstance(message_id, int):
                logger.error(f"Invalid message_id type: {type(message_id)}")
                return False

            if not isinstance(reminder, Reminder):
                logger.error(f"Invalid reminder type: {type(reminder)}")
                return False

            # Check required attributes
            required_attrs = ['message_id', 'channel_id', 'guild_id', 'title']
            for attr in required_attrs:
                if not hasattr(reminder, attr):
                    logger.error(f"Reminder missing required attribute: {attr}")
                    return False

            # Validate data consistency
            if reminder.message_id != message_id:
                logger.error(f"Message ID mismatch: key={message_id}, reminder={reminder.message_id}")
                return False

        logger.debug(f"Data integrity check passed for {len(watched_matches)} reminders")
        return True

    except Exception as e:
        logger.error(f"Error during data integrity check: {e}")
        return False


def get_file_lock_status() -> Dict[str, bool]:
    """
    Get the current status of file locks for monitoring.

    Returns:
        Dict[str, bool]: Lock status information
    """
    return {
        'file_lock_locked': _file_lock.locked(),
        'save_file_exists': os.path.exists(SAVE_FILE)
    }