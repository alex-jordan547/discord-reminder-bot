"""
Tests unitaires complets pour le module persistence/database.py

Ce module teste tous les aspects de la gestion de base de données, incluant :
- Configuration et connexion à la base de données
- Gestion des chemins et environnements
- Initialisation et vérification de la base de données
- Configuration pour différents environnements (test/production)
- Gestion des erreurs et récupération
"""

import os
import sys
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from peewee import SqliteDatabase

from persistence.database import (
    DATABASE_NAME,
    DatabaseConfig,
    close_database,
    get_database,
    get_database_info,
    get_database_path,
    initialize_database,
    is_database_available,
)


class TestDatabasePath(TestCase):
    """Tests pour get_database_path."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Sauvegarder la variable d'environnement originale
        self.original_db_path = os.getenv("DATABASE_PATH")

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Restaurer la variable d'environnement originale
        if self.original_db_path is not None:
            os.environ["DATABASE_PATH"] = self.original_db_path
        elif "DATABASE_PATH" in os.environ:
            del os.environ["DATABASE_PATH"]

    def test_get_database_path_default(self):
        """Test récupération du chemin par défaut."""
        # Supprimer la variable d'environnement si elle existe
        if "DATABASE_PATH" in os.environ:
            del os.environ["DATABASE_PATH"]

        path = get_database_path()
        self.assertEqual(path, DATABASE_NAME)

    def test_get_database_path_environment_override(self):
        """Test récupération du chemin via variable d'environnement."""
        custom_path = "/custom/path/test.db"
        os.environ["DATABASE_PATH"] = custom_path

        path = get_database_path()
        self.assertEqual(path, custom_path)

    @patch("pathlib.Path.mkdir")
    def test_get_database_path_creates_directory(self, mock_mkdir):
        """Test création du répertoire parent."""
        custom_path = "/new/directory/test.db"
        os.environ["DATABASE_PATH"] = custom_path

        get_database_path()

        # Vérifier que mkdir a été appelé avec les bons paramètres
        mock_mkdir.assert_called_once_with(parents=True, exist_ok=True)

    def test_get_database_path_with_nested_directory(self):
        """Test avec un chemin contenant des répertoires imbriqués."""
        with tempfile.TemporaryDirectory() as temp_dir:
            nested_path = os.path.join(temp_dir, "nested", "deep", "test.db")
            os.environ["DATABASE_PATH"] = nested_path

            path = get_database_path()
            self.assertEqual(path, nested_path)

            # Vérifier que le répertoire parent a été créé
            parent_dir = Path(nested_path).parent
            self.assertTrue(parent_dir.exists())


class TestGetDatabase(TestCase):
    """Tests pour get_database."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Reset global database instance
        import persistence.database

        persistence.database.db = None

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Reset global database instance
        import persistence.database

        if persistence.database.db and not persistence.database.db.is_closed():
            persistence.database.db.close()
        persistence.database.db = None

    @patch("persistence.database.get_database_path")
    def test_get_database_creates_instance(self, mock_get_path):
        """Test création d'une nouvelle instance de base de données."""
        mock_get_path.return_value = ":memory:"

        db = get_database()

        self.assertIsInstance(db, SqliteDatabase)
        mock_get_path.assert_called_once()

    @patch("persistence.database.get_database_path")
    def test_get_database_returns_same_instance(self, mock_get_path):
        """Test que la même instance est retournée lors d'appels multiples."""
        mock_get_path.return_value = ":memory:"

        db1 = get_database()
        db2 = get_database()

        self.assertIs(db1, db2)
        # get_database_path ne devrait être appelé qu'une fois
        mock_get_path.assert_called_once()

    @patch("persistence.database.get_database_path")
    def test_get_database_with_pragmas(self, mock_get_path):
        """Test que la base de données est configurée avec les bons pragmas."""
        mock_get_path.return_value = ":memory:"

        db = get_database()

        # Vérifier que les pragmas sont configurés
        expected_pragmas = {
            "journal_mode": "wal",
            "cache_size": -1 * 64000,
            "foreign_keys": 1,
            "ignore_check_constraints": 0,
            "synchronous": 0,
        }

        # Les pragmas sont stockés dans l'attribut _pragmas de la base de données
        for pragma, expected_value in expected_pragmas.items():
            self.assertEqual(db._pragmas[pragma], expected_value)


