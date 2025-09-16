/**
 * Discord Reminder Bot - Message Parser Utilities
 *
 * Utilities for parsing and validating Discord message links:
 * - Parse Discord message URLs to extract guild, channel, and message IDs
 * - Validate message link format
 * - Fetch messages from Discord with error handling
 */

import { Client, Message, TextChannel } from 'discord.js';
import { createLogger } from './loggingConfig.js';

const logger = createLogger('message-parser');

/**
 * Parsed Discord message link components
 */
export interface ParsedMessageLink {
  guildId: string;
  channelId: string;
  messageId: string;
  url: string;
}

/**
 * Regular expression for Discord message links
 */
const DISCORD_MESSAGE_URL_REGEX = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
const DISCORD_MESSAGE_URL_REGEX_STRICT =
  /^https:\/\/discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})$/;

/**
 * Validate if a string is a properly formatted Discord message link
 */
export function validateMessageLink(link: string): boolean {
  if (typeof link !== 'string' || !link.trim()) return false;
  return DISCORD_MESSAGE_URL_REGEX_STRICT.test(link.trim());
}

/**
 * Parse a Discord message link to extract component IDs
 */
export function parseMessageLink(link: string): ParsedMessageLink | null {
  if (!link || typeof link !== 'string') {
    logger.warn('Invalid link provided to parseMessageLink');
    return null;
  }

  const trimmedLink = link.trim();
  const match = trimmedLink.match(DISCORD_MESSAGE_URL_REGEX);

  if (!match || match.length < 4) {
    logger.warn(`Invalid Discord message link format: ${trimmedLink}`);
    return null;
  }

  const [, guildId, channelId, messageId] = match;

  if (
    !guildId ||
    !channelId ||
    !messageId ||
    !isValidSnowflake(guildId) ||
    !isValidSnowflake(channelId) ||
    !isValidSnowflake(messageId)
  ) {
    logger.warn(`Invalid Discord ID format in link: ${trimmedLink}`);
    if (guildId && channelId && messageId) {
      logger.warn(
        `IDs found - Guild: ${guildId} (${guildId.length}), Channel: ${channelId} (${channelId.length}), Message: ${messageId} (${messageId.length})`,
      );
    }
    return null;
  }

  return { guildId, channelId, messageId, url: trimmedLink };
}

/**
 * Validate if a string is a valid Discord snowflake ID
 */
export function isValidSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

/**
 * Fetch a Discord message using the parsed components
 */
export async function fetchMessage(
  client: Client,
  parsed: ParsedMessageLink,
): Promise<Message | null> {
  try {
    const channel = await client.channels.fetch(parsed.channelId);

    if (!channel) {
      logger.warn(`Channel ${parsed.channelId} not found`);
      return null;
    }

    if (!channel.isTextBased()) {
      logger.warn(`Channel ${parsed.channelId} is not a text channel`);
      return null;
    }

    const textChannel = channel as TextChannel;
    const message = await textChannel.messages.fetch(parsed.messageId);

    if (!message) {
      logger.warn(`Message ${parsed.messageId} not found in channel ${parsed.channelId}`);
      return null;
    }

    return message;
  } catch (error) {
    logger.error(`Error fetching message ${parsed.messageId}: ${error}`);
    return null;
  }
}

/**
 * Build a Discord message link from IDs
 */
export function buildMessageLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/**
 * Extract message info (for display)
 */
export async function extractMessageInfo(
  client: Client,
  messageLink: string,
): Promise<{
  title: string;
  author: string;
  content: string;
  timestamp: Date;
  channelName: string;
  guildName: string;
} | null> {
  try {
    const parsed = parseMessageLink(messageLink);
    if (!parsed) return null;

    const message = await fetchMessage(client, parsed);
    if (!message) return null;

    const channel = message.channel as TextChannel;
    const guild = message.guild;
    if (!guild) {
      logger.warn(`Message ${parsed.messageId} is not in a guild`);
      return null;
    }

    let title = message.content;
    if (!title) {
      title = 'Message with attachments/embeds';
    } else if (title.length > 100) {
      title = title.substring(0, 100) + '...';
    }

    return {
      title,
      author: message.author.tag,
      content: message.content || '[No text content]',
      timestamp: message.createdAt,
      channelName: channel.name,
      guildName: guild.name,
    };
  } catch (error) {
    logger.error(`Error extracting message info: ${error}`);
    return null;
  }
}

/**
 * Validate if a message can be "watched" (bot perms, age, etc.)
 */
export async function validateWatchableMessage(
  client: Client,
  messageLink: string,
): Promise<{
  valid: boolean;
  reason?: string;
  parsed?: ParsedMessageLink;
  message?: Message;
}> {
  try {
    const parsed = parseMessageLink(messageLink);
    if (!parsed) {
      return { valid: false, reason: 'Invalid Discord message link format' };
    }

    const message = await fetchMessage(client, parsed);
    if (!message) {
      return {
        valid: false,
        reason: 'Message not found or not accessible',
        parsed,
      };
    }

    if (!message.guild) {
      return {
        valid: false,
        reason: 'Message must be in a server (not DM)',
        parsed,
        message,
      };
    }

    const channel = message.channel as TextChannel;
    const botPermissions = channel.permissionsFor(client.user!);
    if (!botPermissions) {
      return {
        valid: false,
        reason: 'Cannot determine bot permissions in that channel',
        parsed,
        message,
      };
    }

    const requiredPermissions = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
    const missingPermissions = requiredPermissions.filter(perm => !botPermissions.has(perm as any));
    if (missingPermissions.length > 0) {
      return {
        valid: false,
        reason: `Bot is missing permissions: ${missingPermissions.join(', ')}`,
        parsed,
        message,
      };
    }

    const messageAge = Date.now() - message.createdTimestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (messageAge > maxAge) {
      return {
        valid: false,
        reason: 'Message is too old (older than 30 days)',
        parsed,
        message,
      };
    }

    return { valid: true, parsed, message };
  } catch (error) {
    logger.error(`Error validating watchable message: ${error}`);
    return { valid: false, reason: 'Error occurred while validating message' };
  }
}

/**
 * Get all reactions from a message as user IDs
 */
export async function extractReactionsFromMessage(message: Message): Promise<string[]> {
  try {
    const userIds = new Set<string>();

    for (const [, reaction] of message.reactions.cache) {
      try {
        const users = await reaction.users.fetch();
        users.forEach(user => {
          if (!user.bot) userIds.add(user.id);
        });
      } catch (error) {
        logger.warn(`Error fetching users for reaction ${reaction.emoji}: ${error}`);
      }
    }

    return Array.from(userIds);
  } catch (error) {
    logger.error(`Error extracting reactions from message: ${error}`);
    return [];
  }
}

/**
 * Shorten a message link for UI display
 */
export function shortenMessageLink(link: string, maxLength = 50): string {
  if (link.length <= maxLength) return link;

  const parsed = parseMessageLink(link);
  if (parsed) {
    return `discord.com/.../channels/${parsed.channelId}/${parsed.messageId}`;
  }

  return link.substring(0, maxLength - 3) + '...';
}
