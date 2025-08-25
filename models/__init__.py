"""
Models package for Discord Reminder Bot.

This package contains the data models used throughout the application.
"""

from .reminder import Event, MatchReminder  # MatchReminder is legacy alias

__all__ = ["Event", "MatchReminder"]