class TestInitializeDatabase(TestCase):
    """Tests pour initialize_database."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Reset global database instance
        import persistence.database

        persistence.database.db = None

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Reset global database instance
        import persistence.database

        if persistence.database.db and not persistence.database.db.is_closed():
            persistence.database.db.close()
        persistence.database.db = None

    @patch("persistence.database.get_database")
    def test_initialize_database_success(self, mock_get_database):
        """Test initialisation réussie de la base de données."""
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = initialize_database()

        self.assertTrue(result)
        mock_db.connect.assert_called_once()
        mock_db.execute_sql.assert_called_once_with("SELECT 1")
        mock_db.close.assert_called_once()

    @patch("persistence.database.get_database")
    def test_initialize_database_connection_failure(self, mock_get_database):
        """Test échec de connexion lors de l'initialisation."""
        mock_db = Mock()
        mock_db.connect.side_effect = Exception("Connection failed")
        mock_db.is_closed.return_value = True
        mock_get_database.return_value = mock_db

        result = initialize_database()

        self.assertFalse(result)
        mock_db.connect.assert_called_once()

    @patch("persistence.database.get_database")
    def test_initialize_database_query_failure(self, mock_get_database):
        """Test échec de requête lors de l'initialisation."""
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.side_effect = Exception("Query failed")
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = initialize_database()

        self.assertFalse(result)
        mock_db.execute_sql.assert_called_once_with("SELECT 1")
        mock_db.close.assert_called_once()

    @patch("persistence.database.get_database")
    def test_initialize_database_closes_connection_on_success(self, mock_get_database):
        """Test que la connexion est fermée après initialisation réussie."""
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        initialize_database()

        mock_db.close.assert_called_once()

    @patch("persistence.database.get_database")
    def test_initialize_database_handles_already_closed(self, mock_get_database):
        """Test gestion d'une connexion déjà fermée."""
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.return_value = None
        mock_db.is_closed.return_value = True  # Déjà fermée
        mock_get_database.return_value = mock_db

        result = initialize_database()

        self.assertTrue(result)
        # close() ne devrait pas être appelé si déjà fermée
        mock_db.close.assert_not_called()


class TestCloseDatabase(TestCase):
    """Tests pour close_database."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Reset global database instance
        import persistence.database

        persistence.database.db = None

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Reset global database instance
        import persistence.database

        persistence.database.db = None

    def test_close_database_no_instance(self):
        """Test fermeture quand aucune instance n'existe."""
        # Ne devrait pas lever d'exception
        close_database()

    def test_close_database_with_open_connection(self):
        """Test fermeture d'une connexion ouverte."""
        import persistence.database

        mock_db = Mock()
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        persistence.database.db = mock_db

        close_database()

        mock_db.close.assert_called_once()

    def test_close_database_with_closed_connection(self):
        """Test fermeture d'une connexion déjà fermée."""
        import persistence.database

        mock_db = Mock()
        mock_db.is_closed.return_value = True
        persistence.database.db = mock_db

        close_database()

        # close() ne devrait pas être appelé si déjà fermée
        mock_db.close.assert_not_called()


class TestGetDatabaseInfo(TestCase):
    """Tests pour get_database_info."""

    @patch("persistence.database.get_database_path")
    @patch("pathlib.Path.exists")
    def test_get_database_info_file_not_exists(self, mock_exists, mock_get_path):
        """Test info quand le fichier de base de données n'existe pas."""
        mock_get_path.return_value = "/path/to/nonexistent.db"
        mock_exists.return_value = False

        info = get_database_info()

        expected = {
            "database_path": "/path/to/nonexistent.db",
            "database_exists": False,
            "database_name": DATABASE_NAME,
        }
        self.assertEqual(info, expected)

    @patch("persistence.database.get_database_path")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.stat")
    def test_get_database_info_file_exists(self, mock_stat, mock_exists, mock_get_path):
        """Test info quand le fichier de base de données existe."""
        mock_get_path.return_value = "/path/to/existing.db"
        mock_exists.return_value = True

        # Mock file stats
        mock_stat_result = Mock()
        mock_stat_result.st_size = 2097152  # 2 MB
        mock_stat.return_value = mock_stat_result

        info = get_database_info()

        expected = {
            "database_path": "/path/to/existing.db",
            "database_exists": True,
            "database_name": DATABASE_NAME,
            "database_size_bytes": 2097152,
            "database_size_mb": 2.0,
        }
        self.assertEqual(info, expected)

    @patch("persistence.database.get_database_path")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.stat")
    def test_get_database_info_stat_error(self, mock_stat, mock_exists, mock_get_path):
        """Test info quand stat() échoue."""
        mock_get_path.return_value = "/path/to/existing.db"
        mock_exists.return_value = True
        mock_stat.side_effect = OSError("Permission denied")

        info = get_database_info()

        expected = {
            "database_path": "/path/to/existing.db",
            "database_exists": True,
            "database_name": DATABASE_NAME,
            "database_size_bytes": None,
            "database_size_mb": None,
        }
        self.assertEqual(info, expected)


