"""
Tests unitaires complets pour le module models/migrations.py

Ce module teste tous les aspects du système de migrations, incluant :
- Modèle SchemaVersion et gestion des versions
- Classe Migration et application/rollback
- MigrationManager et gestion des migrations
- Fonctions globales d'initialisation et de gestion du schéma
- Gestion des erreurs et récupération
"""

import os
import sys
from datetime import datetime
from unittest import TestCase
from unittest.mock import Mock, patch

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from models.migrations import (
    Migration,
    MigrationManager,
    SchemaVersion,
    get_schema_info,
    initialize_schema,
    migration_manager,
    rollback_schema,
)


class TestSchemaVersion(TestCase):
    """Tests pour le modèle SchemaVersion."""

    def test_schema_version_creation(self):
        """Test création d'une instance SchemaVersion."""
        schema_version = SchemaVersion(
            version=1,
            name="initial_schema",
            description="Create initial tables",
        )

        self.assertEqual(schema_version.version, 1)
        self.assertEqual(schema_version.name, "initial_schema")
        self.assertEqual(schema_version.description, "Create initial tables")

    def test_schema_version_str(self):
        """Test représentation string de SchemaVersion."""
        schema_version = SchemaVersion(version=2, name="add_indexes")

        result = str(schema_version)

        self.assertEqual(result, "SchemaVersion(2, add_indexes)")

    def test_schema_version_meta_configuration(self):
        """Test configuration Meta de SchemaVersion."""
        # Vérifier que la base de données est None par défaut
        self.assertIsNone(SchemaVersion._meta.database)

        # Vérifier les index
        expected_indexes = (("version",), ("applied_at",))
        self.assertEqual(SchemaVersion._meta.indexes, expected_indexes)


class TestMigration(TestCase):
    """Tests pour la classe Migration."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        self.up_func = Mock()
        self.down_func = Mock()
        self.migration = Migration(
            version=1,
            name="test_migration",
            description="Test migration",
            up_func=self.up_func,
            down_func=self.down_func,
        )

    @patch("models.migrations.SchemaVersion.create")
    def test_migration_apply_success(self, mock_create):
        """Test application réussie d'une migration."""
        result = self.migration.apply()

        self.assertTrue(result)
        self.up_func.assert_called_once()
        mock_create.assert_called_once_with(
            version=1, name="test_migration", description="Test migration"
        )

    @patch("models.migrations.SchemaVersion.create")
    def test_migration_apply_up_func_failure(self, mock_create):
        """Test application avec échec de la fonction up."""
        self.up_func.side_effect = Exception("Up function failed")

        result = self.migration.apply()

        self.assertFalse(result)
        self.up_func.assert_called_once()
        mock_create.assert_not_called()

    @patch("models.migrations.SchemaVersion.create")
    def test_migration_apply_create_failure(self, mock_create):
        """Test application avec échec de création du record."""
        mock_create.side_effect = Exception("Create failed")

        result = self.migration.apply()

        self.assertFalse(result)
        self.up_func.assert_called_once()
        mock_create.assert_called_once()

    @patch("models.migrations.SchemaVersion.get")
    def test_migration_rollback_success(self, mock_get):
        """Test rollback réussi d'une migration."""
        mock_schema_version = Mock()
        mock_get.return_value = mock_schema_version

        result = self.migration.rollback()

        self.assertTrue(result)
        self.down_func.assert_called_once()
        mock_get.assert_called_once_with(SchemaVersion.version == 1)
        mock_schema_version.delete_instance.assert_called_once()

    def test_migration_rollback_no_down_func(self):
        """Test rollback sans fonction down."""
        migration_no_down = Migration(
            version=1,
            name="test_migration",
            description="Test migration",
            up_func=self.up_func,
            down_func=None,
        )

        result = migration_no_down.rollback()

        self.assertFalse(result)

    @patch("models.migrations.SchemaVersion.get")
    def test_migration_rollback_down_func_failure(self, mock_get):
        """Test rollback avec échec de la fonction down."""
        self.down_func.side_effect = Exception("Down function failed")

        result = self.migration.rollback()

        self.assertFalse(result)
        self.down_func.assert_called_once()
        mock_get.assert_not_called()

    @patch("models.migrations.SchemaVersion.get")
    @patch("models.migrations.DoesNotExist")
    def test_migration_rollback_record_not_found(self, mock_does_not_exist, mock_get):
        """Test rollback quand le record n'existe pas."""
        mock_get.side_effect = mock_does_not_exist

        result = self.migration.rollback()

        self.assertTrue(result)  # Devrait réussir malgré l'absence du record
        self.down_func.assert_called_once()

    @patch("models.migrations.SchemaVersion.get")
    def test_migration_rollback_delete_failure(self, mock_get):
        """Test rollback avec échec de suppression du record."""
        mock_schema_version = Mock()
        mock_schema_version.delete_instance.side_effect = Exception("Delete failed")
        mock_get.return_value = mock_schema_version

        result = self.migration.rollback()

        self.assertFalse(result)
        self.down_func.assert_called_once()


