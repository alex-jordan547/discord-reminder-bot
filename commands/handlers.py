"""
Discord command handlers for Discord Reminder Bot.

This module contains all Discord command implementations and related
functionality for managing match reminders.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

import discord
from discord.ext import commands, tasks

from models.reminder import MatchReminder
from persistence.storage import save_matches, load_matches
from utils.permissions import has_admin_permission, get_permission_error_message
from utils.message_parser import parse_message_link, get_parsing_error_message, extract_message_title
from config.settings import Settings, Messages

# Get logger for this module
logger = logging.getLogger(__name__)

# Global storage for watched matches
watched_matches: Dict[int, MatchReminder] = {}

# Variable globale pour la tâche de vérification dynamique
_dynamic_reminder_task: Optional[asyncio.Task] = None


def reschedule_reminders() -> None:
    """Replanifie les rappels après ajout/suppression d'un match."""
    global _dynamic_reminder_task
    
    # Annuler la tâche précédente
    if _dynamic_reminder_task and not _dynamic_reminder_task.done():
        _dynamic_reminder_task.cancel()
        logger.debug("Previous reminder task cancelled for rescheduling")
    
    if watched_matches:
        logger.debug(f"Rescheduling reminders for {len(watched_matches)} watched match(es)")
        print(f"🔄 Replanification des rappels pour {len(watched_matches)} match(s)")
        print("⏰ Le système se réactivera dans quelques secondes...")
        # La replanification sera gérée par une tâche qui se déclenchera automatiquement
    else:
        logger.debug("No matches to watch, system entering sleep mode")
        print("😴 Aucun match à surveiller, mise en veille du système")


async def send_error_to_user(channel_or_interaction, error: Exception, context: str = "") -> None:
    """
    Send a descriptive error message to the user.

    Args:
        channel_or_interaction: Discord channel or interaction to send the message to
        error: The exception that occurred
        context: Additional context about what was being attempted
    """
    error_msg = f"❌ **Erreur** ({error.__class__.__name__})"
    if context:
        error_msg += f" lors de {context}"
    error_msg += f"\n💬 **Description**: {str(error)}"

    logger.error(f"Error in {context}: {error}")

    try:
        if hasattr(channel_or_interaction, 'response'):  # Discord interaction
            if channel_or_interaction.response.is_done():
                await channel_or_interaction.followup.send(error_msg, ephemeral=True)
            else:
                await channel_or_interaction.response.send_message(error_msg, ephemeral=True)
        else:  # Discord channel
            await channel_or_interaction.send(error_msg)
    except Exception as send_error:
        logger.error(f"Failed to send error message to user: {send_error}")


async def get_or_create_reminder_channel(guild: discord.Guild) -> Optional[discord.TextChannel]:
    """
    Find or create the reminder channel if separate channel mode is enabled.

    Args:
        guild: Discord guild where the channel should exist

    Returns:
        TextChannel if found/created or separate channel mode disabled, None if failed
    """
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
            topic="📢 Canal automatique pour les rappels de disponibilités matchs"
        )
        logger.info(Messages.CHANNEL_CREATED.format(Settings.REMINDER_CHANNEL_NAME, guild.name))
        print(Messages.CHANNEL_CREATED.format(Settings.REMINDER_CHANNEL_NAME, guild.name))
        return channel
    except discord.Forbidden:
        logger.warning(f"Insufficient permissions to create channel #{Settings.REMINDER_CHANNEL_NAME}")
        print(Messages.NO_CHANNEL_PERMISSIONS.format(Settings.REMINDER_CHANNEL_NAME))
        return None


