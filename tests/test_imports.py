"""
Test basic imports and module loading.
"""


def test_core_imports():
    """Test that all core modules can be imported."""
    try:
        import discord

        assert hasattr(discord, "Client"), "discord.Client should be available"
        print("✅ Discord.py import successful")
    except ImportError as e:
        assert False, f"Failed to import discord: {e}"

    try:
        from config.settings import Settings

        assert hasattr(
            Settings, "get_reminder_interval_minutes"
        ), "Settings should have reminder interval method"
        print("✅ Settings import successful")
    except ImportError as e:
        assert False, f"Failed to import Settings: {e}"

    try:
        from models.reminder import Reminder

        assert hasattr(Reminder, "to_dict"), "Reminder should have to_dict method"
        print("✅ Reminder model import successful")
    except ImportError as e:
        assert False, f"Failed to import Reminder: {e}"

    try:
        from utils.logging_config import setup_logging

        assert callable(setup_logging), "setup_logging should be callable"
        print("✅ Logging utils import successful")
    except ImportError as e:
        assert False, f"Failed to import logging utils: {e}"


def test_configuration_loading():
    """Test that configuration can be loaded properly."""
    import os

    # Set test environment
    os.environ["TEST_MODE"] = "true"
    os.environ["DISCORD_TOKEN"] = "test_token_for_pytest"

    try:
        from config.settings import Settings

        # Test that Settings can handle test mode
        assert Settings.is_test_mode(), "Should be in test mode"

        # Test interval validation works
        interval = Settings.validate_interval_minutes(60)
        assert isinstance(interval, (int, float)), "Interval should be numeric"
        assert interval > 0, "Interval should be positive"

        print("✅ Configuration loading successful")
    except Exception as e:
        assert False, f"Configuration loading failed: {e}"


def test_storage_system():
    """Test that the storage system works without file operations."""
    try:
        from persistence.storage import load_matches, save_matches

        # These should be importable
        assert callable(load_matches), "load_matches should be callable"
        assert callable(save_matches), "save_matches should be callable"

        print("✅ Storage system imports successful")
    except ImportError as e:
        assert False, f"Failed to import storage system: {e}"


if __name__ == "__main__":
    print("🔧 Running import and configuration tests...")

    try:
        test_core_imports()
        print("✅ All core imports passed")
    except Exception as e:
        print(f"❌ Core imports failed: {e}")

    try:
        test_configuration_loading()
        print("✅ Configuration loading passed")
    except Exception as e:
        print(f"❌ Configuration loading failed: {e}")

    try:
        test_storage_system()
        print("✅ Storage system passed")
    except Exception as e:
        print(f"❌ Storage system failed: {e}")

    print("🎉 All import tests completed!")