class TestMigrationManager(TestCase):
    """Tests pour la classe MigrationManager."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        self.manager = MigrationManager()

    def test_migration_manager_init(self):
        """Test initialisation du MigrationManager."""
        # Vérifier qu'au moins la migration initiale est enregistrée
        self.assertIn(1, self.manager.migrations)
        self.assertEqual(self.manager.migrations[1].name, "initial_schema")

    def test_register_migration_success(self):
        """Test enregistrement réussi d'une migration."""
        up_func = Mock()
        down_func = Mock()

        self.manager.register_migration(
            version=10,
            name="test_migration",
            description="Test migration",
            up_func=up_func,
            down_func=down_func,
        )

        self.assertIn(10, self.manager.migrations)
        migration = self.manager.migrations[10]
        self.assertEqual(migration.version, 10)
        self.assertEqual(migration.name, "test_migration")
        self.assertEqual(migration.up_func, up_func)
        self.assertEqual(migration.down_func, down_func)

    def test_register_migration_duplicate_version(self):
        """Test enregistrement d'une migration avec version dupliquée."""
        up_func = Mock()

        with self.assertRaises(ValueError) as context:
            self.manager.register_migration(
                version=1,  # Version déjà existante
                name="duplicate_migration",
                description="Duplicate migration",
                up_func=up_func,
            )

        self.assertIn("Migration version 1 already exists", str(context.exception))

    @patch("models.migrations.get_database")
    @patch("models.migrations.SchemaVersion")
    def test_get_current_version_with_migrations(self, mock_schema_version, mock_get_database):
        """Test récupération de la version courante avec migrations."""
        # Mock database
        mock_db = Mock()
        mock_db.table_exists.return_value = True
        mock_db.connect.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock SchemaVersion query
        mock_latest = Mock()
        mock_latest.version = 5
        mock_select = Mock()
        mock_select.order_by.return_value.first.return_value = mock_latest
        mock_schema_version.select.return_value = mock_select

        result = self.manager.get_current_version()

        self.assertEqual(result, 5)
        mock_db.connect.assert_called_once()
        mock_db.table_exists.assert_called_once_with("schemaversion")

    @patch("models.migrations.get_database")
    def test_get_current_version_no_table(self, mock_get_database):
        """Test récupération de la version courante sans table."""
        # Mock database
        mock_db = Mock()
        mock_db.table_exists.return_value = False
        mock_db.connect.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        result = self.manager.get_current_version()

        self.assertEqual(result, 0)

    @patch("models.migrations.get_database")
    @patch("models.migrations.SchemaVersion")
    def test_get_current_version_no_migrations(self, mock_schema_version, mock_get_database):
        """Test récupération de la version courante sans migrations appliquées."""
        # Mock database
        mock_db = Mock()
        mock_db.table_exists.return_value = True
        mock_db.connect.return_value = None
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock SchemaVersion query - pas de migrations
        mock_select = Mock()
        mock_select.order_by.return_value.first.return_value = None
        mock_schema_version.select.return_value = mock_select

        result = self.manager.get_current_version()

        self.assertEqual(result, 0)

    @patch("models.migrations.get_database")
    def test_get_current_version_exception(self, mock_get_database):
        """Test récupération de la version courante avec exception."""
        mock_get_database.side_effect = Exception("Database error")

        result = self.manager.get_current_version()

        self.assertEqual(result, 0)

    def test_get_target_version(self):
        """Test récupération de la version cible."""
        # Ajouter quelques migrations de test
        self.manager.migrations[5] = Mock()
        self.manager.migrations[3] = Mock()
        self.manager.migrations[7] = Mock()

        result = self.manager.get_target_version()

        self.assertEqual(result, 7)  # Plus haute version

    def test_get_target_version_no_migrations(self):
        """Test récupération de la version cible sans migrations."""
        # Vider les migrations
        self.manager.migrations.clear()

        result = self.manager.get_target_version()

        self.assertEqual(result, 0)

    @patch.object(MigrationManager, "get_current_version")
    @patch.object(MigrationManager, "get_target_version")
    def test_get_pending_migrations(self, mock_target_version, mock_current_version):
        """Test récupération des migrations en attente."""
        mock_current_version.return_value = 2
        mock_target_version.return_value = 5

        # Ajouter des migrations de test
        migration_3 = Mock()
        migration_3.version = 3
        migration_4 = Mock()
        migration_4.version = 4
        migration_5 = Mock()
        migration_5.version = 5

        self.manager.migrations = {3: migration_3, 4: migration_4, 5: migration_5}

        result = self.manager.get_pending_migrations()

        self.assertEqual(len(result), 3)
        self.assertEqual([m.version for m in result], [3, 4, 5])

    @patch.object(MigrationManager, "get_current_version")
    @patch.object(MigrationManager, "get_target_version")
    def test_get_pending_migrations_none(self, mock_target_version, mock_current_version):
        """Test récupération des migrations en attente - aucune."""
        mock_current_version.return_value = 5
        mock_target_version.return_value = 5

        result = self.manager.get_pending_migrations()

        self.assertEqual(len(result), 0)

    @patch.object(MigrationManager, "get_pending_migrations")
    @patch("models.migrations.get_database")
    def test_apply_migrations_no_pending(self, mock_get_database, mock_get_pending):
        """Test application des migrations - aucune en attente."""
        mock_get_pending.return_value = []

        result = self.manager.apply_migrations()

        self.assertTrue(result)

    @patch.object(MigrationManager, "get_pending_migrations")
    @patch("models.migrations.get_database")
    @patch("models.migrations.SchemaVersion")
    def test_apply_migrations_success(self, mock_schema_version, mock_get_database, mock_get_pending):
        """Test application réussie des migrations."""
        # Mock database
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.create_tables.return_value = None
        mock_db.atomic.return_value.__enter__ = Mock()
        mock_db.atomic.return_value.__exit__ = Mock(return_value=None)
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock migrations
        migration_1 = Mock()
        migration_1.apply.return_value = True
        migration_2 = Mock()
        migration_2.apply.return_value = True
        mock_get_pending.return_value = [migration_1, migration_2]

        result = self.manager.apply_migrations()

        self.assertTrue(result)
        migration_1.apply.assert_called_once()
        migration_2.apply.assert_called_once()

    @patch.object(MigrationManager, "get_pending_migrations")
    @patch("models.migrations.get_database")
    @patch("models.migrations.SchemaVersion")
    def test_apply_migrations_failure(self, mock_schema_version, mock_get_database, mock_get_pending):
        """Test application des migrations avec échec."""
        # Mock database
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.create_tables.return_value = None
        mock_db.atomic.return_value.__enter__ = Mock()
        mock_db.atomic.return_value.__exit__ = Mock(return_value=None)
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock migrations - une échoue
        migration_1 = Mock()
        migration_1.apply.return_value = True
        migration_2 = Mock()
        migration_2.apply.return_value = False  # Échec
        mock_get_pending.return_value = [migration_1, migration_2]

        result = self.manager.apply_migrations()

        self.assertFalse(result)
        migration_1.apply.assert_called_once()
        migration_2.apply.assert_called_once()

    @patch.object(MigrationManager, "get_pending_migrations")
    @patch("models.migrations.get_database")
    def test_apply_migrations_exception(self, mock_get_database, mock_get_pending):
        """Test application des migrations avec exception."""
        mock_get_database.side_effect = Exception("Database error")
        mock_get_pending.return_value = [Mock()]

        result = self.manager.apply_migrations()

        self.assertFalse(result)

    @patch.object(MigrationManager, "get_current_version")
    @patch("models.migrations.get_database")
    def test_rollback_to_version_no_rollback_needed(self, mock_get_database, mock_current_version):
        """Test rollback - aucun rollback nécessaire."""
        mock_current_version.return_value = 3

        result = self.manager.rollback_to_version(5)  # Version plus haute

        self.assertTrue(result)

    @patch.object(MigrationManager, "get_current_version")
    @patch("models.migrations.get_database")
    def test_rollback_to_version_success(self, mock_get_database, mock_current_version):
        """Test rollback réussi."""
        mock_current_version.return_value = 5

        # Mock database
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.atomic.return_value.__enter__ = Mock()
        mock_db.atomic.return_value.__exit__ = Mock(return_value=None)
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock migrations
        migration_5 = Mock()
        migration_5.rollback.return_value = True
        migration_4 = Mock()
        migration_4.rollback.return_value = True
        self.manager.migrations = {4: migration_4, 5: migration_5}

        result = self.manager.rollback_to_version(3)

        self.assertTrue(result)
        migration_5.rollback.assert_called_once()
        migration_4.rollback.assert_called_once()

    @patch.object(MigrationManager, "get_current_version")
    @patch("models.migrations.get_database")
    def test_rollback_to_version_failure(self, mock_get_database, mock_current_version):
        """Test rollback avec échec."""
        mock_current_version.return_value = 3

        # Mock database
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.atomic.return_value.__enter__ = Mock()
        mock_db.atomic.return_value.__exit__ = Mock(return_value=None)
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock migration qui échoue
        migration_3 = Mock()
        migration_3.rollback.return_value = False
        self.manager.migrations = {3: migration_3}

        result = self.manager.rollback_to_version(2)

        self.assertFalse(result)
        migration_3.rollback.assert_called_once()

    @patch.object(MigrationManager, "get_current_version")
    @patch.object(MigrationManager, "get_target_version")
    @patch.object(MigrationManager, "get_pending_migrations")
    @patch("models.migrations.get_database")
    @patch("models.migrations.SchemaVersion")
    def test_get_migration_status(
        self,
        mock_schema_version,
        mock_get_database,
        mock_get_pending,
        mock_target_version,
        mock_current_version,
    ):
        """Test récupération du statut des migrations."""
        # Mock versions
        mock_current_version.return_value = 2
        mock_target_version.return_value = 4

        # Mock pending migrations
        pending_migration = Mock()
        pending_migration.version = 3
        pending_migration.name = "pending_migration"
        pending_migration.description = "Pending migration"
        mock_get_pending.return_value = [pending_migration]

        # Mock database
        mock_db = Mock()
        mock_db.connect.return_value = None
        mock_db.table_exists.return_value = True
        mock_db.is_closed.return_value = False
        mock_db.close.return_value = None
        mock_get_database.return_value = mock_db

        # Mock applied migrations
        applied_migration = Mock()
        applied_migration.version = 1
        applied_migration.name = "applied_migration"
        applied_migration.description = "Applied migration"
        applied_migration.applied_at = datetime(2023, 12, 1, 10, 30, 0)
        mock_schema_version.select.return_value.order_by.return_value = [applied_migration]

        result = self.manager.get_migration_status()

        expected = {
            "current_version": 2,
            "target_version": 4,
            "needs_migration": True,
            "pending_count": 1,
            "applied_migrations": [
                {
                    "version": 1,
                    "name": "applied_migration",
                    "description": "Applied migration",
                    "applied_at": "2023-12-01T10:30:00",
                }
            ],
            "pending_migrations": [
                {"version": 3, "name": "pending_migration", "description": "Pending migration"}
            ],
        }

        self.assertEqual(result, expected)


