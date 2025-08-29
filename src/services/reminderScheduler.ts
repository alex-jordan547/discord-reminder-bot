/**
 * Discord Reminder Bot - Reminder Scheduler Service
 *
 * Advanced scheduling system that provides:
 * - Dynamic scheduling based on next reminder time
 * - Smart sleep mode when no events are active
 * - Precise timing with ±5 second accuracy
 * - Automatic rescheduling after reminders
 * - Complete 1:1 migration from Python implementation
 */

import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { createLogger } from '@/utils/loggingConfig';
import { EventManager } from './eventManager';
import { Event } from '@/models';
import { Settings } from '@/config/settings';
import { formatDateForDisplay } from '@/utils/dateUtils';
import { GuildConfigManager } from './guildConfigManager';
import { SqliteStorage } from '@/persistence/sqliteStorage';

const logger = createLogger('reminder-scheduler');

/**
 * Scheduler status information
 */
export interface SchedulerStatus {
  status: 'active' | 'sleeping' | 'stopped' | 'error';
  nextCheck: Date | null;
  activeEvents: number;
  lastReminderSent: Date | null;
}

/**
 * Reminder Scheduler Service Class
 *
 * Manages the intelligent scheduling of reminder checks and sending.
 * Uses dynamic timing to minimize resource usage while maintaining precision.
 * Migrated 1:1 from Python implementation with exact same behavior.
 */
export class ReminderScheduler {
  private client: Client;
  private eventManager: EventManager;
  private scheduledTimeout: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private status: SchedulerStatus;
  private guildConfigManager: GuildConfigManager;
  
  // Protection against infinite loops
  private failedReminders: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly FAILED_REMINDER_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  constructor(client: Client, eventManager: EventManager) {
    this.client = client;
    this.eventManager = eventManager;

    // Initialize guild configuration manager
    const storage = new SqliteStorage();
    this.guildConfigManager = new GuildConfigManager(client, storage);
    this.status = {
      status: 'stopped',
      nextCheck: null,
      activeEvents: 0,
      lastReminderSent: null,
    };
  }

  /**
   * Initialize and start the reminder scheduler
   * Equivalent to start_dynamic_reminder_system() in Python
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🎯 Système de planification dynamique des rappels activé (thread-safe)');

      this.isRunning = true;
      this.status.status = 'active';

      // Schedule the first check
      await this.scheduleNextCheck();

      logger.info('Reminder scheduler initialized and running');
    } catch (error) {
      logger.error(`Failed to initialize reminder scheduler: ${error}`);
      this.status.status = 'error';
      throw error;
    }
  }

  /**
   * Stop the reminder scheduler
   */
  stop(): void {
    logger.info('Stopping reminder scheduler...');

    this.isRunning = false;
    this.status.status = 'stopped';
    this.status.nextCheck = null;

    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }

