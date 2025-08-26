#!/usr/bin/env python3
"""
Script de validation finale pour le bot Discord.
Vérifie que toutes les fonctionnalités critiques sont opérationnelles.
"""

import asyncio
import os
import sys
from datetime import datetime

# Ajouter le répertoire racine au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()


async def validate_critical_functionality():
    """Valide les fonctionnalités critiques du bot."""
    print("🔍 === VALIDATION FINALE DU BOT DISCORD ===\\n")

    critical_tests = []

    # Test 1: Imports critiques
    print("📦 Test des imports critiques...")
    try:
        import bot
        from commands.slash_commands import SlashCommands
        from models.database_models import Event, Guild, Reaction, User
        from utils.event_manager_adapter import event_manager_adapter
        from utils.unified_event_manager import unified_event_manager

        print("✅ Tous les imports critiques réussis")
        critical_tests.append(True)
    except Exception as e:
        print(f"❌ Échec des imports critiques: {e}")
        critical_tests.append(False)

    # Test 2: Base de données
    print("\\n🗄️ Test de la base de données...")
    try:
        from models.schema_manager import setup_database

        success = setup_database()
        if success:
            print("✅ Base de données initialisée")
            critical_tests.append(True)
        else:
            print("❌ Échec de l'initialisation de la base")
            critical_tests.append(False)
    except Exception as e:
        print(f"❌ Erreur base de données: {e}")
        critical_tests.append(False)

    # Test 3: Création d'événement
    print("\\n📅 Test de création d'événement...")
    try:
        from models.database_models import Event, Guild
        from persistence.database import get_database

        database = get_database()
        if database.is_closed():
            database.connect()

        # Créer une guilde de test
        guild, _ = Guild.get_or_create(
            guild_id=999999999, defaults={"name": "Test Guild Final", "settings": "{}"}
        )

        # Créer un événement
        event = Event.create(
            message_id=888777666,
            channel_id=555444333,
            guild_id=guild.guild_id,
            title="Test Final",
            description="Test de validation finale",
            interval_minutes=60.0,
            is_paused=False,
            last_reminder=datetime.now(),
            required_reactions='["✅"]',
        )

        # Vérifier et nettoyer
        found = Event.get_by_id(event.id)
        event.delete_instance()

        print("✅ Création/suppression d'événement réussie")
        critical_tests.append(True)

        database.close()

    except Exception as e:
        print(f"❌ Erreur création d'événement: {e}")
        critical_tests.append(False)

    # Test 4: Gestionnaire unifié
    print("\\n⚙️ Test du gestionnaire unifié...")
    try:
        success = await unified_event_manager.initialize()
        if success:
            print("✅ Gestionnaire unifié initialisé")
            critical_tests.append(True)
        else:
            print("❌ Échec du gestionnaire unifié")
            critical_tests.append(False)
    except Exception as e:
        print(f"❌ Erreur gestionnaire unifié: {e}")
        critical_tests.append(False)

    # Test 5: Configuration
    print("\\n⚙️ Test de la configuration...")
    try:
        from config.feature_flags import feature_flags
        from config.settings import Settings

        # Vérifier les paramètres critiques
        if Settings.TOKEN and Settings.TOKEN != "YOUR_BOT_TOKEN_HERE":
            print("✅ Token Discord configuré")
        else:
            print("⚠️ Token Discord non configuré (normal en test)")

        # Vérifier les feature flags
        sqlite_enabled = feature_flags.is_enabled("sqlite_storage")
        print(f"ℹ️ SQLite storage: {'activé' if sqlite_enabled else 'désactivé'}")

        critical_tests.append(True)

    except Exception as e:
        print(f"❌ Erreur de configuration: {e}")
        critical_tests.append(False)

    # Résumé
    print("\\n" + "=" * 50)
    print("📊 RÉSUMÉ DE LA VALIDATION FINALE")
    print("=" * 50)

    passed = sum(critical_tests)
    total = len(critical_tests)

    print(f"Tests critiques réussis: {passed}/{total}")

    if passed == total:
        print("🎉 VALIDATION RÉUSSIE - Le bot est prêt pour la production!")
        print("\\n🚀 Pour démarrer le bot:")
        print("   ./run_dev.sh")
        print("\\n📋 Commandes disponibles:")
        print("   /watch - Surveiller un événement")
        print("   /list - Lister les événements")
        print("   /help - Aide complète")
        return True
    else:
        print(f"❌ VALIDATION ÉCHOUÉE - {total - passed} test(s) critique(s) ont échoué")
        print("\\n🔧 Actions recommandées:")
        print("   1. Vérifier les logs d'erreur ci-dessus")
        print("   2. Corriger les problèmes identifiés")
        print("   3. Relancer la validation")
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(validate_critical_functionality())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\\n⏹️ Validation interrompue")
        sys.exit(1)
    except Exception as e:
        print(f"\\n💥 Erreur critique lors de la validation: {e}")
        sys.exit(1)
