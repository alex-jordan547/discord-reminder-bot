"""
Data migration service for migrating from JSON to SQLite.

This module handles the migration of existing JSON data to the new SQLite database
using Pewee ORM models. It includes validation, error handling, and rollback capabilities.
"""

import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models.database_models import Guild, User, Event, Reaction, initialize_models
from persistence.database import get_database

# Get logger for this module
logger = logging.getLogger(__name__)


class MigrationError(Exception):
    """Custom exception for migration-related errors."""
    
    CODES = {
        'JSON_CORRUPT': 'Fichier JSON corrompu ou illisible',
        'JSON_NOT_FOUND': 'Fichier JSON non trouvé',
        'DB_CREATION_FAILED': 'Échec de création de la base SQLite',
        'MIGRATION_INCOMPLETE': 'Migration incomplète, données partielles',
        'VALIDATION_FAILED': 'Validation des données migrées échouée',
        'ROLLBACK_FAILED': 'Échec du rollback vers JSON',
        'BACKUP_FAILED': 'Échec de la sauvegarde des fichiers JSON'
    }
    
    def __init__(self, code: str, message: str = None):
        self.code = code
        self.message = message or self.CODES.get(code, 'Erreur de migration inconnue')
        super().__init__(self.message)


class MigrationResult:
    """Result object for migration operations."""
    
    def __init__(self):
        self.success = False
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.stats = {
            'guilds_migrated': 0,
            'events_migrated': 0,
            'reactions_migrated': 0,
            'users_created': 0,
            'data_corrupted': 0,
            'migration_time': 0.0
        }
        self.backup_path: Optional[str] = None
    
    def add_error(self, error: str):
        """Add an error message."""
        self.errors.append(error)
        logger.error(f"Migration error: {error}")
    
    def add_warning(self, warning: str):
        """Add a warning message."""
        self.warnings.append(warning)
        logger.warning(f"Migration warning: {warning}")
    
    def is_successful(self) -> bool:
        """Check if migration was successful."""
        return self.success and len(self.errors) == 0


class JSONDataValidator:
    """Validator for JSON data before migration."""
    
    @staticmethod
    def validate_json_structure(data: Dict[str, Any]) -> List[str]:
        """
        Validate the overall structure of the JSON data.
        
        Args:
            data: The JSON data to validate
            
        Returns:
            List[str]: List of validation errors
        """
        errors = []
        
        if not isinstance(data, dict):
            errors.append("JSON data must be a dictionary")
            return errors
        
        for message_id, event_data in data.items():
            # Validate message ID
            try:
                int(message_id)
            except ValueError:
                errors.append(f"Invalid message ID format: {message_id}")
                continue
            
            # Validate event data structure
            event_errors = JSONDataValidator.validate_event_data(event_data, message_id)
            errors.extend(event_errors)
        
        return errors
    
    @staticmethod
    def validate_event_data(event_data: Dict[str, Any], message_id: str) -> List[str]:
        """
        Validate individual event data.
        
        Args:
            event_data: The event data to validate
            message_id: The message ID for error reporting
            
        Returns:
            List[str]: List of validation errors
        """
        errors = []
        
        if not isinstance(event_data, dict):
            errors.append(f"Event {message_id}: data must be a dictionary")
            return errors
        
        # Required fields
        required_fields = ['message_id', 'channel_id', 'guild_id', 'title']
        for field in required_fields:
            if field not in event_data:
                errors.append(f"Event {message_id}: missing required field '{field}'")
            elif not isinstance(event_data[field], (int, str)):
                if field in ['message_id', 'channel_id', 'guild_id']:
                    errors.append(f"Event {message_id}: field '{field}' must be an integer")
                elif field == 'title':
                    errors.append(f"Event {message_id}: field '{field}' must be a string")
        
        # Validate optional fields
        if 'interval_minutes' in event_data:
            interval = event_data['interval_minutes']
            if not isinstance(interval, (int, float)) or interval <= 0:
                errors.append(f"Event {message_id}: interval_minutes must be a positive number")
        
        if 'required_reactions' in event_data:
            reactions = event_data['required_reactions']
            if not isinstance(reactions, list):
                errors.append(f"Event {message_id}: required_reactions must be a list")
            elif not all(isinstance(r, str) for r in reactions):
                errors.append(f"Event {message_id}: all required_reactions must be strings")
        
        if 'users_who_reacted' in event_data:
            users = event_data['users_who_reacted']
            if not isinstance(users, list):
                errors.append(f"Event {message_id}: users_who_reacted must be a list")
            elif not all(isinstance(u, int) for u in users):
                errors.append(f"Event {message_id}: all user IDs must be integers")
        
        if 'all_users' in event_data:
            users = event_data['all_users']
            if not isinstance(users, list):
                errors.append(f"Event {message_id}: all_users must be a list")
            elif not all(isinstance(u, int) for u in users):
                errors.append(f"Event {message_id}: all user IDs must be integers")
        
        if 'is_paused' in event_data:
            if not isinstance(event_data['is_paused'], bool):
                errors.append(f"Event {message_id}: is_paused must be a boolean")
        
        # Validate datetime fields
        datetime_fields = ['last_reminder', 'created_at']
        for field in datetime_fields:
            if field in event_data:
                try:
                    datetime.fromisoformat(event_data[field].replace('Z', '+00:00'))
                except (ValueError, AttributeError):
                    errors.append(f"Event {message_id}: invalid datetime format in '{field}'")
        
        return errors


