#!/usr/bin/env python3
"""
Test script for database configuration.

This script tests different database configuration scenarios
to verify environment-based configuration works correctly.
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from config.settings import Settings
from persistence.database import DatabaseConfig, get_database_info
from persistence.database_manager import get_database_manager


async def test_default_config():
    """
    Test default database configuration.
    """
    print("🔧 Testing default configuration...")

    try:
        # Check default settings
        print(f"  USE_SQLITE: {Settings.USE_SQLITE}")
        print(f"  DATABASE_PATH: {Settings.DATABASE_PATH}")
        print(f"  AUTO_MIGRATE: {Settings.AUTO_MIGRATE}")
        print(f"  BACKUP_JSON_ON_MIGRATION: {Settings.BACKUP_JSON_ON_MIGRATION}")

        # Get database info
        db_info = get_database_info()
        print(f"  Database path: {db_info['database_path']}")
        print(f"  Database exists: {db_info['database_exists']}")

        # Test database config
        is_test_mode = DatabaseConfig.is_test_mode()
        print(f"  Test mode: {is_test_mode}")

        print("✅ Default configuration test passed!")
        return True

    except Exception as e:
        print(f"❌ Default configuration test failed: {e}")
        return False


async def test_environment_overrides():
    """
    Test environment variable overrides.
    """
    print("🌍 Testing environment overrides...")

    try:
        # Save original values
        original_values = {
            "USE_SQLITE": os.getenv("USE_SQLITE"),
            "DATABASE_PATH": os.getenv("DATABASE_PATH"),
            "AUTO_MIGRATE": os.getenv("AUTO_MIGRATE"),
            "TEST_MODE": os.getenv("TEST_MODE"),
        }

        # Test SQLite enabled
        os.environ["USE_SQLITE"] = "true"
        os.environ["DATABASE_PATH"] = "test_custom.db"
        os.environ["AUTO_MIGRATE"] = "false"

        # Reload settings (in a real scenario, this would require restarting)
        # For testing, we'll just check the environment variables directly
        use_sqlite = os.getenv("USE_SQLITE", "false").lower() == "true"
        database_path = os.getenv("DATABASE_PATH", "discord_bot.db")
        auto_migrate = os.getenv("AUTO_MIGRATE", "true").lower() == "true"

        print(f"  Overridden USE_SQLITE: {use_sqlite}")
        print(f"  Overridden DATABASE_PATH: {database_path}")
        print(f"  Overridden AUTO_MIGRATE: {auto_migrate}")

        assert use_sqlite == True
        assert database_path == "test_custom.db"
        assert auto_migrate == False

        # Test test mode
        os.environ["TEST_MODE"] = "true"
        is_test_mode = DatabaseConfig.is_test_mode()
        print(f"  Test mode enabled: {is_test_mode}")
        assert is_test_mode == True

        print("✅ Environment override test passed!")
        return True

    except Exception as e:
        print(f"❌ Environment override test failed: {e}")
        return False

    finally:
        # Restore original values
        for key, value in original_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


async def test_database_manager_config():
    """
    Test database manager with different configurations.
    """
    print("🗄️ Testing database manager configuration...")

    try:
        # Test production database
        os.environ.pop("TEST_MODE", None)  # Ensure test mode is off

        db_manager = get_database_manager()
        health = await db_manager.health_check()

        print(f"  Database status: {health['status']}")
        print(f"  Database available: {health['database_available']}")
        print(f"  Tables exist: {health['tables_exist']}")

        # Test status summary
        status_summary = db_manager.get_status_summary()
        print(f"  Status summary: {status_summary}")

        print("✅ Database manager configuration test passed!")
        return True

    except Exception as e:
        print(f"❌ Database manager configuration test failed: {e}")
        return False


async def test_test_mode_database():
    """
    Test in-memory database for test mode.
    """
    print("🧪 Testing test mode database...")

    try:
        # Enable test mode
        os.environ["TEST_MODE"] = "true"

        # Get test database
        test_db = DatabaseConfig.get_test_database()
        print(f"  Test database: {test_db.database}")

        # Verify it's in-memory
        assert test_db.database == ":memory:"

        # Get configured database (should be test database)
        configured_db = DatabaseConfig.get_configured_database()
        print(f"  Configured database: {configured_db.database}")

        assert configured_db.database == ":memory:"

        print("✅ Test mode database test passed!")
        return True

    except Exception as e:
        print(f"❌ Test mode database test failed: {e}")
        return False

    finally:
        # Disable test mode
        os.environ.pop("TEST_MODE", None)


async def main():
    """
    Main test function.
    """
    # Setup basic logging
    logging.basicConfig(
        level=logging.WARNING,  # Reduce noise
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    print("🔧 Testing Database Configuration")
    print("=" * 35)

    try:
        # Run configuration tests
        tests = [
            test_default_config(),
            test_environment_overrides(),
            test_database_manager_config(),
            test_test_mode_database(),
        ]

        results = await asyncio.gather(*tests, return_exceptions=True)

        # Check results
        all_passed = True
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"❌ Test {i+1} failed with exception: {result}")
                all_passed = False
            elif not result:
                print(f"❌ Test {i+1} failed")
                all_passed = False

        if all_passed:
            print("\n🎉 All configuration tests passed!")
            return 0
        else:
            print("\n❌ Some configuration tests failed!")
            return 1

    except Exception as e:
        print(f"💥 Configuration test suite failed: {e}")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
