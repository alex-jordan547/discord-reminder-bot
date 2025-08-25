#!/usr/bin/env python3
"""
Script de test manuel pour vérifier les fonctionnalités du bot Discord.
Ce script teste les composants principaux sans nécessiter une connexion Discord.
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
os.environ["SQLITE_MIGRATION"] = "true"
os.environ["SQLITE_SCHEDULER"] = "true"
os.environ["SQLITE_CONCURRENCY"] = "true"
os.environ["SQLITE_MONITORING"] = "true"
os.environ["SQLITE_BACKUP"] = "true"


async def test_database_setup():
    """Test de l'initialisation de la base de données."""
    print("🗄️ Test de l'initialisation de la base de données...")

    try:
        from models.schema_manager import get_database_status, setup_database

        # Initialiser la base de données
        success = setup_database()
        if success:
            print("✅ Base de données initialisée avec succès")

            # Obtenir le statut
            status = get_database_status()
            print(f"📊 Statut de la base: {status['database_available']}")
            print(f"📊 Version du schéma: {status['schema_version']}")

            return True
        else:
            print("❌ Échec de l'initialisation de la base de données")
            return False

    except Exception as e:
        print(f"❌ Erreur lors du test de la base de données: {e}")
        return False


async def test_event_creation():
    """Test de création d'événements."""
    print("\\n📅 Test de création d'événements...")

    try:
        from models.database_models import Event, Guild
        from persistence.database import get_database

        database = get_database()
        if database.is_closed():
            database.connect()

        # Créer une guilde de test
        guild, created = Guild.get_or_create(
            guild_id=123456789, defaults={"name": "Test Guild", "settings": "{}"}
        )

        if created:
            print("✅ Guilde de test créée")
        else:
            print("ℹ️ Guilde de test existante utilisée")

        # Créer un événement de test
        event = Event.create(
            message_id=987654321,
            channel_id=111222333,
            guild_id=guild.guild_id,
            title="Test Event",
            description="Événement de test",
            interval_minutes=60.0,
            is_paused=False,
            last_reminder=datetime.now(),
            required_reactions='["✅", "❌"]',
        )

        print(f"✅ Événement créé avec ID: {event.id}")

        # Vérifier que l'événement existe
        found_event = Event.get_by_id(event.id)
        print(f"✅ Événement retrouvé: {found_event.title}")

        # Nettoyer
        event.delete_instance()
        print("🧹 Événement de test supprimé")

        database.close()
        return True

    except Exception as e:
        print(f"❌ Erreur lors du test de création d'événement: {e}")
        return False


async def test_migration_system():
    """Test du système de migration."""
    print("\\n🔄 Test du système de migration...")

    try:
        from utils.data_migration import check_and_migrate_if_needed

        # Tester la vérification de migration
        migration_needed = await check_and_migrate_if_needed()

        if migration_needed:
            print("✅ Migration effectuée")
        else:
            print("ℹ️ Aucune migration nécessaire")

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test de migration: {e}")
        return False


async def test_unified_event_manager():
    """Test du gestionnaire d'événements unifié."""
    print("\\n⚙️ Test du gestionnaire d'événements unifié...")

    try:
        from utils.unified_event_manager import unified_event_manager

        # Initialiser le gestionnaire
        success = await unified_event_manager.initialize()

        if success:
            print("✅ Gestionnaire d'événements unifié initialisé")

            # Obtenir le statut
            status = unified_event_manager.get_status()
            print(f"📊 Backend actuel: {status.get('backend', 'Unknown')}")
            print(f"📊 Nombre d'événements: {status.get('event_count', 0)}")

            return True
        else:
            print("❌ Échec de l'initialisation du gestionnaire unifié")
            return False

    except Exception as e:
        print(f"❌ Erreur lors du test du gestionnaire unifié: {e}")
        return False


async def test_storage_adapter():
    """Test de l'adaptateur de stockage."""
    print("\\n💾 Test de l'adaptateur de stockage...")

    try:
        from utils.storage_adapter import storage_adapter

        # Initialiser l'adaptateur d'abord
        await storage_adapter.initialize()

        # Tester le chargement des données
        data = await storage_adapter.load_data()
        if data is not None:
            print(f"✅ Données chargées: {len(data)} éléments")
        else:
            print("ℹ️ Aucune donnée trouvée")

        # Tester la sauvegarde (avec données vides pour ne pas affecter les vraies données)
        test_data = []
        success = await storage_adapter.save_data(test_data)

        if success:
            print("✅ Sauvegarde testée avec succès")
        else:
            print("❌ Échec du test de sauvegarde")

        return success

    except Exception as e:
        print(f"❌ Erreur lors du test de l'adaptateur de stockage: {e}")
        return False


async def test_feature_flags():
    """Test des feature flags."""
    print("\\n🚩 Test des feature flags...")

    try:
        from config.feature_flags import feature_flags

        # Vérifier les feature flags SQLite
        sqlite_flags = [
            "sqlite_storage",
            "sqlite_migration",
            "sqlite_scheduler",
            "sqlite_concurrency",
            "sqlite_monitoring",
            "sqlite_backup",
        ]

        for flag in sqlite_flags:
            enabled = feature_flags.is_enabled(flag)
            status = "✅ ACTIVÉ" if enabled else "❌ DÉSACTIVÉ"
            print(f"  {flag}: {status}")

        return True

    except Exception as e:
        print(f"❌ Erreur lors du test des feature flags: {e}")
        return False


async def test_validation():
    """Test du système de validation."""
    print("\\n✅ Test du système de validation...")

    try:
        from utils.validation import validate_environment_config

        # Valider la configuration
        is_valid = validate_environment_config()

        if is_valid:
            print("✅ Configuration environnement valide")
        else:
            print("❌ Configuration environnement invalide")

        return is_valid

    except Exception as e:
        print(f"❌ Erreur lors du test de validation: {e}")
        return False


async def run_all_tests():
    """Exécute tous les tests."""
    print("🧪 === TESTS MANUELS DU BOT DISCORD ===\\n")

    tests = [
        ("Validation de l'environnement", test_validation),
        ("Feature flags", test_feature_flags),
        ("Initialisation base de données", test_database_setup),
        ("Système de migration", test_migration_system),
        ("Création d'événements", test_event_creation),
        ("Adaptateur de stockage", test_storage_adapter),
        ("Gestionnaire d'événements unifié", test_unified_event_manager),
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
    print("📊 RÉSUMÉ DES TESTS")
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
        print("🎉 Tous les tests sont passés avec succès!")
        return True
    else:
        print(f"⚠️ {failed} test(s) ont échoué")
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(run_all_tests())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\\n⏹️ Tests interrompus par l'utilisateur")
        sys.exit(1)
    except Exception as e:
        print(f"\\n💥 Erreur critique: {e}")
        sys.exit(1)
