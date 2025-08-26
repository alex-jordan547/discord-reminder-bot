"""
SQLite-based scheduler module for Discord Reminder Bot.

This module provides dynamic scheduling functionality optimized for SQLite
database operations with proper transaction handling and guild isolation.
"""

import asyncio
import logging
from datetime import datetime
from typing import List, Optional

import discord
from discord.ext import commands

from config.settings import Messages, Settings
from models.database_models import Event, Guild
from utils.auto_delete import get_auto_delete_manager
from utils.concurrency_sqlite import (
    ensure_database_connection,
    execute_with_retry,
    sqlite_concurrency_stats,
)
from utils.error_recovery import safe_fetch_message, safe_send_message
from utils.event_manager_sqlite import sqlite_event_manager

# Get logger for this module
logger = logging.getLogger(__name__)

# Global variable for the dynamic reminder task
_dynamic_reminder_task: Optional[asyncio.Task] = None

# Global variable to store bot reference
bot: Optional[commands.Bot] = None


async def schedule_next_reminder_check() -> None:
    """
    Schedule the next reminder check dynamically using SQLite queries.

    Calculates the exact time until the next due reminder and enters
    sleep mode if no reminders are being watched.
    """
    global _dynamic_reminder_task

    # Cancel previous task if it exists
    if _dynamic_reminder_task and not _dynamic_reminder_task.done():
        _dynamic_reminder_task.cancel()

    # Ensure database connection is available
    if not await ensure_database_connection():
        logger.error("Database connection not available, cannot schedule reminders")
        return

    try:
        # Get all active events from database
        active_events = await sqlite_event_manager.get_due_events()
        all_events = []

        # Get all non-paused events for scheduling
        try:
            all_events = list(Event.select().where(Event.is_paused == False))
        except Exception as e:
            logger.error(f"Failed to query active events: {e}")
            return

        if not all_events:
            logger.debug("No watched events - entering sleep mode (no periodic checks)")
            print("😴 Mode veille: Aucun événement surveillé, arrêt des vérifications périodiques")
            return

        # Check for overdue reminders
        current_time = datetime.now()
        overdue_events = []
        next_reminder_times = []

        for event in all_events:
            if not event.is_paused:
                next_time = event.get_next_reminder_time()
                time_diff = (current_time - next_time).total_seconds()

                logger.debug(
                    f"Event {event.message_id}: next_time={next_time.strftime('%H:%M:%S')}, "
                    f"current={current_time.strftime('%H:%M:%S')}, diff={time_diff:.1f}s"
                )

                if next_time <= current_time:
                    # Overdue reminder - should be processed immediately
                    overdue_events.append(event)
                    logger.debug(
                        f"Added event {event.message_id} to overdue list "
                        f"(overdue by {time_diff:.1f}s)"
                    )
                else:
                    # Future reminder - add to scheduling
                    next_reminder_times.append(next_time)
                    logger.debug(
                        f"Added event {event.message_id} to future list "
                        f"(due in {-time_diff:.1f}s)"
                    )

        # Process overdue reminders immediately
        if overdue_events:
            logger.info(
                f"Found {len(overdue_events)} overdue reminder(s), processing immediately..."
            )
            print(
                f"🚨 {len(overdue_events)} rappel(s) en retard détecté(s), traitement immédiat..."
            )

            # Process overdue reminders without automatic rescheduling
            _dynamic_reminder_task = asyncio.create_task(
                check_reminders_dynamic(reschedule_after=False)
            )
            try:
                await _dynamic_reminder_task
            except asyncio.CancelledError:
                logger.debug("Overdue reminder check cancelled (likely due to rescheduling)")
                pass

            # After processing overdue reminders, schedule normally
            await schedule_next_reminder_check()
            return

        # If no overdue reminders but future reminders exist, schedule normally
        if not next_reminder_times:
            logger.debug("All reminders are paused - entering sleep mode")
            print("😴 Mode veille: Tous les rappels sont en pause")
            return

        # Calculate time until next reminder
        next_reminder = min(next_reminder_times)
        time_until_next = (next_reminder - current_time).total_seconds()

        # Add small margin to avoid timing issues (5 seconds)
        time_until_next = max(5, time_until_next - 5)

        # Limit maximum wait time
        max_wait = 300 if Settings.is_test_mode() else 1800  # 5 min in test, 30 min in prod
        time_until_next = min(time_until_next, max_wait)

        logger.debug(
            f"Next reminder due at {next_reminder.strftime('%H:%M:%S')}, "
            f"waiting {time_until_next:.1f} seconds"
        )
        print(
            f"🕰️ Prochain rappel programmé à {next_reminder.strftime('%H:%M:%S')} "
            f"(dans {time_until_next:.0f}s)"
        )

        _dynamic_reminder_task = asyncio.create_task(asyncio.sleep(time_until_next))

        try:
            await _dynamic_reminder_task
            await check_reminders_dynamic()
        except asyncio.CancelledError:
            logger.debug("Reminder check cancelled (likely due to rescheduling)")
            pass

    except Exception as e:
        logger.error(f"Error in schedule_next_reminder_check: {e}")
        # Retry after a short delay
        await asyncio.sleep(30)
        await schedule_next_reminder_check()


