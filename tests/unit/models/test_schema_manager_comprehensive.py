"""
Tests unitaires complets pour le module models/schema_manager.py

Ce module teste tous les aspects de la gestion de schéma, incluant :
- Configuration complète de la base de données
- Gestion des migrations et du schéma
- Vérification de l'intégrité de la base de données
- Opérations de maintenance (reset, backup)
- Gestion des erreurs et récupération
"""

import os
import sys
from unittest import TestCase
from unittest.mock import Mock, patch

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from models.schema_manager import (
    create_backup_info,
    get_database_status,
    reset_database,
    setup_database,
    verify_database_integrity,
)


class TestSetupDatabase(TestCase):
    """Tests pour setup_database."""

    @patch("models.schema_manager.initialize_database")
    @patch("models.schema_manager.initialize_models")
    @patch("models.schema_manager.initialize_schema")
    def test_setup_database_success(self, mock_init_schema, mock_init_models, mock_init_db):
        """Test configuration réussie de la base de données."""
        mock_init_db.return_value = True
        mock_init_schema.return_value = True

        result = setup_database()

        self.assertTrue(result)
        mock_init_db.assert_called_once()
        mock_init_models.assert_called_once()
        mock_init_schema.assert_called_once()

    @patch("models.schema_manager.initialize_database")
    def test_setup_database_init_db_failure(self, mock_init_db):
        """Test échec d'initialisation de la base de données."""
        mock_init_db.return_value = False

        result = setup_database()

        self.assertFalse(result)
        mock_init_db.assert_called_once()

    @patch("models.schema_manager.initialize_database")
    @patch("models.schema_manager.initialize_models")
    @patch("models.schema_manager.initialize_schema")
    def test_setup_database_schema_failure(self, mock_init_schema, mock_init_models, mock_init_db):
        """Test échec d'initialisation du schéma."""
        mock_init_db.return_value = True
        mock_init_schema.return_value = False

        result = setup_database()

        self.assertFalse(result)
        mock_init_db.assert_called_once()
        mock_init_models.assert_called_once()
        mock_init_schema.assert_called_once()

    @patch("models.schema_manager.initialize_database")
    @patch("models.schema_manager.initialize_models")
    @patch("models.schema_manager.initialize_schema")
    def test_setup_database_schema_exception(self, mock_init_schema, mock_init_models, mock_init_db):
        """Test exception lors de l'initialisation du schéma."""
        mock_init_db.return_value = True
        mock_init_schema.side_effect = Exception("Schema error")

        result = setup_database()

        self.assertFalse(result)
        mock_init_db.assert_called_once()
        mock_init_models.assert_called_once()
        mock_init_schema.assert_called_once()

    @patch("models.schema_manager.initialize_database")
    def test_setup_database_general_exception(self, mock_init_db):
        """Test exception générale lors de la configuration."""
        mock_init_db.side_effect = Exception("General error")

        result = setup_database()

        self.assertFalse(result)
        mock_init_db.assert_called_once()


class TestGetDatabaseStatus(TestCase):
    """Tests pour get_database_status."""

    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_database_info")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    def test_get_database_status_success(
        self, mock_table_info, mock_schema_info, mock_db_info, mock_db_available
    ):
        """Test récupération réussie du statut de la base de données."""
        mock_db_available.return_value = True
        mock_db_info.return_value = {"database_path": "/path/to/db.sqlite"}
        mock_schema_info.return_value = {"version": "1.0.0"}
        mock_table_info.return_value = {"guild": {"exists": True}}

        result = get_database_status()

        expected = {
            "database_available": True,
            "database_info": {"database_path": "/path/to/db.sqlite"},
            "schema_info": {"version": "1.0.0"},
            "table_info": {"guild": {"exists": True}},
        }
        self.assertEqual(result, expected)

    @patch("models.schema_manager.is_database_available")
    def test_get_database_status_exception(self, mock_db_available):
        """Test exception lors de la récupération du statut."""
        mock_db_available.side_effect = Exception("Database error")

        result = get_database_status()

        expected = {"database_available": False, "error": "Database error"}
        self.assertEqual(result, expected)

    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_database_info")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    def test_get_database_status_partial_failure(
        self, mock_table_info, mock_schema_info, mock_db_info, mock_db_available
    ):
        """Test récupération du statut avec échec partiel."""
        mock_db_available.return_value = True
        mock_db_info.return_value = {"database_path": "/path/to/db.sqlite"}
        mock_schema_info.side_effect = Exception("Schema error")

        result = get_database_status()

        # Devrait retourner une erreur car une exception s'est produite
        self.assertFalse(result["database_available"])
        self.assertIn("error", result)