class JSONToSQLiteTransformer:
    """Transforms JSON data to SQLite models."""
    
    def __init__(self):
        self.guilds_cache: Dict[int, Guild] = {}
        self.users_cache: Dict[Tuple[int, int], User] = {}  # (user_id, guild_id) -> User
    
    def transform_event_data(self, json_data: Dict[str, Any]) -> Tuple[List[Event], List[Reaction], MigrationResult]:
        """
        Transform JSON event data to SQLite models.
        
        Args:
            json_data: The JSON data to transform
            
        Returns:
            Tuple of (events, reactions, migration_result)
        """
        result = MigrationResult()
        events = []
        reactions = []
        
        start_time = datetime.now()
        
        try:
            for message_id_str, event_data in json_data.items():
                try:
                    # Transform individual event
                    event, event_reactions = self._transform_single_event(message_id_str, event_data)
                    if event:
                        events.append(event)
                        reactions.extend(event_reactions)
                        result.stats['events_migrated'] += 1
                        result.stats['reactions_migrated'] += len(event_reactions)
                    else:
                        result.stats['data_corrupted'] += 1
                        
                except Exception as e:
                    result.add_error(f"Failed to transform event {message_id_str}: {e}")
                    result.stats['data_corrupted'] += 1
            
            result.stats['guilds_migrated'] = len(self.guilds_cache)
            result.stats['users_created'] = len(self.users_cache)
            result.stats['migration_time'] = (datetime.now() - start_time).total_seconds()
            
            if len(events) > 0:
                result.success = True
            else:
                result.add_error("No events were successfully transformed")
                
        except Exception as e:
            result.add_error(f"Critical error during transformation: {e}")
        
        return events, reactions, result
    
    def _transform_single_event(self, message_id_str: str, event_data: Dict[str, Any]) -> Tuple[Optional[Event], List[Reaction]]:
        """
        Transform a single event from JSON to SQLite models.
        
        Args:
            message_id_str: The message ID as string
            event_data: The event data dictionary
            
        Returns:
            Tuple of (Event or None, List of Reactions)
        """
        try:
            message_id = int(message_id_str)
            
            # Get or create guild
            guild_id = event_data['guild_id']
            guild = self._get_or_create_guild(guild_id)
            
            # Parse datetime fields
            last_reminder = self._parse_datetime(
                event_data.get('last_reminder'), 
                datetime.now()
            )
            created_at = self._parse_datetime(
                event_data.get('created_at'), 
                datetime.now()
            )
            
            # Create event
            event = Event(
                message_id=message_id,
                channel_id=event_data['channel_id'],
                guild=guild,
                title=event_data['title'],
                description=event_data.get('description'),
                interval_minutes=event_data.get('interval_minutes', 60.0),
                is_paused=event_data.get('is_paused', False),
                last_reminder=last_reminder,
                created_at=created_at,
                updated_at=datetime.now()
            )
            
            # Set required reactions
            required_reactions = event_data.get('required_reactions', ["✅", "❌", "❓"])
            event.required_reactions_list = required_reactions
            
            # Create reactions
            reactions = []
            users_who_reacted = event_data.get('users_who_reacted', [])
            all_users = event_data.get('all_users', [])
            
            # Create user records for all users
            for user_id in set(users_who_reacted + all_users):
                self._get_or_create_user(user_id, guild)
            
            # Create reaction records for users who reacted
            for user_id in users_who_reacted:
                # Use the first required reaction as default (usually ✅)
                emoji = required_reactions[0] if required_reactions else "✅"
                
                reaction = Reaction(
                    event=event,
                    user_id=user_id,
                    emoji=emoji,
                    reacted_at=created_at,  # Use event creation time as fallback
                    created_at=created_at,
                    updated_at=datetime.now()
                )
                reactions.append(reaction)
            
            return event, reactions
            
        except Exception as e:
            logger.error(f"Failed to transform event {message_id_str}: {e}")
            return None, []
    
    def _get_or_create_guild(self, guild_id: int) -> Guild:
        """Get or create a guild record."""
        if guild_id not in self.guilds_cache:
            guild = Guild(
                guild_id=guild_id,
                name=f"Guild {guild_id}",  # Default name, will be updated by bot
                settings='{}',
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            self.guilds_cache[guild_id] = guild
        
        return self.guilds_cache[guild_id]
    
    def _get_or_create_user(self, user_id: int, guild: Guild) -> User:
        """Get or create a user record."""
        cache_key = (user_id, guild.guild_id)
        
        if cache_key not in self.users_cache:
            user = User(
                user_id=user_id,
                guild=guild,
                username=f"User {user_id}",  # Default name, will be updated by bot
                is_bot=False,
                last_seen=datetime.now(),
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            self.users_cache[cache_key] = user
        
        return self.users_cache[cache_key]
    
    def _parse_datetime(self, datetime_str: Optional[str], default: datetime) -> datetime:
        """Parse datetime string with fallback to default."""
        if not datetime_str:
            return default
        
        try:
            # Handle ISO format with or without timezone
            if datetime_str.endswith('Z'):
                datetime_str = datetime_str[:-1] + '+00:00'
            return datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            logger.warning(f"Invalid datetime format: {datetime_str}, using default")
            return default


class DataMigrationService:
    """Main service for handling data migration from JSON to SQLite."""
    
    def __init__(self, json_file_path: str = "watched_reminders.json"):
        self.json_file_path = json_file_path
        self.backup_dir = Path("data/backups")
        self.backup_dir.mkdir(parents=True, exist_ok=True)
    
    def read_json_data(self) -> Dict[str, Any]:
        """
        Read and parse JSON data from file.
        
        Returns:
            Dict[str, Any]: The parsed JSON data
            
        Raises:
            MigrationError: If file cannot be read or parsed
        """
        try:
            if not os.path.exists(self.json_file_path):
                raise MigrationError('JSON_NOT_FOUND', f"JSON file not found: {self.json_file_path}")
            
            with open(self.json_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            logger.info(f"Successfully read JSON data from {self.json_file_path}")
            return data
            
        except json.JSONDecodeError as e:
            raise MigrationError('JSON_CORRUPT', f"Invalid JSON format: {e}")
        except Exception as e:
            raise MigrationError('JSON_CORRUPT', f"Failed to read JSON file: {e}")
    
    def validate_json_data(self, data: Dict[str, Any]) -> List[str]:
        """
        Validate JSON data structure and content.
        
        Args:
            data: The JSON data to validate
            
        Returns:
            List[str]: List of validation errors
        """
        return JSONDataValidator.validate_json_structure(data)
    
    def migrate_from_json(self, json_file_path: Optional[str] = None) -> MigrationResult:
        """
        Migrate data from JSON file to SQLite database.
        
        Args:
            json_file_path: Optional path to JSON file (uses default if not provided)
            
        Returns:
            MigrationResult: Result of the migration operation
        """
        if json_file_path:
            self.json_file_path = json_file_path
        
        result = MigrationResult()
        
        try:
            # Initialize database models
            initialize_models()
            
            # Read JSON data
            logger.info("Reading JSON data...")
            json_data = self.read_json_data()
            
            # Validate JSON data
            logger.info("Validating JSON data...")
            validation_errors = self.validate_json_data(json_data)
            if validation_errors:
                for error in validation_errors:
                    result.add_error(error)
                
                # If there are critical errors, stop migration
                if len(validation_errors) > 10:  # Arbitrary threshold
                    result.add_error("Too many validation errors, stopping migration")
                    return result
            
            # Transform data
            logger.info("Transforming JSON data to SQLite models...")
            transformer = JSONToSQLiteTransformer()
            events, reactions, transform_result = transformer.transform_event_data(json_data)
            
            # Merge transformation results
            result.errors.extend(transform_result.errors)
            result.warnings.extend(transform_result.warnings)
            result.stats.update(transform_result.stats)
            
            if not events:
                result.add_error("No events to migrate")
                return result
            
            # Save to database
            logger.info("Saving data to SQLite database...")
            save_result = self._save_to_database(events, reactions, transformer)
            
            # Merge save results
            result.errors.extend(save_result.errors)
            result.warnings.extend(save_result.warnings)
            for key, value in save_result.stats.items():
                if key in result.stats:
                    result.stats[key] += value
                else:
                    result.stats[key] = value
            
            # Check if migration was successful
            if len(result.errors) == 0 and save_result.success:
                result.success = True
                logger.info("Migration completed successfully")
            else:
                logger.error("Migration completed with errors")
            
        except MigrationError as e:
            result.add_error(f"Migration error: {e.message}")
        except Exception as e:
            result.add_error(f"Unexpected error during migration: {e}")
            logger.exception("Unexpected error during migration")
        
        return result
    
    def _save_to_database(self, events: List[Event], reactions: List[Reaction], transformer: JSONToSQLiteTransformer) -> MigrationResult:
        """
        Save transformed data to the database.
        
        Args:
            events: List of Event objects to save
            reactions: List of Reaction objects to save
            transformer: The transformer instance with cached objects
            
        Returns:
            MigrationResult: Result of the save operation
        """
        result = MigrationResult()
        database = get_database()
        
        try:
            database.connect()
            
            with database.atomic():
                # Save guilds first
                logger.info(f"Saving {len(transformer.guilds_cache)} guilds...")
                for guild in transformer.guilds_cache.values():
                    guild.save()
                
                # Save users
                logger.info(f"Saving {len(transformer.users_cache)} users...")
                for user in transformer.users_cache.values():
                    user.save()
                
                # Save events
                logger.info(f"Saving {len(events)} events...")
                for event in events:
                    event.save()
                
                # Save reactions
                logger.info(f"Saving {len(reactions)} reactions...")
                for reaction in reactions:
                    reaction.save()
            
            result.success = True
            result.stats['guilds_saved'] = len(transformer.guilds_cache)
            result.stats['users_saved'] = len(transformer.users_cache)
            result.stats['events_saved'] = len(events)
            result.stats['reactions_saved'] = len(reactions)
            
            logger.info("All data saved successfully to database")
            
        except Exception as e:
            result.add_error(f"Failed to save data to database: {e}")
            logger.exception("Failed to save data to database")
        finally:
            if not database.is_closed():
                database.close()
        
        return result
    
    def validate_migration(self, json_file_path: Optional[str] = None) -> MigrationResult:
        """
        Validate that the migration was successful by comparing JSON and SQLite data.
        
        Args:
            json_file_path: Optional path to JSON file (uses default if not provided)
            
        Returns:
            MigrationResult: Result of the validation
        """
        if json_file_path:
            self.json_file_path = json_file_path
        
        result = MigrationResult()
        
        try:
            # Read original JSON data
            json_data = self.read_json_data()
            
            # Initialize database models
            initialize_models()
            database = get_database()
            database.connect()
            
            # Compare data
            logger.info("Validating migration by comparing JSON and SQLite data...")
            
            # Check event counts
            json_event_count = len(json_data)
            db_event_count = Event.select().count()
            
            if json_event_count != db_event_count:
                result.add_error(f"Event count mismatch: JSON has {json_event_count}, DB has {db_event_count}")
            else:
                result.add_warning(f"Event count matches: {json_event_count} events")
            
            # Check individual events
            missing_events = []
            data_mismatches = []
            
            for message_id_str, json_event in json_data.items():
                message_id = int(message_id_str)
                
                try:
                    db_event = Event.get(Event.message_id == message_id)
                    
                    # Compare key fields
                    if db_event.channel_id != json_event['channel_id']:
                        data_mismatches.append(f"Event {message_id}: channel_id mismatch")
                    
                    if db_event.guild.guild_id != json_event['guild_id']:
                        data_mismatches.append(f"Event {message_id}: guild_id mismatch")
                    
                    if db_event.title != json_event['title']:
                        data_mismatches.append(f"Event {message_id}: title mismatch")
                    
                    if abs(db_event.interval_minutes - json_event.get('interval_minutes', 60.0)) > 0.001:
                        data_mismatches.append(f"Event {message_id}: interval_minutes mismatch")
                    
                    if db_event.is_paused != json_event.get('is_paused', False):
                        data_mismatches.append(f"Event {message_id}: is_paused mismatch")
                    
                    # Check reaction counts
                    json_reaction_count = len(json_event.get('users_who_reacted', []))
                    db_reaction_count = Reaction.select().where(Reaction.event == db_event).count()
                    
                    if json_reaction_count != db_reaction_count:
                        data_mismatches.append(f"Event {message_id}: reaction count mismatch (JSON: {json_reaction_count}, DB: {db_reaction_count})")
                    
                except Event.DoesNotExist:
                    missing_events.append(message_id)
            
            # Report validation results
            if missing_events:
                result.add_error(f"Missing events in database: {missing_events}")
            
            if data_mismatches:
                for mismatch in data_mismatches[:10]:  # Limit to first 10 mismatches
                    result.add_error(mismatch)
                
                if len(data_mismatches) > 10:
                    result.add_error(f"... and {len(data_mismatches) - 10} more data mismatches")
            
            # Set success status
            if len(result.errors) == 0:
                result.success = True
                logger.info("Migration validation passed successfully")
            else:
                logger.error(f"Migration validation failed with {len(result.errors)} errors")
            
            result.stats['events_validated'] = json_event_count
            result.stats['missing_events'] = len(missing_events)
            result.stats['data_mismatches'] = len(data_mismatches)
            
        except Exception as e:
            result.add_error(f"Validation failed with error: {e}")
            logger.exception("Migration validation failed")
        finally:
            database = get_database()
            if not database.is_closed():
                database.close()
        
        return result
    
    def create_backup(self, json_file_path: Optional[str] = None) -> str:
        """
        Create a backup of the JSON file before migration.
        
        Args:
            json_file_path: Optional path to JSON file (uses default if not provided)
            
        Returns:
            str: Path to the backup file
            
        Raises:
            MigrationError: If backup creation fails
        """
        if json_file_path:
            self.json_file_path = json_file_path
        
        try:
            if not os.path.exists(self.json_file_path):
                raise MigrationError('JSON_NOT_FOUND', f"JSON file not found: {self.json_file_path}")
            
            # Create backup filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"watched_reminders_backup_{timestamp}.json"
            backup_path = self.backup_dir / backup_filename
            
            # Copy file to backup location
            shutil.copy2(self.json_file_path, backup_path)
            
            logger.info(f"Created backup at: {backup_path}")
            return str(backup_path)
            
        except Exception as e:
            raise MigrationError('BACKUP_FAILED', f"Failed to create backup: {e}")
    
    def archive_json_file(self, json_file_path: Optional[str] = None) -> str:
        """
        Archive the original JSON file after successful migration.
        
        Args:
            json_file_path: Optional path to JSON file (uses default if not provided)
            
        Returns:
            str: Path to the archived file
            
        Raises:
            MigrationError: If archiving fails
        """
        if json_file_path:
            self.json_file_path = json_file_path
        
        try:
            if not os.path.exists(self.json_file_path):
                raise MigrationError('JSON_NOT_FOUND', f"JSON file not found: {self.json_file_path}")
            
            # Create archive filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            archive_filename = f"watched_reminders_archived_{timestamp}.json"
            archive_path = self.backup_dir / archive_filename
            
            # Move file to archive location
            shutil.move(self.json_file_path, archive_path)
            
            logger.info(f"Archived JSON file to: {archive_path}")
            return str(archive_path)
            
        except Exception as e:
            raise MigrationError('BACKUP_FAILED', f"Failed to archive JSON file: {e}")
    
    def get_migration_status(self) -> Dict[str, Any]:
        """
        Get the current migration status.
        
        Returns:
            Dict[str, Any]: Status information
        """
        status = {
            'json_file_exists': os.path.exists(self.json_file_path),
            'json_file_path': self.json_file_path,
            'backup_dir': str(self.backup_dir),
            'database_initialized': False,
            'tables_exist': False,
            'data_counts': {}
        }
        
        try:
            # Check if JSON file exists and get basic info
            if status['json_file_exists']:
                stat = os.stat(self.json_file_path)
                status['json_file_size'] = stat.st_size
                status['json_file_modified'] = datetime.fromtimestamp(stat.st_mtime).isoformat()
                
                # Try to read and count JSON data
                try:
                    json_data = self.read_json_data()
                    status['json_event_count'] = len(json_data)
                except Exception as e:
                    status['json_read_error'] = str(e)
            
            # Check database status
            try:
                initialize_models()
                database = get_database()
                database.connect()
                
                status['database_initialized'] = True
                
                # Check if tables exist and get counts
                try:
                    status['data_counts']['guilds'] = Guild.select().count()
                    status['data_counts']['users'] = User.select().count()
                    status['data_counts']['events'] = Event.select().count()
                    status['data_counts']['reactions'] = Reaction.select().count()
                    status['tables_exist'] = True
                except Exception as e:
                    status['database_error'] = str(e)
                
            except Exception as e:
                status['database_connection_error'] = str(e)
            finally:
                database = get_database()
                if database and not database.is_closed():
                    database.close()
            
            # List backup files
            if self.backup_dir.exists():
                backup_files = list(self.backup_dir.glob("*.json"))
                status['backup_files'] = [str(f) for f in backup_files]
                status['backup_count'] = len(backup_files)
            
        except Exception as e:
            status['status_error'] = str(e)
        
        return status


# Convenience functions for easy usage
def migrate_json_to_sqlite(json_file_path: str = "watched_reminders.json") -> MigrationResult:
    """
    Convenience function to migrate JSON data to SQLite.
    
    Args:
        json_file_path: Path to the JSON file to migrate
        
    Returns:
        MigrationResult: Result of the migration
    """
    service = DataMigrationService(json_file_path)
    return service.migrate_from_json()


def validate_migration_data(json_file_path: str = "watched_reminders.json") -> MigrationResult:
    """
    Convenience function to validate migration data.
    
    Args:
        json_file_path: Path to the JSON file to validate against
        
    Returns:
        MigrationResult: Result of the validation
    """
    service = DataMigrationService(json_file_path)
    return service.validate_migration()


def get_migration_status() -> Dict[str, Any]:
    """
    Convenience function to get migration status.
    
    Returns:
        Dict[str, Any]: Current migration status
    """
    service = DataMigrationService()
    return service.get_migration_status()