async def send_reminder(reminder: MatchReminder, channel: discord.TextChannel, bot: commands.Bot) -> int:
    """
    Send a reminder for a specific match.

    Args:
        reminder: The MatchReminder instance to send reminder for
        channel: Discord channel to send the reminder in
        bot: Discord bot instance

    Returns:
        int: Number of users mentioned in the reminder
    """
    try:
        # Get the original match message to update reactions
        match_channel = bot.get_channel(reminder.channel_id)
        if not match_channel:
            logger.error(f"Could not find match channel {reminder.channel_id}")
            return 0

        message = await match_channel.fetch_message(reminder.message_id)

        # Update the list of users who have reacted
        reminder.users_who_reacted.clear()
        for reaction in message.reactions:
            if reaction.emoji in reminder.required_reactions:
                async for user in reaction.users():
                    if not user.bot:
                        reminder.users_who_reacted.add(user.id)

        # Filter all_users to only include users who can see the match channel
        guild = bot.get_guild(reminder.guild_id)
        if not guild:
            logger.error(f"Could not find guild {reminder.guild_id}")
            return 0

        # Get users who can actually see and access the match channel
        accessible_users = set()
        for member in guild.members:
            if not member.bot:
                # Check if user can view the match channel
                permissions = match_channel.permissions_for(member)
                if permissions.view_channel and permissions.send_messages:
                    accessible_users.add(member.id)

        # Update the reminder's user list to only include accessible users
        reminder.all_users = accessible_users

        # Identify missing users (only from those who can access the channel)
        missing_users = reminder.get_missing_users()

        if not missing_users:
            logger.debug(f"No missing users for match {reminder.message_id}")
            return 0

        # Limit mentions to avoid spam
        users_to_mention = list(missing_users)[:Settings.MAX_MENTIONS_PER_REMINDER]
        remaining = len(missing_users) - len(users_to_mention)

        # Build the reminder message
        mentions = ' '.join([f'<@{user_id}>' for user_id in users_to_mention])

        embed = discord.Embed(
            title=f"🔔 Rappel: {reminder.title[:Settings.MAX_TITLE_LENGTH]}",
            description="**Merci de mettre votre disponibilité pour le match!**\n"
                       "Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)",
            color=discord.Color.orange(),
            timestamp=datetime.now()
        )

        embed.add_field(
            name="📊 Statistiques",
            value=f"✅ Ont répondu: **{reminder.get_response_count()}**\n"
                  f"❌ Manquants: **{reminder.get_missing_count()}**\n"
                  f"👥 Total joueurs: **{reminder.get_total_users_count()}**",
            inline=False
        )

        embed.add_field(
            name="🔗 Lien vers le match",
            value=f"[**Cliquez ici pour voir le message**](https://discord.com/channels/{reminder.guild_id}/{reminder.channel_id}/{reminder.message_id})",
            inline=False
        )

        if remaining > 0:
            embed.set_footer(text=Messages.MENTION_LIMIT_EXCEEDED.format(remaining))

        # Send the reminder
        await channel.send(content=mentions, embed=embed)

        # Update reminder timestamp
        reminder.last_reminder = datetime.now()
        save_matches(watched_matches)

        logger.info(f"Sent reminder for match {reminder.message_id} to {len(users_to_mention)} users")

        return len(users_to_mention)

    except discord.NotFound as e:
        logger.error(f"Message or channel not found for match {reminder.message_id}: {e}")
        # Update timestamp to avoid repeated attempts
        reminder.last_reminder = datetime.now()
        save_matches(watched_matches)
        return 0
    except discord.Forbidden as e:
        logger.error(f"Permission denied for sending reminder for match {reminder.message_id}: {e}")
        # Update timestamp to avoid spamming failed attempts
        reminder.last_reminder = datetime.now()
        save_matches(watched_matches)
        return 0
    except Exception as e:
        logger.error(f"Unexpected error sending reminder for match {reminder.message_id}: {e}")
        # Update timestamp even on error to prevent retry loop
        reminder.last_reminder = datetime.now()
        save_matches(watched_matches)
        return 0


