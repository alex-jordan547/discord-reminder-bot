"""
Backup and rollback service for JSON to SQLite migration.

This module handles backup creation, rollback operations, and post-migration validation
to ensure data safety during the migration process.
"""

import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models.database_models import ALL_MODELS, Event, Guild, Reaction, User, initialize_models
from persistence.database import get_database
from utils.data_migration import MigrationError, MigrationResult

# Get logger for this module
logger = logging.getLogger(__name__)


class BackupResult:
    """Result object for backup operations."""

    def __init__(self):
        self.success = False
        self.backup_path: Optional[str] = None
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.backup_size: int = 0
        self.backup_time: float = 0.0

    def add_error(self, error: str):
        """Add an error message."""
        self.errors.append(error)
        logger.error(f"Backup error: {error}")

    def add_warning(self, warning: str):
        """Add a warning message."""
        self.warnings.append(warning)
        logger.warning(f"Backup warning: {warning}")


class RollbackResult:
    """Result object for rollback operations."""

    def __init__(self):
        self.success = False
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.restored_file: Optional[str] = None
        self.database_cleared = False
        self.rollback_time: float = 0.0

    def add_error(self, error: str):
        """Add an error message."""
        self.errors.append(error)
        logger.error(f"Rollback error: {error}")

    def add_warning(self, warning: str):
        """Add a warning message."""
        self.warnings.append(warning)
        logger.warning(f"Rollback warning: {warning}")


class ValidationResult:
    """Result object for post-migration validation."""

    def __init__(self):
        self.success = False
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.data_integrity_score: float = 0.0
        self.comparison_stats = {
            "events_compared": 0,
            "events_matched": 0,
            "reactions_compared": 0,
            "reactions_matched": 0,
            "data_mismatches": 0,
        }

    def add_error(self, error: str):
        """Add an error message."""
        self.errors.append(error)
        logger.error(f"Validation error: {error}")

    def add_warning(self, warning: str):
        """Add a warning message."""
        self.warnings.append(warning)
        logger.warning(f"Validation warning: {warning}")


