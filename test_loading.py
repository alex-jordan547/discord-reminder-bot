#!/usr/bin/env python3
"""
Test script to verify compatibility with existing watched_matches.json files.
"""

import sys
import json
from models.reminder import MatchReminder
from persistence.storage import save_matches, load_matches

def test_loading_compatibility():
    """Test loading a sample watched_matches.json file."""
    print("Testing compatibility with existing save format...")
    
    # Test loading from test file
    try:
        with open('test_compatibility.json', 'r') as f:
            data = json.load(f)
        
        watched_matches = {int(k): MatchReminder.from_dict(v) for k, v in data.items()}
        
        print(f"✅ Successfully loaded {len(watched_matches)} match(es)")
        
        # Verify data integrity
        for match_id, reminder in watched_matches.items():
            print(f"  Match {match_id}: {reminder.title}")
            print(f"    Guild: {reminder.guild_id}")
            print(f"    Channel: {reminder.channel_id}")
            print(f"    Responses: {reminder.get_response_count()}/{reminder.get_total_users_count()}")
            print(f"    Missing: {reminder.get_missing_count()}")
            print(f"    Last reminder: {reminder.last_reminder}")
        
        # Test saving back
        if save_matches(watched_matches):
            print("✅ Save function works correctly")
        else:
            print("❌ Save function failed")
            return False
            
        print("✅ Compatibility test passed!")
        return True
        
    except Exception as e:
        print(f"❌ Compatibility test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_loading_compatibility()
    sys.exit(0 if success else 1)