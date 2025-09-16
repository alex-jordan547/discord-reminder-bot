/**
 * Message Selection Utilities for Enhanced /watch Command
 *
 * Provides functionality to:
 * - Fetch and filter recent messages from a channel
 * - Create interactive Discord UI components for message selection
 * - Handle time interval selection interface
 */

import {
  TextChannel,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageType,
} from 'discord.js';
import { createLogger } from './loggingConfig.js';

const logger = createLogger('message-selector');

/**
 * Interface for message selection option
 */
export interface MessageSelectionOption {
  messageId: string;
  content: string;
  author: string;
  createdAt: Date;
  channelId: string;
}

/**
 * Interface for time selection option
 */
export interface TimeSelectionOption {
  label: string;
  value: number; // minutes
  category: 'quick' | 'minutes' | 'hours' | 'days';
}

/**
 * Fetch and filter the last N messages from a channel suitable for watching
 */
export async function getSelectableMessages(
  channel: TextChannel,
  limit: number = 10,
): Promise<MessageSelectionOption[]> {
  try {
    logger.debug(`Fetching last ${limit * 2} messages from channel ${channel.id}`);

    // Fetch more messages than needed to account for filtering
    const messages = await channel.messages.fetch({ limit: limit * 2 });

    // Filter messages that are suitable for watching
    const suitableMessages: MessageSelectionOption[] = [];

    for (const [, message] of messages) {
      // Skip bot messages
      if (message.author.bot) {
        continue;
      }

      // Skip system messages (only process default user messages)
      if (message.type !== MessageType.Default) {
        continue;
      }

      // Skip empty messages
      if (!message.content && message.embeds.length === 0 && message.attachments.size === 0) {
        continue;
      }

      // Add to suitable messages
      suitableMessages.push({
        messageId: message.id,
        content: message.content || '[Embed/Attachment]',
        author: message.author.username,
        createdAt: message.createdAt,
        channelId: channel.id,
      });

      // Stop when we have enough messages
      if (suitableMessages.length >= limit) {
        break;
      }
    }

    logger.info(`Found ${suitableMessages.length} suitable messages for selection`);
    return suitableMessages.slice(0, limit);
  } catch (error) {
    logger.error(`Error fetching messages from channel ${channel.id}:`, error);
    throw error;
  }
}

/**
 * Create a Discord select menu for message selection
 */
export function createMessageSelectMenu(
  messages: MessageSelectionOption[],
  customId: string = 'select_message',
): StringSelectMenuBuilder {
  const options = messages.map((message, index) => {
    // Truncate content for display (Discord limit: 100 chars for label, 100 for description)
    const truncatedContent =
      message.content.length > 80 ? message.content.substring(0, 77) + '...' : message.content;

    // Format timestamp for description
    const timeAgo = formatTimeAgo(message.createdAt);

    return new StringSelectMenuOptionBuilder()
      .setLabel(`${index + 1}. ${truncatedContent}`)
      .setDescription(`By ${message.author} • ${timeAgo}`)
      .setValue(message.messageId)
      .setEmoji('📝');
  });

  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select a message to watch for reactions...')
    .addOptions(options);
}

/**
 * Create embed for message selection interface
 */
export function createMessageSelectionEmbed(messageCount: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle('🔍 Select Message to Watch')
    .setDescription(
      `Choose which message you want to watch for reactions from the **${messageCount}** most recent messages in this channel.`,
    )
    .addFields(
      {
        name: '📋 Instructions',
        value:
          '• Select a message from the dropdown below\n' +
          '• Only user messages (not bot messages) are shown\n' +
          "• You'll then choose the reminder interval\n" +
          '• Users who react to the selected message will be tracked',
        inline: false,
      },
      {
        name: '💡 Tip',
        value:
          'You can still use `/watch` with a message link for specific messages from other channels!',
        inline: false,
      },
    )
    .setFooter({ text: 'This menu expires in 5 minutes • Discord Reminder Bot' })
    .setTimestamp();
}

/**
 * Get predefined time selection options
 */
export function getTimeSelectionOptions(): TimeSelectionOption[] {
  return [
    // Quick options
    { label: '5 minutes', value: 5, category: 'quick' },
    { label: '15 minutes', value: 15, category: 'quick' },
    { label: '30 minutes', value: 30, category: 'quick' },

    // Hours
    { label: '1 hour', value: 60, category: 'hours' },
    { label: '2 hours', value: 120, category: 'hours' },
    { label: '6 hours', value: 360, category: 'hours' },
    { label: '12 hours', value: 720, category: 'hours' },

    // Days
    { label: '1 day (24 hours)', value: 1440, category: 'days' },
    { label: '2 days (48 hours)', value: 2880, category: 'days' },
    { label: '1 week (7 days)', value: 10080, category: 'days' },
  ];
}

/**
 * Create time selection menu
 */
export function createTimeSelectMenu(customId: string = 'select_time'): StringSelectMenuBuilder {
  const timeOptions = getTimeSelectionOptions();

  const options = timeOptions.map(option =>
    new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setDescription(`Remind every ${option.label.toLowerCase()}`)
      .setValue(option.value.toString())
      .setEmoji(getTimeEmoji(option.category)),
  );

  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Choose reminder interval...')
    .addOptions(options);
}

/**
 * Create embed for time selection interface
 */
export function createTimeSelectionEmbed(selectedMessage: MessageSelectionOption): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle('⏰ Select Reminder Interval')
    .setDescription(
      `Now choose how often you want to be reminded about reactions to the selected message.`,
    )
    .addFields(
      {
        name: '📝 Selected Message',
        value: `"${selectedMessage.content.substring(0, 100)}${selectedMessage.content.length > 100 ? '...' : ''}"`,
        inline: false,
      },
      {
        name: '👤 Author',
        value: selectedMessage.author,
        inline: true,
      },
      {
        name: '🕐 Posted',
        value: `<t:${Math.floor(selectedMessage.createdAt.getTime() / 1000)}:R>`,
        inline: true,
      },
      {
        name: '⚡ How It Works',
        value:
          '• Choose an interval from the dropdown below\n' +
          "• Reminders will be sent to users who haven't reacted\n" +
          '• The bot will track reactions automatically',
        inline: false,
      },
    )
    .setFooter({ text: 'This menu expires in 5 minutes • Discord Reminder Bot' })
    .setTimestamp();
}

/**
 * Format time ago string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Get emoji for time category
 */
function getTimeEmoji(category: string): string {
  switch (category) {
    case 'quick':
      return '⚡';
    case 'minutes':
      return '🕐';
    case 'hours':
      return '🕑';
    case 'days':
      return '📅';
    default:
      return '⏰';
  }
}
