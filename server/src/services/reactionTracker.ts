/**
 * Discord Reminder Bot - Reaction Tracker Service
 *
 * Handles Discord reaction events and updates event data accordingly:
 * - Tracks when users react to watched messages
 * - Updates user reaction lists in real-time
 * - Handles both reaction additions and removals
 * - Maintains data consistency with the event manager
 */

import { MessageReaction, User } from 'discord.js';
import { createLogger } from '#/utils/loggingConfig';
import { EventManager } from './eventManager';
import { GuildConfig } from '#/models/GuildConfig';
import { Settings } from '#/config/settings';

const logger = createLogger('reaction-tracker');

/**
 * Reaction Tracker Service Class
 *
 * Monitors Discord message reactions for tracked events and maintains
 * an up-to-date list of users who have responded to each event.
 */
export class ReactionTracker {
  private eventManager: EventManager;

  constructor(eventManager: EventManager) {
    this.eventManager = eventManager;
  }

  /**
   * Récupère dynamiquement les réactions valides pour un message (via guildConfig ou fallback)
   */
  private async getValidReactionsForEvent(messageId: string): Promise<string[]> {
    const event = await this.eventManager.getEvent(messageId);
    if (!event || !event.guildId) return [...Settings.DEFAULT_REACTIONS];
    const config = await GuildConfig.findByGuildId(event.guildId);
    if (config && Array.isArray(config.defaultReactions) && config.defaultReactions.length > 0) {
      return [...config.defaultReactions];
    }
    return [...Settings.DEFAULT_REACTIONS];
  }

  /** Handle when a user adds a reaction to a message */
  async handleReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
    try {
      const messageId = reaction.message.id;
      const validReactions = await this.getValidReactionsForEvent(messageId);
      if (!validReactions.includes(reaction.emoji.name || '')) return;
      // Vérifier si le message est suivi
      const event = await this.eventManager.getEvent(messageId);
      if (!event) return;

      // Déjà dans la liste
      if (event.usersWhoReacted.includes(user.id)) {
        logger.debug(`User ${user.tag} already marked as reacted to event ${messageId}`);
        return;
      }

      // Ajouter le user
      const updatedUsers = [...event.usersWhoReacted, user.id];
      const success = await this.eventManager.updateUserReactions(messageId, updatedUsers);

      if (success) {
        logger.info(
          `User ${user.tag} reacted to event ${messageId} (${updatedUsers.length} total reactions)`,
        );
      } else {
        logger.error(`Failed to update reactions for event ${messageId}`);
      }
    } catch (error) {
      logger.error(`Error handling reaction add: ${error}`);
    }
  }

  /** Handle when a user removes a reaction from a message */
  async handleReactionRemove(reaction: MessageReaction, user: User): Promise<void> {
    try {
      const messageId = reaction.message.id;
      const validReactions = await this.getValidReactionsForEvent(messageId);
      if (!validReactions.includes(reaction.emoji.name || '')) return;

      const event = await this.eventManager.getEvent(messageId);
      if (!event) return;

      if (!event.usersWhoReacted.includes(user.id)) {
        logger.debug(`User ${user.tag} was not marked as reacted to event ${messageId}`);
        return;
      }

      const updatedUsers = event.usersWhoReacted.filter(uid => uid !== user.id);
      const success = await this.eventManager.updateUserReactions(messageId, updatedUsers);

      if (success) {
        logger.info(
          `User ${user.tag} removed reaction from event ${messageId} (${updatedUsers.length} total reactions)`,
        );
      } else {
        logger.error(`Failed to update reactions for event ${messageId}`);
      }
    } catch (error) {
      logger.error(`Error handling reaction remove: ${error}`);
    }
  }

  /**
   * Sync all reactions for a specific message (useful for initialization)
   */
  async syncReactions(messageId: string): Promise<boolean> {
    try {
      const event = await this.eventManager.getEvent(messageId);
      if (!event) {
        logger.warn(`Attempted to sync reactions for unknown event ${messageId}`);
        return false;
      }

      logger.info(`Reaction sync requested for event ${messageId}`);
      // TODO: implémenter le fetch complet avec le Message Discord et reconstruire la liste

      return true;
    } catch (error) {
      logger.error(`Error syncing reactions for event ${messageId}: ${error}`);
      return false;
    }
  }

  /** Get stats for an event */
  async getReactionStats(
    messageId: string,
  ): Promise<{ totalReactions: number; uniqueUsers: number; lastUpdated: Date } | null> {
    try {
      const event = await this.eventManager.getEvent(messageId);
      if (!event) return null;

      return {
        totalReactions: event.usersWhoReacted.length,
        uniqueUsers: new Set(event.usersWhoReacted).size,
        lastUpdated: event.updatedAt,
      };
    } catch (error) {
      logger.error(`Error getting reaction stats for event ${messageId}: ${error}`);
      return null;
    }
  }

  /** Has user reacted? */
  async hasUserReacted(messageId: string, userId: string): Promise<boolean | null> {
    try {
      const event = await this.eventManager.getEvent(messageId);
      return event ? event.usersWhoReacted.includes(userId) : null;
    } catch (error) {
      logger.error(`Error checking if user ${userId} reacted to event ${messageId}: ${error}`);
      return null;
    }
  }

  /** Get all reacted users */
  async getReactedUsers(messageId: string): Promise<string[] | null> {
    try {
      const event = await this.eventManager.getEvent(messageId);
      return event ? [...event.usersWhoReacted] : null;
    } catch (error) {
      logger.error(`Error getting reacted users for event ${messageId}: ${error}`);
      return null;
    }
  }

  /** Clear all reactions for an event */
  async clearReactions(messageId: string): Promise<boolean> {
    try {
      const success = await this.eventManager.updateUserReactions(messageId, []);
      if (success) logger.info(`Cleared all reactions for event ${messageId}`);
      return success;
    } catch (error) {
      logger.error(`Error clearing reactions for event ${messageId}: ${error}`);
      return false;
    }
  }

  /** Bulk update reactions across many events */
  async bulkUpdateReactions(updates: { messageId: string; userIds: string[] }[]): Promise<number> {
    let successCount = 0;

    for (const update of updates) {
      try {
        const success = await this.eventManager.updateUserReactions(
          update.messageId,
          update.userIds,
        );
        if (success) successCount++;
      } catch (error) {
        logger.error(`Error in bulk update for event ${update.messageId}: ${error}`);
      }
    }

    logger.info(`Bulk updated reactions for ${successCount}/${updates.length} events`);
    return successCount;
  }

  /** Global stats (simplified) */
  async getGlobalReactionStats(): Promise<{
    totalEvents: number;
    eventsWithReactions: number;
    totalReactions: number;
    averageReactionsPerEvent: number;
  }> {
    try {
      const totalEvents = await this.eventManager.getTotalEventCount();

      // TODO: fetch all events for full calculation
      const stats = {
        totalEvents,
        eventsWithReactions: 0,
        totalReactions: 0,
        averageReactionsPerEvent: 0,
      };

      logger.debug('Global reaction stats requested');
      return stats;
    } catch (error) {
      logger.error(`Error getting global reaction stats: ${error}`);
      return {
        totalEvents: 0,
        eventsWithReactions: 0,
        totalReactions: 0,
        averageReactionsPerEvent: 0,
      };
    }
  }
}
