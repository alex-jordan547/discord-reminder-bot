"""
Match reminder model for Discord Reminder Bot.

This module contains the MatchReminder class that represents a watched match
and its associated data including user reactions and timing information.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set


class Reminder:
    """
    Represents an item being watched for user availability responses.

    This class stores all the information needed to track user reactions
    to a Discord message and send automated reminders.

    Attributes:
        message_id (int): The Discord message ID being watched
        channel_id (int): The Discord channel ID where the message is located
        guild_id (int): The Discord guild (server) ID
        title (str): The title/description of the reminder
        required_reactions (List[str]): List of emoji reactions to track
        last_reminder (datetime): When the last reminder was sent
        users_who_reacted (Set[int]): Set of user IDs who have reacted
        all_users (Set[int]): Set of all user IDs in the server (excluding bots)
        interval_minutes (float): Reminder interval in minutes for this specific reminder
        is_paused (bool): Whether reminders are paused for this item
        created_at (datetime): When this reminder was first added to watch
    """

    def __init__(
        self,
        message_id: int,
        channel_id: int,
        guild_id: int,
        title: str,
        interval_minutes: float = 60,
        required_reactions: Optional[List[str]] = None,
    ) -> None:
        """
        Initialize a new Reminder instance.

        Args:
            message_id: The Discord message ID to watch
            channel_id: The Discord channel ID containing the message
            guild_id: The Discord guild (server) ID
            title: The title or description of the reminder
            interval_minutes: Reminder interval in minutes (default: 60)
            required_reactions: List of emoji reactions to track (defaults to ['✅', '❌', '❓'])
        """
        self.message_id: int = message_id
        self.channel_id: int = channel_id
        self.guild_id: int = guild_id
        self.title: str = title
        # Use centralized validation that accounts for test mode
        from config.settings import Settings

        self.interval_minutes: float = Settings.validate_interval_minutes(interval_minutes)
        self.required_reactions: List[str] = required_reactions or ["✅", "❌", "❓"]
        self.last_reminder: datetime = datetime.now()
        self.users_who_reacted: Set[int] = set()
        self.all_users: Set[int] = set()
        self.is_paused: bool = False
        self.created_at: datetime = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the Reminder instance to a dictionary for JSON serialization.

        Returns:
            Dict containing all instance data in serializable format
        """
        return {
            "message_id": self.message_id,
            "channel_id": self.channel_id,
            "guild_id": self.guild_id,
            "title": self.title,
            "interval_minutes": self.interval_minutes,
            "required_reactions": self.required_reactions,
            "last_reminder": self.last_reminder.isoformat(),
            "users_who_reacted": list(self.users_who_reacted),
            "all_users": list(self.all_users),
            "is_paused": self.is_paused,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Reminder":
        """
        Create a Reminder instance from a dictionary (JSON deserialization).

        Args:
            data: Dictionary containing the serialized Reminder data

        Returns:
            Reminder instance reconstructed from the dictionary
        """
        # Handle backward compatibility - convert hours to minutes if needed
        interval_minutes = data.get("interval_minutes")
        if interval_minutes is None:
            # Try to convert from old REMINDER_INTERVAL_HOURS if present
            from config.settings import Settings

            interval_minutes = Settings.get_reminder_interval_minutes()

        reminder = cls(
            data["message_id"],
            data["channel_id"],
            data.get("guild_id", 0),  # Backward compatibility with older saves
            data["title"],
            interval_minutes,
            data["required_reactions"],
        )
        reminder.last_reminder = datetime.fromisoformat(data["last_reminder"])
        reminder.users_who_reacted = set(data["users_who_reacted"])
        reminder.all_users = set(data["all_users"])
        reminder.is_paused = data.get("is_paused", False)
        reminder.created_at = datetime.fromisoformat(
            data.get("created_at", reminder.last_reminder.isoformat())
        )
        return reminder

    def get_missing_users(self) -> Set[int]:
        """
        Get the set of user IDs who haven't reacted to the message.

        Returns:
            Set of user IDs who are in all_users but not in users_who_reacted
        """
        return self.all_users - self.users_who_reacted

    def get_response_count(self) -> int:
        """
        Get the number of users who have responded.

        Returns:
            Number of users who have reacted
        """
        return len(self.users_who_reacted)

    def get_missing_count(self) -> int:
        """
        Get the number of users who haven't responded.

        Returns:
            Number of users who haven't reacted
        """
        return len(self.get_missing_users())

    def get_total_users_count(self) -> int:
        """
        Get the total number of users being tracked.

        Returns:
            Total number of users in the server
        """
        return len(self.all_users)

    def get_next_reminder_time(self) -> datetime:
        """
        Calculate when the next reminder should be sent.

        Returns:
            datetime: The time when the next reminder should be sent
        """
        return self.last_reminder + timedelta(minutes=self.interval_minutes)

    def get_time_until_next_reminder(self) -> timedelta:
        """
        Get the time remaining until the next reminder.

        Returns:
            timedelta: Time remaining until next reminder (negative if overdue)
        """
        return self.get_next_reminder_time() - datetime.now()

    def is_reminder_due(self) -> bool:
        """
        Check if a reminder is due for this item.

        Returns:
            bool: True if a reminder should be sent now
        """
        if self.is_paused:
            return False

        next_reminder_time = self.get_next_reminder_time()
        current_time = datetime.now()
        is_due = current_time >= next_reminder_time

        # Debug logging
        import logging

        logger = logging.getLogger(__name__)
        if is_due:
            time_diff = current_time - next_reminder_time
            logger.debug(
                f"Reminder {self.message_id}: Reminder DUE! "
                f"Current: {current_time.strftime('%H:%M:%S')}, "
                f"Next: {next_reminder_time.strftime('%H:%M:%S')}, "
                f"Overdue by: {time_diff}"
            )
        else:
            time_until = next_reminder_time - current_time
            logger.debug(
                f"Reminder {self.message_id}: Reminder not due. "
                f"Current: {current_time.strftime('%H:%M:%S')}, "
                f"Next: {next_reminder_time.strftime('%H:%M:%S')}, "
                f"Time until: {time_until}"
            )

        return is_due

    def pause_reminders(self) -> None:
        """
        Pause reminders for this item.
        """
        self.is_paused = True

    def resume_reminders(self) -> None:
        """
        Resume reminders for this item.
        """
        self.is_paused = False

    def set_interval(self, interval_minutes: float) -> None:
        """Set a new reminder interval for this item.

        Uses centralized validation that accounts for test mode.

        Args:
            interval_minutes: New interval in minutes (validation depends on mode)
        """
        from config.settings import Settings

        self.interval_minutes = Settings.validate_interval_minutes(interval_minutes)

    def get_status_summary(self) -> Dict[str, Any]:
        """
        Get a comprehensive status summary for this reminder.

        Returns:
            Dict containing status information for display
        """
        time_until_next = self.get_time_until_next_reminder()

        return {
            "title": self.title,
            "message_id": self.message_id,
            "channel_id": self.channel_id,
            "guild_id": self.guild_id,
            "interval_minutes": self.interval_minutes,
            "is_paused": self.is_paused,
            "response_count": self.get_response_count(),
            "missing_count": self.get_missing_count(),
            "total_count": self.get_total_users_count(),
            "response_percentage": round(
                (self.get_response_count() / max(1, self.get_total_users_count())) * 100, 1
            ),
            "next_reminder": self.get_next_reminder_time(),
            "time_until_next": time_until_next,
            "is_overdue": time_until_next.total_seconds() < 0,
            "created_at": self.created_at,
        }


# Alias pour la compatibilité avec le code existant
# TODO: Supprimer cet alias après la migration complète
MatchReminder = Reminder
