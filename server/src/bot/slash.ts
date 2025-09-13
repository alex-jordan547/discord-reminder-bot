/**
 * Discord Reminder Bot - Slash Commands Setup
 *
 * Defines and manages all slash commands for the bot including:
 * - /watch - Watch a message for reactions and send reminders
 * - /unwatch - Stop watching a message
 * - /list - List all watched events
 * - /status - Show bot status and statistics
 */

import {
  SlashCommandBuilder,
  Client,
  Collection,
  ChatInputCommandInteraction,
  REST,
  Routes,
  MessageFlags,
} from 'discord.js';
import { Settings } from '#/config/settings';
import { createLogger } from '#/utils/loggingConfig';
import { DiscordBotClient, SlashCommand } from '#/types/BotClient';
import {
  handleWatchCommand,
  handleUnwatchCommand,
  handleListCommand,
  handleStatusCommand,
  handleRemindNowCommand,
} from './handlers';
import { handleConfigCommand } from '#/bot/configHandler';

const logger = createLogger('slash-commands');

// Collection to store all slash commands
const commands = new Collection<string, SlashCommand>();

/**
 * Watch command - Monitor a message for reactions and send reminders
 */
const watchCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Watch a message for reactions and send reminders')
    .addStringOption(option =>
      option.setName('link').setDescription('Discord message link to watch').setRequired(false),
    )
    .addIntegerOption(option =>
      option
        .setName('interval')
        .setDescription('Reminder interval in minutes')
        .setRequired(false)
        .addChoices(
          { name: '1 minutes', value: 1 },
          { name: '2 minutes', value: 2 },
          { name: '3 minutes', value: 3 },
          { name: '5 minutes', value: 5 },
          { name: '15 minutes', value: 15 },
          { name: '30 minutes', value: 30 },
          { name: '1 hour', value: 60 },
          { name: '2 hours', value: 120 },
          { name: '6 hours', value: 360 },
          { name: '12 hours', value: 720 },
          { name: '24 hours', value: 1440 },
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleWatchCommand } = await import('./handlers');
    await handleWatchCommand(interaction, client as DiscordBotClient);
  },
};

/**
 * Unwatch command - Stop watching a message
 */
const unwatchCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('unwatch')
    .setDescription('Stop watching a message for reactions (choose from available events)'),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleUnwatchCommand } = await import('./handlers');
    await handleUnwatchCommand(interaction, client as DiscordBotClient);
  },
};

/**
 * List command - Show all watched events
 */
const listCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all watched events in this server'),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleListCommand } = await import('./handlers');
    await handleListCommand(interaction, client as DiscordBotClient);
  },
};

/**
 * Status command - Show bot status and statistics
 */
const statusCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show bot status and statistics'),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleStatusCommand } = await import('./handlers');
    await handleStatusCommand(interaction, client as DiscordBotClient);
  },
};

/**
 * Help command - Show available commands and usage
 */
const helpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and how to use them'),
  execute: async (interaction: ChatInputCommandInteraction) => {
    const embed = {
      title: '🤖 Discord Reminder Bot - Help',
      description: 'Available commands and their usage',
      color: 0x00ae86,
      fields: [
        {
          name: '📝 /watch',
          value:
            'Watch a message for reactions and send automatic reminders\n`/watch [link:<message_link>] [interval:<minutes>]`\n💡 *Run without link to choose from recent messages*',
          inline: false,
        },
        {
          name: '⏹️ /unwatch',
          value: 'Stop watching a message for reactions (interactive selection)\n`/unwatch`',
          inline: false,
        },
        {
          name: '📋 /list',
          value: 'List all watched events in this server\n`/list`',
          inline: false,
        },
        {
          name: '⚡ /remind_now',
          value:
            'Send an immediate reminder for a watched event (interactive selection)\n`/remind_now`',
          inline: false,
        },
        {
          name: '📊 /status',
          value: 'Show bot status and statistics\n`/status`',
          inline: false,
        },
        {
          name: '❓ /help',
          value: 'Show this help message\n`/help`',
          inline: false,
        },
      ],
      footer: {
        text: 'Discord Reminder Bot • TypeScript Edition',
      },
      timestamp: new Date().toISOString(),
    };

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

/**
 * Remind Now command - Send immediate reminder for a watched event
 */
const remindNowCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('remind_now')
    .setDescription(
      'Send an immediate reminder for a watched event (choose from available events)',
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleRemindNowCommand } = await import('./handlers');
    await handleRemindNowCommand(interaction, client as DiscordBotClient);
  },
};

