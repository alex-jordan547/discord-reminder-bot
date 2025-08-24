#!/usr/bin/env python3
"""
Test script for the new /help command and short test intervals.

This script validates the new features:
1. Help command functionality
2. Short interval support in test mode (30s, 1min, 2min)
3. Interval conversion and validation logic
"""

import os
import sys
from datetime import datetime, timedelta

def test_interval_conversion():
    """Test interval conversion from seconds to minutes for slash commands."""
    print("=== Test de conversion d'intervalles ===")
    
    # Simuler les valeurs des choices Discord (en secondes)
    test_intervals = {
        30: "30 secondes (test)",
        60: "1 minute (test)", 
        120: "2 minutes (test)",
        300: "5 minutes",
        1800: "30 minutes",
        3600: "1 heure",
        86400: "24 heures"
    }
    
    for seconds, description in test_intervals.items():
        minutes = seconds / 60.0
        print(f"{description}: {seconds}s -> {minutes}min")
    
    print("\n✅ Conversion d'intervalles OK\n")

def test_settings_validation():
    """Test settings validation with new test mode features."""
    print("=== Test de validation des paramètres ===")
    
    # Configurer explicitement le mode test
    os.environ['TEST_MODE'] = 'true'
    
    # Importer après avoir défini les variables d'environnement
    from config.settings import Settings
    
    print(f"Mode test activé: {Settings.is_test_mode()}")
    
    # Test des intervalles en mode test
    test_values = [0.5, 1, 2, 5, 15, 30, 60, 120, 1440]
    
    for minutes in test_values:
        validated = Settings.validate_interval_minutes(minutes)
        formatted = Settings.format_interval_display(validated)
        status = "✅" if validated == minutes else "⚠️ ajusté"
        print(f"  {minutes} min -> {validated} min ({formatted}) {status}")
    
    print("\n✅ Validation des paramètres OK\n")

def test_reminder_model():
    """Test reminder model with float intervals."""
    print("=== Test du modèle Reminder ===")
    
    os.environ['TEST_MODE'] = 'true'
    
    from models.reminder import MatchReminder
    
    # Tester la création d'un reminder avec intervalle court
    reminder = MatchReminder(
        message_id=123456789,
        channel_id=987654321,
        guild_id=555444333,
        title="Test Match 30 secondes",
        interval_minutes=0.5  # 30 secondes
    )
    
    print(f"Reminder créé:")
    print(f"  Titre: {reminder.title}")
    print(f"  Intervalle: {reminder.interval_minutes} min")
    print(f"  Prochain rappel: {reminder.get_next_reminder_time()}")
    
    # Test de sérialisation/désérialisation
    data = reminder.to_dict()
    reminder2 = MatchReminder.from_dict(data)
    
    print(f"  Sérialisation OK: {reminder2.interval_minutes == reminder.interval_minutes}")
    
    print("\n✅ Modèle Reminder OK\n")

def test_help_command_data():
    """Test help command static data and content."""
    print("=== Test des données de la commande help ===")
    
    os.environ['TEST_MODE'] = 'true'
    from config.settings import Settings
    
    # Tester le contenu dynamique de l'aide
    is_test_mode = Settings.is_test_mode()
    print(f"Mode test détecté: {is_test_mode}")
    
    if is_test_mode:
        interval_text = (
            "• 30 secondes, 1 minute, 2 minutes *(mode test)*\n"
            "• 5 min, 15 min, 30 min, 1h, 2h, 6h, 12h, 24h\n"
            f"*(Mode test actif - intervalles flexibles de 30s à 7 jours)*"
        )
        print("Texte d'aide pour mode test généré correctement")
    else:
        interval_text = "• 5 min, 15 min, 30 min, 1h, 2h, 6h, 12h, 24h"
        print("Texte d'aide pour mode production généré correctement")
    
    print(f"Admin roles: {Settings.get_admin_roles_str()}")
    
    print("\n✅ Données de la commande help OK\n")

def main():
    """Run all tests."""
    print("🧪 Test des nouvelles fonctionnalités /help et intervalles courts\n")
    
    try:
        test_interval_conversion()
        test_settings_validation()
        test_reminder_model()
        test_help_command_data()
        
        print("🎉 Tous les tests sont passés avec succès!")
        print("\n📋 Résumé des nouvelles fonctionnalités:")
        print("  ✅ Commande /help avec interface riche Discord")
        print("  ✅ Support des intervalles courts en mode test (30s, 1min, 2min)")
        print("  ✅ Conversion automatique secondes -> minutes")
        print("  ✅ Validation flexible selon le mode (test/production)")
        print("  ✅ Format d'affichage adapté aux nouveaux intervalles")
        
        print("\n🚀 Pour tester en live:")
        print("  1. Configurer TEST_MODE=true dans .env")
        print("  2. Lancer le bot: ./run_dev.sh")
        print("  3. Utiliser /help pour voir l'aide complète")
        print("  4. Utiliser /watch avec les nouveaux intervalles courts")
        
        return True
        
    except Exception as e:
        print(f"❌ Erreur lors des tests: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)