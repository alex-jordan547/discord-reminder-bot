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

# Load environment variables from .env file FIRST
load_dotenv()

from commands.handlers import setup_bot_handlers
from config.settings import Messages, Settings
from utils.auto_delete import init_auto_delete_manager
from utils.logging_config import (
    get_log_level_from_env,
    setup_logging,
    should_log_to_file,
    should_use_colors,
)
from utils.validation import validate_environment_config


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
    logger.info("Bot is present on {} server(s)".format(len(bot.guilds)))

    print(Messages.BOT_CONNECTED.format(bot.user))
    print("📊 Présent sur {} serveur(s)".format(len(bot.guilds)))

    # Log server information
    for guild in bot.guilds:
        logger.info("  - {} (ID: {})".format(guild.name, guild.id))
        print("  - {} (ID: {})".format(guild.name, guild.id))

    # Setup slash commands when bot is ready
    try:
        from commands.slash_commands import SlashCommands

        await bot.add_cog(SlashCommands(bot))
        logger.info("Slash commands cog registered successfully")

        # Synchronize slash commands with Discord
        logger.info("Synchronizing slash commands with Discord...")
        synced = await bot.tree.sync()
        logger.info("Synchronized {} slash command(s) with Discord".format(len(synced)))
        print("⚡ {} commande(s) slash synchronisée(s) avec Discord".format(len(synced)))
    except Exception as e:
        logger.error("Failed to register or sync slash commands: {}".format(e))
        print("❌ Erreur lors de la synchronisation des commandes slash: {}".format(e))

    # Load reminders from storage using thread-safe manager
    if hasattr(bot, "reminder_manager"):
        success = await bot.reminder_manager.load_from_storage()
        if success:
            total_loaded = len(bot.reminder_manager.reminders)
            logger.info("Loaded {} reminders from storage".format(total_loaded))
            print("📥 Chargé {} rappel(s) depuis le stockage".format(total_loaded))
        else:
            logger.warning("Failed to load reminders from storage")
            print("⚠️ Échec du chargement des rappels depuis le stockage")

    # Initialize and start auto-delete manager BEFORE starting reminder system
    auto_delete_mgr = init_auto_delete_manager(bot)
    await auto_delete_mgr.start()

    # Start the dynamic reminder system (after auto-delete manager is ready)
    if hasattr(bot, "start_dynamic_reminder_system"):
        await bot.start_dynamic_reminder_system()

        # Display reminder interval information
        if Settings.is_test_mode():
            logger.info("Dynamic reminder system enabled (TEST MODE) - Intervals: 1-10080 min")
            print("⏰ Système de rappels dynamique activé (MODE TEST)")
        else:
            logger.info("Dynamic reminder system enabled (PRODUCTION) - Intervals: 5-1440 min")
            print("⏰ Système de rappels dynamique activé")

    if Settings.AUTO_DELETE_REMINDERS:
        logger.info(
            "Auto-deletion enabled: {}".format(
                Settings.format_auto_delete_display(Settings.AUTO_DELETE_DELAY_HOURS)
            )
        )
        print(
            "🗑️ Auto-suppression activée: {}".format(
                Settings.format_auto_delete_display(Settings.AUTO_DELETE_DELAY_HOURS)
            )
        )
    else:
        logger.info("Auto-deletion disabled")
        print("🗑️ Auto-suppression désactivée")

    # Display channel mode information
    if Settings.USE_SEPARATE_REMINDER_CHANNEL:
        logger.info("Reminder mode: Separate channel (#{})".format(Settings.REMINDER_CHANNEL_NAME))
        print("📢 Mode: Rappels dans un canal séparé (#{})".format(Settings.REMINDER_CHANNEL_NAME))
    else:
        logger.info("Reminder mode: Same channel as event")
        print("📢 Mode: Rappels dans le même canal que l'évènement")


def main() -> None:
    """
    Main entry point for the Discord Reminder Bot.
    """
    # Setup logging first
    log_level = get_log_level_from_env()
    log_to_file = should_log_to_file()
    use_colors = should_use_colors()
    setup_logging(log_level=log_level, log_to_file=log_to_file, use_colors=use_colors)

    logger = logging.getLogger(__name__)

    # Validate configuration using new comprehensive validation
    config_errors = validate_environment_config()
    if config_errors:
        logger.error("Configuration validation failed. Please check your environment variables.")
        print("❌ Configuration invalide! Vérifiez vos variables d'environnement:")
        for error in config_errors:
            print(f"  - {error}")
        sys.exit(1)

    # Additional basic validation for critical settings
    if not Settings.validate_required_settings():
        logger.error("Critical settings validation failed.")
        print("❌ Validation des paramètres critiques échouée.")
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
    setup_bot_handlers(bot)

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
