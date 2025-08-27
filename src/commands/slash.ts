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
} from 'discord.js';
import { Settings } from '@/config/settings';
import { createLogger } from '@/utils/loggingConfig';

const logger = createLogger('slash-commands');

export interface SlashCommand {
  data: any; // SlashCommandBuilder or SlashCommandSubcommandsOnlyBuilder
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
}

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
      option
        .setName('link')
        .setDescription('Discord message link to watch')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('interval')
        .setDescription('Reminder interval in minutes')
        .setRequired(false)
        .addChoices(
          { name: '5 minutes', value: 5 },
          { name: '15 minutes', value: 15 },
          { name: '30 minutes', value: 30 },
          { name: '1 hour', value: 60 },
          { name: '2 hours', value: 120 },
          { name: '6 hours', value: 360 },
          { name: '12 hours', value: 720 },
          { name: '24 hours', value: 1440 }
        )
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleWatchCommand } = await import('./handlers');
    await handleWatchCommand(interaction, client);
  },
};

/**
 * Unwatch command - Stop watching a message
 */
const unwatchCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('unwatch')
    .setDescription('Stop watching a message for reactions')
    .addStringOption(option =>
      option
        .setName('link')
        .setDescription('Discord message link to stop watching')
        .setRequired(true)
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleUnwatchCommand } = await import('./handlers');
    await handleUnwatchCommand(interaction, client);
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
    await handleListCommand(interaction, client);
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
    await handleStatusCommand(interaction, client);
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
      color: 0x00AE86,
      fields: [
        {
          name: '📝 /watch',
          value: 'Watch a message for reactions and send automatic reminders\\n`/watch link:<message_link> [interval:<minutes>]`',
          inline: false,
        },
        {
          name: '⏹️ /unwatch',
          value: 'Stop watching a message for reactions\\n`/unwatch link:<message_link>`',
          inline: false,
        },
        {
          name: '📋 /list',
          value: 'List all watched events in this server\\n`/list`',
          inline: false,
        },
        {
          name: '📊 /status',
          value: 'Show bot status and statistics\\n`/status`',
          inline: false,
        },
        {
          name: '❓ /help',
          value: 'Show this help message\\n`/help`',
          inline: false,
        },
      ],
      footer: {
        text: 'Discord Reminder Bot • TypeScript Edition',
      },
      timestamp: new Date().toISOString(),
    };

    await interaction.reply({ embeds: [embed] });
  },
};

// Add commands to collection
commands.set(watchCommand.data.name, watchCommand);
commands.set(unwatchCommand.data.name, unwatchCommand);
commands.set(listCommand.data.name, listCommand);
commands.set(statusCommand.data.name, statusCommand);
commands.set(helpCommand.data.name, helpCommand);

/**
 * Setup slash commands on the client
 */
export function setupSlashCommands(client: Client): void {
  // Store commands collection on client for access in interaction handler
  (client as any).commands = commands;

  // Handle slash command interactions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction, client);
      logger.info(`Command ${interaction.commandName} executed by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing command ${interaction.commandName}: ${error}`);
      
      const errorMessage = 'There was an error while executing this command!';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  });
}

/**
 * Synchronize slash commands with Discord
 */
export async function syncSlashCommands(client: Client): Promise<any[]> {
  const rest = new REST().setToken(Settings.TOKEN);

  try {
    logger.info('Started refreshing application (/) commands...');

    // Prepare commands for registration
    const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());

    let synced;
    if (Settings.NODE_ENV === 'development' && Settings.GUILD_ID) {
      // Register commands to specific guild for development (faster)
      synced = await rest.put(
        Routes.applicationGuildCommands(client.user!.id, Settings.GUILD_ID),
        { body: commandsData }
      );
      logger.info(`Successfully registered guild-specific commands for development`);
    } else {
      // Register commands globally for production
      synced = await rest.put(
        Routes.applicationCommands(client.user!.id),
        { body: commandsData }
      );
      logger.info(`Successfully registered global commands`);
    }

    return synced as any[];
  } catch (error) {
    logger.error('Failed to sync slash commands:', error);
    throw error;
  }
}

export { commands };