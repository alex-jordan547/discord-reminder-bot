#!/usr/bin/env python3
"""
Development script to validate that all imports work correctly.
"""

import os
import importlib.util

def validate_module(module_path, module_name):
    """Validate that a module can be imported."""
    try:
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None:
            return False, "Could not create module spec"

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return True, "Import successful"
    except Exception as e:
        return False, str(e)

def main():
    """Main function."""
    print("🔍 Validating Python imports...")

    # Key modules to test
    test_modules = [
        ("bot.py", "bot"),
        ("commands/handlers.py", "handlers"),
        ("commands/slash_commands.py", "slash_commands"),
        ("config/settings.py", "settings"),
        ("models/reminder.py", "reminder"),
        ("persistence/storage.py", "storage"),
        ("utils/logging_config.py", "logging_config"),
        ("utils/validation.py", "validation"),
    ]

    passed = 0
    total = len(test_modules)

    for module_path, module_name in test_modules:
        if not os.path.exists(module_path):
            print(f"❌ {module_path}: File not found")
            continue

        success, message = validate_module(module_path, module_name)
        if success:
            print(f"✅ {module_path}: {message}")
            passed += 1
        else:
            print(f"❌ {module_path}: {message}")

    print(f"\n📊 Results: {passed}/{total} modules imported successfully")

    if passed == total:
        print("🎉 All imports validated successfully!")
        return 0
    else:
        print("⚠️  Some imports failed.")
        return 1

if __name__ == "__main__":
    exit(main())