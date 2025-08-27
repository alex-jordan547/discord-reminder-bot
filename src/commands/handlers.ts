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
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { Settings } from '@/config/settings';
import { createLogger } from '@/utils/loggingConfig';
import { EventManager } from '@/services/eventManager';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { parseMessageLink, validateMessageLink } from '@/utils/messageParser';
import { validatePermissions, hasAdminRole } from '@/utils/permissions';
import { createTimezoneAwareDate } from '@/utils/dateUtils';
import { Event as EventModel } from '@/models/Event';

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
        return await handleWatchCommand(interaction as ChatInputCommandInteraction, client);
      };
    }

    // Unwatch command handler
    const unwatchCommand = commands.get('unwatch');
    if (unwatchCommand) {
      unwatchCommand.execute = async (interaction: CommandInteraction) => {
        await handleUnwatchCommand(interaction as ChatInputCommandInteraction, client);
      };
    }

    // List command handler
    const listCommand = commands.get('list');
    if (listCommand) {
      listCommand.execute = async (interaction: CommandInteraction) => {
        await handleListCommand(interaction as ChatInputCommandInteraction, client);
      };
    }

    // Status command handler
    const statusCommand = commands.get('status');
    if (statusCommand) {
      statusCommand.execute = async (interaction: CommandInteraction) => {
        await handleStatusCommand(interaction as ChatInputCommandInteraction, client);
      };
    }
  }

  logger.info('Event handlers setup complete');
}

/**
 * Handle the /watch command
 */
export async function handleWatchCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const messageLink = interaction.options.get('link')?.value as string;
  const intervalMinutes =
    (interaction.options.get('interval')?.value as number) || Settings.REMINDER_INTERVAL_HOURS * 60;

  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!hasAdminRole(member)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        ephemeral: true,
      });
      return;
    }

    // Validate message link
    if (!validateMessageLink(messageLink)) {
      await interaction.reply({
        content: '❌ Invalid Discord message link format.',
        ephemeral: true,
      });
      return;
    }

    // Parse message link
    const parsed = parseMessageLink(messageLink);
    if (!parsed) {
      await interaction.reply({ content: '❌ Could not parse the message link.', ephemeral: true });
      return;
    }

    // Validate interval
    const minInterval = Settings.is_test_mode() ? 1 : 5;
    const maxInterval = Settings.is_test_mode() ? 10080 : 1440;

    if (intervalMinutes < minInterval || intervalMinutes > maxInterval) {
      await interaction.reply({
        content: `❌ Interval must be between ${minInterval} and ${maxInterval} minutes.`,
        ephemeral: true,
      });
      return;
    }

    // Fetch the message to validate it exists
    try {
      const channel = (await client.channels.fetch(parsed.channelId)) as TextChannel;
      if (!channel) {
        await interaction.reply({
          content: '❌ Could not find the specified channel.',
          ephemeral: true,
        });
        return;
      }

      const message = await channel.messages.fetch(parsed.messageId);
      if (!message) {
        await interaction.reply({
          content: '❌ Could not find the specified message.',
          ephemeral: true,
        });
        return;
      }

      // Check bot permissions
      if (!validatePermissions(channel, client.user!)) {
        await interaction.reply({
          content: '❌ I do not have permission to read/send messages in that channel.',
          ephemeral: true,
        });
        return;
      }

      // Check if event already exists to preserve data
      const eventManager = (client as any).eventManager as EventManager;
      const existingEvent = await eventManager.getEvent(parsed.messageId);

      let event: EventModel;
      let isUpdate = false;

      if (existingEvent) {
        // Update existing event - preserve reactions and creation date
        isUpdate = true;
        logger.info(
          `Updating existing watch for message ${parsed.messageId} - preserving ${existingEvent.usersWhoReacted.length} reactions`,
        );

        event = (await eventManager.createEvent({
          messageId: parsed.messageId,
          channelId: parsed.channelId,
          guildId: interaction.guildId!,
          title: message.content.substring(0, 100) || 'Unnamed Event',
          intervalMinutes,
          lastRemindedAt: existingEvent.lastRemindedAt, // Preserve last reminder time
          isPaused: false, // Reset pause state when user updates
          usersWhoReacted: existingEvent.usersWhoReacted, // Preserve existing reactions
          createdAt: existingEvent.createdAt, // Preserve original creation date
          updatedAt: createTimezoneAwareDate(),
        })) as EventModel;
      } else {
        // Create new event
        logger.info(`Creating new watch for message ${parsed.messageId}`);

        event = (await eventManager.createEvent({
          messageId: parsed.messageId,
          channelId: parsed.channelId,
          guildId: interaction.guildId!,
          title: message.content.substring(0, 100) || 'Unnamed Event',
          intervalMinutes,
          lastRemindedAt: null,
          isPaused: false,
          usersWhoReacted: [],
          createdAt: createTimezoneAwareDate(),
          updatedAt: createTimezoneAwareDate(),
        })) as EventModel;
      }

      // Schedule reminders
      const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;
      await reminderScheduler.scheduleEvent(event);

      // Create success embed with appropriate title and description
      const embed = new EmbedBuilder()
        .setColor(0x00ae86)
        .setTitle(isUpdate ? '🔄 Event Watch Updated' : '✅ Event Watch Started')
        .setDescription(
          isUpdate
            ? `Updated watch settings - preserved ${event.usersWhoReacted.length} existing reactions!`
            : `Now watching the message for reactions!`,
        )
        .addFields(
          { name: '📝 Message', value: `[Jump to message](${messageLink})`, inline: false },
          { name: '⏰ Interval', value: `${intervalMinutes} minutes`, inline: true },
          {
            name: '🔔 Next Reminder',
            value: `<t:${Math.floor((Date.now() + intervalMinutes * 60 * 1000) / 1000)}:R>`,
            inline: true,
          },
        );

      // Add reaction count field for updates
      if (isUpdate && event.usersWhoReacted.length > 0) {
        embed.addFields({
          name: '👥 Current Reactions',
          value: `${event.usersWhoReacted.length} users have reacted`,
          inline: true,
        });
      }

      embed
        .setFooter({ text: 'Users who react to the message will be tracked automatically' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      logger.info(
        `Event watch ${isUpdate ? 'updated' : 'started'} for message ${parsed.messageId} by ${interaction.user.tag}`,
      );
    } catch (error) {
      logger.error(`Error fetching message: ${error}`);
      await interaction.reply({
        content: '❌ Could not access the specified message. Check the link and my permissions.',
        ephemeral: true,
      });
    }
  } catch (error) {
    logger.error(`Error in watch command: ${error}`);
    await interaction.reply({
      content: '❌ An error occurred while setting up the watch. Please try again.',
      ephemeral: true,
    });
  }
}

