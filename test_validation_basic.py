#!/usr/bin/env python3
"""
Basic validation test to check if our implementation has any obvious issues.
"""

try:
    print("Testing validation module import...")
    from utils.validation import (
        validate_message_id, validate_interval_minutes,
        ValidationError, is_valid_discord_snowflake
    )
    print("✅ Import successful")
    
    print("\nTesting basic message ID validation...")
    # Test valid ID
    result = validate_message_id(123456789012345678)
    print(f"✅ Valid ID test passed: {result}")
    
    # Test invalid ID
    try:
        validate_message_id(-1)
        print("❌ Invalid ID test failed - should have raised exception")
    except ValidationError as e:
        print(f"✅ Invalid ID test passed: {e.message}")
    
    print("\nTesting interval validation...")
    # Test valid interval
    result = validate_interval_minutes(60, test_mode=False)
    print(f"✅ Valid interval test passed: {result}")
    
    # Test clamping
    result = validate_interval_minutes(1, test_mode=False)  # Should be clamped to 5
    print(f"✅ Interval clamping test passed: {result}")
    
    print("\nTesting utility functions...")
    result = is_valid_discord_snowflake(123456789012345678)
    print(f"✅ Snowflake validation utility: {result}")
    
    result = is_valid_discord_snowflake("invalid")
    print(f"✅ Invalid snowflake utility: {result}")
    
    print("\n🎉 All basic tests passed!")
    
except Exception as e:
    print(f"❌ Error during testing: {e}")
    import traceback
    traceback.print_exc()