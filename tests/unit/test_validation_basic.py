#!/usr/bin/env python3
"""
Basic validation unit tests.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from utils.validation import validate_message_link, ValidationError

def test_message_link_validation():
    """Test basic message link validation."""
    print("🧪 Test validation des liens de message...")
    
    # Valid message links
    valid_links = [
        "https://discord.com/channels/123456789/987654321/111222333",
        "https://discordapp.com/channels/123456789/987654321/111222333"
    ]
    
    for link in valid_links:
        try:
            result = validate_message_link(link)
            print(f"  ✅ Lien valide: {link[:50]}...")
        except ValidationError as e:
            print(f"  ❌ Lien devrait être valide mais rejeté: {link}")
            raise
    
    # Invalid message links
    invalid_links = [
        "not_a_link",
        "https://example.com",
        "https://discord.com/channels/invalid",
        "https://discord.com/channels/123/456"  # Missing message ID
    ]
    
    for link in invalid_links:
        try:
            validate_message_link(link)
            print(f"  ❌ Lien devrait être invalide mais accepté: {link}")
            assert False, f"Expected ValidationError for {link}"
        except ValidationError:
            print(f"  ✅ Lien invalide correctement rejeté: {link}")
    
    return True

def main():
    """Fonction principale de test."""
    print("🔍 Tests de validation de base")
    print("=" * 40)
    
    tests = [test_message_link_validation]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
                print("✅ Test réussi\n")
        except Exception as e:
            print(f"❌ Test échoué: {e}\n")
    
    print("=" * 40)
    print(f"📊 Résultats: {passed}/{total} tests réussis")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    exit(main())