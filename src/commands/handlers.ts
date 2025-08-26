/**
 * Discord Reminder Bot - Event Handlers
 * 
 * Comprehensive event handling system that manages:
 * - Command processing and validation
 * - Event creation and management
 * - Permission checking
 * - Error handling and user feedback
 */

import {
  Client,
  CommandInteraction,
  MessageReaction,
  User,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { Settings } from '@/config/settings';
import { createLogger } from '@/utils/loggingConfig';
import { EventManager } from '@/services/eventManager';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { parseMessageLink, validateMessageLink } from '@/utils/messageParser';
import { validatePermissions, hasAdminRole } from '@/utils/permissions';

const logger = createLogger('handlers');

/**
 * Setup all event handlers for the bot
 */
export function setupEventHandlers(client: Client): void {
  logger.info('Setting up event handlers...');

  // Update slash command implementations with actual handlers
  const commands = (client as any).commands;
  
  if (commands) {
    // Watch command handler
    const watchCommand = commands.get('watch');
    if (watchCommand) {
      watchCommand.execute = async (interaction: CommandInteraction) => {
        await handleWatchCommand(interaction, client);
      };
    }

    // Unwatch command handler
    const unwatchCommand = commands.get('unwatch');
    if (unwatchCommand) {
      unwatchCommand.execute = async (interaction: CommandInteraction) => {
        await handleUnwatchCommand(interaction, client);
      };
    }

    // List command handler
    const listCommand = commands.get('list');
    if (listCommand) {
      listCommand.execute = async (interaction: CommandInteraction) => {
        await handleListCommand(interaction, client);
      };
    }

    // Status command handler
    const statusCommand = commands.get('status');
    if (statusCommand) {
      statusCommand.execute = async (interaction: CommandInteraction) => {
        await handleStatusCommand(interaction, client);
      };
    }
  }

  logger.info('Event handlers setup complete');
}

/**
 * Handle the /watch command
 */
export async function handleWatchCommand(interaction: CommandInteraction, client: Client): Promise<void> {
  const messageLink = interaction.options.get('link')?.value as string;
  const intervalMinutes = interaction.options.get('interval')?.value as number || Settings.REMINDER_INTERVAL_HOURS * 60;

  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply('❌ This command can only be used in servers.');
      return;
    }

    const member = interaction.member as GuildMember;
    if (!hasAdminRole(member)) {
      await interaction.reply('❌ You need administrator permissions to use this command.');
      return;
    }

    // Validate message link
    if (!validateMessageLink(messageLink)) {
      await interaction.reply('❌ Invalid Discord message link format.');
      return;
    }

    // Parse message link
    const parsed = parseMessageLink(messageLink);
    if (!parsed) {
      await interaction.reply('❌ Could not parse the message link.');
      return;
    }

    // Validate interval
    const minInterval = Settings.is_test_mode() ? 1 : 5;
    const maxInterval = Settings.is_test_mode() ? 10080 : 1440;
    
    if (intervalMinutes < minInterval || intervalMinutes > maxInterval) {
      await interaction.reply(`❌ Interval must be between ${minInterval} and ${maxInterval} minutes.`);
      return;
    }

    // Fetch the message to validate it exists
    try {
      const channel = await client.channels.fetch(parsed.channelId) as TextChannel;
      if (!channel) {
        await interaction.reply('❌ Could not find the specified channel.');
        return;
      }

      const message = await channel.messages.fetch(parsed.messageId);
      if (!message) {
        await interaction.reply('❌ Could not find the specified message.');
        return;
      }

      // Check bot permissions
      if (!validatePermissions(channel, client.user!)) {
        await interaction.reply('❌ I do not have permission to read/send messages in that channel.');
        return;
      }

      // Create event using EventManager
      const eventManager = (client as any).eventManager as EventManager;
      const event = await eventManager.createEvent({
        messageId: parsed.messageId,
        channelId: parsed.channelId,
        guildId: interaction.guildId!,
        title: message.content.substring(0, 100) || 'Unnamed Event',
        intervalMinutes,
        lastRemindedAt: null,
        isPaused: false,
        usersWhoReacted: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Schedule reminders
      const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;
      await reminderScheduler.scheduleEvent(event);

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('✅ Event Watch Started')
        .setDescription(`Now watching the message for reactions!`)
        .addFields(
          { name: '📝 Message', value: `[Jump to message](${messageLink})`, inline: false },
          { name: '⏰ Interval', value: `${intervalMinutes} minutes`, inline: true },
          { name: '🔔 Next Reminder', value: `<t:${Math.floor((Date.now() + intervalMinutes * 60 * 1000) / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Users who react to the message will be tracked automatically' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      logger.info(`Event watch started for message ${parsed.messageId} by ${interaction.user.tag}`);

    } catch (error) {
      logger.error(`Error fetching message: ${error}`);
      await interaction.reply('❌ Could not access the specified message. Check the link and my permissions.');
    }

  } catch (error) {
    logger.error(`Error in watch command: ${error}`);
    await interaction.reply('❌ An error occurred while setting up the watch. Please try again.');
  }
}

/**
 * Handle the /unwatch command
 */
export async function handleUnwatchCommand(interaction: CommandInteraction, client: Client): Promise<void> {
  const messageLink = interaction.options.get('link')?.value as string;

  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply('❌ This command can only be used in servers.');
      return;
    }

    const member = interaction.member as GuildMember;
    if (!hasAdminRole(member)) {
      await interaction.reply('❌ You need administrator permissions to use this command.');
      return;
    }

    // Parse message link
    const parsed = parseMessageLink(messageLink);
    if (!parsed) {
      await interaction.reply('❌ Invalid Discord message link format.');
      return;
    }

    // Remove event using EventManager
    const eventManager = (client as any).eventManager as EventManager;
    const removed = await eventManager.removeEvent(parsed.messageId, interaction.guildId!);

    if (removed) {
      // Cancel scheduled reminders
      const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;
      await reminderScheduler.unscheduleEvent(parsed.messageId);

      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('⏹️ Event Watch Stopped')
        .setDescription('No longer watching the message for reactions.')
        .addFields(
          { name: '📝 Message', value: `[Jump to message](${messageLink})`, inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      logger.info(`Event watch stopped for message ${parsed.messageId} by ${interaction.user.tag}`);
    } else {
      await interaction.reply('❌ This message is not currently being watched.');
    }

  } catch (error) {
    logger.error(`Error in unwatch command: ${error}`);
    await interaction.reply('❌ An error occurred while stopping the watch. Please try again.');
  }
}

/**
 * Handle the /list command
 */
export async function handleListCommand(interaction: CommandInteraction, client: Client): Promise<void> {
  try {
    if (!interaction.guildId) {
      await interaction.reply('❌ This command can only be used in servers.');
      return;
    }

    const eventManager = (client as any).eventManager as EventManager;
    const events = await eventManager.getEventsByGuild(interaction.guildId);

    if (events.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📋 Watched Events')
        .setDescription('No events are currently being watched in this server.')
        .setFooter({ text: 'Use /watch to start monitoring messages!' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Create embed with event list
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('📋 Watched Events')
      .setDescription(`Currently watching ${events.length} event(s) in this server:`)
      .setTimestamp();

    // Add fields for each event (limit to 25 fields max)
    const maxFields = Math.min(events.length, 25);
    for (let i = 0; i < maxFields; i++) {
      const event = events[i];
      const nextReminder = event.lastRemindedAt 
        ? new Date(event.lastRemindedAt.getTime() + event.intervalMinutes * 60 * 1000)
        : new Date(Date.now() + event.intervalMinutes * 60 * 1000);
      
      embed.addFields({
        name: `${i + 1}. ${event.title}`,
        value: `Channel: <#${event.channelId}>\nInterval: ${event.intervalMinutes}min\nNext: <t:${Math.floor(nextReminder.getTime() / 1000)}:R>\nReactions: ${event.usersWhoReacted.length}`,
        inline: true
      });
    }

    if (events.length > 25) {
      embed.setFooter({ text: `Showing first 25 of ${events.length} events` });
    }

    await interaction.reply({ embeds: [embed] });
    logger.info(`List command executed by ${interaction.user.tag} - ${events.length} events`);

  } catch (error) {
    logger.error(`Error in list command: ${error}`);
    await interaction.reply('❌ An error occurred while fetching the event list. Please try again.');
  }
}

/**
 * Handle the /status command
 */
export async function handleStatusCommand(interaction: CommandInteraction, client: Client): Promise<void> {
  try {
    const eventManager = (client as any).eventManager as EventManager;
    const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;
    
    // Gather statistics
    const totalEvents = await eventManager.getTotalEventCount();
    const guildEvents = interaction.guildId ? await eventManager.getEventsByGuild(interaction.guildId) : [];
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    // Format uptime
    const uptimeString = formatUptime(uptime);
    
    // Get scheduler status
    const schedulerStatus = reminderScheduler.getStatus();
    
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('📊 Bot Status')
      .setDescription('Current bot status and statistics')
      .addFields(
        { name: '🤖 Bot Info', value: `Servers: ${client.guilds.cache.size}\nUptime: ${uptimeString}`, inline: true },
        { name: '📊 Events', value: `Total: ${totalEvents}\nThis Server: ${guildEvents.length}`, inline: true },
        { name: '⏰ Scheduler', value: `Status: ${schedulerStatus.status}\nNext Check: ${schedulerStatus.nextCheck ? `<t:${Math.floor(schedulerStatus.nextCheck.getTime() / 1000)}:R>` : 'None'}`, inline: true },
        { name: '💾 Memory Usage', value: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`, inline: true },
        { name: '🏗️ Version', value: 'TypeScript Edition v2.0.0', inline: true },
        { name: '⚙️ Mode', value: Settings.is_test_mode() ? 'Test Mode' : 'Production', inline: true }
      )
      .setThumbnail(client.user?.displayAvatarURL() ?? null)
      .setFooter({ text: 'Discord Reminder Bot • TypeScript Edition' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info(`Status command executed by ${interaction.user.tag}`);

  } catch (error) {
    logger.error(`Error in status command: ${error}`);
    await interaction.reply('❌ An error occurred while fetching bot status. Please try again.');
  }
}

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '<1m';
}