"""
Tests for migration utilities.

This module tests the migration diagnostic tools, admin commands, and metrics tracking.
"""

import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

from utils.migration_utilities import (
    MigrationDiagnostics,
    MigrationMetrics,
    MigrationAdminCommands,
    run_diagnostics,
    get_migration_status
)


class TestMigrationDiagnostics(unittest.TestCase):
    """Test migration diagnostics functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.diagnostics = MigrationDiagnostics()
        self.diagnostics.diagnostics_dir = Path(self.temp_dir) / "diagnostics"
        self.diagnostics.diagnostics_dir.mkdir(parents=True, exist_ok=True)
    
    def tearDown(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_analyze_json_file_not_found(self):
        """Test JSON file analysis when file doesn't exist."""
        analysis = self.diagnostics._analyze_json_file("nonexistent.json")
        
        self.assertFalse(analysis['exists'])
        self.assertFalse(analysis['readable'])
        self.assertFalse(analysis['valid_json'])
        self.assertEqual(analysis['event_count'], 0)
        self.assertIn("JSON file not found", analysis['data_quality_issues'][0])
    
    def test_analyze_json_file_valid(self):
        """Test JSON file analysis with valid data."""
        # Create test JSON file
        test_data = {
            "123456789": {
                "message_id": 123456789,
                "channel_id": 987654321,
                "guild_id": 111222333,
                "title": "Test Event",
                "interval_minutes": 60.0,
                "is_paused": False,
                "users_who_reacted": [444555666, 777888999],
                "required_reactions": ["✅", "❌"]
            }
        }
        
        test_file = Path(self.temp_dir) / "test.json"
        with open(test_file, 'w', encoding='utf-8') as f:
            json.dump(test_data, f)
        
        analysis = self.diagnostics._analyze_json_file(str(test_file))
        
        self.assertTrue(analysis['exists'])
        self.assertTrue(analysis['readable'])
        self.assertTrue(analysis['valid_json'])
        self.assertEqual(analysis['event_count'], 1)
        self.assertEqual(analysis['guild_count'], 1)
        self.assertEqual(analysis['total_reactions'], 2)
        self.assertEqual(len(analysis['data_quality_issues']), 0)
    
    def test_analyze_json_file_invalid_json(self):
        """Test JSON file analysis with invalid JSON."""
        test_file = Path(self.temp_dir) / "invalid.json"
        with open(test_file, 'w', encoding='utf-8') as f:
            f.write("{ invalid json content")
        
        analysis = self.diagnostics._analyze_json_file(str(test_file))
        
        self.assertTrue(analysis['exists'])
        self.assertFalse(analysis['valid_json'])
        self.assertIn("Invalid JSON format", analysis['data_quality_issues'][0])
    
    def test_check_migration_readiness(self):
        """Test migration readiness check."""
        # Create a valid test JSON file
        test_data = {"123": {"message_id": 123, "channel_id": 456, "guild_id": 789, "title": "Test"}}
        test_file = Path(self.temp_dir) / "test.json"
        with open(test_file, 'w', encoding='utf-8') as f:
            json.dump(test_data, f)
        
        readiness = self.diagnostics._check_migration_readiness(str(test_file))
        
        self.assertIn('ready', readiness)
        self.assertIn('blocking_issues', readiness)
        self.assertIn('requirements_met', readiness)
        
        # Should have JSON file requirements met
        self.assertTrue(readiness['requirements_met']['json_file_exists'])
        self.assertTrue(readiness['requirements_met']['json_file_readable'])
    
    @patch('utils.migration_utilities.get_database')
    @patch('utils.migration_utilities.initialize_models')
    def test_analyze_database(self, mock_init, mock_get_db):
        """Test database analysis."""
        # Mock database connection
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        mock_db.is_closed.return_value = False
        
        analysis = self.diagnostics._analyze_database()
        
        self.assertIn('database_exists', analysis)
        self.assertIn('connection_ok', analysis)
        self.assertIn('table_counts', analysis)


