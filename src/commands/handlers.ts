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
async function handleWatchCommand(interaction: CommandInteraction, client: Client): Promise<void> {
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
      const event = await eventManager.createEvent({\n        messageId: parsed.messageId,\n        channelId: parsed.channelId,\n        guildId: interaction.guildId!,\n        title: message.content.substring(0, 100) || 'Unnamed Event',\n        intervalMinutes,\n        lastRemindedAt: null,\n        isPaused: false,\n        usersWhoReacted: [],\n        createdAt: new Date(),\n        updatedAt: new Date(),\n      });\n\n      // Schedule reminders\n      const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;\n      await reminderScheduler.scheduleEvent(event);\n\n      // Create success embed\n      const embed = new EmbedBuilder()\n        .setColor(0x00AE86)\n        .setTitle('✅ Event Watch Started')\n        .setDescription(`Now watching the message for reactions!`)\n        .addFields(\n          { name: '📝 Message', value: `[Jump to message](${messageLink})`, inline: false },\n          { name: '⏰ Interval', value: `${intervalMinutes} minutes`, inline: true },\n          { name: '🔔 Next Reminder', value: `<t:${Math.floor((Date.now() + intervalMinutes * 60 * 1000) / 1000)}:R>`, inline: true }\n        )\n        .setFooter({ text: 'Users who react to the message will be tracked automatically' })\n        .setTimestamp();\n\n      await interaction.reply({ embeds: [embed] });\n      logger.info(`Event watch started for message ${parsed.messageId} by ${interaction.user.tag}`);\n\n    } catch (error) {\n      logger.error(`Error fetching message: ${error}`);\n      await interaction.reply('❌ Could not access the specified message. Check the link and my permissions.');\n    }\n\n  } catch (error) {\n    logger.error(`Error in watch command: ${error}`);\n    await interaction.reply('❌ An error occurred while setting up the watch. Please try again.');\n  }\n}\n\n/**\n * Handle the /unwatch command\n */\nasync function handleUnwatchCommand(interaction: CommandInteraction, client: Client): Promise<void> {\n  const messageLink = interaction.options.get('link')?.value as string;\n\n  try {\n    // Validate permissions\n    if (!interaction.guild || !interaction.member) {\n      await interaction.reply('❌ This command can only be used in servers.');\n      return;\n    }\n\n    const member = interaction.member as GuildMember;\n    if (!hasAdminRole(member)) {\n      await interaction.reply('❌ You need administrator permissions to use this command.');\n      return;\n    }\n\n    // Parse message link\n    const parsed = parseMessageLink(messageLink);\n    if (!parsed) {\n      await interaction.reply('❌ Invalid Discord message link format.');\n      return;\n    }\n\n    // Remove event using EventManager\n    const eventManager = (client as any).eventManager as EventManager;\n    const removed = await eventManager.removeEvent(parsed.messageId, interaction.guildId!);\n\n    if (removed) {\n      // Cancel scheduled reminders\n      const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;\n      await reminderScheduler.unscheduleEvent(parsed.messageId);\n\n      const embed = new EmbedBuilder()\n        .setColor(0xFF6B6B)\n        .setTitle('⏹️ Event Watch Stopped')\n        .setDescription('No longer watching the message for reactions.')\n        .addFields(\n          { name: '📝 Message', value: `[Jump to message](${messageLink})`, inline: false }\n        )\n        .setTimestamp();\n\n      await interaction.reply({ embeds: [embed] });\n      logger.info(`Event watch stopped for message ${parsed.messageId} by ${interaction.user.tag}`);\n    } else {\n      await interaction.reply('❌ This message is not currently being watched.');\n    }\n\n  } catch (error) {\n    logger.error(`Error in unwatch command: ${error}`);\n    await interaction.reply('❌ An error occurred while stopping the watch. Please try again.');\n  }\n}\n\n/**\n * Handle the /list command\n */\nasync function handleListCommand(interaction: CommandInteraction, client: Client): Promise<void> {\n  try {\n    if (!interaction.guildId) {\n      await interaction.reply('❌ This command can only be used in servers.');\n      return;\n    }\n\n    const eventManager = (client as any).eventManager as EventManager;\n    const events = await eventManager.getEventsByGuild(interaction.guildId);\n\n    if (events.length === 0) {\n      const embed = new EmbedBuilder()\n        .setColor(0xFFA500)\n        .setTitle('📋 Watched Events')\n        .setDescription('No events are currently being watched in this server.')\n        .setFooter({ text: 'Use /watch to start monitoring messages!' })\n        .setTimestamp();\n\n      await interaction.reply({ embeds: [embed] });\n      return;\n    }\n\n    // Create embed with event list\n    const embed = new EmbedBuilder()\n      .setColor(0x00AE86)\n      .setTitle('📋 Watched Events')\n      .setDescription(`Currently watching ${events.length} event(s) in this server:`)\n      .setTimestamp();\n\n    // Add fields for each event (limit to 25 fields max)\n    const maxFields = Math.min(events.length, 25);\n    for (let i = 0; i < maxFields; i++) {\n      const event = events[i];\n      const nextReminder = event.lastRemindedAt \n        ? new Date(event.lastRemindedAt.getTime() + event.intervalMinutes * 60 * 1000)\n        : new Date(Date.now() + event.intervalMinutes * 60 * 1000);\n      \n      embed.addFields({\n        name: `${i + 1}. ${event.title}`,\n        value: `Channel: <#${event.channelId}>\\nInterval: ${event.intervalMinutes}min\\nNext: <t:${Math.floor(nextReminder.getTime() / 1000)}:R>\\nReactions: ${event.usersWhoReacted.length}`,\n        inline: true\n      });\n    }\n\n    if (events.length > 25) {\n      embed.setFooter({ text: `Showing first 25 of ${events.length} events` });\n    }\n\n    await interaction.reply({ embeds: [embed] });\n    logger.info(`List command executed by ${interaction.user.tag} - ${events.length} events`);\n\n  } catch (error) {\n    logger.error(`Error in list command: ${error}`);\n    await interaction.reply('❌ An error occurred while fetching the event list. Please try again.');\n  }\n}\n\n/**\n * Handle the /status command\n */\nasync function handleStatusCommand(interaction: CommandInteraction, client: Client): Promise<void> {\n  try {\n    const eventManager = (client as any).eventManager as EventManager;\n    const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;\n    \n    // Gather statistics\n    const totalEvents = await eventManager.getTotalEventCount();\n    const guildEvents = interaction.guildId ? await eventManager.getEventsByGuild(interaction.guildId) : [];\n    const uptime = process.uptime();\n    const memoryUsage = process.memoryUsage();\n    \n    // Format uptime\n    const uptimeString = formatUptime(uptime);\n    \n    // Get scheduler status\n    const schedulerStatus = reminderScheduler.getStatus();\n    \n    const embed = new EmbedBuilder()\n      .setColor(0x00AE86)\n      .setTitle('📊 Bot Status')\n      .setDescription('Current bot status and statistics')\n      .addFields(\n        { name: '🤖 Bot Info', value: `Servers: ${client.guilds.cache.size}\\nUptime: ${uptimeString}`, inline: true },\n        { name: '📊 Events', value: `Total: ${totalEvents}\\nThis Server: ${guildEvents.length}`, inline: true },\n        { name: '⏰ Scheduler', value: `Status: ${schedulerStatus.status}\\nNext Check: ${schedulerStatus.nextCheck ? `<t:${Math.floor(schedulerStatus.nextCheck.getTime() / 1000)}:R>` : 'None'}`, inline: true },\n        { name: '💾 Memory Usage', value: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`, inline: true },\n        { name: '🏗️ Version', value: 'TypeScript Edition v2.0.0', inline: true },\n        { name: '⚙️ Mode', value: Settings.is_test_mode() ? 'Test Mode' : 'Production', inline: true }\n      )\n      .setThumbnail(client.user?.displayAvatarURL() ?? null)\n      .setFooter({ text: 'Discord Reminder Bot • TypeScript Edition' })\n      .setTimestamp();\n\n    await interaction.reply({ embeds: [embed] });\n    logger.info(`Status command executed by ${interaction.user.tag}`);\n\n  } catch (error) {\n    logger.error(`Error in status command: ${error}`);\n    await interaction.reply('❌ An error occurred while fetching bot status. Please try again.');\n  }\n}\n\n/**\n * Format uptime in human readable format\n */\nfunction formatUptime(seconds: number): string {\n  const days = Math.floor(seconds / (24 * 60 * 60));\n  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));\n  const minutes = Math.floor((seconds % (60 * 60)) / 60);\n  \n  const parts = [];\n  if (days > 0) parts.push(`${days}d`);\n  if (hours > 0) parts.push(`${hours}h`);\n  if (minutes > 0) parts.push(`${minutes}m`);\n  \n  return parts.join(' ') || '<1m';\n}