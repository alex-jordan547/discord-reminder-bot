#!/usr/bin/env python3
"""
Health check script for Discord Reminder Bot Docker container.

This script validates that all required modules can be imported
and basic functionality is available.
"""

import sys


def main():
    """Main health check logic."""
    try:
        # Test core dependencies
        import discord  # noqa: F401

        print("✓ discord.py import successful")

        # Test bot module
        import bot  # noqa: F401

        print("✓ Bot module import successful")

        # Test settings configuration
        from config.settings import Settings  # noqa: F401

        print("✓ Settings configuration accessible")

        # Test basic model imports
        from models.reminder import Event  # noqa: F401

        print("✓ Event model accessible")

        # Test persistence layer
        from persistence.storage import load_events, save_events  # noqa: F401

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
    main()
