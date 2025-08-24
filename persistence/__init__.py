"""
Persistence package for Discord Reminder Bot.

This package handles data storage and retrieval operations.
"""

from .storage import load_matches, save_matches

__all__ = ["save_matches", "load_matches"]
