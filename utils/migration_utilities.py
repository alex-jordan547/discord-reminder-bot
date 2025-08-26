"""
Migration utilities for diagnostics, administration, and monitoring.

This module provides tools for diagnosing migration issues, administrative commands
for manual migration control, and detailed metrics and logging for the migration process.
"""

import json
import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models.database_models import (
    ALL_MODELS,
    Event,
    Guild,
    Reaction,
    ReminderLog,
    User,
    initialize_models,
)
from persistence.database import get_database
from utils.backup_rollback import BackupManager, PostMigrationValidator, RollbackManager
from utils.data_migration import DataMigrationService, MigrationError, MigrationResult

# Get logger for this module
logger = logging.getLogger(__name__)


class MigrationDiagnostics:
    """Diagnostic tools for migration troubleshooting."""

    def __init__(self):
        self.diagnostics_dir = Path("data/diagnostics")
        self.diagnostics_dir.mkdir(parents=True, exist_ok=True)

    def run_full_diagnostics(
        self, json_file_path: str = "watched_reminders.json"
    ) -> Dict[str, Any]:
        """
        Run comprehensive diagnostics on the migration system.

        Args:
            json_file_path: Path to the JSON file to analyze

        Returns:
            Dict[str, Any]: Complete diagnostic report
        """
        report = {
            "timestamp": datetime.now().isoformat(),
            "json_file_path": json_file_path,
            "system_info": self._get_system_info(),
            "json_analysis": self._analyze_json_file(json_file_path),
            "database_analysis": self._analyze_database(),
            "migration_readiness": self._check_migration_readiness(json_file_path),
            "performance_metrics": self._get_performance_metrics(),
            "recommendations": [],
        }

        # Generate recommendations based on analysis
        report["recommendations"] = self._generate_recommendations(report)

        # Save diagnostic report
        self._save_diagnostic_report(report)

        return report

    def _get_system_info(self) -> Dict[str, Any]:
        """Get system information relevant to migration."""
        import platform

        import psutil

        try:
            return {
                "platform": platform.platform(),
                "python_version": platform.python_version(),
                "available_memory": psutil.virtual_memory().available,
                "disk_space": psutil.disk_usage(".").free,
                "cpu_count": psutil.cpu_count(),
                "current_directory": os.getcwd(),
                "environment": os.environ.get("ENVIRONMENT", "unknown"),
            }
        except Exception as e:
            logger.warning(f"Failed to get system info: {e}")
            return {"error": str(e)}

    def _analyze_json_file(self, json_file_path: str) -> Dict[str, Any]:
        """Analyze the JSON file for migration readiness."""
        analysis = {
            "exists": False,
            "readable": False,
            "valid_json": False,
            "file_size": 0,
            "event_count": 0,
            "guild_count": 0,
            "total_reactions": 0,
            "data_quality_issues": [],
            "structure_analysis": {},
        }

        try:
            if not os.path.exists(json_file_path):
                analysis["data_quality_issues"].append(f"JSON file not found: {json_file_path}")
                return analysis

            analysis["exists"] = True

            # Get file info
            stat = os.stat(json_file_path)
            analysis["file_size"] = stat.st_size
            analysis["last_modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()

            # Try to read and parse JSON
            try:
                with open(json_file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                analysis["readable"] = True
                analysis["valid_json"] = True

                if isinstance(data, dict):
                    analysis["event_count"] = len(data)

                    # Analyze data structure
                    guilds = set()
                    total_reactions = 0

                    for message_id, event_data in data.items():
                        if isinstance(event_data, dict):
                            if "guild_id" in event_data:
                                guilds.add(event_data["guild_id"])

                            if "users_who_reacted" in event_data:
                                total_reactions += len(event_data["users_who_reacted"])

                    analysis["guild_count"] = len(guilds)
                    analysis["total_reactions"] = total_reactions

                    # Detailed structure analysis
                    analysis["structure_analysis"] = self._analyze_json_structure(data)

                else:
                    analysis["data_quality_issues"].append("JSON root is not a dictionary")

            except json.JSONDecodeError as e:
                analysis["data_quality_issues"].append(f"Invalid JSON format: {e}")
            except Exception as e:
                analysis["data_quality_issues"].append(f"Failed to read JSON file: {e}")

        except Exception as e:
            analysis["data_quality_issues"].append(f"File analysis failed: {e}")

        return analysis

    def _analyze_json_structure(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze the structure of JSON data in detail."""
        structure = {
            "field_coverage": {},
            "data_types": {},
            "value_ranges": {},
            "potential_issues": [],
        }

        # Analyze field coverage and types
        all_fields = set()
        field_counts = {}
        type_analysis = {}

        for message_id, event_data in data.items():
            if not isinstance(event_data, dict):
                structure["potential_issues"].append(f"Event {message_id}: not a dictionary")
                continue

            for field, value in event_data.items():
                all_fields.add(field)
                field_counts[field] = field_counts.get(field, 0) + 1

                value_type = type(value).__name__
                if field not in type_analysis:
                    type_analysis[field] = {}
                type_analysis[field][value_type] = type_analysis[field].get(value_type, 0) + 1

        total_events = len(data)

        # Calculate field coverage
        for field in all_fields:
            coverage = (field_counts[field] / total_events) * 100
            structure["field_coverage"][field] = {
                "count": field_counts[field],
                "coverage_percent": round(coverage, 1),
            }

            if coverage < 100:
                structure["potential_issues"].append(
                    f"Field '{field}' missing in {total_events - field_counts[field]} events"
                )

        structure["data_types"] = type_analysis

        # Analyze value ranges for numeric fields
        numeric_fields = ["interval_minutes", "message_id", "channel_id", "guild_id"]
        for field in numeric_fields:
            if field in all_fields:
                values = []
                for event_data in data.values():
                    if isinstance(event_data, dict) and field in event_data:
                        try:
                            values.append(float(event_data[field]))
                        except (ValueError, TypeError):
                            pass

                if values:
                    structure["value_ranges"][field] = {
                        "min": min(values),
                        "max": max(values),
                        "avg": sum(values) / len(values),
                        "count": len(values),
                    }

        return structure

    def _analyze_database(self) -> Dict[str, Any]:
        """Analyze the current database state."""
        analysis = {
            "database_exists": False,
            "tables_exist": False,
            "connection_ok": False,
            "table_counts": {},
            "schema_info": {},
            "integrity_check": {},
        }

        try:
            # Check if database file exists
            database = get_database()
            if hasattr(database, "database") and os.path.exists(database.database):
                analysis["database_exists"] = True

            # Try to connect and analyze
            initialize_models()
            database.connect()
            analysis["connection_ok"] = True

            # Check tables and get counts
            tables_exist = True
            for model in ALL_MODELS:
                try:
                    count = model.select().count()
                    analysis["table_counts"][model.__name__] = count
                except Exception as e:
                    tables_exist = False
                    analysis["table_counts"][model.__name__] = f"Error: {e}"

            analysis["tables_exist"] = tables_exist

            # Get schema information
            cursor = database.execute_sql("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in cursor.fetchall()]
            analysis["schema_info"]["tables"] = tables

            # Basic integrity checks
            if tables_exist:
                analysis["integrity_check"] = self._run_database_integrity_checks()

        except Exception as e:
            analysis["connection_error"] = str(e)
        finally:
            database = get_database()
            if database and not database.is_closed():
                database.close()

        return analysis

    def _run_database_integrity_checks(self) -> Dict[str, Any]:
        """Run basic database integrity checks."""
        checks = {"foreign_key_violations": [], "orphaned_records": [], "data_consistency": []}

        try:
            # Check for orphaned reactions (reactions without events)
            orphaned_reactions = (
                Reaction.select().join(Event, join_type="LEFT OUTER").where(Event.id.is_null())
            )
            orphaned_count = orphaned_reactions.count()
            if orphaned_count > 0:
                checks["orphaned_records"].append(f"{orphaned_count} reactions without events")

            # Check for orphaned users (users without guilds)
            orphaned_users = (
                User.select().join(Guild, join_type="LEFT OUTER").where(Guild.guild_id.is_null())
            )
            orphaned_user_count = orphaned_users.count()
            if orphaned_user_count > 0:
                checks["orphaned_records"].append(f"{orphaned_user_count} users without guilds")

            # Check for events without guilds
            orphaned_events = (
                Event.select().join(Guild, join_type="LEFT OUTER").where(Guild.guild_id.is_null())
            )
            orphaned_event_count = orphaned_events.count()
            if orphaned_event_count > 0:
                checks["orphaned_records"].append(f"{orphaned_event_count} events without guilds")

            # Check data consistency
            total_events = Event.select().count()
            total_reactions = Reaction.select().count()

            if total_events > 0:
                avg_reactions_per_event = total_reactions / total_events
                checks["data_consistency"].append(
                    f"Average reactions per event: {avg_reactions_per_event:.2f}"
                )

        except Exception as e:
            checks["check_error"] = str(e)

        return checks

    def _check_migration_readiness(self, json_file_path: str) -> Dict[str, Any]:
        """Check if the system is ready for migration."""
        readiness = {"ready": False, "blocking_issues": [], "warnings": [], "requirements_met": {}}

        # Check requirements
        requirements = {
            "json_file_exists": os.path.exists(json_file_path),
            "json_file_readable": False,
            "database_connectable": False,
            "sufficient_disk_space": False,
            "backup_directory_writable": False,
        }

        # Check JSON file readability
        if requirements["json_file_exists"]:
            try:
                with open(json_file_path, "r", encoding="utf-8") as f:
                    json.load(f)
                requirements["json_file_readable"] = True
            except Exception:
                pass

        # Check database connectivity
        try:
            initialize_models()
            database = get_database()
            database.connect()
            requirements["database_connectable"] = True
            database.close()
        except Exception:
            pass

        # Check disk space (need at least 100MB free)
        try:
            import psutil

            free_space = psutil.disk_usage(".").free
            requirements["sufficient_disk_space"] = free_space > 100 * 1024 * 1024
        except Exception:
            pass

        # Check backup directory
        try:
            backup_dir = Path("data/backups")
            backup_dir.mkdir(parents=True, exist_ok=True)
            test_file = backup_dir / "test_write.tmp"
            test_file.write_text("test")
            test_file.unlink()
            requirements["backup_directory_writable"] = True
        except Exception:
            pass

        readiness["requirements_met"] = requirements

        # Determine blocking issues
        if not requirements["json_file_exists"]:
            readiness["blocking_issues"].append("JSON file does not exist")
        elif not requirements["json_file_readable"]:
            readiness["blocking_issues"].append(
                "JSON file is not readable or contains invalid JSON"
            )

        if not requirements["database_connectable"]:
            readiness["blocking_issues"].append("Cannot connect to database")

        if not requirements["sufficient_disk_space"]:
            readiness["blocking_issues"].append("Insufficient disk space (need at least 100MB)")

        if not requirements["backup_directory_writable"]:
            readiness["blocking_issues"].append("Cannot write to backup directory")

        # Determine warnings
        if requirements["json_file_exists"]:
            try:
                stat = os.stat(json_file_path)
                if stat.st_size > 10 * 1024 * 1024:  # > 10MB
                    readiness["warnings"].append("Large JSON file may take longer to migrate")
            except Exception:
                pass

        # Overall readiness
        readiness["ready"] = len(readiness["blocking_issues"]) == 0

        return readiness

    def _get_performance_metrics(self) -> Dict[str, Any]:
        """Get performance metrics for the migration system."""
        metrics = {
            "json_read_time": None,
            "database_query_time": None,
            "estimated_migration_time": None,
        }

        try:
            # Test JSON read performance
            json_file = "watched_reminders.json"
            if os.path.exists(json_file):
                start_time = time.time()
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                metrics["json_read_time"] = time.time() - start_time

                # Estimate migration time based on data size
                event_count = len(data) if isinstance(data, dict) else 0
                # Rough estimate: 100 events per second
                metrics["estimated_migration_time"] = max(event_count / 100, 1.0)

            # Test database query performance
            try:
                initialize_models()
                database = get_database()
                database.connect()

                start_time = time.time()
                Event.select().count()
                metrics["database_query_time"] = time.time() - start_time

                database.close()
            except Exception:
                pass

        except Exception as e:
            metrics["performance_error"] = str(e)

        return metrics

    def _generate_recommendations(self, report: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on diagnostic report."""
        recommendations = []

        # JSON file recommendations
        json_analysis = report.get("json_analysis", {})
        if json_analysis.get("file_size", 0) > 50 * 1024 * 1024:  # > 50MB
            recommendations.append("Consider splitting large JSON file for faster processing")

        if len(json_analysis.get("data_quality_issues", [])) > 0:
            recommendations.append("Fix data quality issues before migration")

        # Database recommendations
        db_analysis = report.get("database_analysis", {})
        if not db_analysis.get("tables_exist", False):
            recommendations.append("Create database tables before migration")

        integrity_issues = db_analysis.get("integrity_check", {})
        if integrity_issues.get("orphaned_records"):
            recommendations.append("Clean up orphaned database records")

        # Performance recommendations
        performance = report.get("performance_metrics", {})
        if performance.get("estimated_migration_time", 0) > 300:  # > 5 minutes
            recommendations.append(
                "Large dataset detected - consider running migration during low-usage period"
            )

        # Readiness recommendations
        readiness = report.get("migration_readiness", {})
        if not readiness.get("ready", False):
            recommendations.append("Resolve blocking issues before attempting migration")

        if len(readiness.get("warnings", [])) > 0:
            recommendations.append("Review warnings and plan accordingly")

        return recommendations

    def _save_diagnostic_report(self, report: Dict[str, Any]) -> str:
        """Save diagnostic report to file."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.diagnostics_dir / f"migration_diagnostics_{timestamp}.json"

        try:
            with open(report_file, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=False, default=str)

            logger.info(f"Diagnostic report saved to: {report_file}")
            return str(report_file)
        except Exception as e:
            logger.error(f"Failed to save diagnostic report: {e}")
            return ""


class MigrationMetrics:
    """Tracks and reports migration metrics."""

    def __init__(self):
        self.metrics_dir = Path("data/metrics")
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
        self.current_metrics = {}

    def start_migration_tracking(self) -> str:
        """Start tracking a migration operation."""
        session_id = f"migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        self.current_metrics = {
            "session_id": session_id,
            "start_time": datetime.now().isoformat(),
            "phases": {},
            "errors": [],
            "warnings": [],
            "performance_data": [],
        }

        logger.info(f"Started migration tracking: {session_id}")
        return session_id

    def track_phase(
        self,
        phase_name: str,
        start_time: datetime,
        end_time: datetime,
        success: bool,
        details: Dict[str, Any] = None,
    ):
        """Track a migration phase."""
        if not self.current_metrics:
            logger.warning("No active migration tracking session")
            return

        phase_data = {
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": (end_time - start_time).total_seconds(),
            "success": success,
            "details": details or {},
        }

        self.current_metrics["phases"][phase_name] = phase_data
        logger.info(
            f"Tracked phase '{phase_name}': {phase_data['duration_seconds']:.2f}s, success: {success}"
        )

    def add_performance_data(self, operation: str, duration: float, items_processed: int = 0):
        """Add performance data point."""
        if not self.current_metrics:
            return

        data_point = {
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "duration_seconds": duration,
            "items_processed": items_processed,
            "items_per_second": items_processed / duration if duration > 0 else 0,
        }

        self.current_metrics["performance_data"].append(data_point)

    def add_error(self, error: str, phase: str = None):
        """Add an error to the metrics."""
        if not self.current_metrics:
            return

        error_data = {"timestamp": datetime.now().isoformat(), "error": error, "phase": phase}

        self.current_metrics["errors"].append(error_data)

    def add_warning(self, warning: str, phase: str = None):
        """Add a warning to the metrics."""
        if not self.current_metrics:
            return

        warning_data = {"timestamp": datetime.now().isoformat(), "warning": warning, "phase": phase}

        self.current_metrics["warnings"].append(warning_data)

    def finish_migration_tracking(self, success: bool) -> str:
        """Finish tracking and save metrics."""
        if not self.current_metrics:
            logger.warning("No active migration tracking session")
            return ""

        self.current_metrics["end_time"] = datetime.now().isoformat()
        self.current_metrics["overall_success"] = success

        # Calculate total duration
        start_time = datetime.fromisoformat(self.current_metrics["start_time"])
        end_time = datetime.fromisoformat(self.current_metrics["end_time"])
        self.current_metrics["total_duration_seconds"] = (end_time - start_time).total_seconds()

        # Save metrics to file
        metrics_file = self.metrics_dir / f"{self.current_metrics['session_id']}.json"

        try:
            with open(metrics_file, "w", encoding="utf-8") as f:
                json.dump(self.current_metrics, f, indent=2, ensure_ascii=False)

            logger.info(f"Migration metrics saved to: {metrics_file}")
            return str(metrics_file)
        except Exception as e:
            logger.error(f"Failed to save migration metrics: {e}")
            return ""
        finally:
            self.current_metrics = {}

    def get_historical_metrics(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get historical migration metrics."""
        metrics_files = sorted(self.metrics_dir.glob("migration_*.json"), reverse=True)
        historical_data = []

        for metrics_file in metrics_files[:limit]:
            try:
                with open(metrics_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    historical_data.append(data)
            except Exception as e:
                logger.warning(f"Failed to read metrics file {metrics_file}: {e}")

        return historical_data


class MigrationAdminCommands:
    """Administrative commands for migration management."""

    def __init__(self):
        self.migration_service = DataMigrationService()
        self.backup_manager = BackupManager()
        self.rollback_manager = RollbackManager()
        self.diagnostics = MigrationDiagnostics()
        self.metrics = MigrationMetrics()

    def status(self) -> Dict[str, Any]:
        """Get comprehensive migration status."""
        return {
            "migration_status": self.migration_service.get_migration_status(),
            "backup_files": self.backup_manager.list_backups(),
            "rollback_candidates": self.rollback_manager.get_rollback_candidates(),
            "system_ready": self.diagnostics._check_migration_readiness("watched_reminders.json"),
        }

    def diagnose(self, json_file_path: str = "watched_reminders.json") -> Dict[str, Any]:
        """Run full diagnostics."""
        return self.diagnostics.run_full_diagnostics(json_file_path)

    def backup(
        self, json_file_path: str = "watched_reminders.json", backup_name: str = None
    ) -> Dict[str, Any]:
        """Create a backup."""
        if backup_name:
            result = self.backup_manager.create_manual_backup(json_file_path, backup_name)
        else:
            result = self.backup_manager.create_automatic_backup(json_file_path)

        return {
            "success": result.success,
            "backup_path": result.backup_path,
            "errors": result.errors,
            "warnings": result.warnings,
            "backup_size": result.backup_size,
        }

    def migrate(
        self, json_file_path: str = "watched_reminders.json", create_backup: bool = True
    ) -> Dict[str, Any]:
        """Perform migration with full tracking."""
        session_id = self.metrics.start_migration_tracking()

        try:
            # Create backup if requested
            if create_backup:
                backup_start = datetime.now()
                backup_result = self.backup_manager.create_automatic_backup(json_file_path)
                backup_end = datetime.now()

                self.metrics.track_phase(
                    "backup",
                    backup_start,
                    backup_end,
                    backup_result.success,
                    {"backup_path": backup_result.backup_path},
                )

                if not backup_result.success:
                    self.metrics.add_error("Backup failed", "backup")
                    return {
                        "success": False,
                        "session_id": session_id,
                        "error": "Backup failed",
                        "backup_errors": backup_result.errors,
                    }

            # Perform migration
            migration_start = datetime.now()
            migration_result = self.migration_service.migrate_from_json(json_file_path)
            migration_end = datetime.now()

            self.metrics.track_phase(
                "migration",
                migration_start,
                migration_end,
                migration_result.success,
                migration_result.stats,
            )

            # Add errors and warnings to metrics
            for error in migration_result.errors:
                self.metrics.add_error(error, "migration")

            for warning in migration_result.warnings:
                self.metrics.add_warning(warning, "migration")

            # Validate migration if successful
            if migration_result.success:
                validation_start = datetime.now()
                validator = PostMigrationValidator()
                validation_result = validator.validate_post_migration(json_file_path)
                validation_end = datetime.now()

                self.metrics.track_phase(
                    "validation",
                    validation_start,
                    validation_end,
                    validation_result.success,
                    validation_result.comparison_stats,
                )

                for error in validation_result.errors:
                    self.metrics.add_error(error, "validation")

            # Finish tracking
            metrics_file = self.metrics.finish_migration_tracking(migration_result.success)

            return {
                "success": migration_result.success,
                "session_id": session_id,
                "metrics_file": metrics_file,
                "migration_stats": migration_result.stats,
                "errors": migration_result.errors,
                "warnings": migration_result.warnings,
            }

        except Exception as e:
            self.metrics.add_error(str(e), "migration")
            self.metrics.finish_migration_tracking(False)

            return {"success": False, "session_id": session_id, "error": str(e)}

    def rollback(
        self, backup_path: str, target_json_path: str = "watched_reminders.json"
    ) -> Dict[str, Any]:
        """Perform rollback operation."""
        result = self.rollback_manager.rollback_to_json(backup_path, target_json_path)

        return {
            "success": result.success,
            "restored_file": result.restored_file,
            "database_cleared": result.database_cleared,
            "errors": result.errors,
            "warnings": result.warnings,
            "rollback_time": result.rollback_time,
        }

    def cleanup_backups(self, keep_count: int = 10) -> Dict[str, Any]:
        """Clean up old backup files."""
        deleted_count = self.backup_manager.cleanup_old_backups(keep_count)

        return {"success": True, "deleted_count": deleted_count, "kept_count": keep_count}

    def get_metrics(self, limit: int = 10) -> Dict[str, Any]:
        """Get historical migration metrics."""
        return {"historical_metrics": self.metrics.get_historical_metrics(limit)}


# Convenience functions for easy CLI usage
def run_diagnostics(json_file_path: str = "watched_reminders.json") -> Dict[str, Any]:
    """Run full migration diagnostics."""
    diagnostics = MigrationDiagnostics()
    return diagnostics.run_full_diagnostics(json_file_path)


def get_migration_status() -> Dict[str, Any]:
    """Get current migration status."""
    admin = MigrationAdminCommands()
    return admin.status()


def perform_migration(
    json_file_path: str = "watched_reminders.json", create_backup: bool = True
) -> Dict[str, Any]:
    """Perform complete migration with tracking."""
    admin = MigrationAdminCommands()
    return admin.migrate(json_file_path, create_backup)


def perform_rollback(
    backup_path: str, target_json_path: str = "watched_reminders.json"
) -> Dict[str, Any]:
    """Perform rollback to JSON."""
    admin = MigrationAdminCommands()
    return admin.rollback(backup_path, target_json_path)
