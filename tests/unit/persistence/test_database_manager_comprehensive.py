"""
Tests unitaires complets pour le module persistence/database_manager.py

Ce module teste tous les aspects du gestionnaire de base de données, incluant :
- Initialisation et arrêt du système de base de données
- Vérifications de santé et monitoring
- Opérations de maintenance (sauvegarde, optimisation, reset)
- Gestion des erreurs et récupération
- Singleton pattern pour le gestionnaire global
"""

import os
import sys
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, Mock, patch

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from persistence.database_manager import (
    DatabaseManager,
    get_database_manager,
    initialize_database_system,
    shutdown_database_system,
)


class TestDatabaseManager(IsolatedAsyncioTestCase):
    """Tests pour la classe DatabaseManager."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        self.db_manager = DatabaseManager()

    async def test_init(self):
        """Test initialisation du DatabaseManager."""
        self.assertFalse(self.db_manager._initialized)
        self.assertIsNone(self.db_manager._database)

    @patch("persistence.database_manager.DatabaseConfig.get_configured_database")
    @patch("persistence.database_manager.initialize_database")
    @patch("persistence.database_manager.create_tables")
    @patch("persistence.database_manager.is_database_available")
    @patch("persistence.database_manager.get_database_info")
    @patch("persistence.database_manager.get_table_info")
    async def test_initialize_success(
        self,
        mock_table_info,
        mock_db_info,
        mock_db_available,
        mock_create_tables,
        mock_init_db,
        mock_get_configured_db,
    ):
        """Test initialisation réussie."""
        # Configuration des mocks
        mock_db = Mock()
        mock_get_configured_db.return_value = mock_db
        mock_init_db.return_value = True
        mock_create_tables.return_value = True
        mock_db_available.return_value = True
        mock_db_info.return_value = {
            "database_path": "/path/to/db.sqlite",
            "database_size_mb": 2.5,
        }
        mock_table_info.return_value = {
            "guild": {"row_count": 5},
            "user": {"row_count": 10},
        }

        result = await self.db_manager.initialize()

        self.assertTrue(result)
        self.assertTrue(self.db_manager._initialized)
        self.assertEqual(self.db_manager._database, mock_db)

        # Vérifier les appels
        mock_get_configured_db.assert_called_once()
        mock_init_db.assert_called_once()
        mock_create_tables.assert_called_once()
        mock_db_available.assert_called_once()

    @patch("persistence.database_manager.DatabaseConfig.get_configured_database")
    @patch("persistence.database_manager.initialize_database")
    async def test_initialize_db_init_failure(self, mock_init_db, mock_get_configured_db):
        """Test initialisation avec échec d'initialisation de la DB."""
        mock_db = Mock()
        mock_get_configured_db.return_value = mock_db
        mock_init_db.return_value = False

        result = await self.db_manager.initialize()

        self.assertFalse(result)
        self.assertFalse(self.db_manager._initialized)

    @patch("persistence.database_manager.DatabaseConfig.get_configured_database")
    @patch("persistence.database_manager.initialize_database")
    @patch("persistence.database_manager.create_tables")
    async def test_initialize_create_tables_failure(self, mock_create_tables, mock_init_db, mock_get_configured_db):
        """Test initialisation avec échec de création des tables."""
        mock_db = Mock()
        mock_get_configured_db.return_value = mock_db
        mock_init_db.return_value = True
        mock_create_tables.return_value = False

        result = await self.db_manager.initialize()

        self.assertFalse(result)
        self.assertFalse(self.db_manager._initialized)

    @patch("persistence.database_manager.DatabaseConfig.get_configured_database")
    @patch("persistence.database_manager.initialize_database")
    @patch("persistence.database_manager.create_tables")
    @patch("persistence.database_manager.is_database_available")
    async def test_initialize_db_unavailable(self, mock_db_available, mock_create_tables, mock_init_db, mock_get_configured_db):
        """Test initialisation avec base de données indisponible."""
        mock_db = Mock()
        mock_get_configured_db.return_value = mock_db
        mock_init_db.return_value = True
        mock_create_tables.return_value = True
        mock_db_available.return_value = False

        result = await self.db_manager.initialize()

        self.assertFalse(result)
        self.assertFalse(self.db_manager._initialized)

    @patch("persistence.database_manager.DatabaseConfig.get_configured_database")
    async def test_initialize_exception(self, mock_get_configured_db):
        """Test initialisation avec exception."""
        mock_get_configured_db.side_effect = Exception("Configuration error")

        result = await self.db_manager.initialize()

        self.assertFalse(result)
        self.assertFalse(self.db_manager._initialized)

    @patch("persistence.database_manager.close_database")
    async def test_shutdown(self, mock_close_db):
        """Test arrêt du gestionnaire."""
        self.db_manager._initialized = True

        await self.db_manager.shutdown()

        self.assertFalse(self.db_manager._initialized)
        mock_close_db.assert_called_once()

    @patch("persistence.database_manager.close_database")
    async def test_shutdown_with_exception(self, mock_close_db):
        """Test arrêt avec exception."""
        self.db_manager._initialized = True
        mock_close_db.side_effect = Exception("Shutdown error")

        # Ne devrait pas lever d'exception
        await self.db_manager.shutdown()

        self.assertFalse(self.db_manager._initialized)

    def test_is_initialized(self):
        """Test vérification de l'état d'initialisation."""
        self.assertFalse(self.db_manager.is_initialized())

        self.db_manager._initialized = True
        self.assertTrue(self.db_manager.is_initialized())

    @patch("persistence.database_manager.is_database_available")
    @patch("persistence.database_manager.get_database_info")
    @patch("persistence.database_manager.get_table_info")
    @patch("persistence.database_manager.ALL_MODELS")
    async def test_health_check_healthy(self, mock_all_models, mock_table_info, mock_db_info, mock_db_available):
        """Test vérification de santé - état sain."""
        self.db_manager._initialized = True
        mock_all_models.__len__ = Mock(return_value=5)  # 5 modèles attendus
        mock_db_available.return_value = True
        mock_db_info.return_value = {"database_path": "/path/to/db.sqlite"}
        mock_table_info.return_value = {
            "table1": {"exists": True},
            "table2": {"exists": True},
            "table3": {"exists": True},
            "table4": {"exists": True},
            "table5": {"exists": True},
        }

        health = await self.db_manager.health_check()

        self.assertEqual(health["status"], "healthy")
        self.assertTrue(health["initialized"])
        self.assertTrue(health["database_available"])
        self.assertTrue(health["tables_exist"])
        self.assertEqual(len(health["errors"]), 0)

    @patch("persistence.database_manager.is_database_available")
    async def test_health_check_db_unavailable(self, mock_db_available):
        """Test vérification de santé - base de données indisponible."""
        self.db_manager._initialized = True
        mock_db_available.return_value = False

        health = await self.db_manager.health_check()

        self.assertEqual(health["status"], "unhealthy")
        self.assertTrue(health["initialized"])
        self.assertFalse(health["database_available"])
        self.assertIn("Database not available", health["errors"])

    @patch("persistence.database_manager.is_database_available")
    @patch("persistence.database_manager.get_database_info")
    @patch("persistence.database_manager.get_table_info")
    @patch("persistence.database_manager.ALL_MODELS")
    async def test_health_check_missing_tables(self, mock_all_models, mock_table_info, mock_db_info, mock_db_available):
        """Test vérification de santé - tables manquantes."""
        self.db_manager._initialized = True
        mock_all_models.__len__ = Mock(return_value=5)  # 5 modèles attendus
        mock_db_available.return_value = True
        mock_db_info.return_value = {"database_path": "/path/to/db.sqlite"}
        mock_table_info.return_value = {
            "table1": {"exists": True},
            "table2": {"exists": True},
            "table3": {"exists": False},  # Table manquante
        }

        health = await self.db_manager.health_check()

        self.assertEqual(health["status"], "unhealthy")
        self.assertTrue(health["initialized"])
        self.assertTrue(health["database_available"])
        self.assertFalse(health["tables_exist"])
        self.assertIn("Not all tables exist", health["errors"])

    @patch("persistence.database_manager.is_database_available")
    @patch("persistence.database_manager.get_database_info")
    @patch("persistence.database_manager.get_table_info")
    @patch("persistence.database_manager.ALL_MODELS")
    async def test_health_check_degraded(self, mock_all_models, mock_table_info, mock_db_info, mock_db_available):
        """Test vérification de santé - état dégradé."""
        self.db_manager._initialized = False  # Non initialisé
        mock_all_models.__len__ = Mock(return_value=3)
        mock_db_available.return_value = True
        mock_db_info.return_value = {"database_path": "/path/to/db.sqlite"}
        mock_table_info.return_value = {
            "table1": {"exists": True},
            "table2": {"exists": True},
            "table3": {"exists": True},
        }

        health = await self.db_manager.health_check()

        self.assertEqual(health["status"], "degraded")
        self.assertFalse(health["initialized"])
        self.assertTrue(health["database_available"])
        self.assertTrue(health["tables_exist"])

    @patch("persistence.database_manager.is_database_available")
    async def test_health_check_exception(self, mock_db_available):
        """Test vérification de santé avec exception."""
        mock_db_available.side_effect = Exception("Health check error")

        health = await self.db_manager.health_check()

        self.assertEqual(health["status"], "error")
        self.assertIn("Health check failed", health["errors"][0])

    @patch("persistence.database_manager.get_database_info")
    @patch("pathlib.Path.exists")
    @patch("shutil.copy2")
    async def test_backup_database_success(self, mock_copy2, mock_exists, mock_db_info):
        """Test sauvegarde réussie de la base de données."""
        self.db_manager._initialized = True
        mock_db_info.return_value = {"database_path": "/path/to/source.db"}
        mock_exists.return_value = True

        result = await self.db_manager.backup_database("/path/to/backup.db")

        self.assertTrue(result)
        mock_copy2.assert_called_once_with("/path/to/source.db", "/path/to/backup.db")

    async def test_backup_database_not_initialized(self):
        """Test sauvegarde avec gestionnaire non initialisé."""
        self.db_manager._initialized = False

        result = await self.db_manager.backup_database("/path/to/backup.db")

        self.assertFalse(result)

    @patch("persistence.database_manager.get_database_info")
    @patch("pathlib.Path.exists")
    async def test_backup_database_source_not_exists(self, mock_exists, mock_db_info):
        """Test sauvegarde avec fichier source inexistant."""
        self.db_manager._initialized = True
        mock_db_info.return_value = {"database_path": "/path/to/nonexistent.db"}
        mock_exists.return_value = False

        result = await self.db_manager.backup_database("/path/to/backup.db")

        self.assertFalse(result)

    @patch("persistence.database_manager.get_database_info")
    @patch("pathlib.Path.exists")
    @patch("persistence.database_manager.datetime")
    @patch("shutil.copy2")
    async def test_backup_database_auto_path(self, mock_copy2, mock_datetime, mock_exists, mock_db_info):
        """Test sauvegarde avec génération automatique du chemin."""
        self.db_manager._initialized = True
        mock_db_info.return_value = {"database_path": "/path/to/source.db"}
        mock_exists.return_value = True

        # Mock datetime
        mock_now = Mock()
        mock_now.strftime.return_value = "20231201_103000"
        mock_datetime.now.return_value = mock_now

        result = await self.db_manager.backup_database()

        self.assertTrue(result)
        mock_copy2.assert_called_once_with("/path/to/source.db", "discord_bot_backup_20231201_103000.db")

    @patch("persistence.database_manager.get_database_info")
    @patch("pathlib.Path.exists")
    @patch("shutil.copy2")
    async def test_backup_database_exception(self, mock_copy2, mock_exists, mock_db_info):
        """Test sauvegarde avec exception."""
        self.db_manager._initialized = True
        mock_db_info.return_value = {"database_path": "/path/to/source.db"}
        mock_exists.return_value = True
        mock_copy2.side_effect = Exception("Copy failed")

        result = await self.db_manager.backup_database("/path/to/backup.db")

        self.assertFalse(result)

    @patch("persistence.database_manager.get_database")
    async def test_optimize_database_success(self, mock_get_database):
        """Test optimisation réussie de la base de données."""
        self.db_manager._initialized = True

        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = await self.db_manager.optimize_database()

        self.assertTrue(result)
        mock_db.connect.assert_called_once()
        # Vérifier que VACUUM et ANALYZE ont été appelés
        calls = mock_db.execute_sql.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0][0], "VACUUM")
        self.assertEqual(calls[1][0][0], "ANALYZE")
        mock_db.close.assert_called_once()

    async def test_optimize_database_not_initialized(self):
        """Test optimisation avec gestionnaire non initialisé."""
        self.db_manager._initialized = False

        result = await self.db_manager.optimize_database()

        self.assertFalse(result)

    @patch("persistence.database_manager.get_database")
    async def test_optimize_database_exception(self, mock_get_database):
        """Test optimisation avec exception."""
        self.db_manager._initialized = True
        mock_get_database.side_effect = Exception("Optimization error")

        result = await self.db_manager.optimize_database()

        self.assertFalse(result)

    @patch("persistence.database_manager.get_database")
    async def test_optimize_database_closes_on_exception(self, mock_get_database):
        """Test que la connexion est fermée même en cas d'exception."""
        self.db_manager._initialized = True

        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.side_effect = Exception("SQL error")
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = await self.db_manager.optimize_database()

        self.assertFalse(result)
        mock_db.close.assert_called_once()

    @patch("persistence.database_manager.drop_tables")
    @patch("persistence.database_manager.create_tables")
    async def test_reset_database_success(self, mock_create_tables, mock_drop_tables):
        """Test reset réussi de la base de données."""
        mock_drop_tables.return_value = True
        mock_create_tables.return_value = True

        result = await self.db_manager.reset_database()

        self.assertTrue(result)
        mock_drop_tables.assert_called_once()
        mock_create_tables.assert_called_once()

    @patch("persistence.database_manager.drop_tables")
    async def test_reset_database_drop_failure(self, mock_drop_tables):
        """Test reset avec échec de suppression des tables."""
        mock_drop_tables.return_value = False

        result = await self.db_manager.reset_database()

        self.assertFalse(result)
        mock_drop_tables.assert_called_once()

    @patch("persistence.database_manager.drop_tables")
    @patch("persistence.database_manager.create_tables")
    async def test_reset_database_create_failure(self, mock_create_tables, mock_drop_tables):
        """Test reset avec échec de création des tables."""
        mock_drop_tables.return_value = True
        mock_create_tables.return_value = False

        result = await self.db_manager.reset_database()

        self.assertFalse(result)
        mock_drop_tables.assert_called_once()
        mock_create_tables.assert_called_once()

    @patch("persistence.database_manager.drop_tables")
    async def test_reset_database_exception(self, mock_drop_tables):
        """Test reset avec exception."""
        mock_drop_tables.side_effect = Exception("Reset error")

        result = await self.db_manager.reset_database()

        self.assertFalse(result)

    def test_get_status_summary_not_initialized(self):
        """Test résumé de statut - non initialisé."""
        self.db_manager._initialized = False

        summary = self.db_manager.get_status_summary()

        self.assertEqual(summary, "❌ Database not initialized")

    @patch("persistence.database_manager.is_database_available")
    async def test_get_status_summary_unavailable(self, mock_db_available):
        """Test résumé de statut - base de données indisponible."""
        self.db_manager._initialized = True
        mock_db_available.return_value = False

        summary = self.db_manager.get_status_summary()

        self.assertEqual(summary, "⚠️ Database unavailable")

    @patch("persistence.database_manager.is_database_available")
    @patch("persistence.database_manager.get_database_info")
    @patch("persistence.database_manager.get_table_info")
    async def test_get_status_summary_healthy(self, mock_table_info, mock_db_info, mock_db_available):
        """Test résumé de statut - sain."""
        self.db_manager._initialized = True
        mock_db_available.return_value = True
        mock_db_info.return_value = {"database_size_mb": 3.5}
        mock_table_info.return_value = {
            "table1": {"row_count": 10},
            "table2": {"row_count": 25},
        }

        summary = self.db_manager.get_status_summary()

        self.assertEqual(summary, "✅ Database healthy - 35 records (3.5 MB)")

    @patch("persistence.database_manager.is_database_available")
    @patch("persistence.database_manager.get_database_info")
    @patch("persistence.database_manager.get_table_info")
    async def test_get_status_summary_healthy_no_size(self, mock_table_info, mock_db_info, mock_db_available):
        """Test résumé de statut - sain sans taille."""
        self.db_manager._initialized = True
        mock_db_available.return_value = True
        mock_db_info.return_value = {}  # Pas de taille
        mock_table_info.return_value = {
            "table1": {"row_count": 15},
        }

        summary = self.db_manager.get_status_summary()

        self.assertEqual(summary, "✅ Database healthy - 15 records")

    @patch("persistence.database_manager.is_database_available")
    async def test_get_status_summary_exception(self, mock_db_available):
        """Test résumé de statut avec exception."""
        self.db_manager._initialized = True
        mock_db_available.side_effect = Exception("Status error")

        summary = self.db_manager.get_status_summary()

        self.assertEqual(summary, "❌ Database error: Status error")


