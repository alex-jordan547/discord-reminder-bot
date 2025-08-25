"""
Discord command handlers for Discord Reminder Bot.

This module contains all Discord command implementations and related
functionality for managing event reminders.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

import discord
from discord.ext import commands

from commands.command_utils import create_health_embed, sync_slash_commands_logic
from config.settings import Messages, Settings
from models.reminder import Event
from utils.auto_delete import get_auto_delete_manager
from utils.concurrency import get_concurrency_stats
from utils.error_recovery import retry_stats, safe_fetch_message, safe_send_message
from utils.message_parser import extract_message_title, parse_message_link
from utils.permissions import get_permission_error_message, has_admin_permission
from utils.event_manager_adapter import event_manager_adapter as reminder_manager
from utils.validation import (
    ValidationError,
    get_validation_error_embed,
    safe_int_conversion,
    validate_message_id,
    validate_message_link,
)

# Get logger for this module
logger = logging.getLogger(__name__)

# Variable globale pour la tâche de vérification dynamique
_dynamic_reminder_task: Optional[asyncio.Task] = None

# Variable globale pour stocker la référence du bot
bot = None


async def schedule_next_reminder_check() -> None:
    """
    Planifie la prochaine vérification de rappel de manière dynamique
    en calculant le temps exact jusqu'au prochain rappel dû.
    Entre en mode veille si aucun rappel n'est surveillé.

    Cette version utilise le gestionnaire de rappels thread-safe.
    """
    global _dynamic_reminder_task

    # Annuler la tâche précédente si elle existe
    if _dynamic_reminder_task and not _dynamic_reminder_task.done():
        _dynamic_reminder_task.cancel()

    # Obtenir les rappels via le gestionnaire thread-safe
    reminders = reminder_manager.reminders

    if not reminders:
        logger.debug("No watched reminders - entering sleep mode (no periodic checks)")
        print("😴 Mode veille: Aucun rappel surveillé, arrêt des vérifications périodiques")
        return

    # Vérifier s'il y a des rappels dus maintenant (en retard)
    current_time = datetime.now()
    overdue_reminders = []
    next_reminder_times = []

    for reminder in reminders.values():
        if not reminder.is_paused:
            next_time = reminder.get_next_reminder_time()
            time_diff = (current_time - next_time).total_seconds()

            logger.debug(
                f"Reminder {reminder.message_id}: next_time={next_time.strftime('%H:%M:%S')}, "
                f"current={current_time.strftime('%H:%M:%S')}, diff={time_diff:.1f}s"
            )

            if next_time <= current_time:
                # Rappel en retard - doit être traité immédiatement
                overdue_reminders.append(reminder)
                logger.debug(
                    f"Added reminder {reminder.message_id} to overdue list "
                    f"(overdue by {time_diff:.1f}s)"
                )
            else:
                # Rappel futur - ajouter à la planification
                next_reminder_times.append(next_time)
                logger.debug(
                    f"Added reminder {reminder.message_id} to future list "
                    f"(due in {-time_diff:.1f}s)"
                )

    # Si il y a des rappels en retard, les traiter immédiatement
    if overdue_reminders:
        logger.info(
            f"Found {len(overdue_reminders)} overdue reminder(s), " "processing immediately..."
        )
        print(
            f"🚨 {len(overdue_reminders)} rappel(s) en retard détecté(s), " "traitement immédiat..."
        )

        # Traiter immédiatement les rappels en retard sans replanification automatique
        _dynamic_reminder_task = asyncio.create_task(
            check_reminders_dynamic(reschedule_after=False)
        )
        try:
            await _dynamic_reminder_task
        except asyncio.CancelledError:
            logger.debug("Overdue reminder check cancelled (likely due to rescheduling)")
            pass
        # Après traitement des rappels en retard, programmer normalement
        await schedule_next_reminder_check()
        return

    # Si pas de rappels en retard mais des rappels futurs, planifier normalement
    if not next_reminder_times:
        logger.debug("All reminders are paused - entering sleep mode")
        print("😴 Mode veille: Tous les rappels sont en pause")
        return

    # Calculer le temps jusqu'au prochain rappel
    next_reminder = min(next_reminder_times)
    time_until_next = (next_reminder - current_time).total_seconds()

    # Ajouter une petite marge pour éviter les problèmes de timing (5 secondes)
    time_until_next = max(5, time_until_next - 5)

    # Limiter à un maximum pour éviter les attentes trop longues
    max_wait = 300 if Settings.is_test_mode() else 1800  # 5 min en test, 30 min en prod
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


async def check_reminders_dynamic(reschedule_after: bool = True) -> None:
    """
    Vérification dynamique des rappels avec planification automatique
    de la prochaine vérification.

    Cette version utilise le gestionnaire de rappels thread-safe.

    Args:
        reschedule_after: Si True, replanifie automatiquement la prochaine vérification
    """
    logger.debug("Dynamic reminder check triggered...")

    # Obtenir les rappels dus via le gestionnaire thread-safe
    due_reminders = await reminder_manager.get_due_reminders()

    if not due_reminders:
        all_reminders = reminder_manager.reminders
        if not all_reminders:
            logger.debug("No reminders to check - entering sleep mode")
            print("😴 Aucun rappel à vérifier - entrée en mode veille")
            return
        else:
            logger.debug(f"No reminders due yet. Checked {len(all_reminders)} reminders.")

    total_reminded = 0

    for reminder in due_reminders:
        logger.info(
            f"Reminder due for message {reminder.message_id} "
            f"(interval: {reminder.interval_minutes}min)"
        )

        guild = bot.get_guild(reminder.guild_id)
        if not guild:
            logger.warning(
                f"Guild {reminder.guild_id} not found for reminder {reminder.message_id}"
            )
            continue

        # Déterminer où envoyer le rappel
        if Settings.USE_SEPARATE_REMINDER_CHANNEL:
            reminder_channel = await get_or_create_reminder_channel(guild)
        else:
            reminder_channel = bot.get_channel(reminder.channel_id)

        if reminder_channel:
            count = await send_reminder(reminder, reminder_channel, bot)
            total_reminded += count
            await asyncio.sleep(Settings.REMINDER_DELAY_SECONDS)
        else:
            logger.error(f"Could not find reminder channel for message {reminder.message_id}")

    if total_reminded > 0:
        logger.info(f"Dynamic reminders sent: {total_reminded} people notified")
        print(f"✅ Rappels automatiques envoyés: {total_reminded} personnes notifiées")

    # Programmer la prochaine vérification seulement si demandé
    if reschedule_after:
        await schedule_next_reminder_check()


async def start_dynamic_reminder_system() -> None:
    """Démarre le système de planification dynamique des rappels thread-safe."""
    logger.info("Starting dynamic reminder scheduling system with thread-safety")
    print("🎯 Système de planification dynamique des rappels activé (thread-safe)")

    # Charger les rappels depuis le stockage
    success = await reminder_manager.load_from_storage()
    if success:
        reminders = reminder_manager.reminders
        if reminders:
            print(
                f"🔍 Détection de {len(reminders)} rappel(s) surveillé(s) - "
                "planification en cours..."
            )
            await schedule_next_reminder_check()
        else:
            print("😴 Aucun rappel surveillé - système en mode veille")
            print("💡 Le système se réactivera automatiquement lors de l'ajout d'un rappel")
    else:
        logger.error("Failed to load reminders from storage")
        print("⚠️ Erreur lors du chargement des rappels - démarrage en mode vide")


def reschedule_reminders() -> None:
    """Replanifie les rappels après ajout/suppression d'un événement."""
    # Use the adapter to get the appropriate reschedule function
    from utils.event_manager_adapter import get_scheduler_functions
    _, reschedule_func, _ = get_scheduler_functions()
    
    # Call the appropriate reschedule function
    reschedule_func()