class TestIsDatabaseAvailable(TestCase):
    """Tests pour is_database_available."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Reset global database instance
        import persistence.database

        persistence.database.db = None

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Reset global database instance
        import persistence.database

        if persistence.database.db and not persistence.database.db.is_closed():
            persistence.database.db.close()
        persistence.database.db = None

    @patch("persistence.database.get_database")
    def test_is_database_available_success(self, mock_get_database):
        """Test disponibilité de la base de données - succès."""
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = is_database_available()

        self.assertTrue(result)
        mock_db.connect.assert_called_once()
        mock_db.execute_sql.assert_called_once_with("SELECT 1")
        mock_db.close.assert_called_once()

    @patch("persistence.database.get_database")
    def test_is_database_available_connection_failure(self, mock_get_database):
        """Test disponibilité de la base de données - échec de connexion."""
        mock_db = Mock()
        mock_db.connect.side_effect = Exception("Connection failed")
        mock_db.is_closed.return_value = True
        mock_get_database.return_value = mock_db

        result = is_database_available()

        self.assertFalse(result)

    @patch("persistence.database.get_database")
    def test_is_database_available_query_failure(self, mock_get_database):
        """Test disponibilité de la base de données - échec de requête."""
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.execute_sql.side_effect = Exception("Query failed")
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = is_database_available()

        self.assertFalse(result)
        mock_db.close.assert_called_once()


class TestDatabaseConfig(TestCase):
    """Tests pour la classe DatabaseConfig."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Sauvegarder la variable d'environnement originale
        self.original_test_mode = os.getenv("TEST_MODE")

    def tearDown(self):
        """Nettoyage après chaque test."""
        # Restaurer la variable d'environnement originale
        if self.original_test_mode is not None:
            os.environ["TEST_MODE"] = self.original_test_mode
        elif "TEST_MODE" in os.environ:
            del os.environ["TEST_MODE"]

    def test_is_test_mode_false_default(self):
        """Test mode test par défaut (false)."""
        # Supprimer la variable d'environnement si elle existe
        if "TEST_MODE" in os.environ:
            del os.environ["TEST_MODE"]

        result = DatabaseConfig.is_test_mode()
        self.assertFalse(result)

    def test_is_test_mode_true_values(self):
        """Test mode test avec valeurs vraies."""
        true_values = ["true", "1", "yes", "on", "TRUE", "Yes", "ON"]

        for value in true_values:
            with self.subTest(value=value):
                os.environ["TEST_MODE"] = value
                result = DatabaseConfig.is_test_mode()
                self.assertTrue(result)

    def test_is_test_mode_false_values(self):
        """Test mode test avec valeurs fausses."""
        false_values = ["false", "0", "no", "off", "FALSE", "No", "OFF", "invalid"]

        for value in false_values:
            with self.subTest(value=value):
                os.environ["TEST_MODE"] = value
                result = DatabaseConfig.is_test_mode()
                self.assertFalse(result)

    def test_get_test_database(self):
        """Test récupération de la base de données de test."""
        db = DatabaseConfig.get_test_database()

        self.assertIsInstance(db, SqliteDatabase)
        # Vérifier que c'est une base de données en mémoire
        self.assertEqual(db.database, ":memory:")
        # Vérifier les pragmas de test
        self.assertEqual(db._pragmas["foreign_keys"], 1)
        self.assertEqual(db._pragmas["ignore_check_constraints"], 0)

    @patch("persistence.database.get_database")
    def test_get_production_database(self, mock_get_database):
        """Test récupération de la base de données de production."""
        mock_db = Mock()
        mock_get_database.return_value = mock_db

        result = DatabaseConfig.get_production_database()

        self.assertEqual(result, mock_db)
        mock_get_database.assert_called_once()

    @patch.object(DatabaseConfig, "is_test_mode")
    @patch.object(DatabaseConfig, "get_test_database")
    @patch.object(DatabaseConfig, "get_production_database")
    def test_get_configured_database_test_mode(
        self, mock_get_prod, mock_get_test, mock_is_test
    ):
        """Test récupération de la base configurée en mode test."""
        mock_is_test.return_value = True
        mock_test_db = Mock()
        mock_get_test.return_value = mock_test_db

        result = DatabaseConfig.get_configured_database()

        self.assertEqual(result, mock_test_db)
        mock_get_test.assert_called_once()
        mock_get_prod.assert_not_called()

    @patch.object(DatabaseConfig, "is_test_mode")
    @patch.object(DatabaseConfig, "get_test_database")
    @patch.object(DatabaseConfig, "get_production_database")
    def test_get_configured_database_production_mode(
        self, mock_get_prod, mock_get_test, mock_is_test
    ):
        """Test récupération de la base configurée en mode production."""
        mock_is_test.return_value = False
        mock_prod_db = Mock()
        mock_get_prod.return_value = mock_prod_db

        result = DatabaseConfig.get_configured_database()

        self.assertEqual(result, mock_prod_db)
        mock_get_prod.assert_called_once()
        mock_get_test.assert_not_called()


if __name__ == "__main__":
    import unittest

    unittest.main()