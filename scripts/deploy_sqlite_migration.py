#!/usr/bin/env python3
"""
Deployment script for SQLite migration.

This script handles the deployment of the SQLite migration with
automatic migration, monitoring, and rollback capabilities.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.feature_flags import FeatureFlag, feature_flags
from config.settings import Settings
from utils.storage_adapter import StorageAdapter
from utils.system_integration import system_integrator
from utils.unified_event_manager import unified_event_manager

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f'deployment_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
    ],
)

logger = logging.getLogger(__name__)


class DeploymentManager:
    """
    Manages the SQLite migration deployment process.

    This class handles the complete deployment workflow including
    pre-deployment checks, migration execution, monitoring, and rollback.
    """

    def __init__(self, config_file: Optional[str] = None):
        self.config = self._load_config(config_file)
        self.deployment_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.deployment_log: List[Dict] = []

        # Deployment state
        self.pre_deployment_backup_path: Optional[str] = None
        self.migration_started = False
        self.migration_completed = False
        self.rollback_available = True

    def _load_config(self, config_file: Optional[str]) -> Dict:
        """Load deployment configuration."""
        default_config = {
            "pre_deployment_checks": True,
            "create_backup": True,
            "enable_monitoring": True,
            "migration_timeout_minutes": 30,
            "health_check_interval_seconds": 10,
            "max_health_check_failures": 3,
            "enable_progressive_rollout": False,
            "rollout_percentage": 100,
            "dry_run": False,
        }

        if config_file and os.path.exists(config_file):
            try:
                with open(config_file, "r") as f:
                    user_config = json.load(f)
                default_config.update(user_config)
                logger.info(f"Loaded deployment config from {config_file}")
            except Exception as e:
                logger.warning(f"Failed to load config file {config_file}: {e}")

        return default_config

    def _log_deployment_event(self, event_type: str, message: str, success: bool = True) -> None:
        """Log a deployment event."""
        event = {
            "timestamp": datetime.now().isoformat(),
            "deployment_id": self.deployment_id,
            "event_type": event_type,
            "message": message,
            "success": success,
        }

        self.deployment_log.append(event)

        if success:
            logger.info(f"[{event_type}] {message}")
        else:
            logger.error(f"[{event_type}] {message}")

    async def run_pre_deployment_checks(self) -> bool:
        """Run pre-deployment checks."""
        self._log_deployment_event("PRE_CHECK", "Starting pre-deployment checks")

        checks = [
            ("Environment validation", self._check_environment),
            ("Database connectivity", self._check_database_connectivity),
            ("Backup system", self._check_backup_system),
            ("Feature flags", self._check_feature_flags),
            ("Disk space", self._check_disk_space),
            ("Permissions", self._check_permissions),
        ]

        for check_name, check_func in checks:
            try:
                result = await check_func()
                if result:
                    self._log_deployment_event("PRE_CHECK", f"✅ {check_name} passed")
                else:
                    self._log_deployment_event("PRE_CHECK", f"❌ {check_name} failed", False)
                    return False
            except Exception as e:
                self._log_deployment_event("PRE_CHECK", f"❌ {check_name} error: {e}", False)
                return False

        self._log_deployment_event("PRE_CHECK", "All pre-deployment checks passed")
        return True

    async def _check_environment(self) -> bool:
        """Check environment configuration."""
        required_vars = ["DISCORD_TOKEN"]
        for var in required_vars:
            if not os.getenv(var):
                logger.error(f"Missing required environment variable: {var}")
                return False
        return True

    async def _check_database_connectivity(self) -> bool:
        """Check database connectivity."""
        try:
            # Test SQLite database creation/access
            import sqlite3

            test_db = "test_connectivity.db"

            conn = sqlite3.connect(test_db)
            conn.execute("CREATE TABLE IF NOT EXISTS test (id INTEGER)")
            conn.execute("INSERT INTO test (id) VALUES (1)")
            conn.execute("SELECT * FROM test")
            conn.close()

            # Cleanup test database
            if os.path.exists(test_db):
                os.remove(test_db)

            return True
        except Exception as e:
            logger.error(f"Database connectivity check failed: {e}")
            return False

    async def _check_backup_system(self) -> bool:
        """Check backup system functionality."""
        try:
            # Test backup directory creation
            backup_dir = "data/backups"
            os.makedirs(backup_dir, exist_ok=True)

            # Test file creation and backup
            test_file = os.path.join(backup_dir, "test_backup.txt")
            with open(test_file, "w") as f:
                f.write("test")

            # Test backup creation
            import shutil

            backup_file = f"{test_file}.backup"
            shutil.copy2(test_file, backup_file)

            # Cleanup
            for file in [test_file, backup_file]:
                if os.path.exists(file):
                    os.remove(file)

            return True
        except Exception as e:
            logger.error(f"Backup system check failed: {e}")
            return False

    async def _check_feature_flags(self) -> bool:
        """Check feature flags system."""
        try:
            # Test feature flags functionality
            test_flag = FeatureFlag.SQLITE_STORAGE
            current_state = feature_flags.is_enabled(test_flag)

            # Test flag manipulation (without changing actual state)
            return True
        except Exception as e:
            logger.error(f"Feature flags check failed: {e}")
            return False

    async def _check_disk_space(self) -> bool:
        """Check available disk space."""
        try:
            import shutil

            # Check available space (require at least 100MB)
            total, used, free = shutil.disk_usage(".")
            free_mb = free // (1024 * 1024)

            if free_mb < 100:
                logger.error(f"Insufficient disk space: {free_mb}MB available, 100MB required")
                return False

            logger.info(f"Disk space check passed: {free_mb}MB available")
            return True
        except Exception as e:
            logger.error(f"Disk space check failed: {e}")
            return False

    async def _check_permissions(self) -> bool:
        """Check file system permissions."""
        try:
            # Test write permissions in current directory
            test_file = "test_permissions.tmp"
            with open(test_file, "w") as f:
                f.write("test")

            # Test read permissions
            with open(test_file, "r") as f:
                content = f.read()

            # Cleanup
            os.remove(test_file)

            return content == "test"
        except Exception as e:
            logger.error(f"Permissions check failed: {e}")
            return False

    async def create_pre_deployment_backup(self) -> bool:
        """Create a backup before deployment."""
        self._log_deployment_event("BACKUP", "Creating pre-deployment backup")

        try:
            backup_dir = "data/backups"
            os.makedirs(backup_dir, exist_ok=True)

            # Backup JSON files
            json_files = [Settings.REMINDERS_SAVE_FILE]
            for json_file in json_files:
                if os.path.exists(json_file):
                    backup_path = os.path.join(
                        backup_dir,
                        f"{os.path.basename(json_file)}.pre_deployment_{self.deployment_id}",
                    )

                    import shutil

                    shutil.copy2(json_file, backup_path)
                    self._log_deployment_event("BACKUP", f"Backed up {json_file} to {backup_path}")

            # Backup SQLite database if it exists
            if os.path.exists(Settings.DATABASE_PATH):
                backup_path = os.path.join(
                    backup_dir,
                    f"{os.path.basename(Settings.DATABASE_PATH)}.pre_deployment_{self.deployment_id}",
                )

                import shutil

                shutil.copy2(Settings.DATABASE_PATH, backup_path)
                self.pre_deployment_backup_path = backup_path
                self._log_deployment_event("BACKUP", f"Backed up database to {backup_path}")

            self._log_deployment_event("BACKUP", "Pre-deployment backup completed")
            return True

        except Exception as e:
            self._log_deployment_event("BACKUP", f"Backup failed: {e}", False)
            return False

    async def execute_migration(self) -> bool:
        """Execute the SQLite migration."""
        self._log_deployment_event("MIGRATION", "Starting SQLite migration")

        if self.config["dry_run"]:
            self._log_deployment_event("MIGRATION", "DRY RUN: Migration simulation completed")
            return True

        try:
            self.migration_started = True

            # Initialize system components
            if not await system_integrator.initialize():
                raise Exception("Failed to initialize system integrator")

            # Initialize unified event manager
            if not await unified_event_manager.initialize():
                raise Exception("Failed to initialize unified event manager")

            # Enable SQLite features progressively
            await self._enable_sqlite_features()

            # Validate migration
            if not await self._validate_migration():
                raise Exception("Migration validation failed")

            self.migration_completed = True
            self._log_deployment_event("MIGRATION", "SQLite migration completed successfully")
            return True

        except Exception as e:
            self._log_deployment_event("MIGRATION", f"Migration failed: {e}", False)
            return False

    async def _enable_sqlite_features(self) -> None:
        """Enable SQLite features progressively."""
        features_to_enable = [
            (FeatureFlag.SQLITE_STORAGE, "SQLite storage"),
            (FeatureFlag.SQLITE_MIGRATION, "SQLite migration"),
            (FeatureFlag.SQLITE_SCHEDULER, "SQLite scheduler"),
        ]

        for flag, description in features_to_enable:
            feature_flags.enable_flag(flag, f"Deployment activation: {description}")
            self._log_deployment_event("FEATURE_FLAG", f"Enabled {description}")

            # Wait a bit between feature activations
            await asyncio.sleep(1)

    async def _validate_migration(self) -> bool:
        """Validate the migration was successful."""
        try:
            # Check that unified event manager is working
            status = unified_event_manager.get_status()

            if not status["initialized"]:
                logger.error("Unified event manager not initialized")
                return False

            # Check backend type
            backend_type = status["backend_type"]
            self._log_deployment_event("VALIDATION", f"Using {backend_type} backend")

            # Validate data integrity
            if not await unified_event_manager.validate_data_integrity():
                logger.error("Data integrity validation failed")
                return False

            self._log_deployment_event("VALIDATION", "Migration validation passed")
            return True

        except Exception as e:
            logger.error(f"Migration validation error: {e}")
            return False

    async def start_monitoring(self) -> None:
        """Start deployment monitoring."""
        if not self.config["enable_monitoring"]:
            return

        self._log_deployment_event("MONITORING", "Starting deployment monitoring")

        # Start health monitoring task
        asyncio.create_task(self._health_monitoring_loop())

    async def _health_monitoring_loop(self) -> None:
        """Health monitoring loop."""
        failure_count = 0
        max_failures = self.config["max_health_check_failures"]
        check_interval = self.config["health_check_interval_seconds"]

        while self.migration_started and not self.migration_completed:
            try:
                # Check system health
                is_healthy = await self._check_system_health()

                if is_healthy:
                    failure_count = 0
                else:
                    failure_count += 1
                    self._log_deployment_event(
                        "HEALTH_CHECK",
                        f"Health check failed ({failure_count}/{max_failures})",
                        False,
                    )

                    if failure_count >= max_failures:
                        self._log_deployment_event(
                            "HEALTH_CHECK",
                            "Maximum health check failures reached, triggering rollback",
                            False,
                        )
                        await self.rollback_deployment()
                        break

                await asyncio.sleep(check_interval)

            except Exception as e:
                logger.error(f"Health monitoring error: {e}")
                await asyncio.sleep(check_interval)

    async def _check_system_health(self) -> bool:
        """Check overall system health."""
        try:
            # Check unified event manager status
            status = unified_event_manager.get_status()
            if not status["initialized"]:
                return False

            # Check feature flags status
            flag_status = feature_flags.get_status_summary()
            if flag_status["total_fallback"] > 0:
                logger.warning(f"Feature flags in fallback: {flag_status['total_fallback']}")

            # Check data integrity
            if not await unified_event_manager.validate_data_integrity():
                return False

            return True

        except Exception as e:
            logger.error(f"System health check error: {e}")
            return False

    async def rollback_deployment(self) -> bool:
        """Rollback the deployment."""
        if not self.rollback_available:
            self._log_deployment_event("ROLLBACK", "Rollback not available", False)
            return False

        self._log_deployment_event("ROLLBACK", "Starting deployment rollback")

        try:
            # Disable SQLite features
            sqlite_flags = [
                FeatureFlag.SQLITE_STORAGE,
                FeatureFlag.SQLITE_MIGRATION,
                FeatureFlag.SQLITE_SCHEDULER,
            ]

            for flag in sqlite_flags:
                feature_flags.disable_flag(flag, "Deployment rollback")
                self._log_deployment_event("ROLLBACK", f"Disabled {flag.value}")

            # Restore backup if available
            if self.pre_deployment_backup_path and os.path.exists(self.pre_deployment_backup_path):
                import shutil

                shutil.copy2(self.pre_deployment_backup_path, Settings.DATABASE_PATH)
                self._log_deployment_event("ROLLBACK", "Database backup restored")

            # Enable degraded mode
            feature_flags.enable_flag(FeatureFlag.DEGRADED_MODE, "Rollback to degraded mode")

            self._log_deployment_event("ROLLBACK", "Deployment rollback completed")
            return True

        except Exception as e:
            self._log_deployment_event("ROLLBACK", f"Rollback failed: {e}", False)
            return False

    def generate_deployment_report(self) -> Dict:
        """Generate a deployment report."""
        return {
            "deployment_id": self.deployment_id,
            "timestamp": datetime.now().isoformat(),
            "config": self.config,
            "migration_started": self.migration_started,
            "migration_completed": self.migration_completed,
            "rollback_available": self.rollback_available,
            "events": self.deployment_log,
            "summary": {
                "total_events": len(self.deployment_log),
                "successful_events": len([e for e in self.deployment_log if e["success"]]),
                "failed_events": len([e for e in self.deployment_log if not e["success"]]),
            },
        }

    def save_deployment_report(self, output_file: Optional[str] = None) -> str:
        """Save deployment report to file."""
        if not output_file:
            output_file = f"deployment_report_{self.deployment_id}.json"

        report = self.generate_deployment_report()

        with open(output_file, "w") as f:
            json.dump(report, f, indent=2)

        logger.info(f"Deployment report saved to {output_file}")
        return output_file


async def main():
    """Main deployment function."""
    parser = argparse.ArgumentParser(description="SQLite Migration Deployment Script")
    parser.add_argument("--config", help="Deployment configuration file")
    parser.add_argument("--dry-run", action="store_true", help="Perform a dry run")
    parser.add_argument("--skip-checks", action="store_true", help="Skip pre-deployment checks")
    parser.add_argument("--no-backup", action="store_true", help="Skip backup creation")
    parser.add_argument("--no-monitoring", action="store_true", help="Disable monitoring")
    parser.add_argument("--rollback", action="store_true", help="Perform rollback")

    args = parser.parse_args()

    # Create deployment manager
    deployment_manager = DeploymentManager(args.config)

    if args.dry_run:
        deployment_manager.config["dry_run"] = True

    if args.no_backup:
        deployment_manager.config["create_backup"] = False

    if args.no_monitoring:
        deployment_manager.config["enable_monitoring"] = False

    try:
        if args.rollback:
            # Perform rollback
            success = await deployment_manager.rollback_deployment()
        else:
            # Perform deployment
            success = True

            # Pre-deployment checks
            if not args.skip_checks and deployment_manager.config["pre_deployment_checks"]:
                success = await deployment_manager.run_pre_deployment_checks()

            # Create backup
            if success and deployment_manager.config["create_backup"]:
                success = await deployment_manager.create_pre_deployment_backup()

            # Start monitoring
            if success and deployment_manager.config["enable_monitoring"]:
                await deployment_manager.start_monitoring()

            # Execute migration
            if success:
                success = await deployment_manager.execute_migration()

        # Generate and save report
        report_file = deployment_manager.save_deployment_report()

        if success:
            print(
                f"✅ Deployment {'rollback' if args.rollback else 'migration'} completed successfully"
            )
            print(f"📊 Report saved to: {report_file}")
        else:
            print(f"❌ Deployment {'rollback' if args.rollback else 'migration'} failed")
            print(f"📊 Report saved to: {report_file}")
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n⚠️ Deployment interrupted by user")
        await deployment_manager.rollback_deployment()
        deployment_manager.save_deployment_report()
        sys.exit(1)

    except Exception as e:
        print(f"❌ Deployment error: {e}")
        logger.error(f"Deployment error: {e}")
        await deployment_manager.rollback_deployment()
        deployment_manager.save_deployment_report()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