async def check_reminders_dynamic(reschedule_after: bool = True) -> None:
    """
    Dynamic reminder checking with automatic scheduling of next check.

    Uses SQLite database queries to find due reminders with proper
    transaction handling and guild isolation.

    Args:
        reschedule_after: If True, automatically reschedule next check
    """
    logger.debug("Dynamic reminder check triggered...")

    if not await ensure_database_connection():
        logger.error("Database connection not available for reminder check")
        return

    try:
        # Get due reminders using SQLite event manager
        due_events = await sqlite_event_manager.get_due_events()

        if not due_events:
            # Check if we have any events at all
            try:
                total_events = Event.select().count()
                if total_events == 0:
                    logger.debug("No events to check - entering sleep mode")
                    print("😴 Aucun événement à vérifier - entrée en mode veille")
                    return
                else:
                    logger.debug(f"No reminders due yet. Checked {total_events} events.")
            except Exception as e:
                logger.error(f"Failed to count total events: {e}")
                return

        total_reminded = 0

        for event in due_events:
            logger.info(
                f"Reminder due for message {event.message_id} "
                f"(interval: {event.interval_minutes}min)"
            )

            guild = bot.get_guild(event.guild.guild_id)
            if not guild:
                logger.warning(
                    f"Guild {event.guild.guild_id} not found for event {event.message_id}"
                )
                continue

            # Determine where to send the reminder
            if Settings.USE_SEPARATE_REMINDER_CHANNEL:
                reminder_channel = await get_or_create_reminder_channel(guild)
            else:
                reminder_channel = bot.get_channel(event.channel_id)

            if reminder_channel:
                count = await send_reminder_sqlite(event, reminder_channel, bot)
                total_reminded += count
                await asyncio.sleep(Settings.REMINDER_DELAY_SECONDS)
            else:
                logger.error(f"Could not find reminder channel for message {event.message_id}")

        if total_reminded > 0:
            logger.info(f"Dynamic reminders sent: {total_reminded} people notified")
            print(f"✅ Rappels automatiques envoyés: {total_reminded} personnes notifiées")

        # Schedule next check only if requested
        if reschedule_after:
            await schedule_next_reminder_check()

    except Exception as e:
        logger.error(f"Error in check_reminders_dynamic: {e}")
        # Retry after a short delay if rescheduling is enabled
        if reschedule_after:
            await asyncio.sleep(30)
            await schedule_next_reminder_check()


async def start_dynamic_reminder_system_sqlite() -> None:
    """Start the SQLite-based dynamic reminder scheduling system."""
    logger.info("Starting SQLite dynamic reminder scheduling system")
    print("🎯 Système de planification dynamique des rappels activé (SQLite)")

    # Ensure database connection
    if not await ensure_database_connection():
        logger.error("Failed to initialize database connection for reminder system")
        print("❌ Erreur de connexion à la base de données - système non démarré")
        return

    try:
        # Check for existing events in database
        total_events = Event.select().count()

        if total_events > 0:
            print(
                f"🔍 Détection de {total_events} événement(s) surveillé(s) - "
                "planification en cours..."
            )
            await schedule_next_reminder_check()
        else:
            print("😴 Aucun événement surveillé - système en mode veille")
            print("💡 Le système se réactivera automatiquement lors de l'ajout d'un événement")

    except Exception as e:
        logger.error(f"Failed to start SQLite reminder system: {e}")
        print("⚠️ Erreur lors du démarrage du système de rappels SQLite")


