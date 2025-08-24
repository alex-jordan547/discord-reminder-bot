#!/usr/bin/env python3
"""
Discord Reminder Bot - Main Entry Point

A Discord bot that helps track user availability for matches by monitoring
reactions and sending automatic reminders to users who haven't responded.

This is the refactored version using the new modular architecture.
"""

import logging
import sys

import discord
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from commands.handlers import register_commands
from config.settings import Settings, Messages
from utils.logging_config import setup_logging, get_log_level_from_env, should_log_to_file


def create_bot() -> commands.Bot:
    """
    Create and configure the Discord bot instance.

    Returns:
        commands.Bot: Configured Discord bot instance
    """
    # Configure Discord intents
    intents = discord.Intents.default()
    intents.message_content = True
    intents.reactions = True
    intents.guilds = True
    intents.members = True

    # Create bot instance
    bot = commands.Bot(command_prefix=Settings.COMMAND_PREFIX, intents=intents)

    return bot


async def setup_bot_ready(bot: commands.Bot) -> None:
    """
    Handle bot ready event - called when bot is fully connected and ready.

    Args:
        bot: The Discord bot instance
    """
    logger = logging.getLogger(__name__)

    logger.info(Messages.BOT_CONNECTED.format(bot.user))
    logger.info(f"Bot is present on {len(bot.guilds)} server(s)")

    print(Messages.BOT_CONNECTED.format(bot.user))
    print(f"📊 Présent sur {len(bot.guilds)} serveur(s)")

    # Log server information
    for guild in bot.guilds:
        logger.info(f"  - {guild.name} (ID: {guild.id})")
        print(f"  - {guild.name} (ID: {guild.id})")

    # Setup slash commands when bot is ready
    try:
        from commands.slash_commands import SlashCommands
        await bot.add_cog(SlashCommands(bot))
        logger.info("Slash commands cog registered successfully")
        
        # Synchronize slash commands with Discord
        logger.info("Synchronizing slash commands with Discord...")
        synced = await bot.tree.sync()
        logger.info(f"Synchronized {len(synced)} slash command(s) with Discord")
        print(f"⚡ {len(synced)} commande(s) slash synchronisée(s) avec Discord")
    except Exception as e:
        logger.error(f"Failed to register or sync slash commands: {e}")
        print(f"❌ Erreur lors de la synchronisation des commandes slash: {e}")

    # Load reminders from storage using thread-safe manager
    if hasattr(bot, 'reminder_manager'):
        success = await bot.reminder_manager.load_from_storage()
        if success:
            total_loaded = len(bot.reminder_manager.reminders)
            logger.info(f"Loaded {total_loaded} reminders from storage")
            print(f"📥 Chargé {total_loaded} rappel(s) depuis le stockage")
        else:
            logger.warning("Failed to load reminders from storage")
            print("⚠️ Échec du chargement des rappels depuis le stockage")

    # Start the dynamic reminder system
    if hasattr(bot, 'start_dynamic_reminder_system'):
        await bot.start_dynamic_reminder_system()

        # Display reminder interval information
        if Settings.is_test_mode():
            logger.info(f"Dynamic reminder system enabled (TEST MODE) - Intervals: 1-10080 min")
            print(f"⏰ Système de rappels dynamique activé (MODE TEST)")
        else:
            logger.info(f"Dynamic reminder system enabled (PRODUCTION) - Intervals: 5-1440 min")
            print(f"⏰ Système de rappels dynamique activé")

    # Display channel mode information
    if Settings.USE_SEPARATE_REMINDER_CHANNEL:
        logger.info(f"Reminder mode: Separate channel (#{Settings.REMINDER_CHANNEL_NAME})")
        print(f"📢 Mode: Rappels dans un canal séparé (#{Settings.REMINDER_CHANNEL_NAME})")
    else:
        logger.info("Reminder mode: Same channel as match")
        print("📢 Mode: Rappels dans le même canal que le match")


def main() -> None:
    """
    Main entry point for the Discord Reminder Bot.
    """
    # Setup logging first
    log_level = get_log_level_from_env()
    log_to_file = should_log_to_file()
    setup_logging(log_level=log_level, log_to_file=log_to_file)

    logger = logging.getLogger(__name__)

    # Validate configuration
    if not Settings.validate_required_settings():
        logger.error("Configuration validation failed. Please check your environment variables.")
        print("❌ Configuration invalide! Vérifiez vos variables d'environnement.")
        sys.exit(1)

    # Log configuration
    Settings.log_configuration()

    # Validate Discord token
    if not Settings.TOKEN:
        logger.error("Discord token is missing! Set the DISCORD_TOKEN environment variable")
        print("❌ Token Discord manquant! Définissez la variable DISCORD_TOKEN")
        print("📖 Guide: https://discord.com/developers/applications")
        sys.exit(1)

    # Create bot instance
    bot = create_bot()

    # Register event handler
    @bot.event
    async def on_ready():
        await setup_bot_ready(bot)

    # Register all commands and event handlers
    register_commands(bot)

    # Start the bot
    try:
        logger.info("Starting Discord Reminder Bot...")
        print("🚀 Démarrage du bot...")
        bot.run(Settings.TOKEN)
    except discord.LoginFailure:
        logger.error("Invalid Discord token provided")
        print("❌ Token Discord invalide!")
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Bot shutdown requested by user")
        print("👋 Arrêt du bot demandé par l'utilisateur")
    except Exception as e:
        logger.error(f"Unexpected error during bot startup: {e}")
        print(f"❌ Erreur inattendue lors du démarrage: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()