class TestMigrationMetrics(unittest.TestCase):
    """Test migration metrics tracking."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.metrics = MigrationMetrics()
        self.metrics.metrics_dir = Path(self.temp_dir) / "metrics"
        self.metrics.metrics_dir.mkdir(parents=True, exist_ok=True)
    
    def tearDown(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_start_migration_tracking(self):
        """Test starting migration tracking."""
        session_id = self.metrics.start_migration_tracking()
        
        self.assertIsNotNone(session_id)
        self.assertTrue(session_id.startswith('migration_'))
        self.assertIn('session_id', self.metrics.current_metrics)
        self.assertIn('start_time', self.metrics.current_metrics)
    
    def test_track_phase(self):
        """Test tracking a migration phase."""
        session_id = self.metrics.start_migration_tracking()
        
        start_time = datetime.now()
        end_time = datetime.now()
        
        self.metrics.track_phase('test_phase', start_time, end_time, True, {'test': 'data'})
        
        self.assertIn('test_phase', self.metrics.current_metrics['phases'])
        phase_data = self.metrics.current_metrics['phases']['test_phase']
        self.assertTrue(phase_data['success'])
        self.assertEqual(phase_data['details']['test'], 'data')
    
    def test_add_performance_data(self):
        """Test adding performance data."""
        session_id = self.metrics.start_migration_tracking()
        
        self.metrics.add_performance_data('test_operation', 1.5, 100)
        
        self.assertEqual(len(self.metrics.current_metrics['performance_data']), 1)
        data_point = self.metrics.current_metrics['performance_data'][0]
        self.assertEqual(data_point['operation'], 'test_operation')
        self.assertEqual(data_point['duration_seconds'], 1.5)
        self.assertEqual(data_point['items_processed'], 100)
    
    def test_finish_migration_tracking(self):
        """Test finishing migration tracking."""
        session_id = self.metrics.start_migration_tracking()
        
        # Add some test data
        self.metrics.add_error("Test error")
        self.metrics.add_warning("Test warning")
        
        metrics_file = self.metrics.finish_migration_tracking(True)
        
        self.assertTrue(os.path.exists(metrics_file))
        self.assertEqual(len(self.metrics.current_metrics), 0)  # Should be cleared
        
        # Verify saved data
        with open(metrics_file, 'r', encoding='utf-8') as f:
            saved_data = json.load(f)
        
        self.assertEqual(saved_data['session_id'], session_id)
        self.assertTrue(saved_data['overall_success'])
        self.assertEqual(len(saved_data['errors']), 1)
        self.assertEqual(len(saved_data['warnings']), 1)


class TestMigrationAdminCommands(unittest.TestCase):
    """Test migration admin commands."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.admin = MigrationAdminCommands()
    
    def tearDown(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @patch('utils.migration_utilities.DataMigrationService')
    def test_status(self, mock_service):
        """Test getting migration status."""
        # Mock the service
        mock_instance = MagicMock()
        mock_service.return_value = mock_instance
        mock_instance.get_migration_status.return_value = {'test': 'status'}
        
        status = self.admin.status()
        
        self.assertIn('migration_status', status)
        self.assertIn('backup_files', status)
        self.assertIn('rollback_candidates', status)
        self.assertIn('system_ready', status)
    
    def test_backup_with_name(self):
        """Test creating a named backup."""
        # Create test JSON file
        test_data = {"123": {"message_id": 123, "title": "Test"}}
        test_file = Path(self.temp_dir) / "test.json"
        with open(test_file, 'w', encoding='utf-8') as f:
            json.dump(test_data, f)
        
        # Override backup manager to use temp directory
        self.admin.backup_manager.backup_dir = Path(self.temp_dir) / "backups"
        self.admin.backup_manager.backup_dir.mkdir(parents=True, exist_ok=True)
        
        result = self.admin.backup(str(test_file), "test_backup")
        
        self.assertTrue(result['success'])
        self.assertIsNotNone(result['backup_path'])
        self.assertTrue(os.path.exists(result['backup_path']))


class TestConvenienceFunctions(unittest.TestCase):
    """Test convenience functions."""
    
    @patch('utils.migration_utilities.MigrationDiagnostics')
    def test_run_diagnostics(self, mock_diagnostics):
        """Test run_diagnostics convenience function."""
        mock_instance = MagicMock()
        mock_diagnostics.return_value = mock_instance
        mock_instance.run_full_diagnostics.return_value = {'test': 'diagnostics'}
        
        result = run_diagnostics("test.json")
        
        mock_instance.run_full_diagnostics.assert_called_once_with("test.json")
        self.assertEqual(result, {'test': 'diagnostics'})
    
    @patch('utils.migration_utilities.MigrationAdminCommands')
    def test_get_migration_status(self, mock_admin):
        """Test get_migration_status convenience function."""
        mock_instance = MagicMock()
        mock_admin.return_value = mock_instance
        mock_instance.status.return_value = {'test': 'status'}
        
        result = get_migration_status()
        
        mock_instance.status.assert_called_once()
        self.assertEqual(result, {'test': 'status'})


if __name__ == '__main__':
    unittest.main()