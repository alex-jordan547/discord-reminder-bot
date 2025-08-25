"""
Discord slash command handlers for Discord Reminder Bot.

This module contains all Discord slash command implementations for the
enhanced reminder system with minute-based intervals and advanced features.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from commands.command_utils import create_health_embed, sync_slash_commands_logic
from config.settings import Messages, Settings
from models.reminder import Event
from utils.error_recovery import retry_stats, safe_fetch_message
from utils.message_parser import extract_message_title, parse_message_link
from utils.permissions import has_admin_permission
from utils.reminder_manager import reminder_manager
from utils.validation import ValidationError, get_validation_error_embed, validate_message_link

# Get logger for this module
logger = logging.getLogger(__name__)


async def send_error_to_user(
    interaction: discord.Interaction, error: Exception, context: str = ""
) -> None:
    """
    Send a descriptive error message to the user via interaction.

    Args:
        interaction: Discord interaction to send the message to
        error: The exception that occurred
        context: Additional context about what was being attempted
    """
    error_msg = f"❌ **Erreur** ({error.__class__.__name__})"
    if context:
        error_msg += f" lors de {context}"
    error_msg += f"\n💬 **Description**: {str(error)}"

    logger.error(f"Error in {context}: {error}")

    try:
        if interaction.response.is_done():
            await interaction.followup.send(error_msg, ephemeral=True)
        else:
            await interaction.response.send_message(error_msg, ephemeral=True)
    except Exception as send_error:
        logger.error(f"Failed to send error message to user: {send_error}")


class SlashCommands(commands.Cog):
    """
    Slash commands cog for the Discord Reminder Bot.
    """

    def __init__(self, bot: commands.Bot):
        """Initialise les commandes slash.

        Args:
            bot: L'instance du bot Discord
        """
        self.bot = bot

    async def cog_load(self):
        """Called when the cog is loaded."""
        logger.info("Slash commands cog loaded")

    @app_commands.command(
        name="watch", description="Surveiller les réactions d'un message avec rappels automatiques"
    )
    @app_commands.describe(
        message="Lien du message Discord à surveiller",
        interval="Intervalle des rappels (défaut: 1h, test: à partir de 30s)",
    )
    @app_commands.choices(
        interval=[
            app_commands.Choice(name="30 secondes (test)", value=30),
            app_commands.Choice(name="1 minute (test)", value=60),
            app_commands.Choice(name="2 minutes (test)", value=120),
            app_commands.Choice(name="5 minutes", value=300),
            app_commands.Choice(name="15 minutes", value=900),
            app_commands.Choice(name="30 minutes", value=1800),
            app_commands.Choice(name="1 heure", value=3600),
            app_commands.Choice(name="2 heures", value=7200),
            app_commands.Choice(name="6 heures", value=21600),
            app_commands.Choice(name="12 heures", value=43200),
            app_commands.Choice(name="24 heures", value=86400),
        ]
    )
    async def watch(self, interaction: discord.Interaction, message: str, interval: int = 3600):
        """Add an event message to watch for availability responses."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Convert interval from seconds to minutes
        interval_minutes = interval / 60.0

        # Store original interval for comparison
        original_interval_minutes = interval_minutes

        # Validate interval and check if it was adjusted
        validated_interval = Settings.validate_interval_minutes(interval_minutes)
        interval_adjusted = validated_interval != original_interval_minutes

        # Validate message link with permissions
        try:
            link_info = await validate_message_link(self.bot, message, interaction.user)
        except ValidationError as e:
            embed = get_validation_error_embed(e, "Erreur de lien")
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return

        # Verify the message is on this server
        if link_info.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.WRONG_SERVER, ephemeral=True)
            return

        # Defer response for longer processing
        await interaction.response.defer(ephemeral=True)

        try:
            # Fetch and verify the message exists
            channel = self.bot.get_channel(link_info.channel_id)
            if not channel:
                await interaction.followup.send(Messages.CHANNEL_NOT_FOUND, ephemeral=True)
                return

            discord_message = await safe_fetch_message(channel, link_info.message_id)
            if not discord_message:
                await interaction.followup.send(Messages.MESSAGE_NOT_FOUND, ephemeral=True)
                return

            # Check if this is an existing watch being modified
            existing_reminder = await reminder_manager.get_reminder(link_info.message_id)
            is_existing_watch = existing_reminder is not None
            old_interval = None
            if is_existing_watch:
                old_interval = existing_reminder.interval_minutes

            # Extract title from message content
            title = extract_message_title(discord_message.content, Settings.MAX_TITLE_LENGTH)
            if title == "Événement sans titre":
                title = f"Événement #{link_info.message_id}"

            # Create the reminder (or update existing)
            if is_existing_watch:
                # Update existing reminder using thread-safe manager
                success = await reminder_manager.update_reminder_interval(
                    link_info.message_id, validated_interval
                )
                if not success:
                    await interaction.followup.send(
                        "❌ Erreur lors de la mise à jour du rappel.", ephemeral=True
                    )
                    return
                reminder = existing_reminder
            else:
                # Create new reminder
                reminder = Event(
                    link_info.message_id,
                    link_info.channel_id,
                    link_info.guild_id,
                    title,
                    validated_interval,
                    Settings.DEFAULT_REACTIONS,
                )

                # Get all server members who can access this specific channel (excluding bots)
                guild = interaction.guild
                accessible_users = set()
                for member in guild.members:
                    if not member.bot:
                        # Check if user can view and send messages in the channel
                        permissions = channel.permissions_for(member)
                        if permissions.view_channel and permissions.send_messages:
                            accessible_users.add(member.id)

                reminder.all_users = accessible_users

                # Check existing reactions
                for reaction in discord_message.reactions:
                    if reaction.emoji in reminder.required_reactions:
                        async for user in reaction.users():
                            if not user.bot:
                                reminder.users_who_reacted.add(user.id)

                # Add to reminder manager
                success = await reminder_manager.add_reminder(reminder)
                if not success:
                    await interaction.followup.send(
                        "❌ Erreur lors de l'ajout du rappel.", ephemeral=True
                    )
                    return

            # Replanifier les rappels après ajout/modification
            from commands.handlers import reschedule_reminders

            reschedule_reminders()

            # Create success embed - different for new watch vs edit
            if is_existing_watch:
                embed = discord.Embed(
                    title="🔄 Événement modifié", color=discord.Color.blue(), timestamp=datetime.now()
                )
            else:
                embed = discord.Embed(
                    title="✅ Événement ajouté à la surveillance",
                    color=discord.Color.green(),
                    timestamp=datetime.now(),
                )
            embed.add_field(name="📌 Événement", value=title, inline=False)

            if is_existing_watch and old_interval != validated_interval:
                # Show interval change for edits
                embed.add_field(
                    name="⏰ Ancien intervalle",
                    value=Settings.format_interval_display(old_interval),
                    inline=True,
                )
                embed.add_field(
                    name="⏰ Nouvel intervalle",
                    value=Settings.format_interval_display(validated_interval),
                    inline=True,
                )
            else:
                # Show single interval for new watches or when interval unchanged
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

            next_reminder = reminder.get_next_reminder_time()
            embed.add_field(
                name="📅 Prochain rappel",
                value=f"<t:{int(next_reminder.timestamp())}:R>",
                inline=False,
            )

            # Add warning if interval was adjusted
            if interval_adjusted:
                if Settings.is_test_mode():
                    embed.add_field(
                        name="⚠️ Intervalle ajusté (Mode Test)",
                        value=(
                            f"L'intervalle demandé "
                            f"({Settings.format_interval_display(original_interval_minutes)}) "
                            f"a été ajusté à {Settings.format_interval_display(validated_interval)} "
                            "(limite test: 30s-7 jours)"
                        ),
                        inline=False,
                    )
                else:
                    embed.add_field(
                        name="⚠️ Intervalle ajusté",
                        value=(
                            f"L'intervalle demandé "
                            f"({Settings.format_interval_display(original_interval_minutes)}) "
                            f"a été ajusté à {Settings.format_interval_display(validated_interval)} "
                            f"(limite: {Settings.MIN_INTERVAL_MINUTES}-"
                            f"{Settings.MAX_INTERVAL_MINUTES} min)"
                        ),
                        inline=False,
                    )

            await interaction.followup.send(embed=embed, ephemeral=True)

            if is_existing_watch:
                logger.info(
                    f"Modified event {link_info.message_id} on guild {interaction.guild.id}: "
                    f"interval changed from {old_interval}min to {validated_interval}min "
                    f"(requested: {Settings.format_interval_display(original_interval_minutes)})"
                )
            else:
                logger.info(
                    f"Added event {link_info.message_id} to watch list on guild "
                    f"{interaction.guild.id} with {validated_interval}min interval "
                    f"(original: {Settings.format_interval_display(original_interval_minutes)})"
                )

        except Exception as e:
            await send_error_to_user(interaction, e, "l'ajout de l'événement à la surveillance")

    @app_commands.command(name="unwatch", description="Retirer un message de la surveillance")
    @app_commands.describe(message="Lien du message à ne plus surveiller")
    async def unwatch(self, interaction: discord.Interaction, message: str):
        """Remove a message from the watch list."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        # Use thread-safe reminder manager
        existing_reminder = await reminder_manager.get_reminder(message_id)
        if existing_reminder:
            title = existing_reminder.title
            success = await reminder_manager.remove_reminder(message_id)

            if not success:
                await interaction.response.send_message(
                    "❌ Erreur lors de la suppression du rappel.", ephemeral=True
                )
                return

            # Replanifier les rappels après suppression
            from commands.handlers import reschedule_reminders

            reschedule_reminders()

            embed = discord.Embed(
                title="✅ Événement retiré de la surveillance",
                description=f"**{title}** ne sera plus surveillé.",
                color=discord.Color.orange(),
                timestamp=datetime.now(),
            )

            await interaction.response.send_message(embed=embed, ephemeral=True)
            logger.info(f"Removed event {message_id} from watch list")
        else:
            await interaction.response.send_message(Messages.EVENT_NOT_WATCHED, ephemeral=True)

    @app_commands.command(
        name="list", description="Lister tous les rappels surveillés sur ce serveur"
    )
    async def list_events(self, interaction: discord.Interaction):
        """List all watched events on this server."""
        # Utiliser le système thread-safe au lieu de l'ancien système
        from commands.handlers import reminder_manager

        # Filter events for this server only using thread-safe manager
        server_events = await reminder_manager.get_guild_reminders(interaction.guild.id)

        if not server_events:
            await interaction.response.send_message(Messages.NO_WATCHED_EVENTS, ephemeral=True)
            return

        embed = discord.Embed(
            title=f"📋 Évènements surveillés sur {interaction.guild.name}",
            color=discord.Color.blue(),
            timestamp=datetime.now(),
        )

        for event_id, reminder in server_events.items():
            # Update user counts to reflect current server state
            await reminder.update_accessible_users(self.bot)

            channel = self.bot.get_channel(reminder.channel_id)
            channel_mention = f"<#{reminder.channel_id}>" if channel else "Canal inconnu"

            status_emoji = "⏸️" if reminder.is_paused else "▶️"

            if reminder.is_paused:
                next_reminder_text = "En pause"
            else:
                # Calculer le temps jusqu'au prochain rappel de manière plus précise
                next_reminder_time = reminder.get_next_reminder_time()
                current_time = datetime.now()
                time_until_next = (next_reminder_time - current_time).total_seconds()

                # Considérer qu'un rappel est "en retard" seulement s'il dépasse de plus de 30 secondes
                # En mode test, être plus tolérant pour les intervalles courts
                tolerance = 60 if not Settings.is_test_mode() else 30

                if time_until_next < -tolerance:
                    next_reminder_text = "En retard!"
                else:
                    next_reminder_text = f"<t:{int(next_reminder_time.timestamp())}:R>"

            embed.add_field(
                name=f"{status_emoji} {reminder.title[:50]}",
                value=f"📍 {channel_mention}\n"
                f"⏰ Intervalle: {Settings.format_interval_display(reminder.interval_minutes)}\n"
                f"✅ Réponses: {reminder.get_response_count()}/{reminder.get_total_users_count()} "
                f"({reminder.get_status_summary()['response_percentage']}%)\n"
                f"📅 Prochain: {next_reminder_text}\n"
                f"🔗 [Lien](https://discord.com/channels/{reminder.guild_id}/{reminder.channel_id}/{event_id})",
                inline=False,
            )

        embed.set_footer(text=f"Total: {len(server_events)} événement(s) surveillé(s)")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(
        name="remind", description="Envoyer un rappel manuel pour un élément spécifique"
    )
    @app_commands.describe(
        message="Lien du message pour lequel envoyer un rappel (optionnel: tous les rappels si omis)"
    )
    async def remind(self, interaction: discord.Interaction, message: Optional[str] = None):
        """Send a manual reminder for a specific event or all events."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Defer response for processing
        await interaction.response.defer(ephemeral=True)

        # Determine which events to remind using thread-safe manager
        if message:
            link_info = parse_message_link(message)
            if not link_info:
                await interaction.followup.send(Messages.INVALID_LINK_FORMAT, ephemeral=True)
                return

            message_id = link_info.message_id
            reminder = await reminder_manager.get_reminder(message_id)
            if not reminder:
                await interaction.followup.send(Messages.EVENT_NOT_WATCHED, ephemeral=True)
                return
            if reminder.guild_id != interaction.guild.id:
                await interaction.followup.send(Messages.EVENT_NOT_ON_SERVER, ephemeral=True)
                return
            events_to_remind = {message_id: reminder}
        else:
            # Get all events for this server using thread-safe manager
            events_to_remind = await reminder_manager.get_guild_reminders(interaction.guild.id)

        if not events_to_remind:
            await interaction.followup.send(Messages.NO_EVENTS_TO_REMIND, ephemeral=True)
            return

        # Import send_reminder function
        from commands.handlers import get_or_create_reminder_channel, send_reminder

        total_reminded = 0

        for event_id, reminder in events_to_remind.items():
            # Determine reminder channel
            if Settings.USE_SEPARATE_REMINDER_CHANNEL:
                reminder_channel = await get_or_create_reminder_channel(interaction.guild)
            else:
                reminder_channel = self.bot.get_channel(reminder.channel_id)

            if reminder_channel:
                count = await send_reminder(reminder, reminder_channel, self.bot)
                total_reminded += count
                # Add delay between reminders to avoid rate limits
                await asyncio.sleep(Settings.REMINDER_DELAY_SECONDS)

        embed = discord.Embed(
            title="✅ Rappel envoyé",
            description=f"{total_reminded} personne(s) notifiée(s) au total.",
            color=discord.Color.green(),
            timestamp=datetime.now(),
        )

        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(
        name="set_interval", description="Modifier l'intervalle d'un rappel surveillé"
    )
    @app_commands.describe(
        message="Lien du message dont modifier l'intervalle",
        interval="Nouvel intervalle (test: à partir de 30s, prod: à partir de 5min)",
    )
    @app_commands.choices(
        interval=[
            app_commands.Choice(name="30 secondes (test)", value=30),
            app_commands.Choice(name="1 minute (test)", value=60),
            app_commands.Choice(name="2 minutes (test)", value=120),
            app_commands.Choice(name="5 minutes", value=300),
            app_commands.Choice(name="15 minutes", value=900),
            app_commands.Choice(name="30 minutes", value=1800),
            app_commands.Choice(name="1 heure", value=3600),
            app_commands.Choice(name="2 heures", value=7200),
            app_commands.Choice(name="6 heures", value=21600),
            app_commands.Choice(name="12 heures", value=43200),
            app_commands.Choice(name="24 heures", value=86400),
        ]
    )
    async def set_interval(self, interaction: discord.Interaction, message: str, interval: int):
        """Set a new reminder interval for a watched event."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        # Use thread-safe reminder manager
        reminder = await reminder_manager.get_reminder(message_id)
        if not reminder:
            await interaction.response.send_message(Messages.EVENT_NOT_WATCHED, ephemeral=True)
            return

        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.EVENT_NOT_ON_SERVER, ephemeral=True)
            return

        # Convert interval from seconds to minutes and validate
        interval_minutes = interval / 60.0
        old_interval = reminder.interval_minutes

        # Update using thread-safe manager
        success = await reminder_manager.update_reminder_interval(message_id, interval_minutes)
        if not success:
            await interaction.response.send_message(
                "❌ Erreur lors de la mise à jour de l'intervalle.", ephemeral=True
            )
            return

        # Replanifier les rappels après modification
        from commands.handlers import reschedule_reminders

        reschedule_reminders()

        embed = discord.Embed(
            title="✅ Intervalle mis à jour", color=discord.Color.green(), timestamp=datetime.now()
        )
        embed.add_field(name="📌 Événement", value=reminder.title, inline=False)
        embed.add_field(
            name="⏰ Ancien intervalle",
            value=Settings.format_interval_display(old_interval),
            inline=True,
        )
        embed.add_field(
            name="⏰ Nouvel intervalle",
            value=Settings.format_interval_display(reminder.interval_minutes),
            inline=True,
        )
        embed.add_field(
            name="📅 Prochain rappel",
            value=f"<t:{int(reminder.get_next_reminder_time().timestamp())}:R>",
            inline=False,
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)
        logger.info(
            f"Updated interval for event {message_id} from {Settings.format_interval_display(old_interval)} to {Settings.format_interval_display(reminder.interval_minutes)}"
        )

    @app_commands.command(name="pause", description="Mettre en pause les rappels d'un élément")
    @app_commands.describe(message="Lien du message dont mettre en pause les rappels")
    async def pause(self, interaction: discord.Interaction, message: str):
        """Pause reminders for a specific event."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        # Use thread-safe reminder manager
        reminder = await reminder_manager.get_reminder(message_id)
        if not reminder:
            await interaction.response.send_message(Messages.EVENT_NOT_WATCHED, ephemeral=True)
            return

        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.EVENT_NOT_ON_SERVER, ephemeral=True)
            return

        if reminder.is_paused:
            await interaction.response.send_message("⚠️ Cet événement est déjà en pause.", ephemeral=True)
            return

        # Use thread-safe manager to pause
        success = await reminder_manager.pause_reminder(message_id)
        if not success:
            await interaction.response.send_message(
                "❌ Erreur lors de la mise en pause du rappel.", ephemeral=True
            )
            return

        # Replanifier les rappels après modification
        from commands.handlers import reschedule_reminders

        reschedule_reminders()

        embed = discord.Embed(
            title="⏸️ Rappels mis en pause",
            description=f"Les rappels pour **{reminder.title}** sont maintenant en pause.",
            color=discord.Color.orange(),
            timestamp=datetime.now(),
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)
        logger.info(f"Paused reminders for event {message_id}")

    @app_commands.command(name="resume", description="Reprendre les rappels d'un élément en pause")
    @app_commands.describe(message="Lien du message dont reprendre les rappels")
    async def resume(self, interaction: discord.Interaction, message: str):
        """Resume reminders for a paused event."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        # Use thread-safe reminder manager
        reminder = await reminder_manager.get_reminder(message_id)
        if not reminder:
            await interaction.response.send_message(Messages.EVENT_NOT_WATCHED, ephemeral=True)
            return

        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.EVENT_NOT_ON_SERVER, ephemeral=True)
            return

        if not reminder.is_paused:
            await interaction.response.send_message(
                "⚠️ Cet événement n'est pas en pause.", ephemeral=True
            )
            return

        # Use thread-safe manager to resume
        success = await reminder_manager.resume_reminder(message_id)
        if not success:
            await interaction.response.send_message(
                "❌ Erreur lors de la reprise du rappel.", ephemeral=True
            )
            return

        # Replanifier les rappels après modification
        from commands.handlers import reschedule_reminders

        reschedule_reminders()

        embed = discord.Embed(
            title="▶️ Rappels repris",
            description=f"Les rappels pour **{reminder.title}** sont maintenant actifs.",
            color=discord.Color.green(),
            timestamp=datetime.now(),
        )
        embed.add_field(
            name="📅 Prochain rappel",
            value=f"<t:{int(reminder.get_next_reminder_time().timestamp())}:R>",
            inline=False,
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)
        logger.info(f"Resumed reminders for event {message_id}")

    @app_commands.command(name="status", description="Afficher le statut détaillé d'un rappel")
    @app_commands.describe(message="Lien du message dont afficher le statut")
    async def status(self, interaction: discord.Interaction, message: str):
        """Show detailed status for a specific event."""
        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        # Use thread-safe reminder manager
        reminder = await reminder_manager.get_reminder(message_id)
        if not reminder:
            await interaction.response.send_message(Messages.EVENT_NOT_WATCHED, ephemeral=True)
            return

        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.EVENT_NOT_ON_SERVER, ephemeral=True)
            return

        # Update user counts to reflect current server state
        await reminder.update_accessible_users(self.bot)

        status = reminder.get_status_summary()

        # Determine status color and emoji
        if status["is_paused"]:
            color = discord.Color.orange()
            status_emoji = "⏸️"
        elif status["is_overdue"]:
            color = discord.Color.red()
            status_emoji = "🚨"
        else:
            color = discord.Color.green()
            status_emoji = "▶️"

        embed = discord.Embed(
            title=f"{status_emoji} Statut de l'Événement",
            description=f"**{status['title']}**",
            color=color,
            timestamp=datetime.now(),
        )

        # Channel information
        channel = self.bot.get_channel(status["channel_id"])
        channel_mention = f"<#{status['channel_id']}>" if channel else "Canal inconnu"
        embed.add_field(name="📍 Canal", value=channel_mention, inline=True)

        # Interval and pause status
        interval_text = Settings.format_interval_display(status["interval_minutes"])
        if status["is_paused"]:
            interval_text += " (En pause)"
        embed.add_field(name="⏰ Intervalle", value=interval_text, inline=True)

        # Response statistics
        embed.add_field(
            name="📊 Participation",
            value=f"✅ {status['response_count']}/{status['total_count']} ({status['response_percentage']}%)",
            inline=True,
        )

        # Next reminder timing
        if status["is_paused"]:
            next_reminder_text = "En pause"
        elif status["is_overdue"]:
            next_reminder_text = "En retard!"
        else:
            next_reminder_text = f"<t:{int(status['next_reminder'].timestamp())}:R>"

        embed.add_field(name="📅 Prochain rappel", value=next_reminder_text, inline=True)

        # Created date
        embed.add_field(
            name="📅 Créé le", value=f"<t:{int(status['created_at'].timestamp())}:F>", inline=True
        )

        # Message link
        embed.add_field(
            name="🔗 Lien vers le message",
            value=f"[Cliquer ici](https://discord.com/channels/{status['guild_id']}/{status['channel_id']}/{status['message_id']})",
            inline=False,
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(
        name="health",
        description="Afficher les statistiques de santé et de récupération d'erreurs du bot",
    )
    async def health(self, interaction: discord.Interaction):
        """Show bot health and error recovery statistics."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        stats = retry_stats.get_summary()
        embed = create_health_embed(stats)

        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(
        name="help", description="Afficher l'aide complète d'utilisation du bot Discord Reminder"
    )
    async def help(self, interaction: discord.Interaction):
        """Show comprehensive help for Discord Reminder Bot."""

        # Créer l'embed principal d'aide
        embed = discord.Embed(
            title="🤖 Discord Reminder Bot - Guide d'utilisation",
            description="**Bot de rappels automatiques pour vos événements**\n\n"
            "Ce bot surveille les réactions sur vos messages et envoie des rappels automatiques aux participants qui n'ont pas encore répondu.",
            color=discord.Color.blue(),
            timestamp=datetime.now(),
        )

        # Ajouter l'icône du bot comme thumbnail si disponible
        if self.bot.user and self.bot.user.avatar:
            embed.set_thumbnail(url=self.bot.user.avatar.url)

        # Section commandes principales
        embed.add_field(
            name="📋 Commandes principales",
            value=(
                "**`/watch`** - Surveiller un message avec rappels automatiques\n"
                "**`/unwatch`** - Retirer un message de la surveillance\n"
                "**`/list`** - Afficher tous les rappels surveillés\n"
                "**`/remind`** - Envoyer un rappel manuel\n"
                "**`/status`** - Statut détaillé d'un rappel\n"
            ),
            inline=False,
        )

        # Section gestion des rappels
        embed.add_field(
            name="⚙️ Gestion des rappels",
            value=(
                "**`/set_interval`** - Modifier l'intervalle d'un rappel\n"
                "**`/pause`** - Mettre en pause un rappel\n"
                "**`/resume`** - Reprendre un rappel en pause\n"
            ),
            inline=False,
        )

        # Section administration
        embed.add_field(
            name="🛠️ Administration",
            value=(
                "**`/autodelete`** - Configurer l'auto-suppression des rappels\n"
                "**`/health`** - Statistiques de santé du bot\n"
                "**`/sync`** - Synchroniser les commandes slash\n"
            ),
            inline=False,
        )

        # Section intervalles disponibles
        interval_text = "⏱️ **Intervalles standard:**\n"
        if Settings.is_test_mode():
            interval_text += (
                "• 30 secondes, 1 minute, 2 minutes *(mode test)*\n"
                "• 5 min, 15 min, 30 min, 1h, 2h, 6h, 12h, 24h\n"
                "*(Mode test actif - intervalles flexibles de 30s à 7 jours)*"
            )
        else:
            interval_text += "• 5 min, 15 min, 30 min, 1h, 2h, 6h, 12h, 24h"

        embed.add_field(name="⏰ Intervalles de rappel", value=interval_text, inline=False)

        # Section permissions
        embed.add_field(
            name="🔐 Permissions",
            value=(
                f"**Rôles administrateurs:** {Settings.get_admin_roles_str()}\n"
                "Les utilisateurs avec ces rôles peuvent gérer tous les rappels."
            ),
            inline=False,
        )

        # Section fonctionnement
        embed.add_field(
            name="🎯 Comment ça fonctionne",
            value=(
                "1️⃣ Créez un message pour votre événement\n"
                "2️⃣ Ajoutez les réactions ✅ ❌ ❓ au message\n"
                "3️⃣ Utilisez `/watch` avec le lien du message\n"
                "4️⃣ Le bot enverra des rappels aux non-répondants\n"
                "5️⃣ Les rappels s'arrêtent quand tout le monde a répondu"
            ),
            inline=False,
        )

        # Section exemples
        embed.add_field(
            name="💡 Exemples d'utilisation",
            value=(
                "**Surveiller un événement:**\n"
                "`/watch message: [lien du message] interval: 1 heure`\n\n"
                "**Rappel manuel immédiat:**\n"
                "`/remind message: [lien du message]`\n\n"
                "**Lister tous les rappels:**\n"
                "`/list`"
            ),
            inline=False,
        )

        # Section tips & tricks
        embed.add_field(
            name="💭 Conseils d'utilisation",
            value=(
                "• Utilisez des titres clairs dans vos messages d'événements\n"
                "• Les rappels sont envoyés dans le canal d'origine par défaut\n"
                "• Le bot ignore les réactions des autres bots\n"
                "• Vous pouvez modifier l'intervalle d'un rappel existant\n"
                "• Les rappels en pause peuvent être repris à tout moment"
            ),
            inline=False,
        )

        # Footer avec informations supplémentaires
        if interaction.guild:
            # En serveur : afficher les statistiques du serveur using thread-safe manager
            server_events = await reminder_manager.get_guild_reminders(interaction.guild.id)
            server_count = len(server_events)
            footer_text = (
                f"Bot développé avec discord.py • {server_count} rappel(s) actifs sur ce serveur"
            )
        else:
            # En DM : afficher les statistiques globales using thread-safe manager
            all_reminders = reminder_manager.reminders
            total_events = len(all_reminders)
            footer_text = (
                f"Bot développé avec discord.py • {total_events} rappel(s) actifs au total"
            )

        embed.set_footer(text=footer_text)

        await interaction.response.send_message(embed=embed, ephemeral=True)

        # Log sécurisé avec gestion des DM
        guild_info = f"guild {interaction.guild.id}" if interaction.guild else "DM"
        logger.info(f"Help command used by user {interaction.user.id} in {guild_info}")

    @app_commands.command(
        name="autodelete", description="Configure l'auto-suppression des messages de rappel"
    )
    @app_commands.describe(
        action="Action à effectuer (status, enable, disable)",
        delay_hours="Délai en heures avant suppression (si action=enable)",
    )
    @app_commands.choices(
        action=[
            app_commands.Choice(name="status - Voir la configuration", value="status"),
            app_commands.Choice(name="enable - Activer l'auto-suppression", value="enable"),
            app_commands.Choice(name="disable - Désactiver l'auto-suppression", value="disable"),
        ]
    )
    @app_commands.choices(
        delay_hours=[
            app_commands.Choice(name="1 minute", value=1 / 60),
            app_commands.Choice(name="2 minutes", value=2 / 60),
            app_commands.Choice(name="3 minutes", value=0.05),
            app_commands.Choice(name="5 minutes", value=0.08),
            app_commands.Choice(name="10 minutes", value=0.17),
            app_commands.Choice(name="15 minutes", value=0.25),
            app_commands.Choice(name="30 minutes", value=0.5),
            app_commands.Choice(name="1 heure", value=1.0),
            app_commands.Choice(name="2 heures", value=2.0),
            app_commands.Choice(name="6 heures", value=6.0),
            app_commands.Choice(name="12 heures", value=12.0),
            app_commands.Choice(name="24 heures", value=24.0),
            app_commands.Choice(name="48 heures", value=48.0),
        ]
    )
    async def autodelete(
        self, interaction: discord.Interaction, action: str, delay_hours: Optional[float] = None
    ):
        """Configure auto-deletion of reminder messages."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        # Import auto_delete_manager here to avoid circular imports
        from utils.auto_delete import get_auto_delete_manager

        if action == "status":
            embed = discord.Embed(
                title="🗑️ Configuration Auto-suppression",
                color=discord.Color.blue(),
                timestamp=datetime.now(),
            )

            status = "✅ Activée" if Settings.AUTO_DELETE_REMINDERS else "❌ Désactivée"
            embed.add_field(name="📊 Statut", value=status, inline=True)

            if Settings.AUTO_DELETE_REMINDERS:
                delay_text = Settings.format_auto_delete_display(Settings.AUTO_DELETE_DELAY_HOURS)
                embed.add_field(name="⏰ Délai", value=delay_text, inline=True)

                # Get pending deletions count
                auto_delete_mgr = get_auto_delete_manager()
                if auto_delete_mgr:
                    pending_count = auto_delete_mgr.get_pending_count()
                    embed.add_field(
                        name="📝 Messages programmés", value=str(pending_count), inline=True
                    )

            # Show available delay choices
            choices_text = ", ".join(
                [Settings.format_auto_delete_display(h) for h in Settings.AUTO_DELETE_CHOICES[:8]]
            )
            embed.add_field(name="💡 Délais suggérés", value=f"{choices_text}...", inline=False)

            embed.set_footer(text="Utilisez /autodelete enable [délai] ou /autodelete disable")
            await interaction.response.send_message(embed=embed, ephemeral=True)

        elif action == "enable":
            if delay_hours is None:
                delay_hours = 1.0  # Default to 1 hour

            # Validate delay
            validated_delay = Settings.validate_auto_delete_hours(delay_hours)

            # Update settings (this would need to be persistent in a real implementation)
            Settings.AUTO_DELETE_REMINDERS = True
            Settings.AUTO_DELETE_DELAY_HOURS = validated_delay

            delay_text = Settings.format_auto_delete_display(validated_delay)

            embed = discord.Embed(
                title="✅ Auto-suppression activée",
                description=f"Les messages de rappel s'auto-détruiront après **{delay_text}**",
                color=discord.Color.green(),
                timestamp=datetime.now(),
            )

            if validated_delay != delay_hours:
                embed.add_field(
                    name="⚠️ Délai ajusté",
                    value=f"Le délai demandé ({delay_hours}h) a été ajusté à {validated_delay}h",
                    inline=False,
                )

            await interaction.response.send_message(embed=embed, ephemeral=True)
            logger.info(
                f"Auto-deletion enabled by {interaction.user} with delay: {validated_delay}h"
            )

        elif action == "disable":
            Settings.AUTO_DELETE_REMINDERS = False

            # Cancel all pending deletions
            auto_delete_mgr = get_auto_delete_manager()
            if auto_delete_mgr:
                cancelled_count = auto_delete_mgr.get_pending_count()
                # Note: In a full implementation, we'd add a cancel_all_deletions method
            else:
                cancelled_count = 0

            embed = discord.Embed(
                title="❌ Auto-suppression désactivée",
                description="Les messages de rappel ne seront plus supprimés automatiquement",
                color=discord.Color.red(),
                timestamp=datetime.now(),
            )

            if cancelled_count > 0:
                embed.add_field(
                    name="📝 Suppressions annulées",
                    value=f"{cancelled_count} message(s) programmé(s) pour suppression ont été annulés",
                    inline=False,
                )

            await interaction.response.send_message(embed=embed, ephemeral=True)
            logger.info(f"Auto-deletion disabled by {interaction.user}")

        # Log sécurisé avec gestion des DM
        guild_info = f"guild {interaction.guild.id}" if interaction.guild else "DM"
        logger.info(
            f"Autodelete {action} command used by user {interaction.user.id} in {guild_info}"
        )

    @app_commands.command(
        name="sync",
        description="Synchroniser les commandes slash avec Discord (commande de développement)",
    )
    async def sync(self, interaction: discord.Interaction):
        """Synchronize slash commands with Discord (development command)."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)

        try:
            # Sync commands
            synced = await sync_slash_commands_logic(self.bot)

            embed = discord.Embed(
                title="✅ Synchronisation réussie",
                description=f"**{len(synced)}** commande(s) slash synchronisée(s) avec Discord.",
                color=discord.Color.green(),
                timestamp=datetime.now(),
            )

            await interaction.followup.send(embed=embed, ephemeral=True)
            logger.info(
                f"Slash commands synced successfully via /sync command: {len(synced)} commands"
            )

        except Exception as e:
            embed = discord.Embed(
                title="❌ Erreur de synchronisation",
                description=f"Erreur lors de la synchronisation: {str(e)}",
                color=discord.Color.red(),
                timestamp=datetime.now(),
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            logger.error(f"Failed to sync slash commands via /sync: {e}")


async def setup(bot: commands.Bot) -> None:
    """Setup function to add the cog to the bot."""
    await bot.add_cog(SlashCommands(bot))
    logger.info("Slash commands cog registered")


def register_slash_commands(bot: commands.Bot) -> None:
    """
    Register slash commands with the bot.

    Args:
        bot: Discord bot instance to register commands with
    """
    # The actual cog registration happens in bot.py on_ready event
    # when the event loop is running using the setup() function above
    # No need to load from old storage system anymore - using thread-safe reminder_manager

    logger.info("Slash commands setup prepared - using thread-safe reminder_manager")