def reschedule_reminders_sqlite() -> None:
    """Reschedule reminders after adding/removing an event (SQLite version)."""
    # Cancel previous task
    if _dynamic_reminder_task and not _dynamic_reminder_task.done():
        _dynamic_reminder_task.cancel()
        logger.debug("Previous reminder task cancelled for rescheduling")

    # Check if there are events to watch using SQLite
    try:
        total_events = Event.select().count()
        if total_events > 0:
            logger.debug(f"Rescheduling reminders for {total_events} watched event(s)")
            print(f"🔄 Replanification des rappels pour {total_events} événement(s)")
            print("⏰ Le système se réactivera dans quelques secondes...")
            # Restart dynamic scheduling
            asyncio.create_task(schedule_next_reminder_check())
        else:
            logger.debug("No events to watch, system entering sleep mode")
            print("😴 Aucun événement à surveiller, mise en veille du système")
    except Exception as e:
        logger.error(f"Failed to reschedule reminders: {e}")


async def get_or_create_reminder_channel(guild: discord.Guild) -> Optional[discord.TextChannel]:
    """Find or create the reminder channel if separate channel mode is enabled."""
    if not Settings.USE_SEPARATE_REMINDER_CHANNEL:
        return None

    # Look for existing channel
    for channel in guild.text_channels:
        if channel.name == Settings.REMINDER_CHANNEL_NAME:
            logger.debug(f"Found existing reminder channel: #{channel.name}")
            return channel

    # Create the channel if it doesn't exist
    try:
        channel = await guild.create_text_channel(
            name=Settings.REMINDER_CHANNEL_NAME,
            topic="📢 Canal automatique pour les rappels de disponibilités",
        )
        logger.info(Messages.CHANNEL_CREATED.format(Settings.REMINDER_CHANNEL_NAME, guild.name))
        print(Messages.CHANNEL_CREATED.format(Settings.REMINDER_CHANNEL_NAME, guild.name))
        return channel
    except discord.Forbidden:
        logger.warning(
            f"Insufficient permissions to create channel #{Settings.REMINDER_CHANNEL_NAME}"
        )
        print(Messages.NO_CHANNEL_PERMISSIONS.format(Settings.REMINDER_CHANNEL_NAME))
        return None


