/**
 * Database layer using Drizzle ORM - replaces the old sqlite3 implementation
 *
 * This module provides a clean, type-safe interface for database operations
 * using the modern Drizzle ORM with better-sqlite3 as recommended in the documentation.
 */

import { db, schema, eq, and, or, desc, isNull } from '@/db/index.js';
import type {
  Event as DbEvent,
  NewEvent,
  User as DbUser,
  NewUser,
  Guild as DbGuild,
  NewGuild,
  GuildConfig as DbGuildConfig,
  NewGuildConfig,
  ReminderLog as DbReminderLog,
  NewReminderLog,
} from '@/db/schema.js';
import { createLogger } from '@/utils/loggingConfig.js';

const logger = createLogger('database-repositories');

/**
 * Database repository for Events
 */
export class EventRepository {
  /**
   * Get all events for a specific guild
   */
  async getByGuild(guildId: string): Promise<DbEvent[]> {
    logger.debug(`Fetching events for guild: ${guildId}`);

    try {
      const database = await db.getDb();
      const events = await database
        .select()
        .from(schema.events)
        .where(eq(schema.events.guildId, guildId));

      logger.info(`Retrieved ${events.length} events for guild ${guildId}`);
      return events;
    } catch (error) {
      logger.error(`Failed to fetch events for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific event by message ID
   */
  async getByMessageId(messageId: string): Promise<DbEvent | undefined> {
    logger.debug(`Fetching event by message ID: ${messageId}`);

    try {
      const database = await db.getDb();
      const results = await database
        .select()
        .from(schema.events)
        .where(eq(schema.events.messageId, messageId));

      if (results[0]) {
        logger.debug(`Found event for message ${messageId}`);
      } else {
        logger.debug(`No event found for message ${messageId}`);
      }

      return results[0];
    } catch (error) {
      logger.error(`Failed to fetch event for message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Get events that need reminders (not paused and due for reminder)
   */
  async getDueForReminder(): Promise<DbEvent[]> {
    logger.debug('Fetching events due for reminder');

    try {
      const database = await db.getDb();
      const events = await database
        .select()
        .from(schema.events)
        .where(
          and(
            eq(schema.events.isPaused, false),
            or(
              // Never sent a reminder
              isNull(schema.events.lastRemindedAt),
              // Or it's time for the next reminder based on interval
              // This would need a more complex query for proper interval calculation
            ),
          ),
        );

      logger.info(`Found ${events.length} events due for reminder`);
      return events;
    } catch (error) {
      logger.error('Failed to fetch events due for reminder:', error);
      throw error;
    }
  }

  /**
   * Create a new event
   */
  async create(eventData: NewEvent): Promise<DbEvent> {
    logger.info(
      `Creating new event for message ${eventData.messageId} in guild ${eventData.guildId}`,
    );

    try {
      const database = await db.getDb();
      await database.insert(schema.events).values(eventData);

      const created = await this.getByMessageId(eventData.messageId);
      if (!created) {
        throw new Error('Failed to create event');
      }

      logger.info(`Successfully created event: ${eventData.title} (${eventData.messageId})`);
      return created;
    } catch (error) {
      logger.error(`Failed to create event for message ${eventData.messageId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing event
   */
  async update(messageId: string, updates: Partial<NewEvent>): Promise<DbEvent> {
    logger.info(`Updating event for message ${messageId}`);

    try {
      const database = await db.getDb();
      await database
        .update(schema.events)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.events.messageId, messageId));

      const updated = await this.getByMessageId(messageId);
      if (!updated) {
        throw new Error('Event not found after update');
      }

      logger.info(`Successfully updated event: ${messageId}`);
      return updated;
    } catch (error) {
      logger.error(`Failed to update event ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an event
   */
  async delete(messageId: string): Promise<void> {
    logger.info(`Deleting event for message ${messageId}`);

    try {
      const database = await db.getDb();
      await database.delete(schema.events).where(eq(schema.events.messageId, messageId));

      logger.info(`Successfully deleted event: ${messageId}`);
    } catch (error) {
      logger.error(`Failed to delete event ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Update users who reacted to an event
   */
  async updateUsersWhoReacted(messageId: string, userIds: string[]): Promise<void> {
    logger.debug(`Updating users who reacted to event ${messageId}: ${userIds.length} users`);

    try {
      const database = await db.getDb();
      await database
        .update(schema.events)
        .set({
          usersWhoReacted: JSON.stringify(userIds),
          updatedAt: new Date(),
        })
        .where(eq(schema.events.messageId, messageId));

      logger.debug(`Successfully updated reactions for event ${messageId}`);
    } catch (error) {
      logger.error(`Failed to update reactions for event ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Mark event as reminded
   */
  async markAsReminded(messageId: string): Promise<void> {
    logger.debug(`Marking event ${messageId} as reminded`);

    try {
      const database = await db.getDb();
      await database
        .update(schema.events)
        .set({
          lastRemindedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.events.messageId, messageId));

      logger.debug(`Successfully marked event ${messageId} as reminded`);
    } catch (error) {
      logger.error(`Failed to mark event ${messageId} as reminded:`, error);
      throw error;
    }
  }
}

/**
 * Database repository for Users
 */
export class UserRepository {
  /**
   * Get all users for a specific guild
   */
  async getByGuild(guildId: string): Promise<DbUser[]> {
    logger.debug(`Fetching users for guild: ${guildId}`);

    try {
      const database = await db.getDb();
      const users = await database
        .select()
        .from(schema.users)
        .where(eq(schema.users.guildId, guildId));

      logger.info(`Retrieved ${users.length} users for guild ${guildId}`);
      return users;
    } catch (error) {
      logger.error(`Failed to fetch users for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific user by user ID and guild ID
   */
  async getByUserAndGuild(userId: string, guildId: string): Promise<DbUser | undefined> {
    logger.debug(`Fetching user ${userId} in guild ${guildId}`);

    try {
      const database = await db.getDb();
      const results = await database
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.userId, userId), eq(schema.users.guildId, guildId)));

      if (results[0]) {
        logger.debug(`Found user ${userId} in guild ${guildId}`);
      } else {
        logger.debug(`User ${userId} not found in guild ${guildId}`);
      }

      return results[0];
    } catch (error) {
      logger.error(`Failed to fetch user ${userId} in guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Create or update a user
   */
  async upsert(userData: NewUser): Promise<DbUser> {
    logger.info(`Upserting user ${userData.userId} in guild ${userData.guildId}`);

    try {
      const database = await db.getDb();
      const existing = await this.getByUserAndGuild(userData.userId, userData.guildId);

      if (existing) {
        logger.debug(`Updating existing user ${userData.userId}`);
        await database
          .update(schema.users)
          .set({ ...userData, updatedAt: new Date() })
          .where(
            and(
              eq(schema.users.userId, userData.userId),
              eq(schema.users.guildId, userData.guildId),
            ),
          );
      } else {
        logger.debug(`Creating new user ${userData.userId}`);
        await database.insert(schema.users).values(userData);
      }

      const result = await this.getByUserAndGuild(userData.userId, userData.guildId);
      if (!result) {
        throw new Error('Failed to upsert user');
      }

      logger.info(`Successfully upserted user: ${userData.username} (${userData.userId})`);
      return result;
    } catch (error) {
      logger.error(`Failed to upsert user ${userData.userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user's last seen timestamp
   */
  async updateLastSeen(userId: string, guildId: string): Promise<void> {
    logger.debug(`Updating last seen for user ${userId} in guild ${guildId}`);

    try {
      const database = await db.getDb();
      await database
        .update(schema.users)
        .set({
          lastSeen: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.users.userId, userId), eq(schema.users.guildId, guildId)));

      logger.debug(`Successfully updated last seen for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to update last seen for user ${userId}:`, error);
      throw error;
    }
  }
}

/**
 * Database repository for Guilds
 */
export class GuildRepository {
  /**
   * Get a guild by ID
   */
  async getById(guildId: string): Promise<DbGuild | undefined> {
    logger.debug(`Fetching guild by ID: ${guildId}`);

    try {
      const database = await db.getDb();
      const results = await database
        .select()
        .from(schema.guilds)
        .where(eq(schema.guilds.guildId, guildId));

      if (results[0]) {
        logger.debug(`Found guild: ${results[0].guildName} (${guildId})`);
      } else {
        logger.debug(`Guild not found: ${guildId}`);
      }

      return results[0];
    } catch (error) {
      logger.error(`Failed to fetch guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get all active guilds
   */
  async getActive(): Promise<DbGuild[]> {
    logger.debug('Fetching all active guilds');

    try {
      const database = await db.getDb();
      const guilds = await database
        .select()
        .from(schema.guilds)
        .where(eq(schema.guilds.isActive, true));

      logger.info(`Retrieved ${guilds.length} active guilds`);
      return guilds;
    } catch (error) {
      logger.error('Failed to fetch active guilds:', error);
      throw error;
    }
  }

  /**
   * Create or update a guild
   */
  async upsert(guildData: NewGuild): Promise<DbGuild> {
    logger.info(`Upserting guild: ${guildData.guildName} (${guildData.guildId})`);

    try {
      const database = await db.getDb();
      const existing = await this.getById(guildData.guildId);

      if (existing) {
        logger.debug(`Updating existing guild ${guildData.guildId}`);
        await database
          .update(schema.guilds)
          .set({ ...guildData, updatedAt: new Date() })
          .where(eq(schema.guilds.guildId, guildData.guildId));
      } else {
        logger.debug(`Creating new guild ${guildData.guildId}`);
        await database.insert(schema.guilds).values(guildData);
      }

      const result = await this.getById(guildData.guildId);
      if (!result) {
        throw new Error('Failed to upsert guild');
      }

      logger.info(`Successfully upserted guild: ${guildData.guildName} (${guildData.guildId})`);
      return result;
    } catch (error) {
      logger.error(`Failed to upsert guild ${guildData.guildId}:`, error);
      throw error;
    }
  }

  /**
   * Mark guild as inactive (when bot leaves)
   */
  async markInactive(guildId: string): Promise<void> {
    logger.info(`Marking guild ${guildId} as inactive`);

    try {
      const database = await db.getDb();
      await database
        .update(schema.guilds)
        .set({
          isActive: false,
          leftAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.guilds.guildId, guildId));

      logger.info(`Successfully marked guild ${guildId} as inactive`);
    } catch (error) {
      logger.error(`Failed to mark guild ${guildId} as inactive:`, error);
      throw error;
    }
  }
}

/**
 * Database repository for Guild Configurations
 */
export class GuildConfigRepository {
  /**
   * Get configuration for a guild
   */
  async getByGuild(guildId: string): Promise<DbGuildConfig | undefined> {
    logger.debug(`Fetching configuration for guild: ${guildId}`);

    try {
      const database = await db.getDb();
      const results = await database
        .select()
        .from(schema.guildConfigs)
        .where(eq(schema.guildConfigs.guildId, guildId));

      if (results[0]) {
        logger.debug(`Found configuration for guild ${guildId}`);
      } else {
        logger.debug(`No configuration found for guild ${guildId}`);
      }

      return results[0];
    } catch (error) {
      logger.error(`Failed to fetch configuration for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Create or update guild configuration
   */
  async upsert(configData: NewGuildConfig): Promise<DbGuildConfig> {
    logger.info(`Upserting configuration for guild ${configData.guildId}`);

    try {
      const database = await db.getDb();
      const existing = await this.getByGuild(configData.guildId);

      if (existing) {
        logger.debug(`Updating existing configuration for guild ${configData.guildId}`);
        await database
          .update(schema.guildConfigs)
          .set({ ...configData, updatedAt: new Date() })
          .where(eq(schema.guildConfigs.guildId, configData.guildId));
      } else {
        logger.debug(`Creating new configuration for guild ${configData.guildId}`);
        await database.insert(schema.guildConfigs).values(configData);
      }

      const result = await this.getByGuild(configData.guildId);
      if (!result) {
        throw new Error('Failed to upsert guild config');
      }

      logger.info(`Successfully upserted configuration for guild ${configData.guildId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to upsert configuration for guild ${configData.guildId}:`, error);
      throw error;
    }
  }
}

/**
 * Database repository for Reminder Logs
 */
export class ReminderLogRepository {
  /**
   * Create a reminder log entry
   */
  async create(logData: NewReminderLog): Promise<DbReminderLog> {
    logger.info(`Creating reminder log for event ${logData.messageId} in guild ${logData.guildId}`);

    try {
      const database = await db.getDb();
      const result = await database.insert(schema.reminderLogs).values(logData).returning();

      logger.info(
        `Successfully created reminder log: type=${logData.reminderType}, recipients=${logData.recipientCount}`,
      );
      return result[0];
    } catch (error) {
      logger.error(`Failed to create reminder log for event ${logData.messageId}:`, error);
      throw error;
    }
  }

  /**
   * Get reminder logs for a specific event
   */
  async getByEvent(messageId: string, limit = 50): Promise<DbReminderLog[]> {
    logger.debug(`Fetching reminder logs for event ${messageId} (limit: ${limit})`);

    try {
      const database = await db.getDb();
      const logs = await database
        .select()
        .from(schema.reminderLogs)
        .where(eq(schema.reminderLogs.messageId, messageId))
        .orderBy(desc(schema.reminderLogs.sentAt))
        .limit(limit);

      logger.debug(`Retrieved ${logs.length} reminder logs for event ${messageId}`);
      return logs;
    } catch (error) {
      logger.error(`Failed to fetch reminder logs for event ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Get recent reminder logs for a guild
   */
  async getRecentByGuild(guildId: string, limit = 100): Promise<DbReminderLog[]> {
    logger.debug(`Fetching recent reminder logs for guild ${guildId} (limit: ${limit})`);

    try {
      const database = await db.getDb();
      const logs = await database
        .select()
        .from(schema.reminderLogs)
        .where(eq(schema.reminderLogs.guildId, guildId))
        .orderBy(desc(schema.reminderLogs.sentAt))
        .limit(limit);

      logger.debug(`Retrieved ${logs.length} recent reminder logs for guild ${guildId}`);
      return logs;
    } catch (error) {
      logger.error(`Failed to fetch recent reminder logs for guild ${guildId}:`, error);
      throw error;
    }
  }
}

// Export repository instances
export const eventRepo = new EventRepository();
export const userRepo = new UserRepository();
export const guildRepo = new GuildRepository();
export const guildConfigRepo = new GuildConfigRepository();
export const reminderLogRepo = new ReminderLogRepository();

// Export database manager for advanced operations
export { db as databaseManager };

// Legacy compatibility exports
export const DatabaseManager = db.constructor;
export { DatabaseManager as default };
