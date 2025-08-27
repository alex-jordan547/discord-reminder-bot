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

import { Client, TextChannel, EmbedBuilder, User } from 'discord.js';
import { createLogger } from '@/utils/loggingConfig';
import { EventManager } from './eventManager';
import { Event } from '@/models/Event';
import { Settings } from '@/config/settings';

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

  constructor(client: Client, eventManager: EventManager) {
    this.client = client;
    this.eventManager = eventManager;
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
        logger.debug('All reminders are paused - entering sleep mode');
        console.log('😴 Mode veille: Tous les rappels sont en pause');
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
      console.log(
        `🕰️ Prochain rappel programmé à ${nextReminder.toISOString().substr(11, 8)} ` +
          `(dans ${(timeUntilNext / 1000).toFixed(0)}s)`,
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

    logger.debug('No watched reminders - entering sleep mode (no periodic checks)');
    console.log('😴 Mode veille: Aucun rappel surveillé, arrêt des vérifications périodiques');
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
          logger.debug('No reminders to check - entering sleep mode');
          console.log('😴 Aucun rappel à vérifier - entrée en mode veille');
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
        logger.info(`Dynamic reminders sent: ${totalReminded} people notified`);
        console.log(`✅ Rappels automatiques envoyés: ${totalReminded} personnes notifiées`);
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
        const count = await this.sendReminder(event);
        totalReminded += count;

        // Mark event as reminded
        await this.eventManager.markEventReminded(event.messageId);

        // Add delay between reminders to respect rate limits
        if (overdueEvents.length > 1) {
          await this.sleep(Settings.DELAY_BETWEEN_REMINDERS || 2000);
        }
      } catch (error) {
        logger.error(`Failed to send overdue reminder for event ${event.messageId}: ${error}`);
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
            `Successfully removed deleted message ${event.messageId} from reminder surveillance`,
          );
          console.log(
            `🗑️ Rappel supprimé automatiquement - message ${event.messageId} introuvable`,
          );
        }
        return 0;
      }

      // Update the list of users who have reacted
      await this.updateEventReactions(event, originalMessage);

      // Update the event's accessible users to reflect current server state
      await event.updateAccessibleUsersFromBot(this.client);

      // Identify missing users (only from those who can access the channel)
      const missingUsers = event.getMissingUsers();

      if (missingUsers.length === 0) {
        logger.debug(`No missing users for event ${event.messageId}`);
        return 0;
      }

      // Limit mentions to avoid spam
      const maxMentions = Settings.MAX_MENTIONS_PER_REMINDER || 50;
      const usersToMention = missingUsers.slice(0, maxMentions);
      const remaining = missingUsers.length - usersToMention.length;

      // Build the reminder message - exactly as in Python
      const mentions = usersToMention.map(userId => `<@${userId}>`).join(' ');

      const embed = new EmbedBuilder()
        .setTitle(`🔔 Rappel: ${event.title.substring(0, Settings.MAX_TITLE_LENGTH || 100)}`)
        .setDescription(
          "**Merci de mettre votre disponibilité pour l'évènement!**\n" +
            'Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)',
        )
        .setColor(0xffa500) // Orange color like in Python
        .addFields(
          {
            name: '📊 Statistiques',
            value:
              `✅ Ont répondu: **${event.getReactionCount()}**\n` +
              `❌ Manquants: **${event.getMissingUsersCount()}**\n` +
              `👥 Total joueurs: **${event.getTotalUsersCount()}**`,
            inline: false,
          },
          {
            name: "🔗 Lien vers l'évènement",
            value: `[**Cliquez ici pour voir le message**](https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId})`,
            inline: false,
          },
        );

      // Handle footer text like in Python
      if (remaining > 0) {
        const footerText = `${remaining} personne(s) supplémentaire(s) doive(nt) également répondre (limite de mentions atteinte)`;
        if (Settings.is_test_mode()) {
          const timestamp = new Date().toISOString();
          embed.setFooter({ text: `${footerText} • ${timestamp}` });
        } else {
          embed.setFooter({ text: footerText });
        }
      } else if (Settings.AUTO_DELETE_REMINDERS && Settings.AUTO_DELETE_DELAY_HOURS > 0) {
        const deleteDelayText = this.formatAutoDeleteDisplay(Settings.AUTO_DELETE_DELAY_HOURS);
        let footerText = `🗑️ Ce message s'auto-détruira dans ${deleteDelayText}`;
        if (Settings.is_test_mode()) {
          const timestamp = new Date().toISOString();
          footerText += ` • ${timestamp}`;
        }
        embed.setFooter({ text: footerText });
      }

      // Combined footer for both remaining mentions and auto-deletion
      if (remaining > 0 && Settings.AUTO_DELETE_REMINDERS && Settings.AUTO_DELETE_DELAY_HOURS > 0) {
        const deleteDelayText = this.formatAutoDeleteDisplay(Settings.AUTO_DELETE_DELAY_HOURS);
        let combinedText = `${remaining} personne(s) supplémentaire(s) doive(nt) également répondre (limite de mentions atteinte) • 🗑️ Auto-destruction dans ${deleteDelayText}`;
        if (Settings.is_test_mode()) {
          const timestamp = new Date().toISOString();
          combinedText += ` • ${timestamp}`;
        }
        embed.setFooter({ text: combinedText });
      }

      // Send the reminder message
      const sentMessage = await channel.send({
        content: mentions,
        embeds: [embed],
        allowedMentions: {
          users: usersToMention,
          repliedUser: false,
        },
      });

      // Schedule auto-deletion if enabled
      if (Settings.AUTO_DELETE_REMINDERS && Settings.AUTO_DELETE_DELAY_HOURS > 0) {
        const deleteDelay = Settings.AUTO_DELETE_DELAY_HOURS * 60 * 60 * 1000;
        setTimeout(() => {
          sentMessage.delete().catch(error => {
            logger.debug(`Could not auto-delete reminder: ${error}`);
          });
        }, deleteDelay);
      }

      logger.info(`Sent reminder for event ${event.messageId} to ${usersToMention.length} users`);
      return usersToMention.length;
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
      // Clear existing reactions
      event.setUsersWhoReacted([]);

      // Update with current reactions
      for (const reaction of message.reactions.cache.values()) {
        if (event.requiredReactions.includes(reaction.emoji.name || reaction.emoji.toString())) {
          const users = await reaction.users.fetch();
          for (const user of users.values()) {
            if (!user.bot) {
              event.addUserReaction(user.id);
            }
          }
        }
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
   * Get current scheduler status
   */
  getStatus(): SchedulerStatus {
    return { ...this.status };
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