class TestVerifyDatabaseIntegrity(TestCase):
    """Tests pour verify_database_integrity."""

    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    def test_verify_database_integrity_success(self, mock_table_info, mock_schema_info, mock_db_available):
        """Test vérification réussie de l'intégrité."""
        mock_db_available.return_value = True
        mock_schema_info.return_value = {"needs_migration": False}
        mock_table_info.return_value = {
            "guild": {"exists": True},
            "user": {"exists": True},
            "event": {"exists": True},
            "reaction": {"exists": True},
            "reminderlog": {"exists": True},
            "schemaversion": {"exists": True},
        }

        result = verify_database_integrity()

        self.assertTrue(result)

    @patch("models.schema_manager.is_database_available")
    def test_verify_database_integrity_db_unavailable(self, mock_db_available):
        """Test vérification avec base de données indisponible."""
        mock_db_available.return_value = False

        result = verify_database_integrity()

        self.assertFalse(result)

    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_schema_info")
    def test_verify_database_integrity_needs_migration(self, mock_schema_info, mock_db_available):
        """Test vérification avec migration nécessaire."""
        mock_db_available.return_value = True
        mock_schema_info.return_value = {"needs_migration": True}

        result = verify_database_integrity()

        self.assertFalse(result)

    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    def test_verify_database_integrity_missing_table(self, mock_table_info, mock_schema_info, mock_db_available):
        """Test vérification avec table manquante."""
        mock_db_available.return_value = True
        mock_schema_info.return_value = {"needs_migration": False}
        mock_table_info.return_value = {
            "guild": {"exists": True},
            "user": {"exists": True},
            "event": {"exists": True},
            "reaction": {"exists": True},
            "reminderlog": {"exists": True},
            # schemaversion manquante
        }

        result = verify_database_integrity()

        self.assertFalse(result)

    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    def test_verify_database_integrity_table_not_exists(self, mock_table_info, mock_schema_info, mock_db_available):
        """Test vérification avec table qui n'existe pas."""
        mock_db_available.return_value = True
        mock_schema_info.return_value = {"needs_migration": False}
        mock_table_info.return_value = {
            "guild": {"exists": True},
            "user": {"exists": True},
            "event": {"exists": True},
            "reaction": {"exists": True},
            "reminderlog": {"exists": True},
            "schemaversion": {"exists": False},  # Table existe dans la liste mais pas en DB
        }

        result = verify_database_integrity()

        self.assertFalse(result)

    @patch("models.schema_manager.is_database_available")
    def test_verify_database_integrity_exception(self, mock_db_available):
        """Test vérification avec exception."""
        mock_db_available.side_effect = Exception("Integrity check error")

        result = verify_database_integrity()

        self.assertFalse(result)


class TestResetDatabase(TestCase):
    """Tests pour reset_database."""

    @patch("models.schema_manager.drop_tables")
    @patch("models.schema_manager.setup_database")
    def test_reset_database_success(self, mock_setup_db, mock_drop_tables):
        """Test reset réussi de la base de données."""
        mock_drop_tables.return_value = True
        mock_setup_db.return_value = True

        result = reset_database()

        self.assertTrue(result)
        mock_drop_tables.assert_called_once()
        mock_setup_db.assert_called_once()

    @patch("models.schema_manager.drop_tables")
    def test_reset_database_drop_failure(self, mock_drop_tables):
        """Test reset avec échec de suppression des tables."""
        mock_drop_tables.return_value = False

        result = reset_database()

        self.assertFalse(result)
        mock_drop_tables.assert_called_once()

    @patch("models.schema_manager.drop_tables")
    @patch("models.schema_manager.setup_database")
    def test_reset_database_setup_failure(self, mock_setup_db, mock_drop_tables):
        """Test reset avec échec de recréation."""
        mock_drop_tables.return_value = True
        mock_setup_db.return_value = False

        result = reset_database()

        self.assertFalse(result)
        mock_drop_tables.assert_called_once()
        mock_setup_db.assert_called_once()

    @patch("models.schema_manager.drop_tables")
    def test_reset_database_exception(self, mock_drop_tables):
        """Test reset avec exception."""
        mock_drop_tables.side_effect = Exception("Reset error")

        result = reset_database()

        self.assertFalse(result)
        mock_drop_tables.assert_called_once()