class BackupManager:
    """Manages backup operations for JSON files."""

    def __init__(self, backup_dir: str = "data/backups"):
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def create_automatic_backup(self, json_file_path: str) -> BackupResult:
        """
        Create an automatic backup before migration.

        Args:
            json_file_path: Path to the JSON file to backup

        Returns:
            BackupResult: Result of the backup operation
        """
        result = BackupResult()
        start_time = datetime.now()

        try:
            if not os.path.exists(json_file_path):
                result.add_error(f"JSON file not found: {json_file_path}")
                return result

            # Create backup filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"auto_backup_{timestamp}.json"
            backup_path = self.backup_dir / backup_filename

            # Copy file with metadata preservation
            shutil.copy2(json_file_path, backup_path)

            # Verify backup
            if not backup_path.exists():
                result.add_error("Backup file was not created")
                return result

            # Get backup info
            backup_stat = backup_path.stat()
            original_stat = Path(json_file_path).stat()

            if backup_stat.st_size != original_stat.st_size:
                result.add_error("Backup file size doesn't match original")
                return result

            # Verify JSON integrity
            try:
                with open(backup_path, "r", encoding="utf-8") as f:
                    json.load(f)
            except json.JSONDecodeError as e:
                result.add_error(f"Backup file contains invalid JSON: {e}")
                return result

            result.success = True
            result.backup_path = str(backup_path)
            result.backup_size = backup_stat.st_size
            result.backup_time = (datetime.now() - start_time).total_seconds()

            logger.info(f"Automatic backup created successfully: {backup_path}")

        except Exception as e:
            result.add_error(f"Failed to create automatic backup: {e}")
            logger.exception("Failed to create automatic backup")

        return result

    def create_manual_backup(
        self, json_file_path: str, backup_name: Optional[str] = None
    ) -> BackupResult:
        """
        Create a manual backup with custom name.

        Args:
            json_file_path: Path to the JSON file to backup
            backup_name: Optional custom name for the backup

        Returns:
            BackupResult: Result of the backup operation
        """
        result = BackupResult()
        start_time = datetime.now()

        try:
            if not os.path.exists(json_file_path):
                result.add_error(f"JSON file not found: {json_file_path}")
                return result

            # Create backup filename
            if backup_name:
                # Sanitize backup name
                backup_name = "".join(
                    c for c in backup_name if c.isalnum() or c in (" ", "-", "_")
                ).rstrip()
                backup_filename = (
                    f"manual_{backup_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                )
            else:
                backup_filename = f"manual_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

            backup_path = self.backup_dir / backup_filename

            # Copy file
            shutil.copy2(json_file_path, backup_path)

            # Verify backup (same as automatic backup)
            if not backup_path.exists():
                result.add_error("Backup file was not created")
                return result

            backup_stat = backup_path.stat()
            original_stat = Path(json_file_path).stat()

            if backup_stat.st_size != original_stat.st_size:
                result.add_error("Backup file size doesn't match original")
                return result

            result.success = True
            result.backup_path = str(backup_path)
            result.backup_size = backup_stat.st_size
            result.backup_time = (datetime.now() - start_time).total_seconds()

            logger.info(f"Manual backup created successfully: {backup_path}")

        except Exception as e:
            result.add_error(f"Failed to create manual backup: {e}")
            logger.exception("Failed to create manual backup")

        return result

    def list_backups(self) -> List[Dict[str, Any]]:
        """
        List all available backup files.

        Returns:
            List[Dict[str, Any]]: List of backup file information
        """
        backups = []

        try:
            if not self.backup_dir.exists():
                return backups

            for backup_file in self.backup_dir.glob("*.json"):
                try:
                    stat = backup_file.stat()
                    backup_info = {
                        "filename": backup_file.name,
                        "path": str(backup_file),
                        "size": stat.st_size,
                        "created": datetime.fromtimestamp(stat.st_ctime),
                        "modified": datetime.fromtimestamp(stat.st_mtime),
                        "type": "auto" if backup_file.name.startswith("auto_") else "manual",
                    }

                    # Try to get event count from backup
                    try:
                        with open(backup_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            backup_info["event_count"] = len(data) if isinstance(data, dict) else 0
                    except Exception:
                        backup_info["event_count"] = -1  # Unknown

                    backups.append(backup_info)

                except Exception as e:
                    logger.warning(f"Failed to get info for backup {backup_file}: {e}")

            # Sort by creation time (newest first)
            backups.sort(key=lambda x: x["created"], reverse=True)

        except Exception as e:
            logger.error(f"Failed to list backups: {e}")

        return backups

    def cleanup_old_backups(self, keep_count: int = 10) -> int:
        """
        Clean up old backup files, keeping only the most recent ones.

        Args:
            keep_count: Number of backups to keep

        Returns:
            int: Number of backups deleted
        """
        deleted_count = 0

        try:
            backups = self.list_backups()

            if len(backups) <= keep_count:
                logger.info(f"Only {len(backups)} backups found, no cleanup needed")
                return 0

            # Delete oldest backups
            backups_to_delete = backups[keep_count:]

            for backup in backups_to_delete:
                try:
                    Path(backup["path"]).unlink()
                    deleted_count += 1
                    logger.info(f"Deleted old backup: {backup['filename']}")
                except Exception as e:
                    logger.warning(f"Failed to delete backup {backup['filename']}: {e}")

            logger.info(f"Cleaned up {deleted_count} old backups, kept {keep_count} most recent")

        except Exception as e:
            logger.error(f"Failed to cleanup old backups: {e}")

        return deleted_count


class RollbackManager:
    """Manages rollback operations to restore JSON data."""

    def __init__(self, backup_dir: str = "data/backups"):
        self.backup_dir = Path(backup_dir)

    def rollback_to_json(
        self, backup_path: str, target_json_path: str = "watched_reminders.json"
    ) -> RollbackResult:
        """
        Rollback to JSON by restoring from backup and clearing database.

        Args:
            backup_path: Path to the backup file to restore
            target_json_path: Path where to restore the JSON file

        Returns:
            RollbackResult: Result of the rollback operation
        """
        result = RollbackResult()
        start_time = datetime.now()

        try:
            # Verify backup file exists and is valid
            if not os.path.exists(backup_path):
                result.add_error(f"Backup file not found: {backup_path}")
                return result

            # Validate backup JSON
            try:
                with open(backup_path, "r", encoding="utf-8") as f:
                    backup_data = json.load(f)

                if not isinstance(backup_data, dict):
                    result.add_error("Backup file does not contain valid JSON data structure")
                    return result

            except json.JSONDecodeError as e:
                result.add_error(f"Backup file contains invalid JSON: {e}")
                return result

            # Clear database first (safer to clear before restoring)
            clear_result = self._clear_database()
            if not clear_result:
                result.add_error("Failed to clear database before rollback")
                return result

            result.database_cleared = True

            # Backup existing JSON file if it exists
            if os.path.exists(target_json_path):
                backup_existing_result = self._backup_existing_file(target_json_path)
                if backup_existing_result:
                    result.add_warning(f"Existing JSON file backed up to: {backup_existing_result}")

            # Restore JSON file from backup
            shutil.copy2(backup_path, target_json_path)

            # Verify restoration
            if not os.path.exists(target_json_path):
                result.add_error("Failed to restore JSON file")
                return result

            # Verify restored file integrity
            try:
                with open(target_json_path, "r", encoding="utf-8") as f:
                    restored_data = json.load(f)

                if len(restored_data) != len(backup_data):
                    result.add_error("Restored file has different event count than backup")
                    return result

            except json.JSONDecodeError as e:
                result.add_error(f"Restored file contains invalid JSON: {e}")
                return result

            result.success = True
            result.restored_file = target_json_path
            result.rollback_time = (datetime.now() - start_time).total_seconds()

            logger.info(
                f"Rollback completed successfully: restored {target_json_path} from {backup_path}"
            )

        except Exception as e:
            result.add_error(f"Rollback failed with error: {e}")
            logger.exception("Rollback operation failed")

        return result

    def _clear_database(self) -> bool:
        """
        Clear all data from the database tables.

        Returns:
            bool: True if database was cleared successfully
        """
        try:
            initialize_models()
            database = get_database()
            database.connect()

            with database.atomic():
                # Delete in reverse dependency order to avoid foreign key constraints
                for model in reversed(ALL_MODELS):
                    deleted_count = model.delete().execute()
                    logger.info(f"Deleted {deleted_count} records from {model.__name__}")

            logger.info("Database cleared successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to clear database: {e}")
            return False
        finally:
            database = get_database()
            if database and not database.is_closed():
                database.close()

    def _backup_existing_file(self, file_path: str) -> Optional[str]:
        """
        Backup existing file before overwriting.

        Args:
            file_path: Path to the file to backup

        Returns:
            Optional[str]: Path to backup file if successful, None otherwise
        """
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"rollback_backup_{timestamp}.json"
            backup_path = self.backup_dir / backup_filename

            shutil.copy2(file_path, backup_path)
            return str(backup_path)

        except Exception as e:
            logger.warning(f"Failed to backup existing file {file_path}: {e}")
            return None

    def get_rollback_candidates(self) -> List[Dict[str, Any]]:
        """
        Get list of backup files that can be used for rollback.

        Returns:
            List[Dict[str, Any]]: List of rollback candidate information
        """
        backup_manager = BackupManager(str(self.backup_dir))
        backups = backup_manager.list_backups()

        # Filter out rollback backups (created during rollback operations)
        candidates = [
            backup for backup in backups if not backup["filename"].startswith("rollback_backup_")
        ]

        return candidates


class PostMigrationValidator:
    """Validates data integrity after migration."""

    def __init__(self):
        pass

    def validate_post_migration(self, original_json_path: str) -> ValidationResult:
        """
        Perform comprehensive validation after migration.

        Args:
            original_json_path: Path to the original JSON file

        Returns:
            ValidationResult: Result of the validation
        """
        result = ValidationResult()

        try:
            # Read original JSON data
            if not os.path.exists(original_json_path):
                result.add_error(f"Original JSON file not found: {original_json_path}")
                return result

            with open(original_json_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)

            # Initialize database
            initialize_models()
            database = get_database()
            database.connect()

            # Perform detailed comparison
            comparison_result = self._compare_json_with_database(json_data)

            # Merge results
            result.errors.extend(comparison_result["errors"])
            result.warnings.extend(comparison_result["warnings"])
            result.comparison_stats.update(comparison_result["stats"])

            # Calculate data integrity score
            total_items = (
                result.comparison_stats["events_compared"]
                + result.comparison_stats["reactions_compared"]
            )
            matched_items = (
                result.comparison_stats["events_matched"]
                + result.comparison_stats["reactions_matched"]
            )

            if total_items > 0:
                result.data_integrity_score = (matched_items / total_items) * 100
            else:
                result.data_integrity_score = 0.0

            # Determine success
            if len(result.errors) == 0 and result.data_integrity_score >= 95.0:
                result.success = True
                logger.info(
                    f"Post-migration validation passed with {result.data_integrity_score:.1f}% integrity"
                )
            else:
                logger.warning(
                    f"Post-migration validation issues found, integrity: {result.data_integrity_score:.1f}%"
                )

        except Exception as e:
            result.add_error(f"Validation failed with error: {e}")
            logger.exception("Post-migration validation failed")
        finally:
            database = get_database()
            if database and not database.is_closed():
                database.close()

        return result

    def _compare_json_with_database(self, json_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compare JSON data with database data in detail.

        Args:
            json_data: The original JSON data

        Returns:
            Dict[str, Any]: Comparison results
        """
        comparison = {
            "errors": [],
            "warnings": [],
            "stats": {
                "events_compared": 0,
                "events_matched": 0,
                "reactions_compared": 0,
                "reactions_matched": 0,
                "data_mismatches": 0,
            },
        }

        try:
            for message_id_str, json_event in json_data.items():
                comparison["stats"]["events_compared"] += 1
                message_id = int(message_id_str)

                try:
                    # Find corresponding database event
                    db_event = Event.get(Event.message_id == message_id)

                    # Compare event fields
                    field_matches = 0
                    total_fields = 0

                    # Compare basic fields
                    fields_to_compare = [
                        ("channel_id", "channel_id"),
                        ("guild_id", lambda e: e.guild.guild_id),
                        ("title", "title"),
                        ("interval_minutes", "interval_minutes"),
                        ("is_paused", "is_paused"),
                    ]

                    for json_field, db_field in fields_to_compare:
                        total_fields += 1
                        json_value = json_event.get(json_field)

                        if callable(db_field):
                            db_value = db_field(db_event)
                        else:
                            db_value = getattr(db_event, db_field)

                        if json_value == db_value:
                            field_matches += 1
                        else:
                            comparison["stats"]["data_mismatches"] += 1
                            comparison["warnings"].append(
                                f"Event {message_id}: {json_field} mismatch (JSON: {json_value}, DB: {db_value})"
                            )

                    # Compare reactions
                    json_reactions = json_event.get("users_who_reacted", [])
                    db_reactions = list(Reaction.select().where(Reaction.event == db_event))

                    comparison["stats"]["reactions_compared"] += len(json_reactions)

                    if len(json_reactions) == len(db_reactions):
                        comparison["stats"]["reactions_matched"] += len(json_reactions)
                    else:
                        comparison["stats"]["data_mismatches"] += 1
                        comparison["warnings"].append(
                            f"Event {message_id}: reaction count mismatch (JSON: {len(json_reactions)}, DB: {len(db_reactions)})"
                        )

                    # If most fields match, consider event matched
                    if field_matches >= total_fields * 0.8:  # 80% threshold
                        comparison["stats"]["events_matched"] += 1

                except Event.DoesNotExist:
                    comparison["errors"].append(f"Event {message_id} not found in database")
                    comparison["stats"]["data_mismatches"] += 1

        except Exception as e:
            comparison["errors"].append(f"Comparison failed: {e}")

        return comparison


# Convenience functions
def create_backup(
    json_file_path: str = "watched_reminders.json", backup_name: Optional[str] = None
) -> BackupResult:
    """
    Convenience function to create a backup.

    Args:
        json_file_path: Path to JSON file to backup
        backup_name: Optional custom backup name

    Returns:
        BackupResult: Result of the backup operation
    """
    manager = BackupManager()
    if backup_name:
        return manager.create_manual_backup(json_file_path, backup_name)
    else:
        return manager.create_automatic_backup(json_file_path)


def rollback_migration(
    backup_path: str, target_json_path: str = "watched_reminders.json"
) -> RollbackResult:
    """
    Convenience function to rollback migration.

    Args:
        backup_path: Path to backup file to restore
        target_json_path: Path where to restore JSON file

    Returns:
        RollbackResult: Result of the rollback operation
    """
    manager = RollbackManager()
    return manager.rollback_to_json(backup_path, target_json_path)


def validate_migration(original_json_path: str = "watched_reminders.json") -> ValidationResult:
    """
    Convenience function to validate migration.

    Args:
        original_json_path: Path to original JSON file

    Returns:
        ValidationResult: Result of the validation
    """
    validator = PostMigrationValidator()
    return validator.validate_post_migration(original_json_path)
