"""
Data migration utilities for Discord Reminder Bot.

This module handles migration of data from older versions to support
the new minute-based interval system and enhanced features.
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, Any

from config.settings import Settings

# Get logger for this module
logger = logging.getLogger(__name__)


def migrate_matches_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Migrate matches data from old format to new format.

    This function handles:
    - Converting from hour-based to minute-based intervals
    - Adding new fields (is_paused, created_at, interval_minutes)
    - Ensuring backward compatibility

    Args:
        data: Raw data dictionary from JSON file

    Returns:
        Dict: Migrated data dictionary
    """
    migrated_data = {}
    migration_count = 0

    for match_id_str, match_data in data.items():
        try:
            # Convert string keys back to integers
            match_id = int(match_id_str)

            # Check if migration is needed
            needs_migration = False

            # Add interval_minutes if missing
            if 'interval_minutes' not in match_data:
                # Use global setting as default
                match_data['interval_minutes'] = Settings.get_reminder_interval_minutes()
                needs_migration = True
                logger.debug(f"Added interval_minutes to match {match_id}")

            # Add is_paused if missing
            if 'is_paused' not in match_data:
                match_data['is_paused'] = False
                needs_migration = True
                logger.debug(f"Added is_paused to match {match_id}")

            # Add created_at if missing
            if 'created_at' not in match_data:
                # Use last_reminder as fallback
                if 'last_reminder' in match_data:
                    match_data['created_at'] = match_data['last_reminder']
                else:
                    match_data['created_at'] = datetime.now().isoformat()
                needs_migration = True
                logger.debug(f"Added created_at to match {match_id}")

            # Ensure guild_id exists (backward compatibility)
            if 'guild_id' not in match_data:
                match_data['guild_id'] = 0  # Will need manual fixing
                needs_migration = True
                logger.warning(f"Added missing guild_id to match {match_id}")

            # Validate and clamp interval_minutes
            if match_data['interval_minutes'] < Settings.MIN_INTERVAL_MINUTES:
                match_data['interval_minutes'] = Settings.MIN_INTERVAL_MINUTES
                needs_migration = True
                logger.info(f"Clamped interval_minutes to minimum for match {match_id}")
            elif match_data['interval_minutes'] > Settings.MAX_INTERVAL_MINUTES:
                match_data['interval_minutes'] = Settings.MAX_INTERVAL_MINUTES
                needs_migration = True
                logger.info(f"Clamped interval_minutes to maximum for match {match_id}")

            migrated_data[match_id] = match_data

            if needs_migration:
                migration_count += 1

        except (ValueError, KeyError) as e:
            logger.error(f"Error migrating match {match_id_str}: {e}")
            # Skip problematic entries
            continue

    if migration_count > 0:
        logger.info(f"Migrated {migration_count} matches to new format")
    else:
        logger.debug("No migration needed - all matches already in current format")

    return migrated_data


def backup_data_file(file_path: str) -> str:
    """
    Create a backup of the data file before migration.

    Args:
        file_path: Path to the original data file

    Returns:
        str: Path to the backup file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{file_path}.backup_{timestamp}"

    try:
        if os.path.exists(file_path):
            import shutil
            shutil.copy2(file_path, backup_path)
            logger.info(f"Created backup: {backup_path}")
        return backup_path
    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
        return ""


def run_migration() -> bool:
    """
    Run the complete migration process.

    Returns:
        bool: True if migration was successful, False otherwise
    """
    data_file = Settings.REMINDERS_SAVE_FILE

    try:
        # Check if file exists
        if not os.path.exists(data_file):
            logger.info("No existing data file found - starting fresh")
            return True

        # Create backup
        backup_path = backup_data_file(data_file)
        if not backup_path:
            logger.warning("Proceeding without backup (backup failed)")

        # Load existing data
        with open(data_file, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        logger.info(f"Loaded {len(raw_data)} matches from {data_file}")

        # Migrate data
        migrated_data = migrate_matches_data(raw_data)

        # Save migrated data
        with open(data_file, 'w', encoding='utf-8') as f:
            json.dump(migrated_data, f, indent=2, ensure_ascii=False)

        logger.info(f"Migration completed successfully. Migrated data saved to {data_file}")

        if backup_path:
            logger.info(f"Original data backed up to {backup_path}")

        return True

    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in data file {data_file}: {e}")
        return False
    except FileNotFoundError:
        logger.info("No existing data file found - starting fresh")
        return True
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False


def check_migration_needed() -> bool:
    """
    Check if migration is needed by examining the data file.

    Returns:
        bool: True if migration is needed, False otherwise
    """
    data_file = Settings.REMINDERS_SAVE_FILE

    try:
        if not os.path.exists(data_file):
            return False  # No file = no migration needed

        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Check a few entries to see if migration is needed
        for match_data in list(data.values())[:3]:  # Check first 3 entries
            if ('interval_minutes' not in match_data or
                'is_paused' not in match_data or
                'created_at' not in match_data):
                return True

        return False

    except Exception as e:
        logger.error(f"Error checking migration status: {e}")
        return False


def get_migration_status() -> Dict[str, Any]:
    """
    Get detailed migration status information.

    Returns:
        Dict containing migration status details
    """
    data_file = Settings.REMINDERS_SAVE_FILE
    status = {
        'file_exists': os.path.exists(data_file),
        'migration_needed': False,
        'total_matches': 0,
        'matches_needing_migration': 0,
        'backup_available': False
    }

    try:
        if status['file_exists']:
            with open(data_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            status['total_matches'] = len(data)

            for match_data in data.values():
                if ('interval_minutes' not in match_data or
                    'is_paused' not in match_data or
                    'created_at' not in match_data):
                    status['matches_needing_migration'] += 1

            status['migration_needed'] = status['matches_needing_migration'] > 0

            # Check for existing backups
            import glob
            backup_pattern = f"{data_file}.backup_*"
            backups = glob.glob(backup_pattern)
            status['backup_available'] = len(backups) > 0

    except Exception as e:
        logger.error(f"Error getting migration status: {e}")

    return status