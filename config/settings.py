"""
Configuration settings for Discord Reminder Bot.

This module centralizes all application settings and provides
a clean interface for configuration management.
"""

import logging
import os
from datetime import datetime
from typing import List, Optional

# Get logger for this module
logger = logging.getLogger(__name__)


class Settings:
    """
    Centralized application settings.

    This class manages all configuration values for the Discord bot,
    loading them from environment variables with sensible defaults.
    """

    # Discord Bot Configuration
    TOKEN: Optional[str] = os.getenv("DISCORD_TOKEN")
    COMMAND_PREFIX: str = "!"

    # Reminder Configuration
    REMINDER_INTERVAL_HOURS: float = float(os.getenv("REMINDER_INTERVAL_HOURS", "24"))

    # Channel Configuration
    USE_SEPARATE_REMINDER_CHANNEL: bool = (
        os.getenv("USE_SEPARATE_REMINDER_CHANNEL", "false").lower() == "true"
    )
    REMINDER_CHANNEL_NAME: str = os.getenv("REMINDER_CHANNEL_NAME", "rappels")

    # Permission Configuration
    ADMIN_ROLES: List[str] = os.getenv("ADMIN_ROLES", "Admin,Moderateur,Coach").split(",")

    # Message Configuration
    DEFAULT_REACTIONS: List[str] = ["✅", "❌", "❓"]
    MAX_MENTIONS_PER_REMINDER: int = 50
    MAX_TITLE_LENGTH: int = 100
    # Auto-deletion Configuration
    AUTO_DELETE_REMINDERS: bool = os.getenv("AUTO_DELETE_REMINDERS", "true").lower() == "true"
    AUTO_DELETE_DELAY_HOURS: float = float(
        os.getenv("AUTO_DELETE_DELAY_HOURS", "1")
    )  # Default: 1 hour instead of 24
    MIN_AUTO_DELETE_HOURS: float = 1 / 60  # Minimum 1 minute exact (1/60 hours)
    MAX_AUTO_DELETE_HOURS: float = 168.0  # Maximum 7 days
    AUTO_DELETE_CHOICES: List[float] = [
        1 / 60,
        2 / 60,
        0.05,
        0.08,
        0.17,
        0.25,
        0.5,
        1,
        2,
        6,
        12,
        24,
        48,
        72,
        168,
    ]  # 1min, 2min, 3min, 5min, 10min, 15min, 30min, 1h, 2h, 6h, 12h, 24h, 48h, 72h, 168h

    # Slash Command Configuration
    DEFAULT_INTERVAL_MINUTES: int = 60  # Default interval for new reminders
    MIN_INTERVAL_MINUTES: int = 5  # Minimum allowed interval
    MAX_INTERVAL_MINUTES: int = 1440  # Maximum allowed interval (24 hours)

    # Suggested interval options for slash command choices
    INTERVAL_CHOICES: List[int] = [5, 15, 30, 60, 120, 360, 720, 1440]

    # Timing Configuration
    REMINDER_DELAY_SECONDS: int = 2  # Delay between multiple reminder messages

    # File Configuration
    REMINDERS_SAVE_FILE: str = "watched_reminders.json"

    @classmethod
    def validate_interval_minutes(cls, interval_minutes: float) -> float:
        """
        Validate and clamp an interval value to acceptable range.
        In test mode, allows more flexible intervals including sub-minute intervals.

        Args:
            interval_minutes: The interval to validate (can be float for sub-minute intervals)

        Returns:
            float: The clamped interval value
        """
        if cls.is_test_mode():
            # Mode test : intervalles très flexibles (30 secondes à 1 semaine)
            return max(0.5, min(10080.0, interval_minutes))  # 30s à 7 jours
        else:
            # Mode production : intervalles standards (entiers seulement)
            interval_minutes = int(interval_minutes)  # Convertir en entier pour la production
            return max(cls.MIN_INTERVAL_MINUTES, min(cls.MAX_INTERVAL_MINUTES, interval_minutes))

    @classmethod
    def validate_auto_delete_hours(cls, hours: float) -> float:
        """
        Validate and clamp an auto-deletion delay to acceptable range.

        Args:
            hours: The delay in hours to validate

        Returns:
            float: The clamped delay value in hours
        """
        return max(cls.MIN_AUTO_DELETE_HOURS, min(cls.MAX_AUTO_DELETE_HOURS, hours))

    @classmethod
    def format_auto_delete_display(cls, hours: float) -> str:
        """
        Format an auto-deletion delay for user-friendly display.

        Args:
            hours: Delay in hours

        Returns:
            str: Formatted delay string
        """
        if hours < 1:
            minutes = int(hours * 60)
            return f"{minutes} minute(s)"
        elif hours == 1:
            return "1 heure"
        elif hours < 24:
            if hours == int(hours):
                return f"{int(hours)} heure(s)"
            else:
                return f"{hours} heure(s)"
        elif hours == 24:
            return "1 jour"
        elif hours < 168:
            days = hours / 24
            if days == int(days):
                return f"{int(days)} jour(s)"
            else:
                return f"{days:.1f} jour(s)"
        else:
            days = hours / 24
            return f"{int(days)} jour(s)"

    @classmethod
    def format_interval_display(cls, minutes: float) -> str:
        """
        Format an interval in minutes for user-friendly display.
        Supports sub-minute intervals in test mode and extended ranges.

        Args:
            minutes: Interval in minutes (can be float for sub-minute)

        Returns:
            str: Formatted interval string
        """
        if minutes < 1:
            if minutes == 0.5:
                return "30 secondes"
            elif minutes < 0.5:
                seconds = int(minutes * 60)
                return f"{seconds} seconde(s)"
            else:
                seconds = int(minutes * 60)
                return f"{seconds} seconde(s)"
        elif minutes == 1:
            return "1 minute"
        elif minutes < 60:
            if minutes == int(minutes):
                return f"{int(minutes)} minute(s)"
            else:
                return f"{minutes} minute(s)"
        elif minutes == 60:
            return "1 heure"
        elif minutes < 1440:
            hours = int(minutes // 60)
            remaining_minutes = minutes % 60
            if remaining_minutes == 0:
                return f"{hours} heure(s)"
            else:
                if remaining_minutes == int(remaining_minutes):
                    return f"{hours}h{int(remaining_minutes)}m"
                else:
                    return f"{hours}h{remaining_minutes}m"
        elif minutes == 1440:
            return "1 jour"
        elif minutes < 10080:  # Moins d'une semaine
            days = int(minutes // 1440)
            remaining_hours = int((minutes % 1440) // 60)
            remaining_mins = minutes % 60

            parts = []
            if days > 0:
                parts.append(f"{days}j")
            if remaining_hours > 0:
                parts.append(f"{remaining_hours}h")
            if remaining_mins > 0:
                if remaining_mins == int(remaining_mins):
                    parts.append(f"{int(remaining_mins)}m")
                else:
                    parts.append(f"{remaining_mins}m")

            return "".join(parts) if parts else "0 minutes"
        else:
            # Plus d'une semaine
            days = int(minutes // 1440)
            return f"{days} jour(s)"

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
            logger.error(
                f"Invalid reminder interval: {cls.REMINDER_INTERVAL_HOURS}. Must be positive."
            )
            return False

        if not cls.ADMIN_ROLES:
            logger.warning(
                "No admin roles configured. Only Discord administrators will have access."
            )

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
            logger.info("Reminder mode: Same channel as original message")

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
            bool: True if TEST_MODE environment variable is set to true or reminder interval is less than 1 hour
        """
        # Check explicit TEST_MODE environment variable first
        test_mode_env = os.getenv("TEST_MODE", "false").lower()
        if test_mode_env in ["true", "1", "yes", "on"]:
            return True

        # Fallback to checking reminder interval for backward compatibility
        return cls.REMINDER_INTERVAL_HOURS < 1

    @classmethod
    def get_admin_roles_str(cls) -> str:
        """
        Get admin roles as a comma-separated string for display.

        Returns:
            str: Comma-separated list of admin role names
        """
        return ", ".join(cls.ADMIN_ROLES)

    @classmethod
    def get_embed_timestamp(cls) -> datetime:
        """
        Get timestamp for embed display.
        Returns datetime.now() for Discord's automatic formatting.
        """
        return datetime.now()

    @classmethod
    def get_custom_footer_timestamp(cls) -> str:
        """
        Get custom formatted timestamp for footer display.
        In test mode, includes seconds for more precise timing.

        Returns:
            str: Formatted timestamp string
        """
        now = datetime.now()
        if cls.is_test_mode():
            # Mode test : affichage avec secondes pour plus de précision
            return now.strftime("%H:%M:%S")
        else:
            # Mode production : affichage standard sans secondes
            return now.strftime("%H:%M")


# Constants for error messages and user feedback
class Messages:
    """
    Standard messages used throughout the application.
    """

    # Error messages
    INVALID_LINK_FORMAT = (
        "❌ Format de lien invalide. Pour obtenir le lien d'un message:\n"
        "1. Faites clic droit sur le message\n"
        "2. Sélectionnez 'Copier le lien du message'\n"
        "3. Collez le lien complet dans la commande"
    )

    MESSAGE_NOT_FOUND = "❌ Message introuvable."
    CHANNEL_NOT_FOUND = "❌ Canal introuvable."
    WRONG_SERVER = "❌ Ce message n'est pas sur ce serveur!"
    REMINDER_NOT_WATCHED = "❌ Ce message n'est pas surveillé."
    REMINDER_NOT_ON_SERVER = "❌ Ce rappel n'est pas sur ce serveur."
    NO_REMINDERS_TO_REMIND = "📭 Aucun rappel à envoyer sur ce serveur."
    NO_WATCHED_REMINDERS = "📭 Aucun rappel surveillé sur ce serveur."

    # Success messages
    REMINDER_ADDED = "✅ Rappel ajouté à la surveillance!"
    REMINDER_REMOVED = "✅ Rappel **{}** retiré de la surveillance."
    REMINDER_SENT = "✅ Rappel envoyé! {} personne(s) notifiée(s) au total."
    CHANNEL_CREATED = "✅ Canal #{} créé sur le serveur {}"
    INTERVAL_UPDATED = "✅ Intervalle mis à jour : {} pour le rappel **{}**"
    REMINDER_PAUSED = "⏸️ Rappel **{}** mis en pause."
    REMINDER_RESUMED = "▶️ Rappel **{}** repris."

    # Slash command responses
    SLASH_WATCH_SUCCESS = "Rappel ajouté avec succès!"
    SLASH_UNWATCH_SUCCESS = "Rappel retiré de la surveillance."
    SLASH_REMIND_SUCCESS = "Rappel envoyé!"
    SLASH_INTERVAL_SUCCESS = "Intervalle mis à jour."
    SLASH_PAUSE_SUCCESS = "Rappels mis en pause."
    SLASH_RESUME_SUCCESS = "Rappels repris."

    # Info messages
    NO_SAVE_FILE = "ℹ️ Aucune sauvegarde trouvée, démarrage avec une liste vide"
    BOT_CONNECTED = "✅ Bot connecté en tant que {}"
    REMINDERS_LOADED = "✅ {} rappel(s) chargés depuis la sauvegarde"

    # Warning messages
    NO_CHANNEL_PERMISSIONS = "⚠️ Pas les permissions pour créer le canal #{}"
    MENTION_LIMIT_EXCEEDED = "⚠️ +{} autres personnes non mentionnées (limite Discord)"

    # Alias pour la compatibilité avec le code existant
    # TODO: Supprimer ces alias après la migration complète
    MATCH_ADDED = REMINDER_ADDED
    MATCH_REMOVED = REMINDER_REMOVED
    MATCH_PAUSED = REMINDER_PAUSED
    MATCH_RESUMED = REMINDER_RESUMED
    MATCH_NOT_WATCHED = REMINDER_NOT_WATCHED
    MATCH_NOT_ON_SERVER = REMINDER_NOT_ON_SERVER
    NO_MATCHES_TO_REMIND = NO_REMINDERS_TO_REMIND
    NO_WATCHED_MATCHES = NO_WATCHED_REMINDERS
    MATCHES_LOADED = REMINDERS_LOADED
