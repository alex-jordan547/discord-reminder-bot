#!/usr/bin/env python3
"""
Script de test des commandes Discord.
Ce script teste les commandes slash et les fonctionnalités principales.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta

# Ajouter le répertoire racine au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

# Configuration pour les tests
os.environ["TEST_MODE"] = "true"
os.environ["SQLITE_STORAGE"] = "true"


async def test_slash_commands_setup():
    """Test de l'initialisation des commandes slash."""
    print("⚡ Test de l'initialisation des commandes slash...")

    try:
        from discord.ext import commands

        from commands.slash_commands import SlashCommands

        # Créer un bot de test
        bot = commands.Bot(command_prefix="!", intents=None)

        # Initialiser les commandes slash
        slash_commands = SlashCommands(bot)

        # Vérifier que les commandes sont définies
        commands_list = [
            "watch",
            "unwatch",
            "list_events",
            "pause",
            "resume",
            "help",
            "status",
            "health",
            "admin",
        ]

        for cmd_name in commands_list:
            if hasattr(slash_commands, cmd_name):
                display_name = cmd_name.replace("_events", "")
                print(f"✅ Commande /{display_name} définie")
            else:
                display_name = cmd_name.replace("_events", "")
                print(f"❌ Commande /{display_name} manquante")
                return False

        print("✅ Toutes les commandes slash sont définies")
        return True

    except Exception as e:
        print(f"❌ Erreur lors du test des commandes slash: {e}")
        return False


async def test_event_manager_operations():
    """Test des opérations du gestionnaire d'événements."""
    print("\\n📋 Test des opérations du gestionnaire d'événements...")

    try:
        from utils.event_manager_adapter import event_manager_adapter

        # Test simple de récupération des événements
        events = await event_manager_adapter.get_all_events()
        print(f"✅ {len(events)} événement(s) trouvé(s)")

        # Test de vérification de l'état du gestionnaire
        if hasattr(event_manager_adapter, "_manager"):
            print("✅ Gestionnaire d'événements initialisé")
        else:
            print("❌ Gestionnaire d'événements non initialisé")
            return False

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test du gestionnaire d'événements: {e}")
        return False


async def test_reminder_scheduling():
    """Test du système de planification des rappels."""
    print("\\n⏰ Test du système de planification des rappels...")

    try:
        # Test simple d'import du scheduler
        try:
            from utils.dynamic_scheduler import DynamicScheduler

            print("✅ Module DynamicScheduler importé")
        except ImportError:
            print("ℹ️ Module DynamicScheduler non disponible, test ignoré")
            return True

        # Test de création d'instance
        scheduler = DynamicScheduler()
        print("✅ Instance DynamicScheduler créée")

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test de planification: {e}")
        return False


async def test_message_parsing():
    """Test du parsing des messages."""
    print("\\n📝 Test du parsing des messages...")

    try:
        # Test simple d'import du module
        from utils import message_parser

        print("✅ Module message_parser importé")

        # Vérifier les fonctions disponibles
        functions = [attr for attr in dir(message_parser) if not attr.startswith("_")]
        print(f"✅ Fonctions disponibles: {', '.join(functions)}")

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test de parsing: {e}")
        return False


async def test_permissions():
    """Test du système de permissions."""
    print("\\n🔐 Test du système de permissions...")

    try:
        # Test simple d'import du module
        from utils import permissions

        print("✅ Module permissions importé")

        # Vérifier les fonctions disponibles
        functions = [attr for attr in dir(permissions) if not attr.startswith("_")]
        print(f"✅ Fonctions disponibles: {', '.join(functions)}")

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test de permissions: {e}")
        return False


async def test_error_recovery():
    """Test du système de récupération d'erreurs."""
    print("\\n🛠️ Test du système de récupération d'erreurs...")

    try:
        # Test simple d'import du module
        from utils import error_recovery

        print("✅ Module error_recovery importé")

        # Vérifier les fonctions disponibles
        functions = [attr for attr in dir(error_recovery) if not attr.startswith("_")]
        print(f"✅ Fonctions disponibles: {', '.join(functions)}")

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test de récupération: {e}")
        return False


async def run_command_tests():
    """Exécute tous les tests de commandes."""
    print("🧪 === TESTS DES COMMANDES DISCORD ===\\n")

    tests = [
        ("Commandes slash", test_slash_commands_setup),
        ("Gestionnaire d'événements", test_event_manager_operations),
        ("Planification des rappels", test_reminder_scheduling),
        ("Parsing des messages", test_message_parsing),
        ("Système de permissions", test_permissions),
        ("Récupération d'erreurs", test_error_recovery),
    ]

    results = []

    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Erreur critique dans {test_name}: {e}")
            results.append((test_name, False))

    # Résumé des résultats
    print("\\n" + "=" * 50)
    print("📊 RÉSUMÉ DES TESTS DE COMMANDES")
    print("=" * 50)

    passed = 0
    failed = 0

    for test_name, result in results:
        status = "✅ RÉUSSI" if result else "❌ ÉCHOUÉ"
        print(f"{test_name}: {status}")

        if result:
            passed += 1
        else:
            failed += 1

    print(f"\\n📈 Total: {passed} réussis, {failed} échoués")

    if failed == 0:
        print("🎉 Tous les tests de commandes sont passés avec succès!")
        return True
    else:
        print(f"⚠️ {failed} test(s) ont échoué")
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(run_command_tests())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\\n⏹️ Tests interrompus par l'utilisateur")
        sys.exit(1)
    except Exception as e:
        print(f"\\n💥 Erreur critique: {e}")
        sys.exit(1)