    logger.info('Reminder scheduler stopped');
  }

  /**
   * Schedule a specific event (called when new events are created)
   */
  async scheduleEvent(event: Event): Promise<void> {
    try {
      logger.info(`Scheduling reminders for event ${event.messageId}`);

      // If scheduler is not running, start it
      if (!this.isRunning) {
        await this.initialize();
      } else {
        // Reschedule to check for this new event
        await this.scheduleNextCheck();
      }
    } catch (error) {
      logger.error(`Failed to schedule event ${event.messageId}: ${error}`);
    }
  }

  /**
   * Unschedule a specific event (called when events are removed)
   */
  async unscheduleEvent(messageId: string): Promise<void> {
    try {
      logger.info(`Unscheduling event ${messageId}`);

      // Reschedule to account for removed event
      await this.scheduleNextCheck();
    } catch (error) {
      logger.error(`Failed to unschedule event ${messageId}: ${error}`);
    }
  }

  /**
   * Schedule the next reminder check using dynamic timing
   * Equivalent to schedule_next_reminder_check() in Python
   */
  private async scheduleNextCheck(): Promise<void> {
    try {
      // Clear existing timeout
      if (this.scheduledTimeout) {
        clearTimeout(this.scheduledTimeout);
        this.scheduledTimeout = null;
      }

      if (!this.isRunning) {
        return;
      }

      // Get all active events
      const activeEvents = await this.eventManager.getActiveEvents();

      if (activeEvents.length === 0) {
        // No events to watch, enter sleep mode
        this.enterSleepMode();
        return;
      }

      // Check for overdue reminders and future reminders
      const currentTime = new Date();
      const overdueEvents: Event[] = [];
      const futureReminderTimes: Date[] = [];

      for (const event of activeEvents) {
        const nextTime = event.getNextReminderTime();
        const timeDiff = nextTime.getTime() - currentTime.getTime();

        logger.debug(
          `Reminder ${event.messageId}: next_time=${nextTime.toISOString().substr(11, 8)}, ` +
            `current=${currentTime.toISOString().substr(11, 8)}, diff=${(timeDiff / 1000).toFixed(1)}s`,
        );

        if (nextTime <= currentTime) {
          // Overdue reminder - needs immediate processing
          overdueEvents.push(event);
          logger.debug(
            `Added reminder ${event.messageId} to overdue list ` +
              `(overdue by ${(-timeDiff / 1000).toFixed(1)}s)`,
          );
        } else {
          // Future reminder
          futureReminderTimes.push(nextTime);
          logger.debug(
            `Added reminder ${event.messageId} to future list ` +
              `(due in ${(timeDiff / 1000).toFixed(1)}s)`,
          );
        }
      }

      // Handle overdue reminders immediately
      if (overdueEvents.length > 0) {
        logger.info(
          `🚨 ${overdueEvents.length} rappel(s) en retard détecté(s), traitement immédiat...`,
        );

        // Process overdue reminders immediately
        await this.checkRemindersImmediate(overdueEvents);

        // After processing overdue reminders, reschedule normally
        await this.scheduleNextCheck();
        return;
      }

      // No overdue reminders, schedule for next future reminder
      if (futureReminderTimes.length === 0) {
        logger.debug('😴 All reminders are paused - entering sleep mode');
        this.enterSleepMode();
        return;
      }

      // Calculate time until next reminder
      const nextReminder = new Date(Math.min(...futureReminderTimes.map(d => d.getTime())));
      let timeUntilNext = nextReminder.getTime() - currentTime.getTime();

      // Add small margin to avoid timing issues (5 seconds)
      timeUntilNext = Math.max(5000, timeUntilNext - 5000);

      // Limit maximum wait to prevent too long delays
      const maxWait = Settings.is_test_mode() ? 300000 : 1800000; // 5 min in test, 30 min in prod
      timeUntilNext = Math.min(timeUntilNext, maxWait);

      this.status.nextCheck = new Date(currentTime.getTime() + timeUntilNext);
      this.status.status = 'active';

      logger.debug(
        `Next reminder due at ${nextReminder.toISOString().substr(11, 8)}, ` +
          `waiting ${(timeUntilNext / 1000).toFixed(0)} seconds`,
      );

      this.scheduledTimeout = setTimeout(() => {
        this.checkReminders().catch(error => {
          logger.error(`Error in scheduled reminder check: ${error}`);
          // Reschedule after error
          setTimeout(() => this.scheduleNextCheck(), 30000);
        });
      }, timeUntilNext);
    } catch (error) {
      logger.error(`Failed to schedule next check: ${error}`);
      this.status.status = 'error';

      // Try to recover by scheduling a check in 1 minute
      setTimeout(() => this.scheduleNextCheck(), 60000);
    }
  }

  /**
   * Enter sleep mode when no events need watching
   */
  private enterSleepMode(): void {
    this.status.status = 'sleeping';
    this.status.nextCheck = null;
    this.status.activeEvents = 0;

    logger.debug('😴No watched reminders - entering sleep mode (no periodic checks)');
  }

  /**
   * Check for reminders that are due and send them
   * Equivalent to check_reminders_dynamic() in Python
   */
  private async checkReminders(): Promise<void> {
    try {
      logger.debug('Dynamic reminder check triggered...');

      const eventsNeedingReminders = await this.eventManager.getEventsNeedingReminders();

      if (eventsNeedingReminders.length === 0) {
        const activeEvents = await this.eventManager.getActiveEvents();
        if (activeEvents.length === 0) {
          logger.debug('😴No reminders to check - entering sleep mode');
          return;
        } else {
          logger.debug(`No reminders due yet. Checked ${activeEvents.length} reminders.`);
        }
      }

      let totalReminded = 0;

      for (const event of eventsNeedingReminders) {
        logger.info(
          `Reminder due for message ${event.messageId} ` +
            `(interval: ${event.intervalMinutes}min)`,
        );

        try {
          const count = await this.sendReminder(event);
          totalReminded += count;

          // Mark event as reminded
          await this.eventManager.markEventReminded(event.messageId);

          // Add delay between reminders to respect rate limits
          if (eventsNeedingReminders.length > 1) {
            await this.sleep(Settings.DELAY_BETWEEN_REMINDERS || 2000);
          }
        } catch (error) {
          logger.error(`Failed to send reminder for event ${event.messageId}: ${error}`);
        }
      }

      if (totalReminded > 0) {
        logger.info(`✅ Dynamic reminders sent: ${totalReminded} people notified`);
        this.status.lastReminderSent = new Date();
      }

      // Update active events count
      const activeEvents = await this.eventManager.getActiveEvents();
      this.status.activeEvents = activeEvents.length;

      // Schedule next check
      await this.scheduleNextCheck();
    } catch (error) {
      logger.error(`Error during reminder check: ${error}`);
      this.status.status = 'error';

      // Try to recover
      setTimeout(() => this.scheduleNextCheck(), 30000);
    }
  }

  /**
   * Check overdue reminders immediately without automatic rescheduling
   */
  private async checkRemindersImmediate(overdueEvents: Event[]): Promise<void> {
    let totalReminded = 0;

    for (const event of overdueEvents) {
      try {
        // Check if this event is in cooldown due to repeated failures
        if (this.isEventInFailureCooldown(event.messageId)) {
          logger.warn(`Event ${event.messageId} is in failure cooldown, skipping reminder`);
          continue;
        }

        const count = await this.sendReminder(event);
        totalReminded += count;

        // Mark event as reminded
        const marked = await this.eventManager.markEventReminded(event.messageId);
        
        if (marked) {
          // Success - clear any failure tracking
          this.clearFailureTracking(event.messageId);
        } else {
          // Failed to mark as reminded - track failure
          this.trackFailedReminder(event.messageId);
          logger.error(`Failed to mark event ${event.messageId} as reminded - tracking failure`);
        }

        // Add delay between reminders to respect rate limits
        if (overdueEvents.length > 1) {
          await this.sleep(Settings.DELAY_BETWEEN_REMINDERS || 2000);
        }
      } catch (error) {
        logger.error(`Failed to send overdue reminder for event ${event.messageId}: ${error}`);
        this.trackFailedReminder(event.messageId);
      }
    }

    if (totalReminded > 0) {
      logger.info(`Sent ${totalReminded} overdue reminders`);
      this.status.lastReminderSent = new Date();
    }
  }

  /**
   * Send a reminder for a specific event with full Python compatibility
   */
  private async sendReminder(event: Event): Promise<number> {
    try {
      // Get guild-specific configuration
      const guildConfig = await this.getGuildConfig(event.guildId);

      // Get the original event message to update reactions
      const channel = (await this.client.channels.fetch(event.channelId)) as TextChannel;
      if (!channel) {
        logger.error(`Could not find channel ${event.channelId} for event ${event.messageId}`);
        return 0;
      }

      // Check if bot has permissions
      const permissions = channel.permissionsFor(this.client.user!);
      if (!permissions?.has(['ViewChannel', 'SendMessages'])) {
        logger.warn(`No permission to send reminders in channel ${event.channelId}`);
        return 0;
      }

      // Get the original message
      let originalMessage;
      try {
        originalMessage = await channel.messages.fetch(event.messageId);
      } catch (error) {
        logger.error(
          `Could not fetch message ${event.messageId} from channel ${event.channelId}: ${error}`,
        );

        // Message deleted - remove reminder automatically
        logger.warn(
          `Message ${event.messageId} appears to have been deleted, removing reminder from watch list`,
        );
        const success = await this.eventManager.removeEvent(event.messageId, event.guildId);
        if (success) {
          logger.info(
            `🗑️ Successfully removed deleted message ${event.messageId} from reminder surveillance`,
          );
        }
        return 0;
      }

      // Update the list of users who have reacted
      await this.updateEventReactions(event, originalMessage);

      // Determine mention strategy based on reactions
      let mentions = '';
      let mentionStrategy = '';
      let missingUsers: string[] = [];

      if (event.usersWhoReacted.length === 0) {
        // Nobody has reacted yet - use @everyone to wake everyone up
        mentions = '@everyone';
        mentionStrategy = 'everyone';
        logger.debug(`No users have reacted for event ${event.messageId} - using @everyone`);
      } else {
        // At least someone has reacted - mention only those who haven't reacted yet
        missingUsers = await this.getMissingUsersInChannel(channel, event.usersWhoReacted);

        if (missingUsers.length === 0) {
          logger.info(
            `All accessible users have reacted to event ${event.messageId} - skipping reminder`,
          );
          return 0;
        }

        // Limit mentions to avoid spam using guild-specific configuration
        const maxMentions = guildConfig.maxMentions;
        const usersToMention = missingUsers.slice(0, maxMentions);
        mentions = usersToMention.map(userId => `<@${userId}>`).join(' ');
        mentionStrategy = 'individual';

        logger.info(
          `Event ${event.messageId}: ${event.usersWhoReacted.length} users reacted - mentioning ${usersToMention.length} missing users`,
        );
      }

      // Get total accessible users for statistics
      const totalAccessibleUsers = await this.getTotalAccessibleUsers(channel);
      const reactedCount = event.getReactionCount();

      // Build reaction instruction text using guild-configured reactions
      const configuredReactions = guildConfig.defaultReactions || ['✅', '❌', '❓'];
      const reactionText = this.buildReactionInstructionText([...configuredReactions]);

      const embed = new EmbedBuilder()
        .setTitle(`🔔 Rappel: ${event.title.substring(0, Settings.MAX_TITLE_LENGTH || 100)}`)
        .setDescription(
          "**Merci de mettre votre disponibilité pour l'évènement!**\n" + reactionText,
        )
        .setColor(0xffa500) // Orange color like in Python
        .addFields(
          {
            name: '📊 Statistiques',
            value:
              `👥 Ont réagi: **${reactedCount}/${totalAccessibleUsers}**\n` +
              `⏳ En attente de réponse: **${Math.max(0, totalAccessibleUsers - reactedCount)}** membres`,
            inline: false,
          },
          {
            name: "🔗 Lien vers l'évènement",
            value: `[**Cliquez ici pour voir le message**](https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId})`,
            inline: false,
          },
        );

      // Handle footer text with proper formatting and timezone using guild-specific configuration
      if (guildConfig.autoDeleteEnabled && guildConfig.autoDeleteDelayHours > 0) {
        const deleteDelayText = this.formatAutoDeleteDisplay(guildConfig.autoDeleteDelayHours);
        let footerText = `🗑️ Ce message s'auto-détruira dans ${deleteDelayText}`;

        if (Settings.is_test_mode()) {
          const currentTime = formatDateForDisplay(new Date());
          footerText += `\n📅 Envoyé le ${currentTime}`;
        }
        embed.setFooter({ text: footerText });
      } else if (Settings.is_test_mode()) {
        const currentTime = formatDateForDisplay(new Date());
        embed.setFooter({ text: `📅 Rappel automatique\nEnvoyé le ${currentTime}` });
      } else {
        embed.setFooter({ text: '📅 Rappel automatique' });
      }

      // Send the reminder message
      const allowedMentions =
        mentionStrategy === 'everyone'
          ? { parse: ['everyone' as const], repliedUser: false }
          : { users: missingUsers, repliedUser: false };

      const sentMessage = await channel.send({
        content: mentions,
        embeds: [embed],
        allowedMentions,
      });

      // Schedule auto-deletion if enabled using guild-specific configuration
      if (guildConfig.autoDeleteEnabled && guildConfig.autoDeleteDelayHours > 0) {
        const deleteDelay = guildConfig.autoDeleteDelayHours * 60 * 60 * 1000;
        setTimeout(() => {
          sentMessage.delete().catch(error => {
            logger.debug(`Could not auto-delete reminder: ${error}`);
          });
        }, deleteDelay);
      }

      if (mentionStrategy === 'everyone') {
        logger.info(
          `Sent reminder for event ${event.messageId} using @everyone (no reactions yet)`,
        );
      } else {
        logger.info(
          `Sent reminder for event ${event.messageId} mentioning ${missingUsers.length} users individually`,
        );
      }
      return 1; // Return 1 to indicate reminder was sent
    } catch (error) {
      logger.error(`Unexpected error in send_reminder for event ${event.messageId}: ${error}`);
      return 0;
    }
  }

  /**
   * Update event reactions from the original message
   */
  private async updateEventReactions(event: Event, message: any): Promise<void> {
    try {
      // Collect users who have reacted with standard emojis
      const reactedUsers: string[] = [];
      const standardEmojis = ['✅', '❌', '❓'];

      for (const reaction of message.reactions.cache.values()) {
        const emojiName = reaction.emoji.name || reaction.emoji.toString();
        if (standardEmojis.includes(emojiName)) {
          const users = await reaction.users.fetch();
          for (const user of users.values()) {
            if (!user.bot && !reactedUsers.includes(user.id)) {
              reactedUsers.push(user.id);
            }
          }
        }
      }

      // Update event with fresh data and save to database
      const success = await this.eventManager.updateUserReactions(event.messageId, reactedUsers);
      if (success) {
        event.usersWhoReacted = reactedUsers; // Update local object too
        logger.debug(
          `Updated reactions for event ${event.messageId}: ${reactedUsers.length} users reacted`,
        );
      } else {
        logger.error(`Failed to save updated reactions for event ${event.messageId}`);
      }
    } catch (error) {
      logger.error(`Error updating reactions for event ${event.messageId}: ${error}`);
    }
  }

  /**
   * Format auto-delete delay for display
   */
  private formatAutoDeleteDisplay(hours: number): string {
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else if (hours < 24) {
      return `${hours} heure${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.round(hours / 24);
      return `${days} jour${days > 1 ? 's' : ''}`;
    }
  }

  /**
   * Get guild-specific configuration for reminder settings
   */
  private async getGuildConfig(guildId: string) {
    try {
      const config = await this.guildConfigManager.getGuildConfig(guildId);
      return {
        maxMentions: config?.maxMentionsPerReminder ?? Settings.MAX_MENTIONS_PER_REMINDER,
        autoDeleteEnabled: config?.autoDeleteEnabled ?? Settings.AUTO_DELETE_REMINDERS,
        autoDeleteDelayHours: config?.getAutoDeleteDelayHours() ?? Settings.AUTO_DELETE_DELAY_HOURS,
        delayBetweenRemindersMs:
          config?.delayBetweenRemindersMs ?? Settings.DELAY_BETWEEN_REMINDERS,
        defaultReactions: config?.defaultReactions ?? Settings.DEFAULT_REACTIONS,
      };
    } catch (error) {
      logger.error(`Error getting guild config for ${guildId}, using defaults:`, error);
      return {
        maxMentions: Settings.MAX_MENTIONS_PER_REMINDER,
        autoDeleteEnabled: Settings.AUTO_DELETE_REMINDERS,
        autoDeleteDelayHours: Settings.AUTO_DELETE_DELAY_HOURS,
        delayBetweenRemindersMs: Settings.DELAY_BETWEEN_REMINDERS,
        defaultReactions: Settings.DEFAULT_REACTIONS,
      };
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus(): SchedulerStatus {
    return { ...this.status };
  }

  /**
   * Send a manual reminder for a specific event
   * Public method to allow manual reminder triggering from commands
   */
  async sendManualReminder(event: Event): Promise<number> {
    try {
      logger.info(`Sending manual reminder for event ${event.messageId}`);
      const count = await this.sendReminder(event);

      if (count > 0) {
        this.status.lastReminderSent = new Date();
        // Mark event as reminded (consistent with automatic reminders)
        await this.eventManager.markEventReminded(event.messageId);
      }

      return count;
    } catch (error) {
      logger.error(`Error sending manual reminder for event ${event.messageId}: ${error}`);
      return 0;
    }
  }

  /**
   * Utility function for adding delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force an immediate reminder check (for testing/debugging)
   */
  async forceCheck(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    logger.info('Forcing immediate reminder check');
    await this.checkReminders();
  }

  /**
   * Get total number of users who can access the channel (excluding bots)
   */
  private async getTotalAccessibleUsers(channel: TextChannel): Promise<number> {
    try {
      const guild = channel.guild;
      if (!guild) {
        return 0;
      }

      const members = await guild.members.fetch();
      let accessibleCount = 0;

      for (const [, member] of members) {
        // Skip bots
        if (member.user.bot) {
          continue;
        }

        // Check if user has permission to view the channel
        const permissions = channel.permissionsFor(member);
        if (permissions?.has('ViewChannel')) {
          accessibleCount++;
        }
      }

      return accessibleCount;
    } catch (error) {
      logger.error(`Error getting total accessible users for channel ${channel.id}: ${error}`);
      return 0;
    }
  }

  /**
   * Get users who have access to the channel but haven't reacted yet
   */
  private async getMissingUsersInChannel(
    channel: TextChannel,
    usersWhoReacted: string[],
  ): Promise<string[]> {
    try {
      const guild = channel.guild;
      if (!guild) {
        logger.warn('Channel has no guild, cannot get missing users');
        return [];
      }

      // Get all members who can view this channel
      const missingUsers: string[] = [];

      // Fetch all guild members (this might be cached)
      const members = await guild.members.fetch();

      for (const [userId, member] of members) {
        // Skip bots
        if (member.user.bot) {
          continue;
        }

        // Skip users who have already reacted
        if (usersWhoReacted.includes(userId)) {
          continue;
        }

        // Check if user has permission to view the channel
        const permissions = channel.permissionsFor(member);
        if (permissions?.has('ViewChannel')) {
          missingUsers.push(userId);
        }
      }

      logger.debug(
        `Found ${missingUsers.length} users who can view channel but haven't reacted yet (out of ${members.size} guild members)`,
      );

      return missingUsers;
    } catch (error) {
      logger.error(`Error getting missing users for channel ${channel.id}: ${error}`);
      return [];
    }
  }

  /**
   * Build reaction instruction text based on configured reactions
   */
  private buildReactionInstructionText(reactions: string[]): string {
    if (reactions.length === 0) {
      return 'Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)';
    }

    // Handle specific preset configurations with known meanings
    const reactionMeanings = this.getReactionMeanings(reactions);
    
    if (reactionMeanings) {
      // Use preset meanings
      const instructionParts = reactions.map((reaction, index) => {
        const meaning = reactionMeanings[index] || 'réaction';
        return `${reaction} (${meaning})`;
      });
      
      if (instructionParts.length === 2) {
        return `Réagissez avec ${instructionParts.join(' ou ')}`;
      } else if (instructionParts.length === 3) {
        return `Réagissez avec ${instructionParts[0]}, ${instructionParts[1]} ou ${instructionParts[2]}`;
      } else {
        return `Réagissez avec ${instructionParts.slice(0, -1).join(', ')} ou ${instructionParts[instructionParts.length - 1]}`;
      }
    } else {
      // Generic text for custom reactions without preset meanings
      if (reactions.length === 2) {
        return `Réagissez avec ${reactions.join(' ou ')}`;
      } else if (reactions.length === 3) {
        return `Réagissez avec ${reactions[0]}, ${reactions[1]} ou ${reactions[2]}`;
      } else {
        return `Réagissez avec ${reactions.slice(0, -1).join(', ')} ou ${reactions[reactions.length - 1]}`;
      }
    }
  }

  /**
   * Get predefined meanings for common reaction presets
   */
  private getReactionMeanings(reactions: string[]): string[] | null {
    const reactionString = reactions.join(',');
    
    // Default reactions
    if (reactionString === '✅,❌,❓') {
      return ['dispo', 'pas dispo', 'incertain'];
    }
    
    // Gaming preset
    if (reactionString === '🎮,⏰,❌') {
      return ['partant', 'en retard', 'absent'];
    }
    
    // Simple yes/no
    if (reactionString === '✅,❌') {
      return ['oui', 'non'];
    }
    
    // Thumbs up/down
    if (reactionString === '👍,👎') {
      return ['j\'aime', 'j\'aime pas'];
    }
    
    // Like/dislike/neutral/love
    if (reactionString === '👍,👎,🤷,❤️') {
      return ['j\'aime', 'j\'aime pas', 'indifférent', 'adoré'];
    }
    
    // Traffic light system
    if (reactionString === '🟢,🔴,🟡') {
      return ['go', 'stop', 'attention'];
    }
    
    return null; // No predefined meanings found
  }

  /**
   * Check if an event is in failure cooldown
   */
  private isEventInFailureCooldown(messageId: string): boolean {
    const failure = this.failedReminders.get(messageId);
    if (!failure) return false;

    const now = new Date();
    const timeSinceLastAttempt = now.getTime() - failure.lastAttempt.getTime();

    // If exceeded max attempts and still in cooldown period
    if (failure.count >= this.MAX_FAILED_ATTEMPTS && timeSinceLastAttempt < this.FAILED_REMINDER_COOLDOWN) {
      return true;
    }

    // If cooldown period has passed, reset the counter
    if (failure.count >= this.MAX_FAILED_ATTEMPTS && timeSinceLastAttempt >= this.FAILED_REMINDER_COOLDOWN) {
      logger.info(`Event ${messageId} cooldown period expired, resetting failure count`);
      this.failedReminders.delete(messageId);
      return false;
    }

    return false;
  }

  /**
   * Track a failed reminder attempt
   */
  private trackFailedReminder(messageId: string): void {
    const now = new Date();
    const failure = this.failedReminders.get(messageId);

    if (failure) {
      failure.count++;
      failure.lastAttempt = now;
    } else {
      this.failedReminders.set(messageId, { count: 1, lastAttempt: now });
    }

    const currentFailure = this.failedReminders.get(messageId)!;
    logger.warn(`Event ${messageId} failure count: ${currentFailure.count}/${this.MAX_FAILED_ATTEMPTS}`);

    if (currentFailure.count >= this.MAX_FAILED_ATTEMPTS) {
      logger.error(
        `Event ${messageId} reached max failure count (${this.MAX_FAILED_ATTEMPTS}), ` +
        `entering ${this.FAILED_REMINDER_COOLDOWN / 1000}s cooldown`
      );
    }
  }

  /**
   * Clear failure tracking for an event
   */
  private clearFailureTracking(messageId: string): void {
    if (this.failedReminders.has(messageId)) {
      logger.debug(`Clearing failure tracking for event ${messageId} after successful operation`);
      this.failedReminders.delete(messageId);
    }
  }

  /**
   * Get statistics about the scheduler
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    activeEvents: number;
    nextReminderIn: number | null;
    lastReminderSent: Date | null;
    status: string;
  }> {
    try {
      const totalEvents = await this.eventManager.getTotalEventCount();
      const activeEvents = await this.eventManager.getActiveEvents();
      const nextReminderTime = await this.eventManager.getNextReminderTime();

      const nextReminderIn = nextReminderTime ? nextReminderTime.getTime() - Date.now() : null;

      return {
        totalEvents,
        activeEvents: activeEvents.length,
        nextReminderIn,
        lastReminderSent: this.status.lastReminderSent,
        status: this.status.status,
      };
    } catch (error) {
      logger.error(`Error getting scheduler statistics: ${error}`);
      throw error;
    }
  }
}