async def send_reminder_sqlite(
    event: Event, channel: discord.TextChannel, bot_instance: commands.Bot
) -> int:
    """Send a reminder for a specific event using SQLite data."""
    try:
        # Get the original event message to update reactions
        event_channel = bot_instance.get_channel(event.channel_id)
        if not event_channel:
            logger.error(f"Could not find event channel {event.channel_id}")
            return 0

        message = await safe_fetch_message(event_channel, event.message_id)
        if not message:
            logger.error(
                f"Could not fetch message {event.message_id} from channel {event.channel_id}"
            )
            # Message deleted - automatically remove this event from surveillance
            logger.warning(
                f"Message {event.message_id} appears to have been deleted, removing from watch list"
            )
            success = await sqlite_event_manager.delete_event(event.message_id)
            if success:
                logger.info(
                    f"Successfully removed deleted message {event.message_id} from surveillance"
                )
                print(
                    f"🗑️ Événement supprimé automatiquement - message {event.message_id} introuvable"
                )
            else:
                logger.error(
                    f"Failed to remove deleted message {event.message_id} from surveillance"
                )
            return 0

        # Update reactions in database
        await sqlite_event_manager.update_event_reactions_safe(event.message_id, bot_instance)

        # Get missing users from database
        missing_users = event.get_missing_users()

        if not missing_users:
            logger.debug(f"No missing users for event {event.message_id}")
            return 0

        # Limit mentions to avoid spam
        users_to_mention = missing_users[: Settings.MAX_MENTIONS_PER_REMINDER]
        remaining = len(missing_users) - len(users_to_mention)

        # Build the reminder message
        mentions = " ".join([f"<@{user_id}>" for user_id in users_to_mention])

        embed = discord.Embed(
            title=f"🔔 Rappel: {event.title[:Settings.MAX_TITLE_LENGTH]}",
            description="**Merci de mettre votre disponibilité pour l'évènement!**\n"
            "Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)",
            color=discord.Color.orange(),
        )

        embed.add_field(
            name="📊 Statistiques",
            value=f"✅ Ont répondu: **{event.get_reaction_count()}**\n"
            f"❌ Manquants: **{event.missing_users_count}**\n"
            f"👥 Total joueurs: **{event.get_total_users_count()}**",
            inline=False,
        )

        embed.add_field(
            name="🔗 Lien vers l'évènement",
            value=(
                f"[**Cliquez ici pour voir le message**]"
                f"(https://discord.com/channels/{event.guild.guild_id}/"
                f"{event.channel_id}/{event.message_id})"
            ),
            inline=False,
        )

        if remaining > 0:
            footer_text = Messages.MENTION_LIMIT_EXCEEDED.format(remaining)
            if Settings.is_test_mode():
                footer_text += f" • {Settings.get_custom_footer_timestamp()}"
            embed.set_footer(text=footer_text)
        elif Settings.AUTO_DELETE_REMINDERS:
            # Add auto-deletion footer if no mention limit exceeded
            delete_delay_text = Settings.format_auto_delete_display(
                Settings.AUTO_DELETE_DELAY_HOURS
            )
            footer_text = f"🗑️ Ce message s'auto-détruira dans {delete_delay_text}"
            if Settings.is_test_mode():
                footer_text += f" • {Settings.get_custom_footer_timestamp()}"
            embed.set_footer(text=footer_text)

        # If we have both remaining mentions and auto-deletion, combine the messages
        if remaining > 0 and Settings.AUTO_DELETE_REMINDERS:
            delete_delay_text = Settings.format_auto_delete_display(
                Settings.AUTO_DELETE_DELAY_HOURS
            )
            combined_text = f"{Messages.MENTION_LIMIT_EXCEEDED.format(remaining)} • 🗑️ Auto-destruction dans {delete_delay_text}"
            if Settings.is_test_mode():
                combined_text += f" • {Settings.get_custom_footer_timestamp()}"
            embed.set_footer(text=combined_text)

        # Send the reminder with retry mechanism
        sent_message = await safe_send_message(channel, content=mentions, embed=embed)
        if not sent_message:
            logger.error(
                f"Failed to send reminder for event {event.message_id} to channel {channel.name}"
            )
            return 0

        # Schedule auto-deletion if enabled
        auto_delete_mgr = get_auto_delete_manager()
        if auto_delete_mgr and Settings.AUTO_DELETE_REMINDERS:
            success = await auto_delete_mgr.schedule_deletion(sent_message)
            if success:
                logger.debug(
                    f"Scheduled auto-deletion for reminder message {sent_message.id} in "
                    f"{Settings.format_auto_delete_display(Settings.AUTO_DELETE_DELAY_HOURS)}"
                )
            else:
                logger.warning(
                    f"Failed to schedule auto-deletion for reminder message {sent_message.id}"
                )

        # Mark reminder as sent in database
        await sqlite_event_manager.mark_reminder_sent(event.message_id, len(users_to_mention))

        logger.info(f"Sent reminder for event {event.message_id} to {len(users_to_mention)} users")

        return len(users_to_mention)

    except Exception as e:
        logger.error(f"Unexpected error in send_reminder_sqlite for event {event.message_id}: {e}")
        # Update timestamp even on error to prevent retry loop
        try:
            await sqlite_event_manager.mark_reminder_sent(event.message_id, 0)
        except Exception as mark_error:
            logger.error(f"Failed to mark reminder as sent after error: {mark_error}")
        return 0


def set_bot_instance(bot_instance: commands.Bot) -> None:
    """Set the bot instance for the scheduler."""
    global bot
    bot = bot_instance


def get_scheduler_stats() -> dict:
    """Get scheduler statistics."""
    stats = {
        "scheduler_type": "SQLite",
        "task_active": _dynamic_reminder_task is not None and not _dynamic_reminder_task.done(),
        "database_available": False,
    }

    try:
        # Check database availability
        stats["database_available"] = True
        stats["total_events"] = Event.select().count()
        stats["active_events"] = Event.select().where(Event.is_paused == False).count()
    except Exception as e:
        stats["database_error"] = str(e)

    return stats
