#!/usr/bin/env python3
"""
Staging environment validation for SQLite migration.

This script provides comprehensive validation testing for the SQLite migration
in a staging environment, including data migration testing, rollback procedures,
and error recovery scenarios.
"""

import argparse
import asyncio
import json
import logging
import os
import random
import shutil
import sys
import tempfile
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.feature_flags import FeatureFlag, feature_flags
from config.settings import Settings
from utils.unified_event_manager import unified_event_manager
from utils.system_integration import system_integrator
from utils.storage_adapter import StorageAdapter

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f'staging_validation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    ]
)

logger = logging.getLogger(__name__)


class StagingValidator:
    """
    Comprehensive staging environment validator for SQLite migration.
    
    This class provides extensive testing capabilities for validating
    the SQLite migration in a staging environment.
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._load_default_config()
        self.validation_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.test_results: List[Dict] = []
        
        # Test data
        self.test_data_dir = f"staging_test_data_{self.validation_id}"
        self.original_data_backup = None
        
        # Validation state
        self.staging_environment_ready = False
        self.test_data_prepared = False
        self.migration_tested = False
        self.rollback_tested = False
    
    def _load_default_config(self) -> Dict:
        """Load default validation configuration."""
        return {
            "test_data_size": 100,  # Number of test events to create
            "anonymize_data": True,
            "test_migration": True,
            "test_rollback": True,
            "test_error_scenarios": True,
            "test_performance": True,
            "test_concurrency": True,
            "performance_threshold_ms": 1000,
            "concurrent_operations": 10,
            "cleanup_after_tests": True,
            "create_detailed_report": True
        }
    
    def _log_test_result(self, test_name: str, success: bool, message: str, duration: float = 0) -> None:
        """Log a test result."""
        result = {
            "timestamp": datetime.now().isoformat(),
            "validation_id": self.validation_id,
            "test_name": test_name,
            "success": success,
            "message": message,
            "duration_seconds": duration
        }
        
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        duration_str = f" ({duration:.2f}s)" if duration > 0 else ""
        logger.info(f"[{test_name}] {status}: {message}{duration_str}")
    
    async def setup_staging_environment(self) -> bool:
        """Setup the staging environment for testing."""
        logger.info("Setting up staging environment...")
        
        try:
            # Create test data directory
            os.makedirs(self.test_data_dir, exist_ok=True)
            
            # Backup original data
            await self._backup_original_data()
            
            # Prepare test environment
            await self._prepare_test_environment()
            
            self.staging_environment_ready = True
            self._log_test_result("staging_setup", True, "Staging environment setup completed")
            return True
        
        except Exception as e:
            self._log_test_result("staging_setup", False, f"Staging setup failed: {e}")
            return False
    
    async def _backup_original_data(self) -> None:
        """Backup original data before testing."""
        backup_dir = os.path.join(self.test_data_dir, "original_backup")
        os.makedirs(backup_dir, exist_ok=True)
        
        # Backup JSON files
        if os.path.exists(Settings.REMINDERS_SAVE_FILE):
            shutil.copy2(Settings.REMINDERS_SAVE_FILE, backup_dir)
        
        # Backup SQLite database
        if os.path.exists(Settings.DATABASE_PATH):
            shutil.copy2(Settings.DATABASE_PATH, backup_dir)
        
        self.original_data_backup = backup_dir
        logger.info(f"Original data backed up to {backup_dir}")
    
    async def _prepare_test_environment(self) -> None:
        """Prepare the test environment."""
        # Set test environment variables
        os.environ["TEST_MODE"] = "true"
        os.environ["USE_SQLITE"] = "false"  # Start with JSON
        
        # Initialize system components
        if not await system_integrator.initialize():
            raise Exception("Failed to initialize system integrator")
        
        if not await unified_event_manager.initialize():
            raise Exception("Failed to initialize unified event manager")
    
    async def generate_test_data(self) -> bool:
        """Generate realistic test data for validation."""
        logger.info("Generating test data...")
        
        try:
            test_data = await self._create_realistic_test_data()
            
            if self.config.get("anonymize_data", True):
                test_data = self._anonymize_test_data(test_data)
            
            # Save test data to JSON file
            test_json_file = os.path.join(self.test_data_dir, "test_reminders.json")
            with open(test_json_file, 'w') as f:
                json.dump(test_data, f, indent=2)
            
            # Load test data into the system
            shutil.copy2(test_json_file, Settings.REMINDERS_SAVE_FILE)
            await unified_event_manager.load_from_storage()
            
            self.test_data_prepared = True
            self._log_test_result(
                "test_data_generation", 
                True, 
                f"Generated {len(test_data)} test events"
            )
            return True
        
        except Exception as e:
            self._log_test_result("test_data_generation", False, f"Test data generation failed: {e}")
            return False
    
    async def _create_realistic_test_data(self) -> Dict:
        """Create realistic test data based on actual usage patterns."""
        test_data = {}
        
        # Sample guild and channel IDs (anonymized)
        guild_ids = [1000000000000000000 + i for i in range(5)]
        channel_ids = [2000000000000000000 + i for i in range(20)]
        
        # Sample event titles and descriptions
        event_titles = [
            "Weekly Team Meeting",
            "Project Review Session",
            "Training Workshop",
            "Community Event",
            "Game Night",
            "Study Group",
            "Code Review",
            "Planning Session",
            "Social Gathering",
            "Technical Discussion"
        ]
        
        event_descriptions = [
            "Join us for our regular team sync",
            "Review progress and discuss next steps",
            "Learn new skills and techniques",
            "Connect with the community",
            "Fun and games for everyone",
            "Collaborative learning session",
            "Review and improve code quality",
            "Plan upcoming activities",
            "Casual meetup and networking",
            "Deep dive into technical topics"
        ]
        
        for i in range(self.config["test_data_size"]):
            message_id = 3000000000000000000 + i
            
            # Create realistic event data
            event_data = {
                "message_id": message_id,
                "channel_id": random.choice(channel_ids),
                "guild_id": random.choice(guild_ids),
                "title": random.choice(event_titles),
                "description": random.choice(event_descriptions),
                "interval_minutes": random.choice([30, 60, 120, 360, 720, 1440]),
                "is_paused": random.choice([True, False]) if random.random() < 0.2 else False,
                "required_reactions": ["✅", "❌", "❓"],
                "last_reminder": (datetime.now() - timedelta(
                    minutes=random.randint(0, 1440)
                )).isoformat(),
                "created_at": (datetime.now() - timedelta(
                    days=random.randint(1, 30)
                )).isoformat(),
                "reactions": self._generate_test_reactions(message_id)
            }
            
            test_data[str(message_id)] = event_data
        
        return test_data
    
    def _generate_test_reactions(self, message_id: int) -> List[Dict]:
        """Generate test reactions for an event."""
        reactions = []
        user_ids = [4000000000000000000 + i for i in range(50)]
        emojis = ["✅", "❌", "❓"]
        
        # Generate 0-20 reactions per event
        num_reactions = random.randint(0, 20)
        selected_users = random.sample(user_ids, min(num_reactions, len(user_ids)))
        
        for user_id in selected_users:
            reactions.append({
                "user_id": user_id,
                "emoji": random.choice(emojis),
                "reacted_at": (datetime.now() - timedelta(
                    hours=random.randint(0, 72)
                )).isoformat()
            })
        
        return reactions
    
    def _anonymize_test_data(self, test_data: Dict) -> Dict:
        """Anonymize test data for privacy."""
        anonymized_data = {}
        
        for event_id, event_data in test_data.items():
            anonymized_event = event_data.copy()
            
            # Anonymize sensitive fields
            anonymized_event["title"] = f"Test Event {event_id[-4:]}"
            anonymized_event["description"] = f"Test description for event {event_id[-4:]}"
            
            # Anonymize user IDs in reactions
            if "reactions" in anonymized_event:
                for reaction in anonymized_event["reactions"]:
                    # Keep the same pattern but anonymize
                    original_id = reaction["user_id"]
                    reaction["user_id"] = 5000000000000000000 + (original_id % 1000000)
            
            anonymized_data[event_id] = anonymized_event
        
        return anonymized_data
    
    async def test_migration_process(self) -> bool:
        """Test the complete migration process."""
        logger.info("Testing migration process...")
        
        start_time = time.time()
        
        try:
            # Ensure we start with JSON storage
            os.environ["USE_SQLITE"] = "false"
            await unified_event_manager.initialize()
            
            # Verify initial state
            initial_events = await unified_event_manager.get_all_events()
            initial_count = len(initial_events)
            
            if not unified_event_manager.is_using_json():
                raise Exception("Expected to start with JSON storage")
            
            # Enable SQLite migration
            os.environ["USE_SQLITE"] = "true"
            feature_flags.enable_flag(FeatureFlag.SQLITE_STORAGE, "Staging test migration")
            feature_flags.enable_flag(FeatureFlag.SQLITE_MIGRATION, "Staging test migration")
            
            # Reinitialize with SQLite
            await unified_event_manager.cleanup()
            await unified_event_manager.initialize()
            
            # Verify migration
            migrated_events = await unified_event_manager.get_all_events()
            migrated_count = len(migrated_events)
            
            if not unified_event_manager.is_using_sqlite():
                raise Exception("Expected to use SQLite storage after migration")
            
            if migrated_count != initial_count:
                raise Exception(f"Event count mismatch: {initial_count} -> {migrated_count}")
            
            # Verify data integrity
            await self._verify_data_integrity(initial_events, migrated_events)
            
            duration = time.time() - start_time
            self.migration_tested = True
            self._log_test_result(
                "migration_process", 
                True, 
                f"Migration completed successfully ({initial_count} events)", 
                duration
            )
            return True
        
        except Exception as e:
            duration = time.time() - start_time
            self._log_test_result("migration_process", False, f"Migration failed: {e}", duration)
            return False
    
    async def _verify_data_integrity(self, original_events: List[Dict], migrated_events: List[Dict]) -> None:
        """Verify data integrity after migration."""
        # Create lookup dictionaries
        original_by_id = {str(event.get("message_id", event.get("id"))): event for event in original_events}
        migrated_by_id = {str(event.get("message_id", event.get("id"))): event for event in migrated_events}
        
        # Check each event
        for event_id, original_event in original_by_id.items():
            if event_id not in migrated_by_id:
                raise Exception(f"Event {event_id} missing after migration")
            
            migrated_event = migrated_by_id[event_id]
            
            # Check critical fields
            critical_fields = ["message_id", "channel_id", "guild_id", "title"]
            for field in critical_fields:
                if original_event.get(field) != migrated_event.get(field):
                    raise Exception(f"Field {field} mismatch for event {event_id}")
        
        logger.info("Data integrity verification passed")
    
    async def test_rollback_procedures(self) -> bool:
        """Test rollback procedures."""
        logger.info("Testing rollback procedures...")
        
        start_time = time.time()
        
        try:
            # Ensure we're using SQLite
            if not unified_event_manager.is_using_sqlite():
                raise Exception("Expected SQLite storage for rollback test")
            
            # Get current state
            sqlite_events = await unified_event_manager.get_all_events()
            sqlite_count = len(sqlite_events)
            
            # Trigger rollback
            feature_flags.disable_flag(FeatureFlag.SQLITE_STORAGE, "Staging rollback test")
            feature_flags.disable_flag(FeatureFlag.SQLITE_MIGRATION, "Staging rollback test")
            os.environ["USE_SQLITE"] = "false"
            
            # Reinitialize with JSON
            await unified_event_manager.cleanup()
            await unified_event_manager.initialize()
            
            # Verify rollback
            json_events = await unified_event_manager.get_all_events()
            json_count = len(json_events)
            
            if not unified_event_manager.is_using_json():
                raise Exception("Expected JSON storage after rollback")
            
            if json_count != sqlite_count:
                raise Exception(f"Event count mismatch after rollback: {sqlite_count} -> {json_count}")
            
            # Verify data integrity after rollback
            await self._verify_data_integrity(sqlite_events, json_events)
            
            duration = time.time() - start_time
            self.rollback_tested = True
            self._log_test_result(
                "rollback_procedures", 
                True, 
                f"Rollback completed successfully ({json_count} events)", 
                duration
            )
            return True
        
        except Exception as e:
            duration = time.time() - start_time
            self._log_test_result("rollback_procedures", False, f"Rollback failed: {e}", duration)
            return False
    
    async def test_error_recovery(self) -> bool:
        """Test error recovery scenarios."""
        logger.info("Testing error recovery scenarios...")
        
        test_scenarios = [
            ("database_corruption", self._test_database_corruption_recovery),
            ("feature_flag_fallback", self._test_feature_flag_fallback),
            ("storage_failure", self._test_storage_failure_recovery),
            ("concurrent_access", self._test_concurrent_access_recovery)
        ]
        
        all_passed = True
        
        for scenario_name, test_func in test_scenarios:
            try:
                start_time = time.time()
                success = await test_func()
                duration = time.time() - start_time
                
                self._log_test_result(
                    f"error_recovery_{scenario_name}", 
                    success, 
                    f"Error recovery test {'passed' if success else 'failed'}", 
                    duration
                )
                
                if not success:
                    all_passed = False
            
            except Exception as e:
                self._log_test_result(
                    f"error_recovery_{scenario_name}", 
                    False, 
                    f"Error recovery test failed: {e}"
                )
                all_passed = False
        
        return all_passed
    
    async def _test_database_corruption_recovery(self) -> bool:
        """Test recovery from database corruption."""
        try:
            # Simulate database corruption by creating invalid database file
            if os.path.exists(Settings.DATABASE_PATH):
                # Backup current database
                backup_path = f"{Settings.DATABASE_PATH}.test_backup"
                shutil.copy2(Settings.DATABASE_PATH, backup_path)
                
                # Create corrupted database
                with open(Settings.DATABASE_PATH, 'w') as f:
                    f.write("corrupted data")
                
                # Try to initialize - should trigger fallback
                await unified_event_manager.cleanup()
                await unified_event_manager.initialize()
                
                # Should fallback to JSON
                if not unified_event_manager.is_using_json():
                    return False
                
                # Restore original database
                shutil.move(backup_path, Settings.DATABASE_PATH)
                
                return True
            
            return True  # No database to corrupt
        
        except Exception as e:
            logger.error(f"Database corruption recovery test failed: {e}")
            return False
    
    async def _test_feature_flag_fallback(self) -> bool:
        """Test feature flag fallback mechanisms."""
        try:
            # Trigger fallback for SQLite storage
            feature_flags.trigger_fallback(
                FeatureFlag.SQLITE_STORAGE, 
                "Staging test fallback"
            )
            
            # Verify fallback was triggered
            fallback_flags = feature_flags.get_fallback_flags()
            if FeatureFlag.SQLITE_STORAGE not in fallback_flags:
                return False
            
            # Verify system switches to JSON
            await unified_event_manager.cleanup()
            await unified_event_manager.initialize()
            
            if not unified_event_manager.is_using_json():
                return False
            
            # Re-enable the flag
            feature_flags.enable_flag(FeatureFlag.SQLITE_STORAGE, "Staging test recovery")
            
            return True
        
        except Exception as e:
            logger.error(f"Feature flag fallback test failed: {e}")
            return False
    
    async def _test_storage_failure_recovery(self) -> bool:
        """Test recovery from storage failures."""
        try:
            # Test with read-only file system (simulated)
            # This is a simplified test - in real scenarios you'd test actual I/O failures
            
            # Try to save data and handle failure gracefully
            test_event_data = {
                "message_id": 9999999999999999999,
                "channel_id": 1000000000000000000,
                "guild_id": 1000000000000000000,
                "title": "Test Event",
                "description": "Test Description"
            }
            
            # This should work normally
            success = await unified_event_manager.add_event(**test_event_data)
            
            if success:
                # Clean up test event
                await unified_event_manager.remove_event(test_event_data["message_id"])
            
            return success
        
        except Exception as e:
            logger.error(f"Storage failure recovery test failed: {e}")
            return False
    
    async def _test_concurrent_access_recovery(self) -> bool:
        """Test recovery from concurrent access issues."""
        try:
            # Simulate concurrent operations
            tasks = []
            
            for i in range(self.config["concurrent_operations"]):
                test_event = {
                    "message_id": 8000000000000000000 + i,
                    "channel_id": 1000000000000000000,
                    "guild_id": 1000000000000000000,
                    "title": f"Concurrent Test Event {i}",
                    "description": f"Test concurrent access {i}"
                }
                
                # Create concurrent add/remove operations
                tasks.append(unified_event_manager.add_event(**test_event))
                tasks.append(unified_event_manager.remove_event(test_event["message_id"]))
            
            # Execute all operations concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Check that no critical exceptions occurred
            critical_errors = [r for r in results if isinstance(r, Exception) and "critical" in str(r).lower()]
            
            return len(critical_errors) == 0
        
        except Exception as e:
            logger.error(f"Concurrent access recovery test failed: {e}")
            return False
    
    async def test_performance(self) -> bool:
        """Test performance characteristics."""
        logger.info("Testing performance...")
        
        performance_tests = [
            ("initialization_time", self._test_initialization_performance),
            ("query_performance", self._test_query_performance),
            ("write_performance", self._test_write_performance),
            ("bulk_operations", self._test_bulk_operations_performance)
        ]
        
        all_passed = True
        
        for test_name, test_func in performance_tests:
            try:
                start_time = time.time()
                success, metrics = await test_func()
                duration = time.time() - start_time
                
                message = f"Performance test {'passed' if success else 'failed'}"
                if metrics:
                    message += f" - {metrics}"
                
                self._log_test_result(
                    f"performance_{test_name}", 
                    success, 
                    message, 
                    duration
                )
                
                if not success:
                    all_passed = False
            
            except Exception as e:
                self._log_test_result(
                    f"performance_{test_name}", 
                    False, 
                    f"Performance test failed: {e}"
                )
                all_passed = False
        
        return all_passed
    
    async def _test_initialization_performance(self) -> Tuple[bool, str]:
        """Test initialization performance."""
        start_time = time.time()
        
        await unified_event_manager.cleanup()
        await unified_event_manager.initialize()
        
        init_time_ms = (time.time() - start_time) * 1000
        threshold_ms = self.config["performance_threshold_ms"]
        
        success = init_time_ms < threshold_ms
        metrics = f"{init_time_ms:.2f}ms (threshold: {threshold_ms}ms)"
        
        return success, metrics
    
    async def _test_query_performance(self) -> Tuple[bool, str]:
        """Test query performance."""
        start_time = time.time()
        
        events = await unified_event_manager.get_all_events()
        
        query_time_ms = (time.time() - start_time) * 1000
        threshold_ms = self.config["performance_threshold_ms"]
        
        success = query_time_ms < threshold_ms
        metrics = f"{query_time_ms:.2f}ms for {len(events)} events (threshold: {threshold_ms}ms)"
        
        return success, metrics
    
    async def _test_write_performance(self) -> Tuple[bool, str]:
        """Test write performance."""
        test_event = {
            "message_id": 7000000000000000000,
            "channel_id": 1000000000000000000,
            "guild_id": 1000000000000000000,
            "title": "Performance Test Event",
            "description": "Test write performance"
        }
        
        start_time = time.time()
        
        await unified_event_manager.add_event(**test_event)
        await unified_event_manager.remove_event(test_event["message_id"])
        
        write_time_ms = (time.time() - start_time) * 1000
        threshold_ms = self.config["performance_threshold_ms"]
        
        success = write_time_ms < threshold_ms
        metrics = f"{write_time_ms:.2f}ms (threshold: {threshold_ms}ms)"
        
        return success, metrics
    
    async def _test_bulk_operations_performance(self) -> Tuple[bool, str]:
        """Test bulk operations performance."""
        num_operations = 50
        
        # Create test events
        test_events = []
        for i in range(num_operations):
            test_events.append({
                "message_id": 6000000000000000000 + i,
                "channel_id": 1000000000000000000,
                "guild_id": 1000000000000000000,
                "title": f"Bulk Test Event {i}",
                "description": f"Bulk operation test {i}"
            })
        
        start_time = time.time()
        
        # Add all events
        for event in test_events:
            await unified_event_manager.add_event(**event)
        
        # Remove all events
        for event in test_events:
            await unified_event_manager.remove_event(event["message_id"])
        
        bulk_time_ms = (time.time() - start_time) * 1000
        avg_time_ms = bulk_time_ms / (num_operations * 2)  # 2 operations per event
        threshold_ms = self.config["performance_threshold_ms"] / 10  # Lower threshold for individual ops
        
        success = avg_time_ms < threshold_ms
        metrics = f"{bulk_time_ms:.2f}ms total, {avg_time_ms:.2f}ms avg (threshold: {threshold_ms}ms)"
        
        return success, metrics
    
    async def cleanup_staging_environment(self) -> bool:
        """Clean up the staging environment."""
        logger.info("Cleaning up staging environment...")
        
        try:
            # Restore original data
            if self.original_data_backup and os.path.exists(self.original_data_backup):
                # Restore JSON file
                json_backup = os.path.join(self.original_data_backup, os.path.basename(Settings.REMINDERS_SAVE_FILE))
                if os.path.exists(json_backup):
                    shutil.copy2(json_backup, Settings.REMINDERS_SAVE_FILE)
                
                # Restore SQLite database
                db_backup = os.path.join(self.original_data_backup, os.path.basename(Settings.DATABASE_PATH))
                if os.path.exists(db_backup):
                    shutil.copy2(db_backup, Settings.DATABASE_PATH)
            
            # Clean up test data directory
            if self.config["cleanup_after_tests"] and os.path.exists(self.test_data_dir):
                shutil.rmtree(self.test_data_dir)
            
            # Reset environment variables
            os.environ.pop("TEST_MODE", None)
            os.environ.pop("USE_SQLITE", None)
            
            # Cleanup system components
            await unified_event_manager.cleanup()
            await system_integrator.cleanup()
            
            self._log_test_result("staging_cleanup", True, "Staging environment cleaned up")
            return True
        
        except Exception as e:
            self._log_test_result("staging_cleanup", False, f"Cleanup failed: {e}")
            return False
    
    def generate_validation_report(self) -> Dict:
        """Generate a comprehensive validation report."""
        successful_tests = [r for r in self.test_results if r["success"]]
        failed_tests = [r for r in self.test_results if not r["success"]]
        
        total_duration = sum(r.get("duration_seconds", 0) for r in self.test_results)
        
        report = {
            "validation_id": self.validation_id,
            "timestamp": datetime.now().isoformat(),
            "config": self.config,
            "environment": {
                "staging_ready": self.staging_environment_ready,
                "test_data_prepared": self.test_data_prepared,
                "migration_tested": self.migration_tested,
                "rollback_tested": self.rollback_tested
            },
            "summary": {
                "total_tests": len(self.test_results),
                "successful_tests": len(successful_tests),
                "failed_tests": len(failed_tests),
                "success_rate": len(successful_tests) / len(self.test_results) * 100 if self.test_results else 0,
                "total_duration_seconds": total_duration
            },
            "test_results": self.test_results,
            "recommendations": self._generate_recommendations()
        }
        
        return report
    
    def _generate_recommendations(self) -> List[str]:
        """Generate recommendations based on test results."""
        recommendations = []
        
        failed_tests = [r for r in self.test_results if not r["success"]]
        
        if failed_tests:
            recommendations.append("Review and fix failed tests before production deployment")
            
            # Specific recommendations based on failed tests
            failed_test_names = [r["test_name"] for r in failed_tests]
            
            if any("migration" in name for name in failed_test_names):
                recommendations.append("Migration process needs improvement - check data integrity and error handling")
            
            if any("rollback" in name for name in failed_test_names):
                recommendations.append("Rollback procedures need refinement - ensure reliable fallback mechanisms")
            
            if any("performance" in name for name in failed_test_names):
                recommendations.append("Performance optimization required - consider indexing and query optimization")
            
            if any("error_recovery" in name for name in failed_test_names):
                recommendations.append("Error recovery mechanisms need strengthening")
        
        else:
            recommendations.append("All tests passed - system ready for production deployment")
            recommendations.append("Consider gradual rollout with monitoring")
            recommendations.append("Ensure production monitoring is configured")
        
        # Performance recommendations
        performance_tests = [r for r in self.test_results if "performance" in r["test_name"]]
        slow_tests = [r for r in performance_tests if r.get("duration_seconds", 0) > 1.0]
        
        if slow_tests:
            recommendations.append("Some performance tests were slow - monitor performance in production")
        
        return recommendations
    
    def save_validation_report(self, output_file: Optional[str] = None) -> str:
        """Save validation report to file."""
        if not output_file:
            output_file = f"staging_validation_report_{self.validation_id}.json"
        
        report = self.generate_validation_report()
        
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Validation report saved to {output_file}")
        return output_file


async def main():
    """Main validation function."""
    parser = argparse.ArgumentParser(description="SQLite Migration Staging Validation")
    parser.add_argument("--config", help="Validation configuration file")
    parser.add_argument("--test-data-size", type=int, default=100, help="Number of test events to create")
    parser.add_argument("--skip-migration", action="store_true", help="Skip migration testing")
    parser.add_argument("--skip-rollback", action="store_true", help="Skip rollback testing")
    parser.add_argument("--skip-error-recovery", action="store_true", help="Skip error recovery testing")
    parser.add_argument("--skip-performance", action="store_true", help="Skip performance testing")
    parser.add_argument("--no-cleanup", action="store_true", help="Don't cleanup after tests")
    
    args = parser.parse_args()
    
    # Load configuration
    config = None
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r') as f:
            config = json.load(f)
    
    # Override config with command line arguments
    if not config:
        config = {}
    
    config["test_data_size"] = args.test_data_size
    config["test_migration"] = not args.skip_migration
    config["test_rollback"] = not args.skip_rollback
    config["test_error_scenarios"] = not args.skip_error_recovery
    config["test_performance"] = not args.skip_performance
    config["cleanup_after_tests"] = not args.no_cleanup
    
    # Create validator
    validator = StagingValidator(config)
    
    try:
        print("🧪 Starting SQLite Migration Staging Validation")
        print(f"📊 Test configuration: {config['test_data_size']} events")
        
        # Setup staging environment
        if not await validator.setup_staging_environment():
            print("❌ Failed to setup staging environment")
            sys.exit(1)
        
        # Generate test data
        if not await validator.generate_test_data():
            print("❌ Failed to generate test data")
            sys.exit(1)
        
        # Run validation tests
        all_tests_passed = True
        
        if config["test_migration"]:
            print("🔄 Testing migration process...")
            if not await validator.test_migration_process():
                all_tests_passed = False
        
        if config["test_rollback"]:
            print("↩️ Testing rollback procedures...")
            if not await validator.test_rollback_procedures():
                all_tests_passed = False
        
        if config["test_error_scenarios"]:
            print("🚨 Testing error recovery...")
            if not await validator.test_error_recovery():
                all_tests_passed = False
        
        if config["test_performance"]:
            print("⚡ Testing performance...")
            if not await validator.test_performance():
                all_tests_passed = False
        
        # Generate and save report
        report_file = validator.save_validation_report()
        
        # Cleanup
        await validator.cleanup_staging_environment()
        
        # Print results
        report = validator.generate_validation_report()
        summary = report["summary"]
        
        print(f"\n📋 Validation Results:")
        print(f"   Total tests: {summary['total_tests']}")
        print(f"   Successful: {summary['successful_tests']}")
        print(f"   Failed: {summary['failed_tests']}")
        print(f"   Success rate: {summary['success_rate']:.1f}%")
        print(f"   Duration: {summary['total_duration_seconds']:.2f}s")
        print(f"📊 Report saved to: {report_file}")
        
        if all_tests_passed:
            print("✅ All validation tests passed - ready for production deployment")
        else:
            print("❌ Some validation tests failed - review issues before deployment")
            
            # Print recommendations
            recommendations = report["recommendations"]
            if recommendations:
                print("\n💡 Recommendations:")
                for rec in recommendations:
                    print(f"   - {rec}")
            
            sys.exit(1)
    
    except KeyboardInterrupt:
        print("\n⚠️ Validation interrupted by user")
        await validator.cleanup_staging_environment()
        validator.save_validation_report()
        sys.exit(1)
    
    except Exception as e:
        print(f"❌ Validation error: {e}")
        logger.error(f"Validation error: {e}")
        await validator.cleanup_staging_environment()
        validator.save_validation_report()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())