/**
 * Handle the /unwatch command
 */
export async function handleUnwatchCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!hasAdminRole(member)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        ephemeral: true,
      });
      return;
    }

    // Get all events for this guild
    const eventManager = (client as any).eventManager as EventManager;
    const events = await eventManager.getEventsByGuild(interaction.guildId!);

    if (events.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('📭 No Events to Unwatch')
        .setDescription('There are no events currently being watched in this server.')
        .addFields({
          name: '💡 Tip',
          value: 'Use `/watch` to start watching messages for reactions!',
          inline: false,
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Create select menu with available events (max 25 options)
    const selectOptions = events.slice(0, 25).map((event, index) => {
      // Truncate title if too long for Discord select menu
      const displayTitle =
        event.title.length > 80 ? event.title.substring(0, 80) + '...' : event.title;

      return {
        label: `${index + 1}. ${displayTitle}`,
        description: `Channel: #${event.channelId} • Interval: ${event.intervalMinutes}min`,
        value: event.messageId,
        emoji: event.isPaused ? '⏸️' : '👁️',
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('unwatch_select')
      .setPlaceholder('Choose an event to stop watching...')
      .addOptions(selectOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('⏹️ Select Event to Unwatch')
      .setDescription(
        `Choose which event you want to stop watching from the **${events.length}** active event${events.length > 1 ? 's' : ''} in this server:`,
      )
      .addFields({
        name: '📝 Events List',
        value:
          events
            .slice(0, 10)
            .map(
              (event, index) =>
                `${index + 1}. ${event.title.length > 50 ? event.title.substring(0, 50) + '...' : event.title}`,
            )
            .join('\n') + (events.length > 10 ? `\n... and ${events.length - 10} more` : ''),
        inline: false,
      })
      .setFooter({ text: `Total: ${events.length} event${events.length > 1 ? 's' : ''}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });

    // Handle the select menu interaction
    const filter = (i: any) => i.customId === 'unwatch_select' && i.user.id === interaction.user.id;

    try {
      const selectInteraction = await interaction
        .followUp({
          content: '⏰ Waiting for your selection...',
          ephemeral: true,
          fetchReply: true,
        })
        .then(() =>
          interaction.channel?.awaitMessageComponent({
            filter,
            time: 60000, // 60 seconds timeout
          }),
        );

      if (selectInteraction && selectInteraction.isStringSelectMenu()) {
        const selectedMessageId = selectInteraction.values[0];
        const selectedEvent = events.find(e => e.messageId === selectedMessageId);

        if (!selectedEvent) {
          await selectInteraction.update({
            content: '❌ Selected event not found.',
            components: [],
            embeds: [],
          });
          return;
        }

        // Remove the event
        const removed = await eventManager.removeEvent(selectedMessageId, interaction.guildId!);

        if (removed) {
          // Cancel scheduled reminders
          const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;
          await reminderScheduler.unscheduleEvent(selectedMessageId);

          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Event Watch Stopped')
            .setDescription('Successfully stopped watching the selected event.')
            .addFields(
              {
                name: '📝 Event',
                value: selectedEvent.title,
                inline: false,
              },
              {
                name: '📍 Channel',
                value: `<#${selectedEvent.channelId}>`,
                inline: true,
              },
              {
                name: '⏰ Was Interval',
                value: `${selectedEvent.intervalMinutes} minutes`,
                inline: true,
              },
            )
            .setTimestamp();

          await selectInteraction.update({
            embeds: [successEmbed],
            components: [],
          });

          logger.info(
            `Event watch stopped for message ${selectedMessageId} by ${interaction.user.tag}`,
          );
        } else {
          await selectInteraction.update({
            content: '❌ Failed to stop watching the selected event.',
            components: [],
            embeds: [],
          });
        }
      }
    } catch (timeoutError) {
      // Handle timeout
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('⏰ Selection Timeout')
        .setDescription('You took too long to select an event. Please run the command again.')
        .setTimestamp();

      try {
        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: [],
        });
      } catch (editError) {
        logger.warn('Could not edit reply after timeout:', editError);
      }
    }
  } catch (error) {
    logger.error(`Error in unwatch command: ${error}`);

    const errorMessage =
      '❌ An error occurred while processing the unwatch command. Please try again.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

/**
 * Handle the /list command
 */
export async function handleListCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  try {
    if (!interaction.guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        ephemeral: true,
      });
      return;
    }

    const eventManager = (client as any).eventManager as EventManager;
    const events = await eventManager.getEventsByGuild(interaction.guildId);

    if (events.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('📋 Watched Events')
        .setDescription('No events are currently being watched in this server.')
        .setFooter({ text: 'Use /watch to start monitoring messages!' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Create embed with event list
    const embed = new EmbedBuilder()
      .setColor(0x00ae86)
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
        inline: true,
      });
    }

    if (events.length > 25) {
      embed.setFooter({ text: `Showing first 25 of ${events.length} events` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    logger.info(`List command executed by ${interaction.user.tag} - ${events.length} events`);
  } catch (error) {
    logger.error(`Error in list command: ${error}`);
    await interaction.reply({
      content: '❌ An error occurred while fetching the event list. Please try again.',
      ephemeral: true,
    });
  }
}

/**
 * Handle the /status command
 */
export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  try {
    const eventManager = (client as any).eventManager as EventManager;
    const reminderScheduler = (client as any).reminderScheduler as ReminderScheduler;

    // Gather statistics
    const totalEvents = await eventManager.getTotalEventCount();
    const guildEvents = interaction.guildId
      ? await eventManager.getEventsByGuild(interaction.guildId)
      : [];
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    // Format uptime
    const uptimeString = formatUptime(uptime);

    // Get scheduler status
    const schedulerStatus = reminderScheduler.getStatus();

    const embed = new EmbedBuilder()
      .setColor(0x00ae86)
      .setTitle('📊 Bot Status')
      .setDescription('Current bot status and statistics')
      .addFields(
        {
          name: '🤖 Bot Info',
          value: `Servers: ${client.guilds.cache.size}\nUptime: ${uptimeString}`,
          inline: true,
        },
        {
          name: '📊 Events',
          value: `Total: ${totalEvents}\nThis Server: ${guildEvents.length}`,
          inline: true,
        },
        {
          name: '⏰ Scheduler',
          value: `Status: ${schedulerStatus.status}\nNext Check: ${schedulerStatus.nextCheck ? `<t:${Math.floor(schedulerStatus.nextCheck.getTime() / 1000)}:R>` : 'None'}`,
          inline: true,
        },
        {
          name: '💾 Memory Usage',
          value: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          inline: true,
        },
        { name: '🏗️ Version', value: 'TypeScript Edition v2.0.0', inline: true },
        {
          name: '⚙️ Mode',
          value: Settings.is_test_mode() ? 'Test Mode' : 'Production',
          inline: true,
        },
      )
      .setThumbnail(client.user?.displayAvatarURL() ?? null)
      .setFooter({ text: 'Discord Reminder Bot • TypeScript Edition' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    logger.info(`Status command executed by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error in status command: ${error}`);
    await interaction.reply({
      content: '❌ An error occurred while fetching bot status. Please try again.',
      ephemeral: true,
    });
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
