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
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  Message,
  MessageComponentInteraction,
} from 'discord.js';
import { DiscordBotClient } from '../types/BotClient.js';
import { Settings } from '../config/settings.js';
import { createLogger } from '../utils/loggingConfig.js';
import { parseMessageLink, validateMessageLink } from '../utils/messageParser.js';
import { validatePermissions, hasAdminRole, hasGuildAdminRole } from '../utils/permissions.js';
import { createTimezoneAwareDate } from '../utils/dateUtils.js';
import { Event as EventModel } from '../models/index.js';
import {
  getSelectableMessages,
  createMessageSelectMenu,
  createMessageSelectionEmbed,
  createTimeSelectMenu,
  createTimeSelectionEmbed,
  MessageSelectionOption,
} from '../utils/messageSelector.js';

const logger = createLogger('handlers');

/**
 * Setup all event handlers for the bot
 * Note: Slash commands are handled directly in slash.ts, this function is for future expansion
 */
export function setupEventHandlers(): void {
  logger.info('Event handlers setup complete - slash commands handled in slash.ts');
}

/**
 * Handle the /watch command
 */
export async function handleWatchCommand(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
): Promise<void> {
  const messageLink = interaction.options.get('link')?.value as string;

  // New enhanced functionality: Handle interactive mode when no link is provided
  if (!messageLink) {
    return await handleInteractiveWatchCommand(interaction, client);
  }

  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get guild-specific configuration
    const guildConfig = await client.guildConfigManager.getGuildConfig(interaction.guild.id);

    const intervalMinutes =
      (interaction.options.get('interval')?.value as number) ||
      (guildConfig ? guildConfig.defaultIntervalMinutes : Settings.REMINDER_INTERVAL_HOURS * 60);

    const member = interaction.member as GuildMember;
    if (!hasGuildAdminRole(member, guildConfig?.adminRoleNames)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Validate message link
    if (!validateMessageLink(messageLink)) {
      await interaction.reply({
        content: '❌ Invalid Discord message link format.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Parse message link
    const parsed = parseMessageLink(messageLink);
    if (!parsed) {
      await interaction.reply({
        content: '❌ Could not parse the message link.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Validate interval
    const minInterval = Settings.is_test_mode() ? 1 : 5;
    const maxInterval = Settings.is_test_mode() ? 10080 : 1440;

    if (intervalMinutes < minInterval || intervalMinutes > maxInterval) {
      await interaction.reply({
        content: `❌ Interval must be between ${minInterval} and ${maxInterval} minutes.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Fetch the message to validate it exists
    try {
      const channel = (await client.channels.fetch(parsed.channelId)) as TextChannel;
      if (!channel) {
        await interaction.reply({
          content: '❌ Could not find the specified channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const message = await channel.messages.fetch(parsed.messageId);
      if (!message) {
        await interaction.reply({
          content: '❌ Could not find the specified message.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check bot permissions
      if (!validatePermissions(channel, client.user!)) {
        await interaction.reply({
          content: '❌ I do not have permission to read/send messages in that channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Create or update the event using the shared function
      const { event, isUpdate } = await createOrUpdateEvent(
        client,
        parsed.messageId,
        parsed.channelId,
        interaction.guildId!,
        message,
        intervalMinutes,
      );

      // Schedule reminders
      const reminderScheduler = client.reminderScheduler;
      await reminderScheduler.scheduleEvent(event);

      // Add default reactions to the message for new events
      if (!isUpdate) {
        await addDefaultReactionsToMessage(message, interaction.guildId!);
      }

      // Create success embed using the shared function
      const embed = createWatchSuccessEmbed(
        event,
        isUpdate,
        intervalMinutes,
        interaction.guildId!,
        parsed.channelId,
        parsed.messageId,
      );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      logger.info(
        `Event watch ${isUpdate ? 'updated' : 'started'} for message ${parsed.messageId} by ${interaction.user.tag}`,
      );
    } catch (error) {
      logger.error(`Error fetching message: ${error}`);
      await interaction.reply({
        content: '❌ Could not access the specified message. Check the link and my permissions.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    logger.error(`Error in watch command: ${error}`);
    await interaction.reply({
      content: '❌ An error occurred while setting up the watch. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle the /unwatch command
 */
export async function handleUnwatchCommand(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
): Promise<void> {
  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!hasAdminRole(member)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get all events for this guild
    const eventManager = client.eventManager;
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

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
      flags: MessageFlags.Ephemeral,
    });

    // Handle the select menu interaction
    const filter = (i: MessageComponentInteraction) =>
      i.customId === 'unwatch_select' && i.user.id === interaction.user.id;

    try {
      const selectInteraction = await interaction
        .followUp({
          content: '⏰ Waiting for your selection...',
          flags: MessageFlags.Ephemeral,
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
        if (!selectedMessageId) {
          await selectInteraction.update({
            content: '❌ No event selected.',
            components: [],
            embeds: [],
          });
          return;
        }
        const selectedEvent = events.find(e => e.messageId === selectedMessageId);

        if (!selectedEvent) {
          await selectInteraction.update({
            content: '❌ Selected event not found.',
            components: [],
            embeds: [],
          });
          return;
        }

        // Remove the event - ensure guildId is not undefined
        if (!interaction.guildId) {
          await selectInteraction.update({
            content: '❌ Guild ID is missing.',
            components: [],
            embeds: [],
          });
          return;
        }

        const removed = await eventManager.removeEvent(selectedMessageId, interaction.guildId);

        if (removed) {
          // Cancel scheduled reminders
          const reminderScheduler = client.reminderScheduler;
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
      logger.info(`Unwatch selection timed out for user ${interaction.user.tag} : ${timeoutError}`);
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
      await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Handle the /list command
 */
export async function handleListCommand(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
): Promise<void> {
  try {
    if (!interaction.guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const eventManager = client.eventManager;
    const events = await eventManager.getEventsByGuild(interaction.guildId);

    if (events.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('📋 Watched Events')
        .setDescription('No events are currently being watched in this server.')
        .setFooter({ text: 'Use /watch to start monitoring messages!' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
      if (!event) continue;

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

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info(`List command executed by ${interaction.user.tag} - ${events.length} events`);
  } catch (error) {
    logger.error(`Error in list command: ${error}`);
    await interaction.reply({
      content: '❌ An error occurred while fetching the event list. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle the /status command
 */
export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
): Promise<void> {
  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventManager = client.eventManager;
    const reminderScheduler = client.reminderScheduler;

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

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Status command executed by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error in status command: ${error}`);

    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while fetching bot status. Please try again.',
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: '❌ An error occurred while fetching bot status. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: '❌ An error occurred while fetching bot status. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      logger.error(`Could not send error message for status command: ${replyError}`);
    }
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

/**
 * Handle the /remind_now command
 */
export async function handleRemindNowCommand(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
): Promise<void> {
  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!hasAdminRole(member)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get all events for this guild
    const eventManager = client.eventManager;
    const events = await eventManager.getEventsByGuild(interaction.guildId!);

    if (events.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('📭 No Events Available')
        .setDescription('There are no events currently being watched in this server.')
        .addFields({
          name: '💡 Tip',
          value: 'Use `/watch` to start watching a message for reactions.',
          inline: false,
        })
        .setFooter({ text: 'Discord Reminder Bot • TypeScript Edition' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Create select menu options for events
    const options = events.slice(0, 25).map((event, index) => {
      const reactionCount = event.usersWhoReacted ? event.usersWhoReacted.length : 0;
      const lastReminded = event.lastRemindedAt
        ? `${Math.floor((Date.now() - new Date(event.lastRemindedAt).getTime()) / (1000 * 60 * 60))}h ago`
        : 'Never';

      return {
        label: `Event ${index + 1} - ${reactionCount} reactions`,
        description: `Last reminded: ${lastReminded} | Interval: ${event.intervalMinutes}min`,
        value: event.messageId,
        emoji: '⚡',
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`remind_now_select_${interaction.user.id}`)
      .setPlaceholder('Choose an event to send a reminder for...')
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(0x00ae86)
      .setTitle('⚡ Send Immediate Reminder')
      .setDescription(
        `Select an event from the list below to send an immediate reminder.\n\n**Found ${events.length} watched event${events.length === 1 ? '' : 's'} in this server.**`,
      )
      .addFields({
        name: '📋 How it works',
        value:
          '• Select an event from the dropdown menu\n' +
          '• A reminder will be sent immediately to the appropriate users\n' +
          '• Regular scheduled reminders will continue as normal',
        inline: false,
      })
      .setFooter({ text: 'Select an event to proceed • This menu expires in 5 minutes' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    // Set up a collector to handle the select menu interaction - simplified approach
    const filter = (selectInteraction: MessageComponentInteraction) =>
      selectInteraction.customId.startsWith('remind_now_select_') &&
      selectInteraction.user.id === interaction.user.id;

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      time: 300000, // 5 minutes
      max: 1, // Only collect one interaction
    });

    if (collector) {
      collector.on('collect', async selectInteraction => {
        try {
          await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });

          // Type guard to ensure we have a string select menu interaction
          if (!selectInteraction.isStringSelectMenu()) {
            await selectInteraction.editReply({
              content: "❌ Type d'interaction invalide.",
            });
            return;
          }

          const selectedMessageId = selectInteraction.values[0];
          const selectedEvent = events.find(event => event.messageId === selectedMessageId);

          if (!selectedEvent) {
            await selectInteraction.editReply({
              content: '❌ Selected event not found. It may have been removed.',
            });
            return;
          }

          // Get the reminder scheduler and send the reminder
          const reminderScheduler = client.reminderScheduler;

          // Use the public sendManualReminder method
          const count = await reminderScheduler.sendManualReminder(selectedEvent);

          if (count === 0) {
            await selectInteraction.editReply({
              content:
                '⚠️ No reminder was sent. This could be due to:\n' +
                '• The message was deleted\n' +
                '• Missing permissions in the target channel\n' +
                '• All users have already reacted',
            });
            return;
          }

          // Event is automatically marked as reminded by sendManualReminder

          const successEmbed = new EmbedBuilder()
            .setColor(0x00ae86)
            .setTitle('✅ Reminder Sent Successfully')
            .setDescription('The immediate reminder has been sent!')
            .addFields(
              {
                name: '📝 Event Details',
                value: `[Jump to message](https://discord.com/channels/${selectedEvent.guildId}/${selectedEvent.channelId}/${selectedEvent.messageId})`,
                inline: false,
              },
              {
                name: '👥 Users Notified',
                value: `${count} user${count === 1 ? '' : 's'} received the reminder`,
                inline: true,
              },
              {
                name: '⏰ Next Scheduled Reminder',
                value: `<t:${Math.floor((Date.now() + selectedEvent.intervalMinutes * 60 * 1000) / 1000)}:R>`,
                inline: true,
              },
            )
            .setFooter({ text: 'Regular scheduled reminders will continue as normal' })
            .setTimestamp();

          await selectInteraction.editReply({ embeds: [successEmbed] });
          logger.info(
            `Immediate reminder sent for event ${selectedEvent.messageId} by ${interaction.user.tag} - notified ${count} users`,
          );

          // Disable the select menu in the original message
          const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu.setDisabled(true).setPlaceholder('Reminder sent successfully!'),
          );

          try {
            await interaction.editReply({
              components: [disabledRow],
            });
          } catch (error) {
            logger.debug('Could not disable select menu:', error);
          }
        } catch (error) {
          logger.error(`Error sending immediate reminder: ${error}`);
          try {
            if (!selectInteraction.replied && !selectInteraction.deferred) {
              await selectInteraction.reply({
                content: '❌ An error occurred while sending the reminder. Please try again.',
                flags: MessageFlags.Ephemeral,
              });
            } else {
              await selectInteraction.editReply({
                content: '❌ An error occurred while sending the reminder. Please try again.',
              });
            }
          } catch (editError) {
            logger.error(`Could not send error message: ${editError}`);
          }
        }
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          // Timeout - disable the select menu
          const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu.setDisabled(true).setPlaceholder('Selection timed out'),
          );

          try {
            await interaction.editReply({
              components: [disabledRow],
            });
          } catch (error) {
            logger.debug('Could not disable select menu after timeout:', error);
          }
        }
      });
    }

    logger.info(
      `Remind now command executed by ${interaction.user.tag} - ${events.length} events available`,
    );
  } catch (error) {
    logger.error(`Error in remind_now command: ${error}`);
    await interaction.reply({
      content: '❌ An error occurred while preparing the reminder menu. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle the interactive /watch command when no link is provided
 */
async function handleInteractiveWatchCommand(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
): Promise<void> {
  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ This command can only be used in servers.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get guild-specific configuration for permission checking
    const guildConfig = await client.guildConfigManager.getGuildConfig(interaction.guild.id);

    const member = interaction.member as GuildMember;
    if (!hasGuildAdminRole(member, guildConfig?.adminRoleNames)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Ensure we're in a text channel
    if (!interaction.channel || interaction.channel.type !== 0) {
      // 0 = GUILD_TEXT
      await interaction.reply({
        content: '❌ This command can only be used in text channels.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.channel as TextChannel;

    // Get selectable messages from the channel
    let selectableMessages: MessageSelectionOption[];
    try {
      selectableMessages = await getSelectableMessages(channel, 10);
    } catch (error) {
      logger.error('Error fetching selectable messages:', error);
      await interaction.reply({
        content: '❌ Could not fetch messages from this channel. Please check my permissions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if we have any suitable messages
    if (selectableMessages.length === 0) {
      await interaction.reply({
        content:
          '❌ No suitable messages found in this channel. The channel needs at least one user message (not bot or system messages).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create the message selection UI
    const selectMenu = createMessageSelectMenu(
      selectableMessages,
      `watch_message_select_${interaction.user.id}`,
    );
    const embed = createMessageSelectionEmbed(selectableMessages.length);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    // Handle message selection using the extracted function
    await handleMessageSelection(interaction, client, selectableMessages, channel);
  } catch (error) {
    logger.error(`Unexpected error in watch command: ${error}`);
    await interaction.reply({
      content: '❌ An unexpected error occurred. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Interface for event creation/update result
 */
interface EventCreationResult {
  event: EventModel;
  isUpdate: boolean;
}

/**
 * Create or update an event with the given parameters
 * This function is shared between handleWatchCommand and handleInteractiveWatchCommand
 */
async function createOrUpdateEvent(
  client: DiscordBotClient,
  messageId: string,
  channelId: string,
  guildId: string,
  message: Message,
  intervalMinutes: number,
): Promise<EventCreationResult> {
  const eventManager = client.eventManager;
  const existingEvent = await eventManager.getEvent(messageId);

  let event: EventModel;
  let isUpdate = false;

  if (existingEvent) {
    // Update existing event - preserve reactions and creation date
    isUpdate = true;
    logger.info(
      `Updating existing watch for message ${messageId} - preserving ${existingEvent.usersWhoReacted.length} reactions`,
    );

    event = (await eventManager.createEvent({
      messageId,
      channelId,
      guildId,
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
    logger.info(`Creating new watch for message ${messageId}`);

    event = (await eventManager.createEvent({
      messageId,
      channelId,
      guildId,
      title: message.content.substring(0, 100) || 'Unnamed Event',
      intervalMinutes,
      lastRemindedAt: null,
      isPaused: false,
      usersWhoReacted: [],
      createdAt: createTimezoneAwareDate(),
      updatedAt: createTimezoneAwareDate(),
    })) as EventModel;
  }

  return { event, isUpdate };
}

/**
 * Handle message selection interaction for interactive watch command
 */
async function handleMessageSelection(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
  selectableMessages: MessageSelectionOption[],
  channel: TextChannel,
): Promise<void> {
  // Set up collector for message selection
  const filter = (selectInteraction: MessageComponentInteraction) =>
    selectInteraction.customId === `watch_message_select_${interaction.user.id}` &&
    selectInteraction.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        const selectedMessageId = selectInteraction.isStringSelectMenu()
          ? selectInteraction.values[0]
          : undefined;
        const selectedMessage = selectableMessages.find(m => m.messageId === selectedMessageId);

        if (!selectedMessage) {
          await selectInteraction.editReply({
            content: '❌ Selected message not found.',
            components: [],
            embeds: [],
          });
          return;
        }

        // Show time selection interface
        await handleTimeSelection(interaction, client, selectedMessage, channel, selectInteraction);
      } catch (error) {
        logger.error(`Error in message selection: ${error}`);
        await selectInteraction.editReply({
          content: '❌ An error occurred while processing your request. Please try again.',
          components: [],
          embeds: [],
        });
      }
    });
  }
}

/**
 * Handle time selection interaction for interactive watch command
 */
async function handleTimeSelection(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
  selectedMessage: MessageSelectionOption,
  channel: TextChannel,
  selectInteraction: MessageComponentInteraction,
): Promise<void> {
  const timeSelectMenu = createTimeSelectMenu(`watch_time_select_${interaction.user.id}`);
  const timeEmbed = createTimeSelectionEmbed(selectedMessage);
  const timeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(timeSelectMenu);

  await selectInteraction.editReply({
    embeds: [timeEmbed],
    components: [timeRow],
  });

  // Set up collector for time selection
  const timeFilter = (timeSelectInteraction: MessageComponentInteraction) =>
    timeSelectInteraction.customId === `watch_time_select_${interaction.user.id}` &&
    timeSelectInteraction.user.id === interaction.user.id;

  const timeCollector = interaction.channel?.createMessageComponentCollector({
    filter: timeFilter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (timeCollector) {
    timeCollector.on('collect', async timeSelectInteraction => {
      try {
        await timeSelectInteraction.deferUpdate();

        // Type guard to ensure we have a string select menu interaction
        if (!timeSelectInteraction.isStringSelectMenu()) {
          await timeSelectInteraction.editReply({
            content: "❌ Type d'interaction invalide.",
          });
          return;
        }

        const firstValue = timeSelectInteraction.values[0];
        if (!firstValue) return;
        const intervalMinutes = parseInt(firstValue);

        // Validate interval
        const minInterval = Settings.is_test_mode() ? 1 : 5;
        const maxInterval = Settings.is_test_mode() ? 10080 : 1440;

        if (intervalMinutes < minInterval || intervalMinutes > maxInterval) {
          await timeSelectInteraction.editReply({
            content: `❌ Interval must be between ${minInterval} and ${maxInterval} minutes.`,
            components: [],
            embeds: [],
          });
          return;
        }

        // Process the final event creation
        await processEventCreation(
          interaction,
          client,
          selectedMessage,
          channel,
          intervalMinutes,
          timeSelectInteraction,
        );
      } catch (error) {
        logger.error(`Error in time selection: ${error}`);
        await timeSelectInteraction.editReply({
          content: '❌ An error occurred while setting up the watch. Please try again.',
        });
      }
    });

    logger.info(
      `Watch command interactive flow completed for ${interaction.user.tag} - message: ${selectedMessage.messageId}`,
    );
  }
}

/**
 * Process the final event creation for interactive watch command
 */
async function processEventCreation(
  interaction: ChatInputCommandInteraction,
  client: DiscordBotClient,
  selectedMessage: MessageSelectionOption,
  channel: TextChannel,
  intervalMinutes: number,
  timeSelectInteraction: MessageComponentInteraction,
): Promise<void> {
  try {
    // Fetch the actual Discord message to validate it still exists
    const message = await channel.messages.fetch(selectedMessage.messageId);
    if (!message) {
      await timeSelectInteraction.editReply({
        content: '❌ The selected message was deleted.',
        components: [],
        embeds: [],
      });
      return;
    }

    // Check bot permissions
    if (!validatePermissions(channel, client.user!)) {
      await timeSelectInteraction.editReply({
        content: '❌ I do not have permission to read/send messages in this channel.',
        components: [],
        embeds: [],
      });
      return;
    }

    // Create or update the event using the shared function
    const { event, isUpdate } = await createOrUpdateEvent(
      client,
      selectedMessage.messageId,
      selectedMessage.channelId,
      interaction.guildId!,
      message,
      intervalMinutes,
    );

    // Schedule reminders
    const reminderScheduler = client.reminderScheduler;
    await reminderScheduler.scheduleEvent(event);

    // Add default reactions to the message for new events
    if (!isUpdate) {
      await addDefaultReactionsToMessage(message, interaction.guildId!);
    }

    // Create success embed using the shared function
    const embed = createWatchSuccessEmbed(
      event,
      isUpdate,
      intervalMinutes,
      interaction.guildId!,
      selectedMessage.channelId,
      selectedMessage.messageId,
    );

    await timeSelectInteraction.editReply({ embeds: [embed] });
    logger.info(
      `Event watch ${isUpdate ? 'updated' : 'started'} for message ${selectedMessage.messageId} by ${interaction.user.tag}`,
    );
  } catch (error) {
    logger.error(`Error fetching message: ${error}`);
    await timeSelectInteraction.editReply({
      content: '❌ Could not access the specified message. Check the link and my permissions.',
    });
  }
}

/**
 * Create success embed for watch command result
 * This function is shared between handleWatchCommand and processEventCreation
 */
function createWatchSuccessEmbed(
  event: EventModel,
  isUpdate: boolean,
  intervalMinutes: number,
  guildId: string,
  channelId: string,
  messageId: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle(isUpdate ? '🔄 Event Watch Updated' : '✅ Event Watch Started')
    .setDescription(
      isUpdate
        ? `Updated watch settings - preserved ${event.usersWhoReacted.length} existing reactions!`
        : `Now watching the message for reactions!`,
    )
    .addFields(
      {
        name: '📝 Message',
        value: `[Jump to message](https://discord.com/channels/${guildId}/${channelId}/${messageId})`,
        inline: false,
      },
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

  return embed;
}

/**
 * Add default reactions to a message based on guild configuration
 */
async function addDefaultReactionsToMessage(message: Message, guildId: string): Promise<void> {
  try {
    // Get guild configuration to determine default reactions
    const client = message.client as DiscordBotClient;

    const guildConfig = await client.guildConfigManager.getGuildConfig(guildId);
    const reactions = guildConfig?.defaultReactions || Settings.DEFAULT_REACTIONS;

    for (const reaction of reactions) {
      try {
        await message.react(reaction);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.warn(`Failed to add reaction ${reaction}: ${error}`);
      }
    }
  } catch (error) {
    logger.error(`Error adding default reactions: ${error}`);
    // Fallback to default reactions from settings if config manager fails
    const defaultReactions = Settings.DEFAULT_REACTIONS;
    for (const reaction of defaultReactions) {
      try {
        await message.react(reaction);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (reactionError) {
        logger.warn(`Failed to add fallback reaction ${reaction}: ${reactionError}`);
      }
    }
  }
}