class TestMigrationManagerMigrationFunctions(TestCase):
    """Tests pour les fonctions de migration du MigrationManager."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        self.manager = MigrationManager()

    @patch("models.migrations.get_database")
    @patch("models.migrations.ALL_MODELS")
    @patch("models.migrations.SchemaVersion")
    def test_migration_001_initial_schema_up(self, mock_schema_version, mock_all_models, mock_get_database):
        """Test migration 001 up - création du schéma initial."""
        mock_db = Mock()
        mock_db.create_tables.return_value = None
        mock_get_database.return_value = mock_db

        # Exécuter la migration
        self.manager._migration_001_initial_schema_up()

        # Vérifications
        mock_db.create_tables.assert_called_once_with(mock_all_models, safe=True)

    @patch("models.migrations.get_database")
    @patch("models.migrations.ALL_MODELS")
    def test_migration_001_initial_schema_down(self, mock_all_models, mock_get_database):
        """Test migration 001 down - suppression du schéma."""
        mock_db = Mock()
        mock_db.drop_tables.return_value = None
        mock_get_database.return_value = mock_db

        # Exécuter le rollback
        self.manager._migration_001_initial_schema_down()

        # Vérifications
        mock_db.drop_tables.assert_called_once()


class TestGlobalFunctions(TestCase):
    """Tests pour les fonctions globales du module migrations."""

    @patch("models.migrations.create_tables")
    def test_initialize_schema_success(self, mock_create_tables):
        """Test initialisation réussie du schéma."""
        mock_create_tables.return_value = True

        result = initialize_schema()

        self.assertTrue(result)
        mock_create_tables.assert_called_once()

    @patch("models.migrations.create_tables")
    def test_initialize_schema_failure(self, mock_create_tables):
        """Test initialisation du schéma avec échec."""
        mock_create_tables.return_value = False

        result = initialize_schema()

        self.assertFalse(result)

    @patch("models.migrations.create_tables")
    def test_initialize_schema_exception(self, mock_create_tables):
        """Test initialisation du schéma avec exception."""
        mock_create_tables.side_effect = Exception("Schema error")

        result = initialize_schema()

        self.assertFalse(result)

    @patch("models.migrations.migration_manager")
    def test_get_schema_info(self, mock_migration_manager):
        """Test récupération des informations de schéma."""
        expected_info = {
            "current_version": 2,
            "target_version": 3,
            "needs_migration": True,
        }
        mock_migration_manager.get_migration_status.return_value = expected_info

        result = get_schema_info()

        self.assertEqual(result, expected_info)
        mock_migration_manager.get_migration_status.assert_called_once()

    @patch("models.migrations.migration_manager")
    def test_rollback_schema(self, mock_migration_manager):
        """Test rollback du schéma."""
        mock_migration_manager.rollback_to_version.return_value = True

        result = rollback_schema(2)

        self.assertTrue(result)
        mock_migration_manager.rollback_to_version.assert_called_once_with(2)


class TestGlobalMigrationManager(TestCase):
    """Tests pour l'instance globale du gestionnaire de migrations."""

    def test_global_migration_manager_exists(self):
        """Test que l'instance globale existe."""
        self.assertIsInstance(migration_manager, MigrationManager)

    def test_global_migration_manager_has_initial_migration(self):
        """Test que l'instance globale a la migration initiale."""
        self.assertIn(1, migration_manager.migrations)
        self.assertEqual(migration_manager.migrations[1].name, "initial_schema")


if __name__ == "__main__":
    import unittest

    unittest.main()