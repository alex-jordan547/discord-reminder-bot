"""
Persistence package for Discord Reminder Bot.

This package handles data storage and retrieval operations.
"""

from .storage import save_matches, load_matches

__all__ = ['save_matches', 'load_matches']