class TestCreateBackupInfo(TestCase):
    """Tests pour create_backup_info."""

    @patch("models.schema_manager.get_database_info")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    @patch("models.schema_manager.datetime")
    def test_create_backup_info_success(self, mock_datetime, mock_table_info, mock_schema_info, mock_db_info):
        """Test création réussie des informations de sauvegarde."""
        # Mock datetime
        mock_now = Mock()
        mock_now.isoformat.return_value = "2023-12-01T10:30:00"
        mock_datetime.now.return_value = mock_now

        # Mock des fonctions
        mock_db_info.return_value = {"database_path": "/path/to/db.sqlite"}
        mock_schema_info.return_value = {"version": "1.0.0"}
        mock_table_info.return_value = {"guild": {"exists": True}}

        result = create_backup_info()

        expected = {
            "backup_timestamp": "2023-12-01T10:30:00",
            "database_info": {"database_path": "/path/to/db.sqlite"},
            "schema_info": {"version": "1.0.0"},
            "table_info": {"guild": {"exists": True}},
        }
        self.assertEqual(result, expected)

    @patch("models.schema_manager.get_database_info")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    @patch("models.schema_manager.datetime")
    def test_create_backup_info_with_complex_data(self, mock_datetime, mock_table_info, mock_schema_info, mock_db_info):
        """Test création des informations de sauvegarde avec données complexes."""
        # Mock datetime
        mock_now = Mock()
        mock_now.isoformat.return_value = "2023-12-01T15:45:30"
        mock_datetime.now.return_value = mock_now

        # Mock des fonctions avec données plus complexes
        mock_db_info.return_value = {
            "database_path": "/complex/path/to/db.sqlite",
            "database_exists": True,
            "database_size_mb": 5.2,
        }
        mock_schema_info.return_value = {
            "version": "2.1.0",
            "needs_migration": False,
            "last_migration": "2023-11-15",
        }
        mock_table_info.return_value = {
            "guild": {"exists": True, "row_count": 10},
            "user": {"exists": True, "row_count": 150},
            "event": {"exists": True, "row_count": 25},
        }

        result = create_backup_info()

        expected = {
            "backup_timestamp": "2023-12-01T15:45:30",
            "database_info": {
                "database_path": "/complex/path/to/db.sqlite",
                "database_exists": True,
                "database_size_mb": 5.2,
            },
            "schema_info": {
                "version": "2.1.0",
                "needs_migration": False,
                "last_migration": "2023-11-15",
            },
            "table_info": {
                "guild": {"exists": True, "row_count": 10},
                "user": {"exists": True, "row_count": 150},
                "event": {"exists": True, "row_count": 25},
            },
        }
        self.assertEqual(result, expected)

    @patch("models.schema_manager.get_database_info")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    @patch("models.schema_manager.datetime")
    def test_create_backup_info_empty_data(self, mock_datetime, mock_table_info, mock_schema_info, mock_db_info):
        """Test création des informations de sauvegarde avec données vides."""
        # Mock datetime
        mock_now = Mock()
        mock_now.isoformat.return_value = "2023-12-01T00:00:00"
        mock_datetime.now.return_value = mock_now

        # Mock des fonctions avec données vides
        mock_db_info.return_value = {}
        mock_schema_info.return_value = {}
        mock_table_info.return_value = {}

        result = create_backup_info()

        expected = {
            "backup_timestamp": "2023-12-01T00:00:00",
            "database_info": {},
            "schema_info": {},
            "table_info": {},
        }
        self.assertEqual(result, expected)


class TestSchemaManagerIntegration(TestCase):
    """Tests d'intégration pour schema_manager."""

    @patch("models.schema_manager.initialize_database")
    @patch("models.schema_manager.initialize_models")
    @patch("models.schema_manager.initialize_schema")
    @patch("models.schema_manager.is_database_available")
    @patch("models.schema_manager.get_schema_info")
    @patch("models.schema_manager.get_table_info")
    def test_full_setup_and_verify_workflow(
        self,
        mock_table_info,
        mock_schema_info,
        mock_db_available,
        mock_init_schema,
        mock_init_models,
        mock_init_db,
    ):
        """Test workflow complet de configuration et vérification."""
        # Configuration pour setup_database
        mock_init_db.return_value = True
        mock_init_schema.return_value = True

        # Configuration pour verify_database_integrity
        mock_db_available.return_value = True
        mock_schema_info.return_value = {"needs_migration": False}
        mock_table_info.return_value = {
            "guild": {"exists": True},
            "user": {"exists": True},
            "event": {"exists": True},
            "reaction": {"exists": True},
            "reminderlog": {"exists": True},
            "schemaversion": {"exists": True},
        }

        # Exécuter le workflow
        setup_result = setup_database()
        verify_result = verify_database_integrity()

        # Vérifications
        self.assertTrue(setup_result)
        self.assertTrue(verify_result)

        # Vérifier que toutes les étapes ont été appelées
        mock_init_db.assert_called_once()
        mock_init_models.assert_called_once()
        mock_init_schema.assert_called_once()
        mock_db_available.assert_called_once()
        mock_schema_info.assert_called_once()
        mock_table_info.assert_called_once()

    @patch("models.schema_manager.drop_tables")
    @patch("models.schema_manager.initialize_database")
    @patch("models.schema_manager.initialize_models")
    @patch("models.schema_manager.initialize_schema")
    def test_reset_and_setup_workflow(self, mock_init_schema, mock_init_models, mock_init_db, mock_drop_tables):
        """Test workflow de reset et reconfiguration."""
        # Configuration pour reset_database
        mock_drop_tables.return_value = True
        mock_init_db.return_value = True
        mock_init_schema.return_value = True

        # Exécuter le workflow
        reset_result = reset_database()

        # Vérifications
        self.assertTrue(reset_result)

        # Vérifier que toutes les étapes ont été appelées
        mock_drop_tables.assert_called_once()
        # setup_database est appelé dans reset_database
        mock_init_db.assert_called_once()
        mock_init_models.assert_called_once()
        mock_init_schema.assert_called_once()


if __name__ == "__main__":
    import unittest

    unittest.main()