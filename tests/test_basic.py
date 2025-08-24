"""
Simple test to verify pytest is working.
"""

import os


def test_environment_setup():
    """Test that the test environment is properly configured."""
    # These should be set by pytest configuration
    test_mode = os.getenv("TEST_MODE")
    discord_token = os.getenv("DISCORD_TOKEN")

    print(f"TEST_MODE: {test_mode}")
    print(f"DISCORD_TOKEN: {'set' if discord_token else 'not set'}")

    assert test_mode == "true", f"Expected TEST_MODE='true', got '{test_mode}'"
    assert discord_token is not None, "DISCORD_TOKEN should be set"


def test_basic_functionality():
    """Basic test to ensure pytest is working."""
    assert 1 + 1 == 2
    assert "test" in "testing"


def test_project_structure():
    """Test that key project files exist."""
    import os

    # Check that we're in the right directory
    assert os.path.exists("bot.py"), "bot.py should exist"
    assert os.path.exists("requirements.txt"), "requirements.txt should exist"
    assert os.path.exists("docker-compose.yml"), "docker-compose.yml should exist"


if __name__ == "__main__":
    print("🧪 Running basic tests...")

    try:
        test_environment_setup()
        print("✅ Environment setup test passed")
    except Exception as e:
        print(f"❌ Environment setup test failed: {e}")

    try:
        test_basic_functionality()
        print("✅ Basic functionality test passed")
    except Exception as e:
        print(f"❌ Basic functionality test failed: {e}")

    try:
        test_project_structure()
        print("✅ Project structure test passed")
    except Exception as e:
        print(f"❌ Project structure test failed: {e}")

    print("🎉 All basic tests completed!")