/**
 * Config command - Manage server-specific bot configuration
 */
const configCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Manage server-specific bot configuration')
    .addSubcommand(subcommand =>
      subcommand.setName('show').setDescription('Show current server configuration'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Configure server settings')
        .addStringOption(option =>
          option
            .setName('option')
            .setDescription('Configuration option to change')
            .setRequired(true)
            .addChoices(
              { name: '📢 Canal de rappel', value: 'reminder_channel' },
              { name: '👑 Rôles administrateurs', value: 'admin_roles' },
              { name: '⏰ Intervalle par défaut', value: 'default_interval' },
              { name: '🗑️ Suppression automatique', value: 'auto_delete' },
              { name: '⏳ Délai suppression auto', value: 'auto_delete_delay' },
              { name: '📊 Limite de mentions', value: 'max_mentions' },
              { name: '🎭 Réactions par défaut', value: 'default_reactions' },
              { name: '🌍 Fuseau horaire', value: 'timezone' },
            ),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleConfigCommand } = await import('./configHandler');
    await handleConfigCommand(interaction, client);
  },
};

// Add commands to collection
commands.set(watchCommand.data.name, watchCommand);
commands.set(unwatchCommand.data.name, unwatchCommand);
commands.set(listCommand.data.name, listCommand);
commands.set(statusCommand.data.name, statusCommand);
commands.set(remindNowCommand.data.name, remindNowCommand);
commands.set(configCommand.data.name, configCommand);
commands.set(helpCommand.data.name, helpCommand);

/**
 * Setup slash commands on the client
 */
export function setupSlashCommands(client: DiscordBotClient): void {
  // Store commands collection on client for access in interaction handler
  client.commands.clear();
  commands.forEach((command, name) => {
    client.commands.set(name, command);
  });

  // Handle all interactions (slash commands and button interactions)
  client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        switch (interaction.commandName) {
          case 'watch':
            await handleWatchCommand(interaction, client as DiscordBotClient);
            break;

          case 'unwatch':
            await handleUnwatchCommand(interaction, client as DiscordBotClient);
            break;

          case 'list':
            await handleListCommand(interaction, client as DiscordBotClient);
            break;

          case 'status':
            await handleStatusCommand(interaction, client as DiscordBotClient);
            break;

          case 'remind_now':
            await handleRemindNowCommand(interaction, client as DiscordBotClient);
            break;
          case 'config':
            await handleConfigCommand(interaction, client as DiscordBotClient);
            break;

          default:
            logger.warn(`Unhandled command: ${interaction.commandName}`);
        }

        logger.info(`Command ${interaction.commandName} executed by ${interaction.user.tag}`);
      } catch (error) {
        logger.error(`Error executing command ${interaction.commandName}: ${error}`);

        try {
          const errorMessage = 'There was an error while executing this command!';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
          }
        } catch (replyError) {
          logger.error(`Could not send error message: ${replyError}`);
        }
      }
    }
    // Handle button interactions for config commands
    else if (interaction.isButton()) {
      try {
        const { handleConfigButtonInteraction } = await import('./configHandler');
        await handleConfigButtonInteraction(interaction, client);
      } catch (error) {
        logger.error(`Error handling button interaction: ${error}`);

        try {
          const errorMessage = "❌ Une erreur s'est produite lors du traitement de l'interaction.";
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
          }
        } catch (replyError) {
          logger.error(`Could not send button error message: ${replyError}`);
        }
      }
    }
  });
}

/**
 * Synchronize slash commands with Discord
 */
export async function syncSlashCommands(client: DiscordBotClient): Promise<any[]> {
  const rest = new REST().setToken(Settings.TOKEN);

  try {
    logger.info('Started refreshing application (/) commands...');

    // Prepare commands for registration
    const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());

    let synced;
    if (Settings.NODE_ENV === 'development' && Settings.GUILD_ID) {
      // Register commands to specific guild for development (faster)
      synced = await rest.put(Routes.applicationGuildCommands(client.user!.id, Settings.GUILD_ID), {
        body: commandsData,
      });
      logger.info(`Successfully registered guild-specific commands for development`);
    } else {
      // Register commands globally for production
      synced = await rest.put(Routes.applicationCommands(client.user!.id), { body: commandsData });
      logger.info(`Successfully registered global commands`);
    }

    return synced as any[];
  } catch (error) {
    logger.error('Failed to sync slash commands:', error);
    throw error;
  }
}

export { commands };
