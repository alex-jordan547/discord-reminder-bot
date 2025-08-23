"""
Configuration settings for Discord Reminder Bot.

This module centralizes all application settings and provides
a clean interface for configuration management.
"""

import os
import logging
from typing import List

# Get logger for this module
logger = logging.getLogger(__name__)


class Settings:
    """
    Centralized application settings.
    
    This class manages all configuration values for the Discord bot,
    loading them from environment variables with sensible defaults.
    """
    
    # Discord Bot Configuration
    TOKEN: str = os.getenv('DISCORD_TOKEN')
    COMMAND_PREFIX: str = '!'
    
    # Reminder Configuration
    REMINDER_INTERVAL_HOURS: float = float(os.getenv('REMINDER_INTERVAL_HOURS', '24'))
    
    # Channel Configuration
    USE_SEPARATE_REMINDER_CHANNEL: bool = os.getenv('USE_SEPARATE_REMINDER_CHANNEL', 'false').lower() == 'true'
    REMINDER_CHANNEL_NAME: str = os.getenv('REMINDER_CHANNEL_NAME', 'rappels-matchs')
    
    # Permission Configuration
    ADMIN_ROLES: List[str] = os.getenv('ADMIN_ROLES', 'Admin,Moderateur,Coach').split(',')
    
    # Message Configuration
    DEFAULT_REACTIONS: List[str] = ['✅', '❌', '❓']
    MAX_MENTIONS_PER_REMINDER: int = 50
    MAX_TITLE_LENGTH: int = 100
    
    # Timing Configuration
    REMINDER_DELAY_SECONDS: int = 2  # Delay between multiple reminder messages
    
    # File Configuration
    MATCHES_SAVE_FILE: str = 'watched_matches.json'
    
    @classmethod
    def get_reminder_interval_minutes(cls) -> int:
        """
        Get the reminder interval converted to minutes.
        
        Returns:
            int: Reminder interval in minutes
        """
        return int(cls.REMINDER_INTERVAL_HOURS * 60)
    
    @classmethod
    def validate_required_settings(cls) -> bool:
        """
        Validate that all required settings are present and valid.
        
        Returns:
            bool: True if all required settings are valid, False otherwise
        """
        if not cls.TOKEN:
            logger.error("Discord token is required! Set the DISCORD_TOKEN environment variable")
            return False
        
        if cls.REMINDER_INTERVAL_HOURS <= 0:
            logger.error(f"Invalid reminder interval: {cls.REMINDER_INTERVAL_HOURS}. Must be positive.")
            return False
        
        if not cls.ADMIN_ROLES:
            logger.warning("No admin roles configured. Only Discord administrators will have access.")
        
        return True
    
    @classmethod
    def log_configuration(cls) -> None:
        """
        Log the current configuration settings (excluding sensitive data).
        """
        logger.info("=== Discord Reminder Bot Configuration ===")
        logger.info(f"Command prefix: {cls.COMMAND_PREFIX}")
        
        # Log reminder interval in a user-friendly format
        if cls.REMINDER_INTERVAL_HOURS < 1:
            logger.info(f"Reminder interval: {cls.get_reminder_interval_minutes()} minutes")
        else:
            logger.info(f"Reminder interval: {cls.REMINDER_INTERVAL_HOURS} hours")
        
        # Log channel configuration
        if cls.USE_SEPARATE_REMINDER_CHANNEL:
            logger.info(f"Reminder mode: Separate channel (#{cls.REMINDER_CHANNEL_NAME})")
        else:
            logger.info("Reminder mode: Same channel as match")
        
        # Log admin roles
        logger.info(f"Admin roles: {', '.join(cls.ADMIN_ROLES)}")
        logger.info(f"Max mentions per reminder: {cls.MAX_MENTIONS_PER_REMINDER}")
        logger.info(f"Default reactions: {', '.join(cls.DEFAULT_REACTIONS)}")
        logger.info("==========================================")
    
    @classmethod
    def is_test_mode(cls) -> bool:
        """
        Check if the bot is running in test mode (rapid reminders).
        
        Returns:
            bool: True if reminder interval is less than 1 hour (test mode)
        """
        return cls.REMINDER_INTERVAL_HOURS < 1
    
    @classmethod
    def get_admin_roles_str(cls) -> str:
        """
        Get admin roles as a comma-separated string for display.
        
        Returns:
            str: Comma-separated list of admin role names
        """
        return ', '.join(cls.ADMIN_ROLES)


# Constants for error messages and user feedback
class Messages:
    """
    Standard messages used throughout the application.
    """
    
    # Error messages
    INVALID_LINK_FORMAT = ("❌ Format de lien invalide. Pour obtenir le lien d'un message:\n"
                          "1. Faites clic droit sur le message\n"
                          "2. Sélectionnez 'Copier le lien du message'\n"
                          "3. Collez le lien complet dans la commande")
    
    MESSAGE_NOT_FOUND = "❌ Message introuvable."
    CHANNEL_NOT_FOUND = "❌ Canal introuvable."
    WRONG_SERVER = "❌ Ce message n'est pas sur ce serveur!"
    MATCH_NOT_WATCHED = "❌ Ce message n'est pas surveillé."
    MATCH_NOT_ON_SERVER = "❌ Ce match n'est pas sur ce serveur."
    NO_MATCHES_TO_REMIND = "📭 Aucun match à rappeler sur ce serveur."
    NO_WATCHED_MATCHES = "📭 Aucun match surveillé sur ce serveur."
    
    # Success messages
    MATCH_ADDED = "✅ Match ajouté à la surveillance!"
    MATCH_REMOVED = "✅ Match **{}** retiré de la surveillance."
    REMINDER_SENT = "✅ Rappel envoyé! {} personne(s) notifiée(s) au total."
    CHANNEL_CREATED = "✅ Canal #{} créé sur le serveur {}"
    
    # Info messages
    NO_SAVE_FILE = "ℹ️ Aucune sauvegarde trouvée, démarrage avec une liste vide"
    BOT_CONNECTED = "✅ Bot connecté en tant que {}"
    MATCHES_LOADED = "✅ {} match(s) chargés depuis la sauvegarde"
    
    # Warning messages
    NO_CHANNEL_PERMISSIONS = "⚠️ Pas les permissions pour créer le canal #{}"
    MENTION_LIMIT_EXCEEDED = "⚠️ +{} autres personnes non mentionnées (limite Discord)"