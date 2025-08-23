#!/usr/bin/env python3
"""
Script de test pour vérifier les corrections apportées.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config.settings import Settings
from models.reminder import MatchReminder
from datetime import datetime

def test_interval_validation():
    """Test que la validation d'intervalle fonctionne correctement."""
    print("🧪 Test de validation d'intervalle...")

    # Simuler le mode production d'abord
    original_hours = Settings.REMINDER_INTERVAL_HOURS
    Settings.REMINDER_INTERVAL_HOURS = 24  # Mode production

    # Test cases en mode production: (input, expected_output)
    test_cases_prod = [
        (2, 5),    # Trop petit, doit être ajusté à 5
        (5, 5),    # Minimum valide
        (60, 60),  # Valeur normale
        (1500, 1440),  # Trop grand, doit être ajusté à 1440
        (-10, 5),  # Négatif, doit être ajusté à 5
    ]

    print("  Mode Production:")
    for input_val, expected in test_cases_prod:
        result = Settings.validate_interval_minutes(input_val)
        status = "✅" if result == expected else "❌"
        print(f"    {status} validate_interval_minutes({input_val}) = {result} (attendu: {expected})")

        if result != expected:
            Settings.REMINDER_INTERVAL_HOURS = original_hours  # Restore
            return False

    # Maintenant tester le mode test
    Settings.REMINDER_INTERVAL_HOURS = 0.1  # Mode test (6 minutes)

    # Test cases en mode test: (input, expected_output)
    test_cases_test = [
        (0, 1),    # 0 doit être ajusté à 1
        (1, 1),    # Minimum valide en mode test
        (2, 2),    # Maintenant valide en mode test!
        (60, 60),  # Valeur normale toujours ok
        (10081, 10080),  # Trop grand, doit être ajusté à 10080 (1 semaine)
        (-5, 1),   # Négatif, doit être ajusté à 1
    ]

    print("  Mode Test:")
    for input_val, expected in test_cases_test:
        result = Settings.validate_interval_minutes(input_val)
        status = "✅" if result == expected else "❌"
        print(f"    {status} validate_interval_minutes({input_val}) = {result} (attendu: {expected})")

        if result != expected:
            Settings.REMINDER_INTERVAL_HOURS = original_hours  # Restore
            return False

    # Restaurer la configuration originale
    Settings.REMINDER_INTERVAL_HOURS = original_hours
    return True

def test_format_interval_display():
    """Test que l'affichage des intervalles fonctionne correctement."""
    print("🧪 Test de formatage d'affichage...")

    test_cases = [
        (1, "1 minute"),
        (5, "5 minute(s)"),
        (30, "30 minute(s)"),
        (60, "1 heure"),
        (90, "1h30m"),
        (120, "2 heure(s)"),
        (1440, "1 jour"),
        (2880, "2j"),          # 2 jours
        (1500, "1j1h"),        # 1 jour 1 heure
        (1502, "1j1h2m"),      # 1 jour 1 heure 2 minutes
        (10080, "7 jour(s)"),  # 1 semaine
    ]

    for input_val, expected in test_cases:
        result = Settings.format_interval_display(input_val)
        status = "✅" if result == expected else "❌"
        print(f"  {status} format_interval_display({input_val}) = '{result}' (attendu: '{expected}')")

        if result != expected:
            return False

    return True

def test_reminder_creation():
    """Test que la création de rappels avec validation fonctionne."""
    print("🧪 Test de création de rappels...")

    # Sauvegarder la configuration originale
    original_hours = Settings.REMINDER_INTERVAL_HOURS

    # Test en mode production
    Settings.REMINDER_INTERVAL_HOURS = 24

    # Test avec intervalle valide
    reminder1 = MatchReminder(123, 456, 789, "Test Match", 60)
    if reminder1.interval_minutes != 60:
        print(f"  ❌ Erreur: intervalle devrait être 60, reçu {reminder1.interval_minutes}")
        Settings.REMINDER_INTERVAL_HOURS = original_hours
        return False
    print(f"  ✅ Création avec intervalle valide (60 min)")

    # Test avec intervalle trop petit (sera ajusté)
    reminder2 = MatchReminder(124, 456, 789, "Test Match 2", 2)
    if reminder2.interval_minutes != 5:
        print(f"  ❌ Erreur: intervalle devrait être ajusté à 5, reçu {reminder2.interval_minutes}")
        Settings.REMINDER_INTERVAL_HOURS = original_hours
        return False
    print(f"  ✅ Création avec intervalle trop petit en prod (2 min → 5 min)")

    # Test en mode test
    Settings.REMINDER_INTERVAL_HOURS = 0.1  # Mode test

    # Maintenant 2 minutes devrait être accepté
    reminder3 = MatchReminder(125, 456, 789, "Test Match 3", 2)
    if reminder3.interval_minutes != 2:
        print(f"  ❌ Erreur: intervalle devrait être 2 en mode test, reçu {reminder3.interval_minutes}")
        Settings.REMINDER_INTERVAL_HOURS = original_hours
        return False
    print(f"  ✅ Création avec intervalle court en mode test (2 min accepté)")

    # Test avec intervalle très grand (sera ajusté)
    reminder4 = MatchReminder(126, 456, 789, "Test Match 4", 15000)
    if reminder4.interval_minutes != 10080:  # 1 semaine max en mode test
        print(f"  ❌ Erreur: intervalle devrait être ajusté à 10080, reçu {reminder4.interval_minutes}")
        Settings.REMINDER_INTERVAL_HOURS = original_hours
        return False
    print(f"  ✅ Création avec intervalle trop grand en mode test (15000 min → 10080 min)")

    # Restaurer la configuration originale
    Settings.REMINDER_INTERVAL_HOURS = original_hours

    return True

def main():
    """Fonction principale de test."""
    print("🔧 Test des corrections apportées au bot Discord")
    print("=" * 50)

    tests = [
        test_interval_validation,
        test_format_interval_display,
        test_reminder_creation,
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        try:
            if test():
                passed += 1
                print("✅ Test réussi\n")
            else:
                print("❌ Test échoué\n")
        except Exception as e:
            print(f"❌ Test échoué avec erreur: {e}\n")

    print("=" * 50)
    print(f"📊 Résultats: {passed}/{total} tests réussis")

    if passed == total:
        print("🎉 Tous les tests sont passés ! Les corrections fonctionnent correctement.")
        return 0
    else:
        print("⚠️  Certains tests ont échoué. Vérifiez les corrections.")
        return 1

if __name__ == "__main__":
    exit(main())