/**
 * Discord Reminder Bot - Event Manager Service
 *
 * Manages Discord event tracking including:
 * - Creating and storing events
 * - Loading events from persistent storage
 * - Updating event data and user reactions
 * - Guild-based event filtering
 */

import { createLogger } from '#/utils/loggingConfig';
import { SqliteStorage } from '#/persistence/sqliteStorage';
import { Event } from '#/models';

const logger = createLogger('event-manager');

/**
 * Event creation parameters
 */
export interface CreateEventParams {
  messageId: string;
  channelId: string;
  guildId: string;
  title: string;
  intervalMinutes: number;
  lastRemindedAt: Date | null;
  isPaused: boolean;
  usersWhoReacted: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event Manager Service Class
 *
 * Provides a high-level interface for event management operations
 * while abstracting the underlying storage implementation.
 */
export class EventManager {
  private storage: SqliteStorage;
  private events: Map<string, Event> = new Map();

  constructor() {
    this.storage = new SqliteStorage();
  }

  /** Initialize the event manager and load existing events */
  async initialize(): Promise<void> {
    try {
      await this.storage.initialize();
      await this.loadFromStorage();
      logger.info('Event manager initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize event manager: ${error}`);
      throw error;
    }
  }

  /** Create a new event and persist it to storage */
  async createEvent(params: CreateEventParams): Promise<Event> {
    logger.debug('Creating event with params:', params);
    try {
      const event = new Event(
        params.messageId,
        params.channelId,
        params.guildId,
        params.title,
        params.intervalMinutes,
        params.lastRemindedAt,
        params.isPaused,
        params.usersWhoReacted,
        params.createdAt,
        params.updatedAt,
      );

      if (!event.isValid()) throw new Error('Invalid event data');

      await this.storage.saveEvent(event);
      this.events.set(event.messageId, event);

      logger.info(`Created event for message ${event.messageId} in guild ${event.guildId}`);
      return event;
    } catch (error) {
      logger.error(`Failed to create event: ${error}`);
      throw error;
    }
  }

  /** Get an event by message ID */
  async getEvent(messageId: string): Promise<Event | null> {
    const cached = this.events.get(messageId);
    if (cached) return cached;

    try {
      const event = await this.storage.getEvent(messageId);
      if (event) this.events.set(messageId, event);
      return event;
    } catch (error) {
      logger.error(`Failed to get event ${messageId}: ${error}`);
      return null;
    }
  }

  /** Get all events for a guild */
  async getEventsByGuild(guildId: string): Promise<Event[]> {
    try {
      const events = await this.storage.getEvents({ guildId });
      events.forEach(e => this.events.set(e.messageId, e));
      return events;
    } catch (error) {
      logger.error(`Failed to get events for guild ${guildId}: ${error}`);
      return [];
    }
  }

  /** Get all active events (not paused) */
  async getActiveEvents(): Promise<Event[]> {
    try {
      const events = await this.storage.getEvents();
      events.forEach(e => this.events.set(e.messageId, e));
      return events.filter(e => !e.isPaused);
    } catch (error) {
      logger.error(`Failed to get active events: ${error}`);
      return [];
    }
  }

  /** Update an event's data */
  async updateEvent(messageId: string, updates: Partial<Event>): Promise<Event | null> {
    try {
      const event = await this.getEvent(messageId);
      if (!event) return null;

      Object.assign(event, updates);
      event.updatedAt = new Date();

      if (!event.isValid()) throw new Error('Updated event data is invalid');

      await this.storage.saveEvent(event);
      this.events.set(messageId, event);

      logger.info(`Updated event ${messageId}`);
      return event;
    } catch (error) {
      logger.error(`Failed to update event ${messageId}: ${error}`);
      throw error;
    }
  }

  /** Remove an event */
  async removeEvent(messageId: string, guildId?: string): Promise<boolean> {
    try {
      const event = await this.getEvent(messageId);
      if (!event) return false;

      if (guildId && event.guildId !== guildId) {
        logger.warn(`Attempted to remove event ${messageId} from wrong guild`);
        return false;
      }

      await this.storage.deleteEvent(messageId);
      this.events.delete(messageId);

      logger.info(`Removed event ${messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove event ${messageId}: ${error}`);
      return false;
    }
  }

  /** Update user reactions for an event */
  async updateUserReactions(messageId: string, usersWhoReacted: string[]): Promise<boolean> {
    try {
      const event = await this.getEvent(messageId);
      if (!event) return false;

      event.usersWhoReacted = usersWhoReacted;
      event.updatedAt = new Date();

      await this.storage.saveEvent(event);
      this.events.set(messageId, event);

      logger.debug(`Updated reactions for event ${messageId}: ${usersWhoReacted.length} users`);
      return true;
    } catch (error) {
      logger.error(`Failed to update reactions for event ${messageId}: ${error}`);
      return false;
    }
  }

  /** Mark an event as reminded */
  async markEventReminded(messageId: string): Promise<boolean> {
    try {
      const now = new Date();
      logger.debug(`Marking event ${messageId} as reminded at ${now.toISOString()}`);

      // Get the event and update it directly using proper setters
      const event = await this.getEvent(messageId);
      if (!event) {
        logger.error(`Event ${messageId} not found when trying to mark as reminded`);
        return false;
      }

      // Use the proper setter instead of Object.assign
      event.lastReminder = now;
      event.updatedAt = new Date();

      // Validate before saving
      if (!event.isValid()) {
        const errors = event.validate();
        logger.error(`Event ${messageId} validation failed:`, errors);
        throw new Error(
          `Event validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        );
      }

      // Save the event
      await this.storage.saveEvent(event);
      this.events.set(messageId, event);

      logger.debug(`Event ${messageId} marked as reminded: SUCCESS`);
      return true;
    } catch (error) {
      logger.error(`Failed to mark event ${messageId} as reminded: ${error}`);
      return false;
    }
  }

  /** Get total number of events */
  async getTotalEventCount(): Promise<number> {
    try {
      const events = await this.storage.getEvents();
      return events.length;
    } catch (error) {
      logger.error(`Failed to get total event count: ${error}`);
      return 0;
    }
  }

  /** Load events from storage into cache */
  async loadFromStorage(): Promise<Event[]> {
    try {
      const events = await this.storage.getEvents();
      this.events.clear();
      events.forEach(e => this.events.set(e.messageId, e));
      logger.info(`Loaded ${events.length} events from storage`);
      return events;
    } catch (error) {
      logger.error(`Failed to load events from storage: ${error}`);
      return [];
    }
  }

  /** Get events needing reminders */
  async getEventsNeedingReminders(): Promise<Event[]> {
    try {
      const active = await this.getActiveEvents();
      const now = new Date();

      return active.filter(e => {
        if (e.isPaused) return false;

        const base = e.lastRemindedAt || e.createdAt;
        const next = new Date(base.getTime() + e.intervalMinutes * 60000);
        return now >= next;
      });
    } catch (error) {
      logger.error(`Failed to get events needing reminders: ${error}`);
      return [];
    }
  }

  /** Get the next global reminder time */
  async getNextReminderTime(): Promise<Date | null> {
    try {
      const active = await this.getActiveEvents();
      if (active.length === 0) return null;

      const times = active.map(e => {
        const base = e.lastRemindedAt || e.createdAt;
        return new Date(base.getTime() + e.intervalMinutes * 60000);
      });

      return new Date(Math.min(...times.map(t => t.getTime())));
    } catch (error) {
      logger.error(`Failed to get next reminder time: ${error}`);
      return null;
    }
  }

  /** Pause or unpause an event */
  async pauseEvent(messageId: string, paused = true): Promise<boolean> {
    try {
      return (await this.updateEvent(messageId, { isPaused: paused })) !== null;
    } catch (error) {
      logger.error(`Failed to ${paused ? 'pause' : 'unpause'} event ${messageId}: ${error}`);
      return false;
    }
  }

  /** Clean up old events */
  async cleanupOldEvents(maxAgeHours: number = 24 * 30): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - maxAgeHours * 3600000);
      const all = await this.storage.getEvents();

      let cleaned = 0;
      for (const e of all) {
        const lastActivity = e.lastRemindedAt || e.createdAt;
        if (lastActivity < cutoff) {
          await this.removeEvent(e.messageId);
          cleaned++;
        }
      }

      if (cleaned > 0) logger.info(`Cleaned up ${cleaned} old events`);
      return cleaned;
    } catch (error) {
      logger.error(`Failed to cleanup old events: ${error}`);
      return 0;
    }
  }
}
