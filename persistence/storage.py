"""
Storage and persistence module for Discord Reminder Bot.

This module handles saving and loading match reminder data to/from JSON files.
It provides functions to persist the application state across restarts.
"""

import json
import logging
from typing import Dict

from models.reminder import MatchReminder

# Constants
SAVE_FILE = 'watched_matches.json'

# Get logger for this module
logger = logging.getLogger(__name__)


def save_matches(watched_matches: Dict[int, MatchReminder]) -> bool:
    """
    Save the watched matches dictionary to a JSON file.
    
    Args:
        watched_matches: Dictionary mapping message IDs to MatchReminder instances
        
    Returns:
        bool: True if save was successful, False otherwise
    """
    try:
        # Convert MatchReminder instances to dictionaries for JSON serialization
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


def load_matches() -> Dict[int, MatchReminder]:
    """
    Load watched matches from the JSON save file.
    
    Returns:
        Dict[int, MatchReminder]: Dictionary mapping message IDs to MatchReminder instances
        Returns empty dict if file doesn't exist or loading fails
    """
    try:
        with open(SAVE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Convert dictionaries back to MatchReminder instances
        watched_matches = {int(k): MatchReminder.from_dict(v) for k, v in data.items()}
        
        logger.info(f"Successfully loaded {len(watched_matches)} matches from {SAVE_FILE}")
        return watched_matches
        
    except FileNotFoundError:
        logger.info(f"No save file found at {SAVE_FILE}, starting with empty matches")
        return {}
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON from {SAVE_FILE}: {e}")
        return {}
    except KeyError as e:
        logger.error(f"Invalid data structure in {SAVE_FILE}, missing key: {e}")
        return {}
    except Exception as e:
        logger.error(f"Unexpected error while loading matches: {e}")
        return {}


def backup_matches(watched_matches: Dict[int, MatchReminder], backup_suffix: str = None) -> bool:
    """
    Create a backup of the current matches data.
    
    Args:
        watched_matches: Dictionary mapping message IDs to MatchReminder instances
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
        
        # Convert MatchReminder instances to dictionaries for JSON serialization
        data = {str(k): v.to_dict() for k, v in watched_matches.items()}
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Successfully created backup: {backup_file}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
        return False