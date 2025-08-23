"""
Match reminder model for Discord Reminder Bot.

This module contains the MatchReminder class that represents a watched match
and its associated data including user reactions and timing information.
"""

from datetime import datetime
from typing import Set, List, Dict, Any


class MatchReminder:
    """
    Represents a match being watched for user availability responses.
    
    This class stores all the information needed to track user reactions
    to a Discord message and send automated reminders.
    
    Attributes:
        message_id (int): The Discord message ID being watched
        channel_id (int): The Discord channel ID where the message is located
        guild_id (int): The Discord guild (server) ID
        title (str): The title/description of the match
        required_reactions (List[str]): List of emoji reactions to track
        last_reminder (datetime): When the last reminder was sent
        users_who_reacted (Set[int]): Set of user IDs who have reacted
        all_users (Set[int]): Set of all user IDs in the server (excluding bots)
    """
    
    def __init__(
        self, 
        message_id: int, 
        channel_id: int, 
        guild_id: int, 
        title: str, 
        required_reactions: List[str] = None
    ) -> None:
        """
        Initialize a new MatchReminder instance.
        
        Args:
            message_id: The Discord message ID to watch
            channel_id: The Discord channel ID containing the message
            guild_id: The Discord guild (server) ID
            title: The title or description of the match
            required_reactions: List of emoji reactions to track (defaults to ['✅', '❌', '❓'])
        """
        self.message_id: int = message_id
        self.channel_id: int = channel_id
        self.guild_id: int = guild_id
        self.title: str = title
        self.required_reactions: List[str] = required_reactions or ['✅', '❌', '❓']
        self.last_reminder: datetime = datetime.now()
        self.users_who_reacted: Set[int] = set()
        self.all_users: Set[int] = set()

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the MatchReminder instance to a dictionary for JSON serialization.
        
        Returns:
            Dict containing all instance data in serializable format
        """
        return {
            'message_id': self.message_id,
            'channel_id': self.channel_id,
            'guild_id': self.guild_id,
            'title': self.title,
            'required_reactions': self.required_reactions,
            'last_reminder': self.last_reminder.isoformat(),
            'users_who_reacted': list(self.users_who_reacted),
            'all_users': list(self.all_users)
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MatchReminder':
        """
        Create a MatchReminder instance from a dictionary (JSON deserialization).
        
        Args:
            data: Dictionary containing the serialized MatchReminder data
            
        Returns:
            MatchReminder instance reconstructed from the dictionary
        """
        reminder = cls(
            data['message_id'],
            data['channel_id'],
            data.get('guild_id', 0),  # Backward compatibility with older saves
            data['title'],
            data['required_reactions']
        )
        reminder.last_reminder = datetime.fromisoformat(data['last_reminder'])
        reminder.users_who_reacted = set(data['users_who_reacted'])
        reminder.all_users = set(data['all_users'])
        return reminder
    
    def get_missing_users(self) -> Set[int]:
        """
        Get the set of user IDs who haven't reacted to the match.
        
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