#!/usr/bin/env python3
"""
Simple verification script to check if all imports work correctly.
"""

try:
    print("Testing imports...")
    
    # Test config
    from config.settings import Settings, Messages
    print("✅ Config imports work")
    print(f"  - Default reactions: {Settings.DEFAULT_REACTIONS}")
    print(f"  - Max mentions: {Settings.MAX_MENTIONS_PER_REMINDER}")
    
    # Test models
    from models.reminder import MatchReminder
    print("✅ Models imports work")
    
    # Create a test reminder
    reminder = MatchReminder(123, 456, 789, "Test Match")
    print(f"  - Created reminder: {reminder.title}")
    print(f"  - Default reactions: {reminder.required_reactions}")
    
    # Test persistence
    from persistence.storage import save_matches, load_matches
    print("✅ Persistence imports work")
    
    # Test utils
    from utils.permissions import has_admin_permission
    from utils.message_parser import parse_message_link
    from utils.logging_config import setup_logging
    print("✅ Utils imports work")
    
    # Test message parser
    test_link = "https://discord.com/channels/123456789/987654321/555666777"
    parsed = parse_message_link(test_link)
    if parsed:
        print(f"  - Parsed link: guild={parsed.guild_id}, channel={parsed.channel_id}, message={parsed.message_id}")
    else:
        print("  - Failed to parse test link")
    
    print("\n✅ All imports successful! The refactored code structure is working correctly.")
    
except Exception as e:
    print(f"❌ Import error: {e}")
    import traceback
    traceback.print_exc()