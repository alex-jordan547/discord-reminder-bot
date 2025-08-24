"""
Discord slash command handlers for Discord Reminder Bot.

This module contains all Discord slash command implementations for the
enhanced reminder system with minute-based intervals and advanced features.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List

import discord
from discord.ext import commands
from discord import app_commands

from models.reminder import MatchReminder
from persistence.storage import save_matches, load_matches
from utils.permissions import has_admin_permission
from utils.message_parser import parse_message_link, extract_message_title
from utils.error_recovery import with_retry_stats, safe_send_message, safe_fetch_message, retry_stats
from utils.validation import (
    validate_message_id, validate_message_link, ValidationError, 
    get_validation_error_embed, safe_int_conversion
)
from commands.command_utils import sync_slash_commands_logic, create_health_embed
from config.settings import Settings, Messages

# Get logger for this module
logger = logging.getLogger(__name__)

# Global storage for watched matches (shared with legacy commands)
watched_matches: Dict[int, MatchReminder] = {}


async def send_error_to_user(interaction: discord.Interaction, error: Exception, context: str = "") -> None:
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
        self.bot = bot

    async def cog_load(self):
        """Called when the cog is loaded."""
        logger.info("Slash commands cog loaded")

    @app_commands.command(name="watch", description="Surveiller les réactions d'un message avec rappels automatiques")
    @app_commands.describe(
        message="Lien du message Discord à surveiller",
        interval="Intervalle des rappels en minutes (défaut: 60, min: 5, max: 1440)"
    )
    @app_commands.choices(interval=[
        app_commands.Choice(name="5 minutes", value=5),
        app_commands.Choice(name="15 minutes", value=15),
        app_commands.Choice(name="30 minutes", value=30),
        app_commands.Choice(name="1 heure", value=60),
        app_commands.Choice(name="2 heures", value=120),
        app_commands.Choice(name="6 heures", value=360),
        app_commands.Choice(name="12 heures", value=720),
        app_commands.Choice(name="24 heures", value=1440),
    ])
    async def watch(self, interaction: discord.Interaction, message: str, interval: int = 60):
        """Add a match message to watch for availability responses."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        # Store original interval for comparison
        original_interval = interval

        # Validate interval and check if it was adjusted
        validated_interval = Settings.validate_interval_minutes(interval)
        interval_adjusted = validated_interval != original_interval

        # Validate message link with permissions
        is_valid, error_msg, link_info = await validate_message_link(self.bot, message, interaction.user)
        if not is_valid:
            await interaction.response.send_message(error_msg, ephemeral=True)
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
            is_existing_watch = link_info.message_id in watched_matches
            old_interval = None
            if is_existing_watch:
                old_interval = watched_matches[link_info.message_id].interval_minutes

            # Extract title from message content
            title = extract_message_title(discord_message.content, Settings.MAX_TITLE_LENGTH)
            if title == "Match sans titre":
                title = f"Match #{link_info.message_id}"

            # Create the reminder (or update existing)
            if is_existing_watch:
                # Update existing reminder
                reminder = watched_matches[link_info.message_id]
                reminder.set_interval(validated_interval)
            else:
                # Create new reminder
                reminder = MatchReminder(
                    link_info.message_id,
                    link_info.channel_id,
                    link_info.guild_id,
                    title,
                    validated_interval,
                    Settings.DEFAULT_REACTIONS
                )

            # Only scan for users and reactions if this is a new watch
            if not is_existing_watch:
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

            # Save the reminder
            watched_matches[link_info.message_id] = reminder
            save_matches(watched_matches)
            
            # Replanifier les rappels après ajout
            from commands.handlers import reschedule_reminders
            reschedule_reminders()

            # Create success embed - different for new watch vs edit
            if is_existing_watch:
                embed = discord.Embed(
                    title="🔄 Match modifié",
                    color=discord.Color.blue(),
                    timestamp=datetime.now()
                )
            else:
                embed = discord.Embed(
                    title="✅ Match ajouté à la surveillance",
                    color=discord.Color.green(),
                    timestamp=datetime.now()
                )
            embed.add_field(name="📌 Match", value=title, inline=False)
            
            if is_existing_watch and old_interval != validated_interval:
                # Show interval change for edits
                embed.add_field(name="⏰ Ancien intervalle", value=Settings.format_interval_display(old_interval), inline=True)
                embed.add_field(name="⏰ Nouvel intervalle", value=Settings.format_interval_display(validated_interval), inline=True)
            else:
                # Show single interval for new watches or when interval unchanged
                embed.add_field(name="⏰ Intervalle", value=Settings.format_interval_display(validated_interval), inline=True)
            
            embed.add_field(name="✅ Ont répondu", value=str(reminder.get_response_count()), inline=True)
            embed.add_field(name="❌ Manquants", value=str(reminder.get_missing_count()), inline=True)
            embed.add_field(name="👥 Total", value=str(reminder.get_total_users_count()), inline=True)

            next_reminder = reminder.get_next_reminder_time()
            embed.add_field(
                name="📅 Prochain rappel",
                value=f"<t:{int(next_reminder.timestamp())}:R>",
                inline=False
            )

            # Add warning if interval was adjusted
            if interval_adjusted:
                if Settings.is_test_mode():
                    embed.add_field(
                        name="⚠️ Intervalle ajusté (Mode Test)",
                        value=f"L'intervalle demandé ({original_interval} min) a été ajusté à {validated_interval} min (limite test: 1-10080 min)",
                        inline=False
                    )
                else:
                    embed.add_field(
                        name="⚠️ Intervalle ajusté",
                        value=f"L'intervalle demandé ({original_interval} min) a été ajusté à {validated_interval} min (limite: {Settings.MIN_INTERVAL_MINUTES}-{Settings.MAX_INTERVAL_MINUTES} min)",
                        inline=False
                    )

            await interaction.followup.send(embed=embed, ephemeral=True)
            
            if is_existing_watch:
                logger.info(f"Modified match {link_info.message_id} on guild {interaction.guild.id}: interval changed from {old_interval}min to {validated_interval}min (requested: {original_interval})")
            else:
                logger.info(f"Added match {link_info.message_id} to watch list on guild {interaction.guild.id} with {validated_interval}min interval (original: {original_interval})")

        except Exception as e:
            await send_error_to_user(interaction, e, "l'ajout du match à la surveillance")

    @app_commands.command(name="unwatch", description="Retirer un message de la surveillance")
    @app_commands.describe(message="Lien du message à ne plus surveiller")
    async def unwatch(self, interaction: discord.Interaction, message: str):
        """Remove a message from the watch list."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        if message_id in watched_matches:
            title = watched_matches[message_id].title
            del watched_matches[message_id]
            save_matches(watched_matches)
            
            # Replanifier les rappels après suppression
            from commands.handlers import reschedule_reminders
            reschedule_reminders()

            embed = discord.Embed(
                title="✅ Match retiré de la surveillance",
                description=f"**{title}** ne sera plus surveillé.",
                color=discord.Color.orange(),
                timestamp=datetime.now()
            )

            await interaction.response.send_message(embed=embed, ephemeral=True)
            logger.info(f"Removed match {message_id} from watch list")
        else:
            await interaction.response.send_message(Messages.MATCH_NOT_WATCHED, ephemeral=True)

    @app_commands.command(name="list", description="Lister tous les rappels surveillés sur ce serveur")
    async def list_matches(self, interaction: discord.Interaction):
        """List all watched matches on this server."""
        # Filter matches for this server only
        server_matches = {k: v for k, v in watched_matches.items() if v.guild_id == interaction.guild.id}

        if not server_matches:
            await interaction.response.send_message(Messages.NO_WATCHED_MATCHES, ephemeral=True)
            return

        embed = discord.Embed(
            title=f"📋 Matchs surveillés sur {interaction.guild.name}",
            color=discord.Color.blue(),
            timestamp=datetime.now()
        )

        for match_id, reminder in server_matches.items():
            channel = self.bot.get_channel(reminder.channel_id)
            channel_mention = f"<#{reminder.channel_id}>" if channel else "Canal inconnu"

            status_emoji = "⏸️" if reminder.is_paused else "▶️"
            time_until_next = reminder.get_time_until_next_reminder()

            if reminder.is_paused:
                next_reminder_text = "En pause"
            elif time_until_next.total_seconds() < 0:
                next_reminder_text = "En retard!"
            else:
                next_reminder_text = f"<t:{int(reminder.get_next_reminder_time().timestamp())}:R>"

            embed.add_field(
                name=f"{status_emoji} {reminder.title[:50]}",
                value=f"📍 {channel_mention}\n"
                      f"⏰ Intervalle: {Settings.format_interval_display(reminder.interval_minutes)}\n"
                      f"✅ Réponses: {reminder.get_response_count()}/{reminder.get_total_users_count()} "
                      f"({reminder.get_status_summary()['response_percentage']}%)\n"
                      f"📅 Prochain: {next_reminder_text}\n"
                      f"🔗 [Lien](https://discord.com/channels/{reminder.guild_id}/{reminder.channel_id}/{match_id})",
                inline=False
            )

        embed.set_footer(text=f"Total: {len(server_matches)} match(s) surveillé(s)")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="remind", description="Envoyer un rappel manuel pour un élément spécifique")
    @app_commands.describe(message="Lien du message pour lequel envoyer un rappel (optionnel: tous les rappels si omis)")
    async def remind(self, interaction: discord.Interaction, message: Optional[str] = None):
        """Send a manual reminder for a specific match or all matches."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        # Defer response for processing
        await interaction.response.defer(ephemeral=True)

        # Determine which matches to remind
        if message:
            link_info = parse_message_link(message)
            if not link_info:
                await interaction.followup.send(Messages.INVALID_LINK_FORMAT, ephemeral=True)
                return

            message_id = link_info.message_id
            if message_id not in watched_matches:
                await interaction.followup.send(Messages.MATCH_NOT_WATCHED, ephemeral=True)
                return
            if watched_matches[message_id].guild_id != interaction.guild.id:
                await interaction.followup.send(Messages.MATCH_NOT_ON_SERVER, ephemeral=True)
                return
            matches_to_remind = {message_id: watched_matches[message_id]}
        else:
            # Filter matches for this server only
            matches_to_remind = {k: v for k, v in watched_matches.items() if v.guild_id == interaction.guild.id}

        if not matches_to_remind:
            await interaction.followup.send(Messages.NO_MATCHES_TO_REMIND, ephemeral=True)
            return

        # Import send_reminder function
        from commands.handlers import send_reminder, get_or_create_reminder_channel

        total_reminded = 0

        for match_id, reminder in matches_to_remind.items():
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
            timestamp=datetime.now()
        )

        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="set_interval", description="Modifier l'intervalle d'un rappel surveillé")
    @app_commands.describe(
        message="Lien du message dont modifier l'intervalle",
        interval="Nouvel intervalle en minutes (min: 5, max: 1440)"
    )
    @app_commands.choices(interval=[
        app_commands.Choice(name="5 minutes", value=5),
        app_commands.Choice(name="15 minutes", value=15),
        app_commands.Choice(name="30 minutes", value=30),
        app_commands.Choice(name="1 heure", value=60),
        app_commands.Choice(name="2 heures", value=120),
        app_commands.Choice(name="6 heures", value=360),
        app_commands.Choice(name="12 heures", value=720),
        app_commands.Choice(name="24 heures", value=1440),
    ])
    async def set_interval(self, interaction: discord.Interaction, message: str, interval: int):
        """Set a new reminder interval for a watched match."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        if message_id not in watched_matches:
            await interaction.response.send_message(Messages.MATCH_NOT_WATCHED, ephemeral=True)
            return

        reminder = watched_matches[message_id]
        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.MATCH_NOT_ON_SERVER, ephemeral=True)
            return

        # Validate and set new interval
        old_interval = reminder.interval_minutes
        reminder.set_interval(interval)
        save_matches(watched_matches)

        embed = discord.Embed(
            title="✅ Intervalle mis à jour",
            color=discord.Color.green(),
            timestamp=datetime.now()
        )
        embed.add_field(name="📌 Match", value=reminder.title, inline=False)
        embed.add_field(name="⏰ Ancien intervalle", value=Settings.format_interval_display(old_interval), inline=True)
        embed.add_field(name="⏰ Nouvel intervalle", value=Settings.format_interval_display(reminder.interval_minutes), inline=True)
        embed.add_field(
            name="📅 Prochain rappel",
            value=f"<t:{int(reminder.get_next_reminder_time().timestamp())}:R>",
            inline=False
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)
        logger.info(f"Updated interval for match {message_id} from {old_interval} to {reminder.interval_minutes} minutes")

    @app_commands.command(name="pause", description="Mettre en pause les rappels d'un élément")
    @app_commands.describe(message="Lien du message dont mettre en pause les rappels")
    async def pause(self, interaction: discord.Interaction, message: str):
        """Pause reminders for a specific match."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        if message_id not in watched_matches:
            await interaction.response.send_message(Messages.MATCH_NOT_WATCHED, ephemeral=True)
            return

        reminder = watched_matches[message_id]
        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.MATCH_NOT_ON_SERVER, ephemeral=True)
            return

        if reminder.is_paused:
            await interaction.response.send_message("⚠️ Ce match est déjà en pause.", ephemeral=True)
            return

        reminder.pause_reminders()
        save_matches(watched_matches)

        embed = discord.Embed(
            title="⏸️ Rappels mis en pause",
            description=f"Les rappels pour **{reminder.title}** sont maintenant en pause.",
            color=discord.Color.orange(),
            timestamp=datetime.now()
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)
        logger.info(f"Paused reminders for match {message_id}")

    @app_commands.command(name="resume", description="Reprendre les rappels d'un élément en pause")
    @app_commands.describe(message="Lien du message dont reprendre les rappels")
    async def resume(self, interaction: discord.Interaction, message: str):
        """Resume reminders for a paused match."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        if message_id not in watched_matches:
            await interaction.response.send_message(Messages.MATCH_NOT_WATCHED, ephemeral=True)
            return

        reminder = watched_matches[message_id]
        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.MATCH_NOT_ON_SERVER, ephemeral=True)
            return

        if not reminder.is_paused:
            await interaction.response.send_message("⚠️ Ce match n'est pas en pause.", ephemeral=True)
            return

        reminder.resume_reminders()
        save_matches(watched_matches)

        embed = discord.Embed(
            title="▶️ Rappels repris",
            description=f"Les rappels pour **{reminder.title}** sont maintenant actifs.",
            color=discord.Color.green(),
            timestamp=datetime.now()
        )
        embed.add_field(
            name="📅 Prochain rappel",
            value=f"<t:{int(reminder.get_next_reminder_time().timestamp())}:R>",
            inline=False
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)
        logger.info(f"Resumed reminders for match {message_id}")

    @app_commands.command(name="status", description="Afficher le statut détaillé d'un rappel")
    @app_commands.describe(message="Lien du message dont afficher le statut")
    async def status(self, interaction: discord.Interaction, message: str):
        """Show detailed status for a specific match."""
        # Parse the message link
        link_info = parse_message_link(message)
        if not link_info:
            await interaction.response.send_message(Messages.INVALID_LINK_FORMAT, ephemeral=True)
            return

        message_id = link_info.message_id

        if message_id not in watched_matches:
            await interaction.response.send_message(Messages.MATCH_NOT_WATCHED, ephemeral=True)
            return

        reminder = watched_matches[message_id]
        if reminder.guild_id != interaction.guild.id:
            await interaction.response.send_message(Messages.MATCH_NOT_ON_SERVER, ephemeral=True)
            return

        status = reminder.get_status_summary()

        # Determine status color and emoji
        if status['is_paused']:
            color = discord.Color.orange()
            status_emoji = "⏸️"
        elif status['is_overdue']:
            color = discord.Color.red()
            status_emoji = "🚨"
        else:
            color = discord.Color.green()
            status_emoji = "▶️"

        embed = discord.Embed(
            title=f"{status_emoji} Statut du Match",
            description=f"**{status['title']}**",
            color=color,
            timestamp=datetime.now()
        )

        # Channel information
        channel = self.bot.get_channel(status['channel_id'])
        channel_mention = f"<#{status['channel_id']}>" if channel else "Canal inconnu"
        embed.add_field(name="📍 Canal", value=channel_mention, inline=True)

        # Interval and pause status
        interval_text = Settings.format_interval_display(status['interval_minutes'])
        if status['is_paused']:
            interval_text += " (En pause)"
        embed.add_field(name="⏰ Intervalle", value=interval_text, inline=True)

        # Response statistics
        embed.add_field(
            name="📊 Participation",
            value=f"✅ {status['response_count']}/{status['total_count']} ({status['response_percentage']}%)",
            inline=True
        )

        # Next reminder timing
        if status['is_paused']:
            next_reminder_text = "En pause"
        elif status['is_overdue']:
            next_reminder_text = "En retard!"
        else:
            next_reminder_text = f"<t:{int(status['next_reminder'].timestamp())}:R>"

        embed.add_field(name="📅 Prochain rappel", value=next_reminder_text, inline=True)

        # Created date
        embed.add_field(
            name="📅 Créé le",
            value=f"<t:{int(status['created_at'].timestamp())}:F>",
            inline=True
        )

        # Message link
        embed.add_field(
            name="🔗 Lien vers le message",
            value=f"[Cliquer ici](https://discord.com/channels/{status['guild_id']}/{status['channel_id']}/{status['message_id']})",
            inline=False
        )

        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="health", description="Afficher les statistiques de santé et de récupération d'erreurs du bot")
    async def health(self, interaction: discord.Interaction):
        """Show bot health and error recovery statistics."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
            )
            return

        stats = retry_stats.get_summary()
        embed = create_health_embed(stats)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="sync", description="Synchroniser les commandes slash avec Discord (commande de développement)")
    async def sync(self, interaction: discord.Interaction):
        """Synchronize slash commands with Discord (development command)."""
        # Check permissions
        if not has_admin_permission(interaction.user):
            await interaction.response.send_message(
                f"❌ Vous devez avoir l'un de ces rôles: {Settings.get_admin_roles_str()}",
                ephemeral=True
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
                timestamp=datetime.now()
            )

            await interaction.followup.send(embed=embed, ephemeral=True)
            logger.info(f"Slash commands synced successfully via /sync command: {len(synced)} commands")

        except Exception as e:
            embed = discord.Embed(
                title="❌ Erreur de synchronisation",
                description=f"Erreur lors de la synchronisation: {str(e)}",
                color=discord.Color.red(),
                timestamp=datetime.now()
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
    global watched_matches

    # Load matches on startup (shared with legacy commands)
    watched_matches = load_matches()

    # The actual cog registration happens in bot.py on_ready event
    # when the event loop is running

    logger.info(f"Slash commands setup prepared and loaded {len(watched_matches)} matches from storage")