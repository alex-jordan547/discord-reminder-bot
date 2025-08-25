#!/usr/bin/env python3
"""
Database optimization script for Discord Reminder Bot.

This script performs comprehensive database optimization including:
- Creating performance indexes
- Analyzing query statistics
- Cleaning up old data
- Vacuuming database file
"""

import logging
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from models.schema_manager import setup_database, verify_database_integrity
from persistence.database import get_database_info
from utils.database_optimization import maintenance_cleanup, optimize_database

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main():
    """Main optimization routine."""
    print("🔧 Starting database optimization...")

    # Verify database is available
    db_info = get_database_info()
    if not db_info.get("database_exists", False):
        print("❌ Database does not exist. Please run the bot first to create it.")
        sys.exit(1)

    print(f"📊 Database size: {db_info.get('database_size_mb', 0):.2f} MB")

    # Verify database integrity
    print("🔍 Verifying database integrity...")
    if not verify_database_integrity():
        print("❌ Database integrity check failed. Please check the logs.")
        sys.exit(1)
    print("✅ Database integrity verified")

    # Perform optimization
    print("⚡ Optimizing database...")
    optimization_results = optimize_database()

    if optimization_results.get("indexes_created", False):
        print("✅ Performance indexes created")
    else:
        print("⚠️ Failed to create some performance indexes")

    if optimization_results.get("analyze_success", False):
        print("✅ Database statistics updated")
    else:
        print("⚠️ Failed to update database statistics")

    # Display statistics
    stats = optimization_results.get("statistics", {})
    if stats and "error" not in stats:
        print("\n📈 Database Statistics:")
        print(f"  Guilds: {stats.get('guilds', 0)}")
        print(f"  Users: {stats.get('users', 0)}")
        print(
            f"  Events: {stats.get('events', 0)} ({stats.get('active_events', 0)} active, {stats.get('paused_events', 0)} paused)"
        )
        print(f"  Reactions: {stats.get('reactions', 0)}")
        print(f"  Reminder Logs: {stats.get('reminder_logs', 0)}")
        print(
            f"  Recent Activity (7 days): {stats.get('recent_events', 0)} events, {stats.get('recent_reactions', 0)} reactions"
        )

    # Perform maintenance cleanup
    print("\n🧹 Performing maintenance cleanup...")
    cleanup_results = maintenance_cleanup(days_to_keep=30)

    logs_deleted = cleanup_results.get("logs_deleted", 0)
    if logs_deleted > 0:
        print(f"✅ Cleaned up {logs_deleted} old reminder logs")
    else:
        print("ℹ️ No old logs to clean up")

    if cleanup_results.get("vacuum_success", False):
        print("✅ Database file optimized (VACUUM)")
    else:
        print("⚠️ Database VACUUM operation failed")

    # Final database info
    final_db_info = get_database_info()
    final_size = final_db_info.get("database_size_mb", 0)
    size_change = final_size - db_info.get("database_size_mb", 0)

    print(f"\n📊 Final database size: {final_size:.2f} MB")
    if size_change != 0:
        print(f"   Size change: {size_change:+.2f} MB")

    print("\n🎉 Database optimization completed successfully!")


if __name__ == "__main__":
    main()