async def sync_slash_commands(ctx: commands.Context) -> None:
    """Synchronise manuellement les commandes slash avec Discord (commande de développement)."""
    if not has_admin_permission(ctx.author):
        await ctx.send(get_permission_error_message())
        return

    try:
        synced = await sync_slash_commands_logic(ctx.bot)
        await ctx.send(f"✅ {len(synced)} commande(s) slash synchronisée(s) avec Discord !")
        logger.info(f"Manual slash command sync: {len(synced)} commands")
    except Exception as e:
        await ctx.send(f"❌ Erreur lors de la synchronisation: {str(e)}")
        logger.error(f"Manual slash command sync failed: {e}")


async def send_error_to_user(channel_or_interaction, error: Exception, context: str = "") -> None:
    """Send a descriptive error message to the user."""
    # Handle database-specific errors
    if "database" in str(error).lower() or "sqlite" in str(error).lower():
        error_msg = f"❌ **Erreur de base de données**"
        if context:
            error_msg += f" lors de {context}"
        error_msg += f"\n💬 **Description**: Problème de connexion à la base de données"
        error_msg += f"\n🔧 **Action**: Veuillez réessayer dans quelques instants"
    elif "IntegrityError" in error.__class__.__name__:
        error_msg = f"❌ **Erreur de données**"
        if context:
            error_msg += f" lors de {context}"
        error_msg += f"\n💬 **Description**: Conflit de données (élément déjà existant)"
    else:
        error_msg = f"❌ **Erreur** ({error.__class__.__name__})"
        if context:
            error_msg += f" lors de {context}"
        error_msg += f"\n💬 **Description**: {str(error)}"

    logger.error(f"Error in {context}: {error}")

    try:
        if hasattr(channel_or_interaction, "response"):  # Discord interaction
            if channel_or_interaction.response.is_done():
                await channel_or_interaction.followup.send(error_msg, ephemeral=True)
            else:
                await channel_or_interaction.response.send_message(error_msg, ephemeral=True)
        else:  # Discord channel
            await channel_or_interaction.send(error_msg)
    except Exception as send_error:
        logger.error(f"Failed to send error message to user: {send_error}")


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


