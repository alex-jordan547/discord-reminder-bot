#!/usr/bin/env python3
"""
Basic validation unit tests.
"""

import sys
import os

# Add project root to Python path when running standalone
if __name__ == "__main__":
    project_root = os.path.join(os.path.dirname(__file__), '..', '..')
    sys.path.insert(0, project_root)

from utils.message_parser import parse_message_link

def test_message_link_validation():
    """Test basic message link validation."""
    print("🧪 Testing message link validation...")

    # Valid message links
    valid_links = [
        "https://discord.com/channels/123456789/987654321/111222333",
        "https://discordapp.com/channels/123456789/987654321/111222333"
    ]

    for link in valid_links:
        result = parse_message_link(link)
        if result is not None:
            print(f"  ✅ Valid link: {link[:50]}...")
        else:
            print(f"  ❌ Link should be valid but was rejected: {link}")
            raise AssertionError(f"Expected valid parsing for {link}")

    # Invalid message links
    invalid_links = [
        "not_a_link",
        "https://example.com",
        "https://discord.com/channels/invalid",
        "https://discord.com/channels/123/456"  # Missing message ID
    ]

    for link in invalid_links:
        result = parse_message_link(link)
        if result is None:
            print(f"  ✅ Invalid link correctly rejected: {link}")
        else:
            print(f"  ❌ Link should be invalid but was accepted: {link}")
            raise AssertionError(f"Expected invalid parsing for {link}")

    return True

def main():
    """Main test function."""
    print("🔍 Basic validation tests")
    print("=" * 40)

    tests = [test_message_link_validation]

    passed = 0
    total = len(tests)

    for test in tests:
        try:
            if test():
                passed += 1
                print("✅ Test passed\n")
        except Exception as e:
            print(f"❌ Test failed: {e}\n")

    print("=" * 40)
    print(f"📊 Results: {passed}/{total} tests passed")

    return 0 if passed == total else 1

if __name__ == "__main__":
    exit(main())