def register_commands(bot: commands.Bot) -> None:
    """
    Register all Discord commands with the bot.

    Args:
        bot: Discord bot instance to register commands with
    """

    @bot.command(name='watch')
    async def watch_match(ctx: commands.Context, message_link: str, interval_minutes: int = 60) -> None:
        """
        Add a match message to watch for availability responses.

        Usage: !watch [message_link] [optional_interval_minutes]
        """
        # Check permissions
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        # Store original interval for comparison
        original_interval = interval_minutes

        # Validate interval and check if it was adjusted
        validated_interval = Settings.validate_interval_minutes(interval_minutes)
        interval_adjusted = validated_interval != original_interval

        # Parse the message link
        link_info = parse_message_link(message_link)
        if not link_info:
            await ctx.send(get_parsing_error_message())
            return

        # Verify the message is on this server
        if link_info.guild_id != ctx.guild.id:
            await ctx.send(Messages.WRONG_SERVER)
            return

        # Fetch and verify the message exists
        try:
            channel = bot.get_channel(link_info.channel_id)
            if not channel:
                await ctx.send(Messages.CHANNEL_NOT_FOUND)
                return

            message = await channel.fetch_message(link_info.message_id)

            # Extract title from message content
            title = extract_message_title(message.content, Settings.MAX_TITLE_LENGTH)
            if title == "Match sans titre":
                title = f"Match #{link_info.message_id}"

            # Create the reminder with interval
            reminder = MatchReminder(
                link_info.message_id,
                link_info.channel_id,
                link_info.guild_id,
                title,
                validated_interval,
                Settings.DEFAULT_REACTIONS
            )

            # Get all server members who can access this specific channel (excluding bots)
            guild = ctx.guild
            accessible_users = set()
            for member in guild.members:
                if not member.bot:
                    # Check if user can view and send messages in the channel
                    permissions = channel.permissions_for(member)
                    if permissions.view_channel and permissions.send_messages:
                        accessible_users.add(member.id)

            reminder.all_users = accessible_users

            # Check existing reactions
            for reaction in message.reactions:
                if reaction.emoji in reminder.required_reactions:
                    async for user in reaction.users():
                        if not user.bot:
                            reminder.users_who_reacted.add(user.id)

            # Save the reminder
            watched_matches[link_info.message_id] = reminder
            save_matches(watched_matches)
            
            # Replanifier les rappels après ajout
            reschedule_reminders()

            # Create success embed
            embed = discord.Embed(
                title=Messages.MATCH_ADDED,
                color=discord.Color.green(),
                timestamp=datetime.now()
            )
            embed.add_field(name="📌 Match", value=title, inline=False)
            embed.add_field(name="⏰ Intervalle", value=Settings.format_interval_display(validated_interval), inline=True)
            embed.add_field(name="✅ Ont répondu", value=str(reminder.get_response_count()), inline=True)
            embed.add_field(name="❌ Manquants", value=str(reminder.get_missing_count()), inline=True)
            embed.add_field(name="👥 Total", value=str(reminder.get_total_users_count()), inline=True)

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

            await ctx.send(embed=embed)
            logger.info(f"Added match {link_info.message_id} to watch list on guild {ctx.guild.id} with {validated_interval}min interval (original: {original_interval})")

        except discord.NotFound:
            await ctx.send(Messages.MESSAGE_NOT_FOUND)
        except discord.Forbidden as e:
            await send_error_to_user(ctx, e, "l'accès au message")
        except Exception as e:
            await send_error_to_user(ctx, e, "l'ajout du match à la surveillance")

    @bot.command(name='unwatch')
    async def unwatch_match(ctx: commands.Context, message: str) -> None:
        """
        Remove a message from the watch list.

        Usage: !unwatch [message_link or message_id]
        """
        # Check permissions
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        # Try to parse as URL first, then as ID
        link_info = parse_message_link(message)
        if link_info:
            message_id = link_info.message_id
        else:
            # Try to parse as direct message ID
            try:
                message_id = int(message)
            except ValueError as e:
                await send_error_to_user(ctx, e, "l'analyse de l'ID du message")
                return

        if message_id in watched_matches:
            title = watched_matches[message_id].title
            del watched_matches[message_id]
            save_matches(watched_matches)
            
            # Replanifier les rappels après suppression
            reschedule_reminders()
            
            await ctx.send(Messages.MATCH_REMOVED.format(title))
            logger.info(f"Removed match {message_id} from watch list")
        else:
            await ctx.send(Messages.MATCH_NOT_WATCHED)

    @bot.command(name='list')
    async def list_matches(ctx: commands.Context) -> None:
        """List all watched matches on this server."""
        # Filter matches for this server only
        server_matches = {k: v for k, v in watched_matches.items() if v.guild_id == ctx.guild.id}

        if not server_matches:
            await ctx.send(Messages.NO_WATCHED_MATCHES)
            return

        embed = discord.Embed(
            title=f"📋 Matchs surveillés sur {ctx.guild.name}",
            color=discord.Color.blue(),
            timestamp=datetime.now()
        )

        for match_id, reminder in server_matches.items():
            channel = bot.get_channel(reminder.channel_id)
            channel_mention = f"<#{reminder.channel_id}>" if channel else "Canal inconnu"

            embed.add_field(
                name=reminder.title[:100],
                value=f"📍 {channel_mention}\n"
                      f"✅ Réponses: {reminder.get_response_count()}/{reminder.get_total_users_count()}\n"
                      f"❌ Manquants: {reminder.get_missing_count()}\n"
                      f"🔗 [Lien](https://discord.com/channels/{reminder.guild_id}/{reminder.channel_id}/{match_id})",
                inline=False
            )

        embed.set_footer(text=f"Total: {len(server_matches)} match(s) surveillé(s)")
        await ctx.send(embed=embed)

    @bot.command(name='remind')
    async def manual_remind(ctx: commands.Context, message: Optional[str] = None) -> None:
        """
        Send a manual reminder for a specific match or all matches on the server.

        Usage: !remind [optional_message_link_or_id]
        """
        # Check permissions
        if not has_admin_permission(ctx.author):
            await ctx.send(get_permission_error_message())
            return

        # Determine which matches to remind
        if message:
            # Try to parse as URL first, then as ID
            link_info = parse_message_link(message)
            if link_info:
                message_id = link_info.message_id
            else:
                # Try to parse as direct message ID
                try:
                    message_id = int(message)
                except ValueError as e:
                    await send_error_to_user(ctx, e, "l'analyse de l'ID du message")
                    return

            if message_id not in watched_matches:
                await ctx.send(Messages.MATCH_NOT_WATCHED)
                return
            if watched_matches[message_id].guild_id != ctx.guild.id:
                await ctx.send(Messages.MATCH_NOT_ON_SERVER)
                return
            matches_to_remind = {message_id: watched_matches[message_id]}
        else:
            # Filter matches for this server only
            matches_to_remind = {k: v for k, v in watched_matches.items() if v.guild_id == ctx.guild.id}

        if not matches_to_remind:
            await ctx.send(Messages.NO_MATCHES_TO_REMIND)
            return

        # Determine reminder channel
        reminder_channel = await get_or_create_reminder_channel(ctx.guild)

        total_reminded = 0

        for match_id, reminder in matches_to_remind.items():
            # Use match channel if no separate reminder channel
            if not reminder_channel:
                reminder_channel = bot.get_channel(reminder.channel_id)

            if reminder_channel:
                count = await send_reminder(reminder, reminder_channel, bot)
                total_reminded += count
                # Add delay between reminders to avoid rate limits
                await asyncio.sleep(Settings.REMINDER_DELAY_SECONDS)

        await ctx.send(Messages.REMINDER_SENT.format(total_reminded))

    @bot.command(name='config')
    async def show_config(ctx: commands.Context) -> None:
        """Display the current bot configuration."""
        embed = discord.Embed(
            title="⚙️ Configuration actuelle",
            color=discord.Color.blue(),
            timestamp=datetime.now()
        )

        mode = "Canal séparé" if Settings.USE_SEPARATE_REMINDER_CHANNEL else "Même canal que le match"
        embed.add_field(name="📢 Mode de rappel", value=mode, inline=False)

        if Settings.USE_SEPARATE_REMINDER_CHANNEL:
            embed.add_field(name="📍 Nom du canal", value=f"#{Settings.REMINDER_CHANNEL_NAME}", inline=False)

        # Display interval in user-friendly format
        if Settings.REMINDER_INTERVAL_HOURS < 1:
            interval_text = f"{Settings.get_reminder_interval_minutes()} minutes"
        else:
            interval_text = f"{Settings.REMINDER_INTERVAL_HOURS} heures"

        embed.add_field(name="⏰ Intervalle", value=interval_text, inline=True)
        embed.add_field(name="👮 Rôles admin", value=Settings.get_admin_roles_str(), inline=True)

        server_matches_count = len([m for m in watched_matches.values() if m.guild_id == ctx.guild.id])
        embed.add_field(name="📊 Matchs surveillés", value=str(server_matches_count), inline=True)

        await ctx.send(embed=embed)

    @bot.command(name='help_reminder')
    async def help_command(ctx: commands.Context) -> None:
        """Display bot help information."""
        embed = discord.Embed(
            title="📚 Aide - Bot Reminder Disponibilités",
            description="Bot pour rappeler aux joueurs de mettre leurs disponibilités",
            color=discord.Color.green()
        )

        embed.add_field(
            name="!watch [lien_message]",
            value="Ajoute un match à surveiller\n"
                  "→ Faites clic droit sur le message → 'Copier le lien'",
            inline=False
        )

        embed.add_field(
            name="!unwatch [lien_message_ou_id]",
            value="Retire un match de la surveillance\n"
                  "→ Accepte lien Discord ou ID numérique",
            inline=False
        )

        embed.add_field(
            name="!list",
            value="Liste tous les matchs surveillés sur ce serveur",
            inline=False
        )

        embed.add_field(
            name="!remind [lien_message_ou_id]",
            value="Envoie un rappel manuel\n"
                  "→ Optionnel: pour un match spécifique (lien ou ID)",
            inline=False
        )

        embed.add_field(
            name="!config",
            value="Affiche la configuration actuelle",
            inline=False
        )

        embed.add_field(
            name="!help_reminder",
            value="Affiche cette aide",
            inline=False
        )

        embed.set_footer(text=f"Préfixe: {Settings.COMMAND_PREFIX} | Rôles admin: {Settings.get_admin_roles_str()}")

        await ctx.send(embed=embed)

    @bot.event
    async def on_reaction_add(reaction: discord.Reaction, user: discord.User) -> None:
        """Update the list of users who have reacted when a reaction is added."""
        if user.bot:
            return

        message_id = reaction.message.id
        if message_id in watched_matches:
            reminder = watched_matches[message_id]
            if reaction.emoji in reminder.required_reactions:
                reminder.users_who_reacted.add(user.id)
                save_matches(watched_matches)
                logger.debug(f"User {user.id} reacted to match {message_id}")

    @bot.event
    async def on_reaction_remove(reaction: discord.Reaction, user: discord.User) -> None:
        """Update the list when a reaction is removed."""
        if user.bot:
            return

        message_id = reaction.message.id
        if message_id in watched_matches:
            reminder = watched_matches[message_id]
            # Check if user still has a valid reaction
            has_valid_reaction = False
            for r in reaction.message.reactions:
                if r.emoji in reminder.required_reactions:
                    users = [u async for u in r.users()]
                    if user in users:
                        has_valid_reaction = True
                        break

            if not has_valid_reaction:
                reminder.users_who_reacted.discard(user.id)
                save_matches(watched_matches)
                logger.debug(f"User {user.id} removed all valid reactions from match {message_id}")

    async def schedule_next_reminder_check() -> None:
        """
        Planifie la prochaine vérification de rappel de manière dynamique
        en calculant le temps exact jusqu'au prochain rappel dû.
        Entre en mode veille si aucun match n'est surveillé.
        """
        global _dynamic_reminder_task
        
        # Annuler la tâche précédente si elle existe
        if _dynamic_reminder_task and not _dynamic_reminder_task.done():
            _dynamic_reminder_task.cancel()
        
        if not watched_matches:
            logger.debug("No watched matches - entering sleep mode (no periodic checks)")
            print("😴 Mode veille: Aucun match surveillé, arrêt des vérifications périodiques")
            # Ne pas programmer de vérification - le système se réactivera lors de l'ajout d'un match
            return
        
        # Trouver le prochain rappel le plus proche
        next_reminder_times = []
        current_time = datetime.now()
        
        for reminder in watched_matches.values():
            if not reminder.is_paused:
                next_time = reminder.get_next_reminder_time()
                if next_time > current_time:  # Seulement les rappels futurs
                    next_reminder_times.append(next_time)
        
        if not next_reminder_times:
            logger.debug("All reminders are paused or overdue - entering sleep mode")
            print("😴 Mode veille: Tous les rappels sont en pause ou en retard")
            # Ne pas programmer de vérification - le système se réactivera lors de modifications
            return
        
        # Calculer le temps jusqu'au prochain rappel
        next_reminder = min(next_reminder_times)
        time_until_next = (next_reminder - current_time).total_seconds()
        
        # Ajouter une petite marge pour éviter les problèmes de timing (5 secondes)
        time_until_next = max(5, time_until_next - 5)
        
        # Limiter à un maximum pour éviter les attentes trop longues
        max_wait = 300 if Settings.is_test_mode() else 1800  # 5 min en test, 30 min en prod
        time_until_next = min(time_until_next, max_wait)
        
        logger.debug(f"Next reminder due at {next_reminder.strftime('%H:%M:%S')}, waiting {time_until_next:.1f} seconds")
        print(f"🕰️ Prochain rappel programmé à {next_reminder.strftime('%H:%M:%S')} (dans {time_until_next:.0f}s)")
        
        _dynamic_reminder_task = asyncio.create_task(
            asyncio.sleep(time_until_next)
        )
        
        try:
            await _dynamic_reminder_task
            await check_reminders_dynamic()
        except asyncio.CancelledError:
            logger.debug("Reminder check cancelled (likely due to rescheduling)")
            pass
    
    async def check_reminders_dynamic() -> None:
        """
        Vérification dynamique des rappels avec planification automatique
        de la prochaine vérification.
        """
        logger.debug("Dynamic reminder check triggered...")
        
        if not watched_matches:
            logger.debug("No watched matches to check - entering sleep mode")
            print("😴 Aucun match à vérifier - entrée en mode veille")
            return
        
        total_reminded = 0
        
        for reminder in watched_matches.values():
            if reminder.is_reminder_due():
                logger.info(f"Reminder due for match {reminder.message_id} (interval: {reminder.interval_minutes}min)")
                
                # Trouver la guilde et le canal approprié
                guild = bot.get_guild(reminder.guild_id)
                if not guild:
                    logger.warning(f"Guild {reminder.guild_id} not found for reminder {reminder.message_id}")
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
                    logger.error(f"Could not find reminder channel for match {reminder.message_id}")
        
        if total_reminded > 0:
            logger.info(f"Dynamic reminders sent: {total_reminded} people notified")
            print(f"✅ Rappels automatiques envoyés: {total_reminded} personnes notifiées")
        else:
            logger.debug(f"No reminders due yet. Checked {len(watched_matches)} matches.")
        
        # Programmer la prochaine vérification
        await schedule_next_reminder_check()
    
    async def start_dynamic_reminder_system() -> None:
        """Démarre le système de planification dynamique des rappels."""
        logger.info("Starting dynamic reminder scheduling system")
        print("🎯 Système de planification dynamique des rappels activé")
        
        if watched_matches:
            print(f"🔍 Détection de {len(watched_matches)} match(s) surveillé(s) - planification en cours...")
            await schedule_next_reminder_check()
        else:
            print("😴 Aucun match surveillé - système en mode veille")
            print("💡 Le système se réactivera automatiquement lors de l'ajout d'un match")
        
        # Démarrer une tâche périodique simple pour s'assurer que les rappels fonctionnent
        async def periodic_check():
            while True:
                try:
                    await asyncio.sleep(30)  # Vérifier toutes les 30 secondes
                    if watched_matches:
                        # Déclencher une vérification si on a des matchs
                        logger.debug("Periodic check - triggering reminder verification")
                        await check_reminders_dynamic()
                    else:
                        logger.debug("Periodic check - no matches, staying in sleep mode")
                except Exception as e:
                    logger.error(f"Error in periodic check: {e}")
                    await asyncio.sleep(60)  # Attendre plus longtemps en cas d'erreur
        
        # Lancer la tâche périodique
        asyncio.create_task(periodic_check())

    # Expose the dynamic reminder functions and global variables for bot.py
    bot.start_dynamic_reminder_system = start_dynamic_reminder_system
    bot.reschedule_reminders = reschedule_reminders
    bot.watched_matches_global = watched_matches

    # Load matches on startup
    watched_matches.update(load_matches())

    # Register slash commands
    from commands.slash_commands import register_slash_commands
    register_slash_commands(bot)

    # Share the watched_matches dictionary with slash commands
    import commands.slash_commands as slash_commands_module
    slash_commands_module.watched_matches = watched_matches

    logger.info(f"Registered all commands and loaded {len(watched_matches)} matches from storage")