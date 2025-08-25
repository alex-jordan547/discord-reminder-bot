"""
Database optimization utilities for Discord Reminder Bot.

This module provides utilities for optimizing database performance,
including query optimization, index management, and maintenance operations.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

from peewee import fn
from models.database_models import Event, Reaction, ReminderLog, User, Guild
from persistence.database import get_database

# Get logger for this module
logger = logging.getLogger(__name__)


class DatabaseOptimizer:
    """Database optimization and maintenance utilities."""
    
    @staticmethod
    def vacuum_database() -> bool:
        """
        Perform VACUUM operation to optimize database file.
        
        Returns:
            bool: True if operation was successful
        """
        try:
            database = get_database()
            database.connect()
            
            # Perform VACUUM operation
            database.execute_sql('VACUUM')
            
            logger.info("Database VACUUM operation completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to vacuum database: {e}")
            return False
        finally:
            if database and not database.is_closed():
                database.close()
    
    @staticmethod
    def analyze_database() -> bool:
        """
        Perform ANALYZE operation to update query planner statistics.
        
        Returns:
            bool: True if operation was successful
        """
        try:
            database = get_database()
            database.connect()
            
            # Perform ANALYZE operation
            database.execute_sql('ANALYZE')
            
            logger.info("Database ANALYZE operation completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to analyze database: {e}")
            return False
        finally:
            if database and not database.is_closed():
                database.close()
    
    @staticmethod
    def cleanup_old_reminder_logs(days_to_keep: int = 30) -> int:
        """
        Clean up old reminder logs to save space.
        
        Args:
            days_to_keep: Number of days of logs to keep
            
        Returns:
            int: Number of records deleted
        """
        try:
            cutoff_date = datetime.now() - timedelta(days=days_to_keep)
            
            # Delete old reminder logs
            deleted_count = (ReminderLog
                           .delete()
                           .where(ReminderLog.created_at < cutoff_date)
                           .execute())
            
            logger.info(f"Cleaned up {deleted_count} old reminder logs")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup old reminder logs: {e}")
            return 0
    
    @staticmethod
    def get_database_statistics() -> Dict[str, Any]:
        """
        Get comprehensive database statistics.
        
        Returns:
            Dict containing database statistics
        """
        try:
            stats = {}
            
            # Table row counts
            stats['guilds'] = Guild.select().count()
            stats['users'] = User.select().count()
            stats['events'] = Event.select().count()
            stats['reactions'] = Reaction.select().count()
            stats['reminder_logs'] = ReminderLog.select().count()
            
            # Active events count
            stats['active_events'] = Event.select().where(Event.is_paused == False).count()
            stats['paused_events'] = Event.select().where(Event.is_paused == True).count()
            
            # Events by guild
            guild_events = (Event
                          .select(Event.guild, fn.COUNT(Event.message_id).alias('count'))
                          .group_by(Event.guild))
            stats['events_per_guild'] = {str(e.guild.guild_id): e.count for e in guild_events}
            
            # Recent activity (last 7 days)
            week_ago = datetime.now() - timedelta(days=7)
            stats['recent_events'] = Event.select().where(Event.created_at >= week_ago).count()
            stats['recent_reactions'] = Reaction.select().where(Reaction.created_at >= week_ago).count()
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get database statistics: {e}")
            return {'error': str(e)}


class QueryOptimizer:
    """Optimized database queries for common operations."""
    
    @staticmethod
    def get_due_events_optimized() -> List[Event]:
        """
        Get events due for reminder using optimized query.
        
        Returns:
            List[Event]: Events that need reminders
        """
        try:
            current_time = datetime.now()
            
            # Optimized query using index on (last_reminder, interval_minutes)
            due_events = (Event
                        .select()
                        .where(
                            (Event.is_paused == False) &
                            (fn.datetime(Event.last_reminder, '+' + fn.CAST(Event.interval_minutes, 'TEXT') + ' minutes') <= current_time)
                        )
                        .order_by(Event.last_reminder))
            
            return list(due_events)
            
        except Exception as e:
            logger.error(f"Failed to get due events: {e}")
            return []
    
    @staticmethod
    def get_guild_events_with_stats(guild_id: int) -> List[Dict[str, Any]]:
        """
        Get guild events with reaction statistics in a single query.
        
        Args:
            guild_id: Discord guild ID
            
        Returns:
            List of events with statistics
        """
        try:
            # Join events with reaction counts
            events_with_stats = (Event
                               .select(
                                   Event,
                                   fn.COUNT(Reaction.id).alias('reaction_count')
                               )
                               .left_outer_join(Reaction)
                               .where(Event.guild == guild_id)
                               .group_by(Event.message_id)
                               .order_by(Event.created_at.desc()))
            
            results = []
            for event in events_with_stats:
                event_dict = event.to_dict()
                event_dict['reaction_count'] = event.reaction_count
                results.append(event_dict)
            
            return results
            
        except Exception as e:
            logger.error(f"Failed to get guild events with stats: {e}")
            return []
    
    @staticmethod
    def get_user_reaction_summary(guild_id: int) -> Dict[int, Dict[str, Any]]:
        """
        Get user reaction summary for a guild.
        
        Args:
            guild_id: Discord guild ID
            
        Returns:
            Dict mapping user_id to reaction statistics
        """
        try:
            # Get reaction counts per user
            user_reactions = (Reaction
                            .select(
                                Reaction.user_id,
                                fn.COUNT(Reaction.id).alias('total_reactions'),
                                fn.COUNT(fn.DISTINCT(Reaction.event)).alias('events_reacted')
                            )
                            .join(Event)
                            .where(Event.guild == guild_id)
                            .group_by(Reaction.user_id))
            
            summary = {}
            for reaction in user_reactions:
                summary[reaction.user_id] = {
                    'total_reactions': reaction.total_reactions,
                    'events_reacted': reaction.events_reacted
                }
            
            return summary
            
        except Exception as e:
            logger.error(f"Failed to get user reaction summary: {e}")
            return {}


class IndexManager:
    """Database index management utilities."""
    
    @staticmethod
    def create_performance_indexes() -> bool:
        """
        Create additional performance indexes beyond the basic ones.
        
        Returns:
            bool: True if indexes were created successfully
        """
        try:
            database = get_database()
            database.connect()
            
            # Additional indexes for performance
            indexes = [
                # Event indexes for common queries
                'CREATE INDEX IF NOT EXISTS idx_event_guild_created ON event(guild_id, created_at)',
                'CREATE INDEX IF NOT EXISTS idx_event_last_reminder_interval ON event(last_reminder, interval_minutes)',
                'CREATE INDEX IF NOT EXISTS idx_event_guild_paused ON event(guild_id, is_paused)',
                
                # Reaction indexes
                'CREATE INDEX IF NOT EXISTS idx_reaction_event_user ON reaction(event_id, user_id)',
                'CREATE INDEX IF NOT EXISTS idx_reaction_created ON reaction(created_at)',
                
                # ReminderLog indexes
                'CREATE INDEX IF NOT EXISTS idx_reminderlog_event_status ON reminderlog(event_id, status)',
                'CREATE INDEX IF NOT EXISTS idx_reminderlog_scheduled ON reminderlog(scheduled_at)',
                
                # User indexes
                'CREATE INDEX IF NOT EXISTS idx_user_guild_bot ON user(guild_id, is_bot)',
                'CREATE INDEX IF NOT EXISTS idx_user_last_seen ON user(last_seen)',
            ]
            
            for index_sql in indexes:
                database.execute_sql(index_sql)
            
            logger.info(f"Created {len(indexes)} performance indexes")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create performance indexes: {e}")
            return False
        finally:
            if database and not database.is_closed():
                database.close()
    
    @staticmethod
    def analyze_index_usage() -> Dict[str, Any]:
        """
        Analyze index usage statistics.
        
        Returns:
            Dict containing index usage information
        """
        try:
            database = get_database()
            database.connect()
            
            # Get index usage statistics (SQLite specific)
            result = database.execute_sql("""
                SELECT name, tbl_name 
                FROM sqlite_master 
                WHERE type = 'index' 
                AND name NOT LIKE 'sqlite_%'
                ORDER BY tbl_name, name
            """)
            
            indexes = {}
            for row in result:
                index_name, table_name = row
                if table_name not in indexes:
                    indexes[table_name] = []
                indexes[table_name].append(index_name)
            
            return indexes
            
        except Exception as e:
            logger.error(f"Failed to analyze index usage: {e}")
            return {}
        finally:
            if database and not database.is_closed():
                database.close()


def optimize_database() -> Dict[str, Any]:
    """
    Perform comprehensive database optimization.
    
    Returns:
        Dict containing optimization results
    """
    results = {}
    
    # Create performance indexes
    results['indexes_created'] = IndexManager.create_performance_indexes()
    
    # Analyze database
    results['analyze_success'] = DatabaseOptimizer.analyze_database()
    
    # Get statistics
    results['statistics'] = DatabaseOptimizer.get_database_statistics()
    
    # Vacuum database (optional, can be slow)
    # results['vacuum_success'] = DatabaseOptimizer.vacuum_database()
    
    logger.info("Database optimization completed")
    return results


def maintenance_cleanup(days_to_keep: int = 30) -> Dict[str, Any]:
    """
    Perform database maintenance and cleanup.
    
    Args:
        days_to_keep: Number of days of logs to keep
        
    Returns:
        Dict containing cleanup results
    """
    results = {}
    
    # Clean up old logs
    results['logs_deleted'] = DatabaseOptimizer.cleanup_old_reminder_logs(days_to_keep)
    
    # Vacuum after cleanup
    results['vacuum_success'] = DatabaseOptimizer.vacuum_database()
    
    # Update statistics
    results['analyze_success'] = DatabaseOptimizer.analyze_database()
    
    logger.info(f"Database maintenance completed, deleted {results['logs_deleted']} old logs")
    return results