async def send_reminder(
    reminder: Event, channel: discord.TextChannel, bot_instance: commands.Bot
) -> int:
    """Send a reminder for a specific event."""
    try:
        # Get the original event message to update reactions
        event_channel = bot_instance.get_channel(reminder.channel_id)
        if not event_channel:
            logger.error(f"Could not find event channel {reminder.channel_id}")
            return 0

        message = await safe_fetch_message(event_channel, reminder.message_id)
        if not message:
            logger.error(
                "Could not fetch message {} from channel {}".format(
                    reminder.message_id, reminder.channel_id
                )
            )
            # Message supprimé - supprimer automatiquement ce rappel de la surveillance
            logger.warning(
                "Message {} appears to have been deleted, removing reminder from watch list".format(
                    reminder.message_id
                )
            )
            success = await reminder_manager.remove_reminder(reminder.message_id)
            if success:
                logger.info(
                    "Successfully removed deleted message {} from reminder surveillance".format(
                        reminder.message_id
                    )
                )
                print(
                    "🗑️ Rappel supprimé automatiquement - message {} introuvable".format(
                        reminder.message_id
                    )
                )
            else:
                logger.error(
                    "Failed to remove deleted message {} from reminder surveillance".format(
                        reminder.message_id
                    )
                )
            return 0

        # Update the list of users who have reacted
        reminder.users_who_reacted.clear()
        for reaction in message.reactions:
            if reaction.emoji in reminder.required_reactions:
                async for user in reaction.users():
                    if not user.bot:
                        reminder.users_who_reacted.add(user.id)

        # Update the reminder's user list to reflect current server state
        await reminder.update_accessible_users(bot_instance)

        # Identify missing users (only from those who can access the channel)
        missing_users = reminder.get_missing_users()

        if not missing_users:
            logger.debug(f"No missing users for event {reminder.message_id}")
            return 0

        # Limit mentions to avoid spam
        users_to_mention = list(missing_users)[: Settings.MAX_MENTIONS_PER_REMINDER]
        remaining = len(missing_users) - len(users_to_mention)

        # Build the reminder message
        mentions = " ".join([f"<@{user_id}>" for user_id in users_to_mention])

        embed = discord.Embed(
            title=f"🔔 Rappel: {reminder.title[:Settings.MAX_TITLE_LENGTH]}",
            description="**Merci de mettre votre disponibilité pour l'évènement!**\n"
            "Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)",
            color=discord.Color.orange(),
            # Supprimé: timestamp=datetime.now() pour éviter le double affichage
        )

        embed.add_field(
            name="📊 Statistiques",
            value=f"✅ Ont répondu: **{reminder.get_response_count()}**\n"
            f"❌ Manquants: **{reminder.get_missing_count()}**\n"
            f"👥 Total joueurs: **{reminder.get_total_users_count()}**",
            inline=False,
        )

        embed.add_field(
            name="🔗 Lien vers l'évènement",
            value=(
                f"[**Cliquez ici pour voir le message**]"
                f"(https://discord.com/channels/{reminder.guild_id}/"
                f"{reminder.channel_id}/{reminder.message_id})"
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
                f"Failed to send reminder for event {reminder.message_id} to "
                f"channel {channel.name}"
            )
            return 0

        # Schedule auto-deletion if enabled
        auto_delete_mgr = get_auto_delete_manager()
        logger.debug(
            f"Auto-delete manager available: {auto_delete_mgr is not None}, "
            f"AUTO_DELETE_REMINDERS: {Settings.AUTO_DELETE_REMINDERS}"
        )
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
        elif not auto_delete_mgr:
            logger.warning("Auto-delete manager is not available")
        elif not Settings.AUTO_DELETE_REMINDERS:
            logger.debug("Auto-deletion is disabled in settings")

        # Update reminder timestamp
        reminder.last_reminder = datetime.now()
        await reminder_manager.save()

        logger.info(
            f"Sent reminder for event {reminder.message_id} to " f"{len(users_to_mention)} users"
        )

        return len(users_to_mention)

    except Exception as e:
        logger.error(f"Unexpected error in send_reminder for event {reminder.message_id}: {e}")
        # Update timestamp even on error to prevent retry loop
        reminder.last_reminder = datetime.now()
        await reminder_manager.save()
        return 0


def setup_bot_handlers(bot_instance: commands.Bot) -> None:
    """
    Set up bot handlers and commands.
    """
    global bot
    bot = bot_instance

    @bot.command(name="watch")
    async def watch_event(
        ctx: commands.Context, message_link: str, interval_minutes: int = 60
    ) -> None:
        """Add an event message to watch for availability responses."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        original_interval = interval_minutes
        validated_interval = Settings.validate_interval_minutes(interval_minutes)
        interval_adjusted = validated_interval != original_interval

        try:
            if not isinstance(interval_minutes, (int, float)) or interval_minutes <= 0:
                raise ValidationError("❌ L'intervalle doit être un nombre positif")
        except ValidationError as e:
            embed = get_validation_error_embed(e, "Erreur d'intervalle")
            await ctx.send(embed=embed)
            return

        try:
            link_info = await validate_message_link(bot, message_link, ctx.author)
        except ValidationError as e:
            embed = get_validation_error_embed(e, "Erreur de lien")
            await ctx.send(embed=embed)
            return

        if link_info.guild_id != ctx.guild.id:
            await ctx.send(Messages.WRONG_SERVER)
            return

        try:
            channel = bot.get_channel(link_info.channel_id)
            if not channel:
                await ctx.send(Messages.CHANNEL_NOT_FOUND)
                return

            message = await safe_fetch_message(channel, link_info.message_id)
            if not message:
                await ctx.send(Messages.MESSAGE_NOT_FOUND)
                return

            title = extract_message_title(message.content, Settings.MAX_TITLE_LENGTH)
            if title == "Événement sans titre":
                title = f"Événement #{link_info.message_id}"

            reminder = Event(
                link_info.message_id,
                link_info.channel_id,
                link_info.guild_id,
                title,
                validated_interval,
                Settings.DEFAULT_REACTIONS,
            )

            guild = ctx.guild
            accessible_users = set()
            for member in guild.members:
                if not member.bot:
                    permissions = channel.permissions_for(member)
                    if permissions.view_channel and permissions.send_messages:
                        accessible_users.add(member.id)

            reminder.all_users = accessible_users

            for reaction in message.reactions:
                if reaction.emoji in reminder.required_reactions:
                    async for user in reaction.users():
                        if not user.bot:
                            reminder.users_who_reacted.add(user.id)

            success = await reminder_manager.add_reminder(reminder)
            if not success:
                await ctx.send("❌ Erreur lors de l'ajout de l'événement à surveiller.")
                return

            reschedule_reminders()

            embed = discord.Embed(
                title=Messages.EVENT_ADDED, color=discord.Color.green(), timestamp=datetime.now()
            )
            embed.add_field(name="📌 Événement", value=title, inline=False)
            embed.add_field(
                name="⏰ Intervalle",
                value=Settings.format_interval_display(validated_interval),
                inline=True,
            )
            embed.add_field(
                name="✅ Ont répondu", value=str(reminder.get_response_count()), inline=True
            )
            embed.add_field(
                name="❌ Manquants", value=str(reminder.get_missing_count()), inline=True
            )
            embed.add_field(
                name="👥 Total", value=str(reminder.get_total_users_count()), inline=True
            )

            if interval_adjusted:
                if Settings.is_test_mode():
                    embed.add_field(
                        name="⚠️ Intervalle ajusté (Mode Test)",
                        value=f"L'intervalle demandé ({original_interval} min) a été ajusté à {validated_interval} min (limite test: 1-10080 min)",
                        inline=False,
                    )
                else:
                    embed.add_field(
                        name="⚠️ Intervalle ajusté",
                        value=f"L'intervalle demandé ({original_interval} min) a été ajusté à {validated_interval} min (limite: {Settings.MIN_INTERVAL_MINUTES}-{Settings.MAX_INTERVAL_MINUTES} min)",
                        inline=False,
                    )

            await ctx.send(embed=embed)
            logger.info(
                "Added event {} to watch list on guild {} with {}min interval (original: {})".format(
                    link_info.message_id, ctx.guild.id, validated_interval, original_interval
                )
            )

        except Exception as e:
            await send_error_to_user(ctx, e, "l'ajout de l'événement à la surveillance")

    @bot.command(name="unwatch")
    async def unwatch_event(ctx: commands.Context, message: str) -> None:
        """Remove a message from the watch list."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        link_info = parse_message_link(message)
        if link_info:
            try:
                validate_message_id(link_info.message_id)
                message_id = link_info.message_id
            except ValidationError as e:
                embed = get_validation_error_embed(e, "Erreur d'ID de message")
                await ctx.send(embed=embed)
                return
        else:
            try:
                message_id = safe_int_conversion(message, "ID du message")
                validate_message_id(message_id)
            except ValidationError as e:
                embed = get_validation_error_embed(e, "Erreur d'ID de message")
                await ctx.send(embed=embed)
                return

        reminder = await reminder_manager.get_reminder(message_id)
        if reminder:
            title = reminder.title
            success = await reminder_manager.remove_reminder(message_id)
            if not success:
                await ctx.send("❌ Erreur lors de la suppression de l'événement.")
                return

            reschedule_reminders()
            await ctx.send(Messages.EVENT_REMOVED.format(title))
            logger.info(f"Removed event {message_id} from watch list")
        else:
            await ctx.send(Messages.EVENT_NOT_WATCHED)

    @bot.command(name="list")
    async def list_events(ctx: commands.Context) -> None:
        """List all watched events on this server."""
        server_events = await reminder_manager.get_guild_reminders(ctx.guild.id)

        if not server_events:
            await ctx.send(Messages.NO_WATCHED_EVENTS)
            return

        embed = discord.Embed(
            title=f"📋 Évènements surveillés sur {ctx.guild.name}",
            color=discord.Color.blue(),
            timestamp=datetime.now(),
        )

        for event_id, reminder in server_events.items():
            # Update user counts to reflect current server state
            await reminder.update_accessible_users(bot)

            channel = bot.get_channel(reminder.channel_id)
            channel_mention = f"<#{reminder.channel_id}>" if channel else "Canal inconnu"

            embed.add_field(
                name=reminder.title[:100],
                value=(
                    f"📍 {channel_mention}\n"
                    f"⏰ Intervalle: {Settings.format_interval_display(reminder.interval_minutes)}\n"
                    f"✅ Réponses: {reminder.get_response_count()}/"
                    f"{reminder.get_total_users_count()} ("
                    f"{reminder.get_response_percentage():.1f}%)\n"
                    f"📅 Prochain: {reminder.get_next_reminder_display()}\n"
                    f"🔗 [Lien](https://discord.com/channels/"
                    f"{reminder.guild_id}/{reminder.channel_id}/{event_id})"
                ),
                inline=False,
            )

        embed.set_footer(text=f"Total: {len(server_events)} événement(s) surveillé(s)")
        await ctx.send(embed=embed)

    # Add other commands similarly...
    @bot.command(name="remind")
    async def manual_remind(ctx: commands.Context, message: Optional[str] = None) -> None:
        """Send a manual reminder for a specific event or all events on the server."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        if message:
            link_info = parse_message_link(message)
            if link_info:
                try:
                    validate_message_id(link_info.message_id)
                    message_id = link_info.message_id
                except ValidationError as e:
                    embed = get_validation_error_embed(e, "Erreur d'ID de message")
                    await ctx.send(embed=embed)
                    return
            else:
                try:
                    message_id = safe_int_conversion(message, "ID du message")
                    validate_message_id(message_id)
                except ValidationError as e:
                    embed = get_validation_error_embed(e, "Erreur d'ID de message")
                    await ctx.send(embed=embed)
                    return

            reminder = await reminder_manager.get_reminder(message_id)
            if not reminder:
                await ctx.send(Messages.EVENT_NOT_WATCHED)
                return
            if reminder.guild_id != ctx.guild.id:
                await ctx.send(Messages.EVENT_NOT_ON_SERVER)
                return
            events_to_remind = {message_id: reminder}
        else:
            events_to_remind = await reminder_manager.get_guild_reminders(ctx.guild.id)

        if not events_to_remind:
            await ctx.send(Messages.NO_EVENTS_TO_REMIND)
            return

        reminder_channel = await get_or_create_reminder_channel(ctx.guild)
        total_reminded = 0

        for event_id, reminder in events_to_remind.items():
            if not reminder_channel:
                reminder_channel = bot.get_channel(reminder.channel_id)

            if reminder_channel:
                count = await send_reminder(reminder, reminder_channel, bot)
                total_reminded += count
                await asyncio.sleep(Settings.REMINDER_DELAY_SECONDS)

        await ctx.send(Messages.REMINDER_SENT.format(total_reminded))

    @bot.event
    async def on_reaction_add(reaction: discord.Reaction, user: discord.User) -> None:
        """Handle reaction add events with thread-safety and debouncing."""
        if user.bot:
            return

        message_id = reaction.message.id
        reminder = await reminder_manager.get_reminder(message_id)
        if not reminder:
            return

        if reaction.emoji not in reminder.required_reactions:
            return

        try:
            await reminder_manager.schedule_reaction_update_debounced(message_id, bot)
            logger.debug(
                f"Scheduled reaction update for message {message_id} "
                f"(user {user.id} added {reaction.emoji})"
            )
        except Exception as e:
            logger.error(f"Error scheduling reaction update for message {message_id}: {e}")

    @bot.event
    async def on_reaction_remove(reaction: discord.Reaction, user: discord.User) -> None:
        """Handle reaction remove events with thread-safety and debouncing."""
        if user.bot:
            return

        message_id = reaction.message.id
        reminder = await reminder_manager.get_reminder(message_id)
        if not reminder:
            return

        if reaction.emoji not in reminder.required_reactions:
            return

        try:
            await reminder_manager.schedule_reaction_update_debounced(message_id, bot)
            logger.debug(
                f"Scheduled reaction update for message {message_id} "
                f"(user {user.id} removed {reaction.emoji})"
            )
        except Exception as e:
            logger.error(f"Error scheduling reaction update for message {message_id}: {e}")

    # Health check and other admin commands
    @bot.command(name="health")
    async def health_check(ctx: commands.Context) -> None:
        """Affiche les statistiques de santé et de récupération d'erreurs du bot avec informations de concurrence."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        retry_stats_data = retry_stats.get_summary()
        embed = create_health_embed(retry_stats_data)

        concurrency_stats_data = get_concurrency_stats()
        reminder_stats = reminder_manager.get_stats()

        concurrency_text = (
            f"🔒 Acquisitions de verrous: {concurrency_stats_data.get('lock_acquisitions', 0)}\n"
            f"🔄 Mises à jour de réactions: {concurrency_stats_data.get('reaction_updates_processed', 0)}\n"
            f"⏱️ Mises à jour avec debouncing: {concurrency_stats_data.get('reaction_updates_debounced', 0)}\n"
            f"💾 Opérations de sauvegarde: {concurrency_stats_data.get('save_operations', 0)}\n"
            f"⚠️ Conflits détectés: {concurrency_stats_data.get('concurrent_conflicts', 0)}"
        )

        embed.add_field(name="📊 Statistiques de Concurrence", value=concurrency_text, inline=False)

        reminder_text = (
            f"📋 Total rappels: {reminder_stats.get('total_reminders', 0)}\n"
            f"✅ Rappels actifs: {reminder_stats.get('active_reminders', 0)}\n"
            f"⏸️ Rappels en pause: {reminder_stats.get('paused_reminders', 0)}\n"
            f"🏰 Serveurs avec rappels: {reminder_stats.get('guilds_with_reminders', 0)}\n"
            f"📈 Moyenne/serveur: {reminder_stats.get('average_reminders_per_guild', 0):.1f}"
        )

        embed.add_field(name="🎯 Statistiques des Rappels", value=reminder_text, inline=False)

        embed.set_footer(text="Utilisez !health reset pour remettre à zéro les statistiques")
        await ctx.send(embed=embed)

    @bot.command(name="sync")
    async def sync_commands(ctx: commands.Context) -> None:
        """Synchronise les commandes slash avec Discord (commande de développement)."""
        await sync_slash_commands(ctx)

    @bot.command(name="db_status")
    async def db_status_cmd(ctx: commands.Context) -> None:
        """Show database status and statistics."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        try:
            from utils.event_manager_adapter import get_backend_info, event_manager_adapter
            
            # Get backend information
            backend_info = get_backend_info()
            stats = event_manager_adapter.get_stats()
            
            embed = discord.Embed(
                title="📊 Statut de la Base de Données",
                color=discord.Color.blue(),
                timestamp=datetime.now(),
            )
            
            # Backend information
            embed.add_field(
                name="🔧 Type de Backend",
                value=f"**{backend_info['backend_type']}**",
                inline=True,
            )
            
            if backend_info['backend_type'] == 'SQLite':
                embed.add_field(
                    name="💾 Base de Données",
                    value=backend_info.get('database_path', 'N/A'),
                    inline=True,
                )
                
                if 'database_size' in backend_info:
                    embed.add_field(
                        name="📏 Taille",
                        value=f"{backend_info['database_size']} MB",
                        inline=True,
                    )
            
            # Statistics
            embed.add_field(
                name="📈 Statistiques",
                value=f"**Total événements**: {stats['total_events']}\n"
                      f"**Événements actifs**: {stats['active_events']}\n"
                      f"**Événements en pause**: {stats['paused_events']}\n"
                      f"**Serveurs avec événements**: {stats['guilds_with_events']}",
                inline=False,
            )
            
            # Performance info for SQLite
            if backend_info['backend_type'] == 'SQLite':
                try:
                    from utils.concurrency_sqlite import sqlite_concurrency_stats
                    concurrency_stats = sqlite_concurrency_stats.get_stats()
                    
                    embed.add_field(
                        name="⚡ Performance SQLite",
                        value=f"**Transactions traitées**: {concurrency_stats.get('transactions_processed', 0)}\n"
                              f"**Mises à jour de réactions**: {concurrency_stats.get('reaction_updates_processed', 0)}\n"
                              f"**Opérations en attente**: {concurrency_stats.get('pending_operations', 0)}",
                        inline=False,
                    )
                except Exception as e:
                    embed.add_field(
                        name="⚠️ Performance",
                        value=f"Impossible de récupérer les statistiques: {e}",
                        inline=False,
                    )
            
            await ctx.send(embed=embed)
            
        except Exception as e:
            await send_error_to_user(ctx, e, "la récupération du statut de la base de données")

    @bot.command(name="db_optimize")
    async def db_optimize_cmd(ctx: commands.Context) -> None:
        """Optimize the SQLite database."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        try:
            from utils.event_manager_adapter import get_backend_info
            backend_info = get_backend_info()
            
            if backend_info['backend_type'] != 'SQLite':
                await ctx.send("❌ L'optimisation n'est disponible que pour les bases de données SQLite.")
                return
            
            # Send initial message
            message = await ctx.send("🔄 Optimisation de la base de données en cours...")
            
            # Perform SQLite optimization
            from persistence.database import get_database
            database = get_database()
            
            # Run VACUUM to optimize database
            database.execute_sql('VACUUM;')
            
            # Run ANALYZE to update statistics
            database.execute_sql('ANALYZE;')
            
            # Get updated size info
            updated_info = get_backend_info()
            
            embed = discord.Embed(
                title="✅ Optimisation Terminée",
                description="La base de données SQLite a été optimisée avec succès.",
                color=discord.Color.green(),
                timestamp=datetime.now(),
            )
            
            if 'database_size' in updated_info:
                embed.add_field(
                    name="📏 Nouvelle Taille",
                    value=f"{updated_info['database_size']} MB",
                    inline=True,
                )
            
            embed.add_field(
                name="🔧 Opérations Effectuées",
                value="• VACUUM (compactage)\n• ANALYZE (mise à jour des statistiques)",
                inline=False,
            )
            
            await message.edit(content=None, embed=embed)
            logger.info(f"Database optimization completed by {ctx.author}")
            
        except Exception as e:
            await send_error_to_user(ctx, e, "l'optimisation de la base de données")

    @bot.command(name="db_backup")
    async def db_backup_cmd(ctx: commands.Context) -> None:
        """Create a backup of the database."""
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        try:
            from utils.event_manager_adapter import get_backend_info
            backend_info = get_backend_info()
            
            if backend_info['backend_type'] != 'SQLite':
                await ctx.send(
                    "❌ La sauvegarde automatique n'est disponible que pour SQLite.\n"
                    "Pour JSON, les fichiers sont déjà sauvegardés automatiquement."
                )
                return
            
            # Send initial message
            message = await ctx.send("🔄 Création de la sauvegarde en cours...")
            
            # Create backup
            import shutil
            import os
            
            db_path = backend_info.get('database_path', 'discord_bot.db')
            backup_dir = 'data/backups'
            
            # Ensure backup directory exists
            os.makedirs(backup_dir, exist_ok=True)
            
            # Create backup filename with timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_filename = f"discord_bot_backup_{timestamp}.db"
            backup_path = os.path.join(backup_dir, backup_filename)
            
            # Copy database file
            shutil.copy2(db_path, backup_path)
            
            # Get backup file size
            backup_size = os.path.getsize(backup_path) / (1024 * 1024)  # MB
            
            embed = discord.Embed(
                title="✅ Sauvegarde Créée",
                description=f"La base de données a été sauvegardée avec succès.",
                color=discord.Color.green(),
                timestamp=datetime.now(),
            )
            
            embed.add_field(
                name="📁 Fichier de Sauvegarde",
                value=f"`{backup_filename}`",
                inline=False,
            )
            
            embed.add_field(
                name="📏 Taille",
                value=f"{backup_size:.2f} MB",
                inline=True,
            )
            
            embed.add_field(
                name="📍 Emplacement",
                value=f"`{backup_path}`",
                inline=False,
            )
            
            await message.edit(content=None, embed=embed)
            logger.info(f"Database backup created: {backup_path} by {ctx.author}")
            
        except Exception as e:
            await send_error_to_user(ctx, e, "la création de la sauvegarde")

    # Set up event manager adapter for the bot
    from utils.event_manager_adapter import setup_event_manager_for_bot
    setup_event_manager_for_bot(bot)

    # Register slash commands
    from commands.slash_commands import register_slash_commands

    register_slash_commands(bot)

    logger.info("Registered all commands and configured reminder manager")
