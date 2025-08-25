#!/usr/bin/env python3
"""
Health check script for Discord Reminder Bot Docker container.

This script validates that all required modules can be imported
and basic functionality is available.
"""

import sys
import logging

def main():
    """Main health check logic."""
    try:
        # Test core dependencies
        import discord
        print("✓ discord.py import successful")
        
        # Test bot module
        import bot
        print("✓ Bot module import successful")
        
        # Test settings configuration
        from config.settings import Settings
        print("✓ Settings configuration accessible")
        
        # Test basic model imports
        from models.reminder import MatchReminder
        print("✓ MatchReminder model accessible")
        
        # Test persistence layer
        from persistence.storage import load_matches, save_matches
        print("✓ Persistence layer accessible")
        
        print("🎉 Health check passed - all modules ready")
        sys.exit(0)
        
    except ImportError as e:
        print(f"❌ Import error during health check: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error during health check: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Disable logging during health check to avoid noise
    logging.disable(logging.CRITICAL)
    main()