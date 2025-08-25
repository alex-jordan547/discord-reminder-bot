#!/usr/bin/env python3
"""
Migration CLI tool for Discord Reminder Bot.

This script provides a command-line interface for managing the JSON to SQLite migration.
"""

import argparse
import json
import sys
from pathlib import Path

# Add the project root to the Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.migration_utilities import (
    run_diagnostics,
    get_migration_status,
    perform_migration,
    perform_rollback,
    MigrationAdminCommands
)


def print_json_pretty(data):
    """Print JSON data in a pretty format."""
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))


def print_status_summary(status):
    """Print a summary of migration status."""
    migration_status = status.get('migration_status', {})
    
    print("=== Migration Status Summary ===")
    print(f"JSON file exists: {migration_status.get('json_file_exists', False)}")
    print(f"Database initialized: {migration_status.get('database_initialized', False)}")
    print(f"Tables exist: {migration_status.get('tables_exist', False)}")
    
    if 'json_event_count' in migration_status:
        print(f"JSON events: {migration_status['json_event_count']}")
    
    data_counts = migration_status.get('data_counts', {})
    if data_counts:
        print("Database counts:")
        for table, count in data_counts.items():
            print(f"  {table}: {count}")
    
    backup_files = status.get('backup_files', [])
    print(f"Backup files: {len(backup_files)}")
    
    system_ready = status.get('system_ready', {})
    ready = system_ready.get('ready', False)
    print(f"System ready for migration: {ready}")
    
    if not ready:
        blocking_issues = system_ready.get('blocking_issues', [])
        if blocking_issues:
            print("Blocking issues:")
            for issue in blocking_issues:
                print(f"  - {issue}")


def print_diagnostics_summary(diagnostics):
    """Print a summary of diagnostics results."""
    print("=== Diagnostics Summary ===")
    
    json_analysis = diagnostics.get('json_analysis', {})
    print(f"JSON file exists: {json_analysis.get('exists', False)}")
    print(f"JSON file readable: {json_analysis.get('readable', False)}")
    print(f"Valid JSON: {json_analysis.get('valid_json', False)}")
    print(f"Event count: {json_analysis.get('event_count', 0)}")
    print(f"Guild count: {json_analysis.get('guild_count', 0)}")
    print(f"Total reactions: {json_analysis.get('total_reactions', 0)}")
    
    issues = json_analysis.get('data_quality_issues', [])
    if issues:
        print("Data quality issues:")
        for issue in issues[:5]:  # Show first 5 issues
            print(f"  - {issue}")
        if len(issues) > 5:
            print(f"  ... and {len(issues) - 5} more issues")
    
    db_analysis = diagnostics.get('database_analysis', {})
    print(f"Database exists: {db_analysis.get('database_exists', False)}")
    print(f"Connection OK: {db_analysis.get('connection_ok', False)}")
    print(f"Tables exist: {db_analysis.get('tables_exist', False)}")
    
    readiness = diagnostics.get('migration_readiness', {})
    print(f"Ready for migration: {readiness.get('ready', False)}")
    
    recommendations = diagnostics.get('recommendations', [])
    if recommendations:
        print("Recommendations:")
        for rec in recommendations:
            print(f"  - {rec}")


def cmd_status(args):
    """Handle status command."""
    print("Getting migration status...")
    status = get_migration_status()
    
    if args.json:
        print_json_pretty(status)
    else:
        print_status_summary(status)


def cmd_diagnose(args):
    """Handle diagnose command."""
    print(f"Running diagnostics on {args.json_file}...")
    diagnostics = run_diagnostics(args.json_file)
    
    if args.json:
        print_json_pretty(diagnostics)
    else:
        print_diagnostics_summary(diagnostics)


def cmd_backup(args):
    """Handle backup command."""
    admin = MigrationAdminCommands()
    
    print(f"Creating backup of {args.json_file}...")
    result = admin.backup(args.json_file, args.name)
    
    if result['success']:
        print(f"✅ Backup created successfully: {result['backup_path']}")
        print(f"Backup size: {result['backup_size']} bytes")
    else:
        print("❌ Backup failed:")
        for error in result['errors']:
            print(f"  - {error}")
        sys.exit(1)


