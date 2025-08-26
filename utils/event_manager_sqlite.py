"""
SQLite-based event management module for Discord Reminder Bot.

This module provides a thread-safe manager for handling event operations
using SQLite database with Pewee ORM, replacing the JSON-based storage.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import discord
from peewee import DoesNotExist, IntegrityError

from config.settings import Settings
from models.database_models import Event, Guild, Reaction, ReminderLog, User, initialize_models
from persistence.database import get_database
from utils.concurrency_sqlite import (
    ensure_database_connection,
    execute_with_retry,
    schedule_sqlite_reaction_update,
    sqlite_concurrency_stats,
    with_sqlite_guild_lock,
    with_sqlite_transaction,
)
from utils.error_recovery import safe_fetch_message

# Get logger for this module
logger = logging.getLogger(__name__)


class SQLiteEventManager:
    """
    Thread-safe manager for event operations using SQLite database.

    This class centralizes all event operations and ensures they are
    executed safely with proper database transactions and guild isolation.
    """

    def __init__(self):
        """Initialize the SQLite event manager."""
        # Initialize database models and ensure connection
        self._ensure_database_connection()

    def _ensure_database_connection(self) -> bool:
        """
        Ensure database connection is available and tables are created.

        Returns:
            bool: True if database is ready, False otherwise
        """
        try:
            # Initialize models first
            initialize_models()
            # Then create tables
            from models.database_models import create_tables

            return create_tables()
        except Exception as e:
            logger.error(f"Failed to ensure database connection: {e}")
            return False

    async def create_event(self, guild_id: int, message_id: int, **kwargs) -> Optional[Event]:
        """
        Create a new event with thread-safety and guild isolation.

        Args:
            guild_id: The Discord guild ID
            message_id: The Discord message ID
            **kwargs: Additional event parameters (channel_id, title, etc.)

        Returns:
            Optional[Event]: The created event or None if failed
        """

        async def _create_operation():
            try:
                # Ensure guild exists
                guild, created = Guild.get_or_create(
                    guild_id=guild_id,
                    defaults={"name": kwargs.get("guild_name", f"Guild {guild_id}")},
                )

                # Create the event
                event = Event.create(
                    message_id=message_id,
                    channel_id=kwargs.get("channel_id"),
                    guild=guild,
                    title=kwargs.get("title", "Untitled Event"),
                    description=kwargs.get("description"),
                    interval_minutes=Settings.validate_interval_minutes(
                        kwargs.get("interval_minutes", 60.0)
                    ),
                    is_paused=kwargs.get("is_paused", False),
                    last_reminder=kwargs.get("last_reminder", datetime.now()),
                    required_reactions=kwargs.get("required_reactions", '["✅", "❌", "❓"]'),
                )

                logger.info(f"Created event {message_id} in guild {guild_id}")
                return event

            except IntegrityError as e:
                logger.error(f"Event {message_id} already exists: {e}")
                return None
            except Exception as e:
                logger.error(f"Failed to create event {message_id}: {e}")
                return None

        try:
            return await _create_operation()
        except Exception as e:
            logger.error(f"Failed to create event for message {message_id}: {e}")
            return None

    async def get_event(self, message_id: int) -> Optional[Event]:
        """
        Get an event by message ID.

        Args:
            message_id: The message ID to look up

        Returns:
            Optional[Event]: The event if found, None otherwise
        """
        try:
            return Event.get(Event.message_id == message_id)
        except DoesNotExist:
            return None
        except Exception as e:
            logger.error(f"Failed to get event {message_id}: {e}")
            return None

    async def update_event(self, message_id: int, **kwargs) -> bool:
        """
        Update an event with thread-safety.

        Args:
            message_id: The message ID of the event to update
            **kwargs: Fields to update

        Returns:
            bool: True if updated successfully, False otherwise
        """
        event = await self.get_event(message_id)
        if not event:
            return False

        async def _update_operation():
            try:
                # Update allowed fields
                updated = False

                if "title" in kwargs:
                    event.title = kwargs["title"]
                    updated = True

                if "description" in kwargs:
                    event.description = kwargs["description"]
                    updated = True

                if "interval_minutes" in kwargs:
                    event.interval_minutes = Settings.validate_interval_minutes(
                        kwargs["interval_minutes"]
                    )
                    updated = True

                if "is_paused" in kwargs:
                    event.is_paused = kwargs["is_paused"]
                    updated = True

                if "last_reminder" in kwargs:
                    event.last_reminder = kwargs["last_reminder"]
                    updated = True

                if "required_reactions" in kwargs:
                    if isinstance(kwargs["required_reactions"], list):
                        event.required_reactions_list = kwargs["required_reactions"]
                    else:
                        event.required_reactions = kwargs["required_reactions"]
                    updated = True

                if updated:
                    event.save()
                    logger.info(f"Updated event {message_id}")
                    return True

                return False

            except Exception as e:
                logger.error(f"Failed to update event {message_id}: {e}")
                return False

        try:
            return await _update_operation()
        except Exception as e:
            logger.error(f"Failed to update event {message_id}: {e}")
            return False

    async def delete_event(self, message_id: int) -> bool:
        """
        Delete an event with thread-safety.

        Args:
            message_id: The message ID of the event to delete

        Returns:
            bool: True if deleted successfully, False if not found
        """
        event = await self.get_event(message_id)
        if not event:
            return False

        async def _delete_operation():
            try:
                # Delete related records first (cascading delete)
                Reaction.delete().where(Reaction.event == event).execute()
                ReminderLog.delete().where(ReminderLog.event == event).execute()

                # Delete the event
                event.delete_instance()

                logger.info(f"Deleted event {message_id} from guild {event.guild.guild_id}")
                return True

            except Exception as e:
                logger.error(f"Failed to delete event {message_id}: {e}")
                return False

        try:
            return await _delete_operation()
        except Exception as e:
            logger.error(f"Failed to delete event {message_id}: {e}")
            return False

    async def get_guild_events(self, guild_id: int) -> List[Event]:
        """
        Get all events for a specific guild with proper isolation.

        Args:
            guild_id: The guild ID

        Returns:
            List[Event]: List of events for the guild
        """
        try:
            return list(Event.select().join(Guild).where(Guild.guild_id == guild_id))
        except Exception as e:
            logger.error(f"Failed to get events for guild {guild_id}: {e}")
            return []

    async def get_due_events(self) -> List[Event]:
        """
        Get all events that are due for notification with optimized query.

        Returns:
            List[Event]: List of events that need to be sent
        """
        try:
            current_time = datetime.now()

            # Optimized query to find due events
            due_events = []

            # Get all non-paused events and check if they're due
            events = Event.select().where(Event.is_paused == False)

            for event in events:
                if event.is_due_for_reminder:
                    due_events.append(event)

            logger.debug(f"Found {len(due_events)} due events")
            return due_events

        except Exception as e:
            logger.error(f"Failed to get due events: {e}")
            return []

    async def pause_event(self, message_id: int) -> bool:
        """
        Pause an event with thread-safety.

        Args:
            message_id: The message ID of the event to pause

        Returns:
            bool: True if paused successfully, False if not found
        """
        return await self.update_event(message_id, is_paused=True)

    async def resume_event(self, message_id: int) -> bool:
        """
        Resume a paused event with thread-safety.

        Args:
            message_id: The message ID of the event to resume

        Returns:
            bool: True if resumed successfully, False if not found
        """
        return await self.update_event(message_id, is_paused=False)

    async def update_event_interval(self, message_id: int, new_interval_minutes: float) -> bool:
        """
        Update an event's interval with thread-safety.

        Args:
            message_id: The message ID of the event
            new_interval_minutes: New interval in minutes

        Returns:
            bool: True if updated successfully, False if not found
        """
        return await self.update_event(message_id, interval_minutes=new_interval_minutes)

    async def update_event_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """
        Update event reactions in a thread-safe manner using database.

        Args:
            message_id: The message ID to update
            bot: The Discord bot client

        Returns:
            bool: True if updated successfully, False otherwise
        """
        event = await self.get_event(message_id)
        if not event:
            return False

        async def _update_operation():
            try:
                # Get the Discord message
                channel = bot.get_channel(event.channel_id)
                if not channel or not hasattr(channel, "fetch_message"):
                    logger.error(f"Could not find text channel {event.channel_id}")
                    return False

                message = await safe_fetch_message(channel, event.message_id)
                if not message:
                    logger.error(f"Could not fetch message {event.message_id}")
                    return False

                database = get_database()

                with database.atomic():
                    # Clear existing reactions for this event
                    Reaction.delete().where(Reaction.event == event).execute()

                    # Process current reactions
                    users_who_reacted = set()

                    for reaction in message.reactions:
                        if reaction.emoji in event.required_reactions_list:
                            async for user in reaction.users():
                                if not user.bot:
                                    users_who_reacted.add(user.id)

                                    # Ensure user exists in database
                                    user_obj, created = User.get_or_create(
                                        user_id=user.id,
                                        guild=event.guild,
                                        defaults={
                                            "username": user.display_name,
                                            "is_bot": user.bot,
                                            "last_seen": datetime.now(),
                                        },
                                    )

                                    # Create reaction record
                                    Reaction.create(
                                        event=event,
                                        user_id=user.id,
                                        emoji=str(reaction.emoji),
                                        reacted_at=datetime.now(),
                                    )

                    logger.debug(
                        f"Updated reactions for event {message_id}: "
                        f"{len(users_who_reacted)} users"
                    )
                    return True

            except Exception as e:
                logger.error(f"Failed to update reactions for message {message_id}: {e}")
                return False

        try:
            result = await with_sqlite_transaction(event.guild.guild_id, _update_operation)
            if result:
                sqlite_concurrency_stats.increment_stat("reaction_updates_processed")
            return result
        except Exception as e:
            logger.error(f"Failed to update reactions for message {message_id}: {e}")
            return False

    async def schedule_reaction_update_debounced(
        self, message_id: int, bot: discord.Client
    ) -> None:
        """
        Schedule a debounced reaction update to prevent rapid successive updates.

        Args:
            message_id: The message ID to update
            bot: The Discord bot client
        """
        await schedule_sqlite_reaction_update(
            message_id, self.update_event_reactions_safe, message_id, bot
        )
        sqlite_concurrency_stats.increment_stat("reaction_updates_debounced")

    async def mark_reminder_sent(self, message_id: int, users_notified: int = 0) -> bool:
        """
        Mark that a reminder was sent for an event.

        Args:
            message_id: The message ID of the event
            users_notified: Number of users who were notified

        Returns:
            bool: True if marked successfully, False otherwise
        """
        event = await self.get_event(message_id)
        if not event:
            return False

        async def _mark_sent_operation():
            try:
                database = get_database()

                with database.atomic():
                    # Update event's last reminder time
                    event.last_reminder = datetime.now()
                    event.save()

                    # Create reminder log entry
                    ReminderLog.create(
                        event=event,
                        scheduled_at=datetime.now(),
                        sent_at=datetime.now(),
                        users_notified=users_notified,
                        status="sent",
                    )

                    logger.info(f"Marked reminder sent for event {message_id}")
                    return True

            except Exception as e:
                logger.error(f"Failed to mark reminder sent for event {message_id}: {e}")
                return False

        try:
            return await with_sqlite_transaction(event.guild.guild_id, _mark_sent_operation)
        except Exception as e:
            logger.error(f"Failed to mark reminder sent for event {message_id}: {e}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the event manager using database queries.

        Returns:
            Dict[str, Any]: Statistics dictionary
        """
        try:
            total_events = Event.select().count()
            active_events = Event.select().where(Event.is_paused == False).count()
            paused_events = Event.select().where(Event.is_paused == True).count()
            total_guilds = Guild.select().count()

            # Calculate average events per guild
            avg_events_per_guild = total_events / total_guilds if total_guilds > 0 else 0

            return {
                "total_events": total_events,
                "active_events": active_events,
                "paused_events": paused_events,
                "guilds_with_events": total_guilds,
                "average_events_per_guild": round(avg_events_per_guild, 2),
                # Legacy compatibility
                "total_reminders": total_events,
                "active_reminders": active_events,
                "paused_reminders": paused_events,
                "guilds_with_reminders": total_guilds,
                "average_reminders_per_guild": round(avg_events_per_guild, 2),
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {
                "total_events": 0,
                "active_events": 0,
                "paused_events": 0,
                "guilds_with_events": 0,
                "average_events_per_guild": 0,
                "total_reminders": 0,
                "active_reminders": 0,
                "paused_reminders": 0,
                "guilds_with_reminders": 0,
                "average_reminders_per_guild": 0,
                "error": str(e),
            }

    # Legacy compatibility methods
    async def add_event(self, event_data) -> bool:
        """Add a new event (legacy compatibility)."""
        if hasattr(event_data, "message_id"):
            # Convert from old Event object
            return (
                await self.create_event(
                    guild_id=event_data.guild_id,
                    message_id=event_data.message_id,
                    channel_id=event_data.channel_id,
                    title=event_data.title,
                    interval_minutes=event_data.interval_minutes,
                    is_paused=event_data.is_paused,
                    last_reminder=event_data.last_reminder,
                    required_reactions=event_data.required_reactions,
                )
                is not None
            )
        return False

    async def remove_event(self, message_id: int) -> bool:
        """Remove an event (legacy compatibility)."""
        return await self.delete_event(message_id)

    async def get_guild_reminders(self, guild_id: int) -> Dict[int, Event]:
        """Get all events for a specific guild (legacy compatibility)."""
        events = await self.get_guild_events(guild_id)
        return {event.message_id: event for event in events}

    async def get_due_reminders(self) -> List[Event]:
        """Get all events that are due for notification (legacy compatibility)."""
        return await self.get_due_events()

    async def get_reminder(self, message_id: int) -> Optional[Event]:
        """Get an event by message ID (legacy compatibility)."""
        return await self.get_event(message_id)

    async def add_reminder(self, reminder) -> bool:
        """Add a new event (legacy compatibility)."""
        return await self.add_event(reminder)

    async def remove_reminder(self, message_id: int) -> bool:
        """Remove an event (legacy compatibility)."""
        return await self.remove_event(message_id)

    async def pause_reminder(self, message_id: int) -> bool:
        """Pause an event (legacy compatibility)."""
        return await self.pause_event(message_id)

    async def resume_reminder(self, message_id: int) -> bool:
        """Resume an event (legacy compatibility)."""
        return await self.resume_event(message_id)

    async def update_reminder_interval(self, message_id: int, new_interval_minutes: float) -> bool:
        """Update an event's interval (legacy compatibility)."""
        return await self.update_event_interval(message_id, new_interval_minutes)

    async def update_reminder_reactions_safe(self, message_id: int, bot: discord.Client) -> bool:
        """Update event reactions (legacy compatibility)."""
        return await self.update_event_reactions_safe(message_id, bot)

    async def load_from_storage(self) -> bool:
        """
        Load events from storage (legacy compatibility).
        For SQLite, this is a no-op since data is already in the database.

        Returns:
            bool: Always True for SQLite implementation
        """
        logger.info("SQLite EventManager: load_from_storage called (no-op)")
        return True

    async def save(self) -> bool:
        """
        Save events to storage (legacy compatibility).
        For SQLite, this is a no-op since data is automatically persisted.

        Returns:
            bool: Always True for SQLite implementation
        """
        logger.debug("SQLite EventManager: save called (no-op)")
        return True


# Global instance for the application
sqlite_event_manager = SQLiteEventManager()