class TestDatabaseManagerGlobal(TestCase):
    """Tests pour les fonctions globales du gestionnaire de base de données."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Reset global manager
        import persistence.database_manager

        persistence.database_manager._db_manager = None

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Reset global manager
        import persistence.database_manager

        persistence.database_manager._db_manager = None

    def test_get_database_manager_singleton(self):
        """Test que get_database_manager retourne toujours la même instance."""
        manager1 = get_database_manager()
        manager2 = get_database_manager()

        self.assertIs(manager1, manager2)
        self.assertIsInstance(manager1, DatabaseManager)

    def test_get_database_manager_creates_instance(self):
        """Test que get_database_manager crée une nouvelle instance si nécessaire."""
        manager = get_database_manager()

        self.assertIsInstance(manager, DatabaseManager)
        self.assertFalse(manager.is_initialized())


class TestDatabaseManagerGlobalFunctions(IsolatedAsyncioTestCase):
    """Tests pour les fonctions globales asynchrones."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Reset global manager
        import persistence.database_manager

        persistence.database_manager._db_manager = None

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Reset global manager
        import persistence.database_manager

        persistence.database_manager._db_manager = None

    @patch("persistence.database_manager.get_database_manager")
    async def test_initialize_database_system(self, mock_get_manager):
        """Test initialisation du système de base de données global."""
        mock_manager = Mock()
        mock_manager.initialize = AsyncMock(return_value=True)
        mock_get_manager.return_value = mock_manager

        result = await initialize_database_system()

        self.assertTrue(result)
        mock_get_manager.assert_called_once()
        mock_manager.initialize.assert_called_once()

    @patch("persistence.database_manager.get_database_manager")
    async def test_initialize_database_system_failure(self, mock_get_manager):
        """Test initialisation du système avec échec."""
        mock_manager = Mock()
        mock_manager.initialize = AsyncMock(return_value=False)
        mock_get_manager.return_value = mock_manager

        result = await initialize_database_system()

        self.assertFalse(result)
        mock_manager.initialize.assert_called_once()

    @patch("persistence.database_manager.get_database_manager")
    async def test_shutdown_database_system(self, mock_get_manager):
        """Test arrêt du système de base de données global."""
        mock_manager = Mock()
        mock_manager.shutdown = AsyncMock()
        mock_get_manager.return_value = mock_manager

        await shutdown_database_system()

        mock_get_manager.assert_called_once()
        mock_manager.shutdown.assert_called_once()

    @patch("persistence.database_manager.get_database_manager")
    async def test_shutdown_database_system_exception(self, mock_get_manager):
        """Test arrêt du système avec exception."""
        mock_manager = Mock()
        mock_manager.shutdown = AsyncMock(side_effect=Exception("Shutdown error"))
        mock_get_manager.return_value = mock_manager

        # Ne devrait pas lever d'exception
        await shutdown_database_system()

        mock_manager.shutdown.assert_called_once()


if __name__ == "__main__":
    import unittest

    unittest.main()