def cmd_migrate(args):
    """Handle migrate command."""
    print(f"Starting migration of {args.json_file}...")
    
    if not args.no_backup:
        print("Creating backup before migration...")
    
    result = perform_migration(args.json_file, not args.no_backup)
    
    if result['success']:
        print("✅ Migration completed successfully!")
        print(f"Session ID: {result['session_id']}")
        
        stats = result.get('migration_stats', {})
        print("Migration statistics:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        
        if result.get('warnings'):
            print("Warnings:")
            for warning in result['warnings']:
                print(f"  - {warning}")
    else:
        print("❌ Migration failed:")
        for error in result['errors']:
            print(f"  - {error}")
        sys.exit(1)


def cmd_rollback(args):
    """Handle rollback command."""
    print(f"Rolling back to {args.backup_path}...")
    
    if not args.force:
        response = input("This will clear the database and restore JSON data. Continue? (y/N): ")
        if response.lower() != 'y':
            print("Rollback cancelled.")
            return
    
    result = perform_rollback(args.backup_path, args.target)
    
    if result['success']:
        print("✅ Rollback completed successfully!")
        print(f"Restored file: {result['restored_file']}")
        print(f"Database cleared: {result['database_cleared']}")
        print(f"Rollback time: {result['rollback_time']:.2f} seconds")
        
        if result.get('warnings'):
            print("Warnings:")
            for warning in result['warnings']:
                print(f"  - {warning}")
    else:
        print("❌ Rollback failed:")
        for error in result['errors']:
            print(f"  - {error}")
        sys.exit(1)


def cmd_list_backups(args):
    """Handle list-backups command."""
    admin = MigrationAdminCommands()
    status = admin.status()
    backups = status.get('backup_files', [])
    
    if not backups:
        print("No backup files found.")
        return
    
    print(f"Found {len(backups)} backup files:")
    print()
    
    for backup in backups:
        print(f"📁 {backup['filename']}")
        print(f"   Path: {backup['path']}")
        print(f"   Size: {backup['size']} bytes")
        print(f"   Created: {backup['created']}")
        print(f"   Type: {backup['type']}")
        if 'event_count' in backup and backup['event_count'] >= 0:
            print(f"   Events: {backup['event_count']}")
        print()


def cmd_cleanup(args):
    """Handle cleanup command."""
    admin = MigrationAdminCommands()
    
    if not args.force:
        response = input(f"This will delete old backup files, keeping only {args.keep} most recent. Continue? (y/N): ")
        if response.lower() != 'y':
            print("Cleanup cancelled.")
            return
    
    result = admin.cleanup_backups(args.keep)
    
    print(f"✅ Cleanup completed!")
    print(f"Deleted {result['deleted_count']} old backup files")
    print(f"Kept {result['kept_count']} most recent backups")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Migration CLI for Discord Reminder Bot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s status                    # Show migration status
  %(prog)s diagnose                  # Run full diagnostics
  %(prog)s backup                    # Create backup
  %(prog)s migrate                   # Perform migration
  %(prog)s rollback backup.json      # Rollback to backup
  %(prog)s list-backups              # List available backups
  %(prog)s cleanup                   # Clean up old backups
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Show migration status')
    status_parser.add_argument('--json', action='store_true', help='Output in JSON format')
    
    # Diagnose command
    diagnose_parser = subparsers.add_parser('diagnose', help='Run migration diagnostics')
    diagnose_parser.add_argument('--json-file', default='watched_reminders.json', 
                                help='Path to JSON file to analyze')
    diagnose_parser.add_argument('--json', action='store_true', help='Output in JSON format')
    
    # Backup command
    backup_parser = subparsers.add_parser('backup', help='Create backup of JSON file')
    backup_parser.add_argument('--json-file', default='watched_reminders.json',
                              help='Path to JSON file to backup')
    backup_parser.add_argument('--name', help='Custom name for backup')
    
    # Migrate command
    migrate_parser = subparsers.add_parser('migrate', help='Perform migration to SQLite')
    migrate_parser.add_argument('--json-file', default='watched_reminders.json',
                               help='Path to JSON file to migrate')
    migrate_parser.add_argument('--no-backup', action='store_true',
                               help='Skip creating backup before migration')
    
    # Rollback command
    rollback_parser = subparsers.add_parser('rollback', help='Rollback to JSON from backup')
    rollback_parser.add_argument('backup_path', help='Path to backup file to restore')
    rollback_parser.add_argument('--target', default='watched_reminders.json',
                                help='Target path for restored JSON file')
    rollback_parser.add_argument('--force', action='store_true',
                                help='Skip confirmation prompt')
    
    # List backups command
    list_parser = subparsers.add_parser('list-backups', help='List available backup files')
    
    # Cleanup command
    cleanup_parser = subparsers.add_parser('cleanup', help='Clean up old backup files')
    cleanup_parser.add_argument('--keep', type=int, default=10,
                               help='Number of backups to keep (default: 10)')
    cleanup_parser.add_argument('--force', action='store_true',
                               help='Skip confirmation prompt')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        if args.command == 'status':
            cmd_status(args)
        elif args.command == 'diagnose':
            cmd_diagnose(args)
        elif args.command == 'backup':
            cmd_backup(args)
        elif args.command == 'migrate':
            cmd_migrate(args)
        elif args.command == 'rollback':
            cmd_rollback(args)
        elif args.command == 'list-backups':
            cmd_list_backups(args)
        elif args.command == 'cleanup':
            cmd_cleanup(args)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()