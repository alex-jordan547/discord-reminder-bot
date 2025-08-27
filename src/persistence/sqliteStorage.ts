/**
 * SQLite storage implementation for Discord Reminder Bot
 *
 * Provides comprehensive CRUD operations, migrations, and optimized queries
 * for all model types with connection pooling and transaction support.
 */

import { DatabaseManager, getDatabase } from './database';
import { Event } from '@/models';
import { createLogger } from '@/utils/loggingConfig';

const logger = createLogger('sqliteStorage.ts');
export interface StorageOperationResult {
  success: boolean;
  error?: string;
  affectedRows?: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface EventFilters {
  guildId?: string;
  channelId?: string;
  isPaused?: boolean;
  isDue?: boolean;
}

/**
 * Main SQLite storage class with comprehensive model operations
 */
export class SqliteStorage {
  private db: DatabaseManager;
  private isInitialized = false;

  constructor(databaseManager?: DatabaseManager) {
    this.db = databaseManager || getDatabase();
  }

  /**
   * Initialize the storage system and create tables
   */
  async initialize(): Promise<boolean> {
    try {
      await this.db.connect();
      await this.createTables();
      await this.runMigrations();
      this.isInitialized = true;

      logger.info('SQLite storage initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SQLite storage:', error);
      return false;
    }
  }

  /**
   * Create simplified database table - only events table needed
   */
  private async createTables(): Promise<void> {
    const tableCreationSQL = [
      // Events table - simplified without foreign key constraints
      {
        sql: `
          CREATE TABLE IF NOT EXISTS events (
            message_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            interval_minutes REAL DEFAULT 60.0,
            is_paused INTEGER DEFAULT 0,
            last_reminder DATETIME DEFAULT CURRENT_TIMESTAMP,
            users_who_reacted TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `,
        params: [],
      },
      
      // Guild configurations table
      {
        sql: `
          CREATE TABLE IF NOT EXISTS guild_configs (
            guild_id TEXT PRIMARY KEY,
            guild_name TEXT NOT NULL,
            reminder_channel_id TEXT,
            reminder_channel_name TEXT DEFAULT 'Canal original',
            admin_role_ids TEXT DEFAULT '[]',
            admin_role_names TEXT DEFAULT '[]',
            default_interval_minutes REAL DEFAULT 60.0,
            auto_delete_enabled INTEGER DEFAULT 1,
            auto_delete_delay_minutes REAL DEFAULT 60.0,
            delay_between_reminders_ms INTEGER DEFAULT 2000,
            max_mentions_per_reminder INTEGER DEFAULT 50,
            use_everyone_above_limit INTEGER DEFAULT 1,
            default_reactions TEXT DEFAULT '["✅","❌","❓"]',
            timezone TEXT DEFAULT 'Europe/Paris',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `,
        params: [],
      },
    ];

    await this.db.executeTransaction(tableCreationSQL);
    await this.createIndexes();
  }

  /**
   * Create optimized indexes for better query performance
   */
  private async createIndexes(): Promise<void> {
    const indexCreationSQL = [
      // Event indexes - optimized for common queries
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_events_guild_paused ON events(guild_id, is_paused)',
        params: [],
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_events_reminder_interval ON events(last_reminder, interval_minutes)',
        params: [],
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_events_guild_created ON events(guild_id, created_at)',
        params: [],
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_events_guild_paused_reminder ON events(guild_id, is_paused, last_reminder)',
        params: [],
      },
      
      // Guild config indexes
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_guild_configs_last_used ON guild_configs(last_used_at)',
        params: [],
      },
    ];

    await this.db.executeTransaction(indexCreationSQL);
  }

  /**
   * Run database migrations (for future schema updates)
   */
  private async runMigrations(): Promise<void> {
    // Create migrations table if it doesn't exist
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Future migrations will be added here
    // Example:
    // await this.runMigration(1, 'Add new column to events table');
  }

  /**
   * Run a specific migration
   */
  private async runMigration(
    version: number,
    description: string,
    migrationSQL: string[],
  ): Promise<void> {
    // Check if migration already applied
    const existing = await this.db.get('SELECT version FROM schema_migrations WHERE version = ?', [
      version,
    ]);

    if (existing) {
      return; // Migration already applied
    }

    logger.info(`Running migration ${version}: ${description}`);

    const statements = migrationSQL.map(sql => ({ sql, params: [] }));
    statements.push({
      sql: 'INSERT INTO schema_migrations (version) VALUES (?)',
      params: [version],
    });

    await this.db.executeTransaction(statements);
    logger.info(`Migration ${version} completed`);
  }

  // ==================== EVENT OPERATIONS ====================

  /**
   * Create or update an event
   */
  async saveEvent(event: Event): Promise<StorageOperationResult> {
    try {
      // Validate before saving
      if (!event.isValid()) {
        logger.error('Event data is invalid');
        return { success: false, error: 'Event data is invalid' };
      }
      const data = event.toDict();

      await this.db.run(
        `
        INSERT OR REPLACE INTO events 
        (message_id, channel_id, guild_id, title, description, interval_minutes, 
         is_paused, last_reminder, users_who_reacted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          data.message_id,
          data.channel_id,
          data.guild_id,
          data.title,
          data.description,
          data.interval_minutes,
          data.is_paused ? 1 : 0,
          data.last_reminder,
          JSON.stringify(data.users_who_reacted),
          data.created_at,
          data.updated_at,
        ],
      );

      logger.debug(`Event ${event.messageId} - (${event.title}) saved/updated successfully in DB`);

      return { success: true, affectedRows: 1 };
    } catch (error) {
      logger.error(
        `Failed to save event: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        error: `Failed to save event: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get an event by message ID
   */
  async getEvent(messageId: string): Promise<Event | null> {
    try {
      const row = await this.db.get('SELECT * FROM events WHERE message_id = ?', [messageId]);

      if (!row) return null;

      // Parse users_who_reacted JSON
      if (typeof row.users_who_reacted === 'string') {
        try {
          row.users_who_reacted = JSON.parse(row.users_who_reacted);
        } catch {
          row.users_who_reacted = [];
        }
      }

      return Event.fromDict(row);
    } catch (error) {
      logger.error('Failed to get event:', error);
      return null;
    }
  }

  /**
   * Get events with filters and pagination
   */
  async getEvents(filters: EventFilters = {}, options: PaginationOptions = {}): Promise<Event[]> {
    try {
      const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options;
      const { guildId, channelId, isPaused } = filters;

      let whereClause = '1=1';
      const params: any[] = [];

      if (guildId) {
        whereClause += ' AND guild_id = ?';
        params.push(guildId);
      }

      if (channelId) {
        whereClause += ' AND channel_id = ?';
        params.push(channelId);
      }

      if (isPaused !== undefined) {
        whereClause += ' AND is_paused = ?';
        params.push(isPaused ? 1 : 0);
      }

      // Add due filter if requested
      if (filters.isDue) {
        whereClause += ` AND (
          (datetime('now') - datetime(last_reminder)) >= (interval_minutes * 60)
          AND is_paused = 0
        )`;
      }

      params.push(limit, offset);

      const rows = await this.db.all(
        `
        SELECT * FROM events 
        WHERE ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT ? OFFSET ?
      `,
        params,
      );

      return rows.map(row => {
        // Parse users_who_reacted JSON
        if (typeof row.users_who_reacted === 'string') {
          try {
            row.users_who_reacted = JSON.parse(row.users_who_reacted);
          } catch {
            row.users_who_reacted = [];
          }
        }
        return Event.fromDict(row);
      });
    } catch (error) {
      logger.error('Failed to get events:', error);
      return [];
    }
  }

  /**
   * Get events that are due for reminders (optimized query)
   */
  async getDueEvents(guildId?: string): Promise<Event[]> {
    try {
      let sql = `
        SELECT * FROM events 
        WHERE is_paused = 0 
        AND (julianday('now') - julianday(last_reminder)) * 24 * 60 >= interval_minutes
      `;
      const params: any[] = [];

      if (guildId) {
        sql += ' AND guild_id = ?';
        params.push(guildId);
      }

      sql += ' ORDER BY last_reminder ASC';

      const rows = await this.db.all(sql, params);

      return rows.map(row => {
        // Parse users_who_reacted JSON
        if (typeof row.users_who_reacted === 'string') {
          try {
            row.users_who_reacted = JSON.parse(row.users_who_reacted);
          } catch {
            row.users_who_reacted = [];
          }
        }
        return Event.fromDict(row);
      });
    } catch (error) {
      logger.error('Failed to get due events:', error);
      return [];
    }
  }

  /**
   * Update event's last reminder timestamp
   */
  async markReminderSent(messageId: string): Promise<StorageOperationResult> {
    try {
      const result = await this.db.run(
        `
        UPDATE events 
        SET last_reminder = datetime('now'), updated_at = datetime('now')
        WHERE message_id = ?
      `,
        [messageId],
      );

      return {
        success: true,
        affectedRows: result.changes,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to mark reminder sent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(messageId: string): Promise<StorageOperationResult> {
    try {
      const result = await this.db.run('DELETE FROM events WHERE message_id = ?', [messageId]);

      logger.debug(`Event ${messageId} deleted from DB`);

      return {
        success: true,
        affectedRows: result.changes,
      };
    } catch (error) {
      logger.error(
        `Failed to DELETE event: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        error: `Failed to delete event: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get comprehensive statistics about the database
   */
  async getStorageStats(): Promise<Record<string, any>> {
    try {
      const stats: Record<string, any> = {};

      // Event counts
      const totalEvents = await this.db.get('SELECT COUNT(*) as count FROM events');
      stats.total_events_count = totalEvents?.count || 0;

      const activeEvents = await this.db.get(
        'SELECT COUNT(*) as count FROM events WHERE is_paused = 0',
      );
      stats.active_events_count = activeEvents?.count || 0;

      const dueEvents = await this.db.get(`
        SELECT COUNT(*) as count FROM events 
        WHERE is_paused = 0 
        AND (julianday('now') - julianday(last_reminder)) * 24 * 60 >= interval_minutes
      `);
      stats.due_events_count = dueEvents?.count || 0;

      return stats;
    } catch (error) {
      logger.error('Failed to get storage stats:', error);
      return {};
    }
  }

  /**
   * Test storage functionality
   */
  async testStorage(): Promise<{ success: boolean; tests: Record<string, boolean> }> {
    const tests: Record<string, boolean> = {};
    let allPassed = true;

    try {
      // Test basic connection
      tests.connection = await this.db.isAvailable();
      if (!tests.connection) allPassed = false;

      // Test events table existence
      try {
        await this.db.get('SELECT COUNT(*) FROM events');
        tests.table_events = true;
      } catch {
        tests.table_events = false;
        allPassed = false;
      }

      return { success: allPassed, tests };
    } catch (error) {
      logger.error('Storage test failed:', error);
      return { success: false, tests };
    }
  }

  /**
   * Close the storage connection
   */
  async close(): Promise<void> {
    await this.db.close();
    this.isInitialized = false;
  }

  /**
   * Check if storage is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // ===========================
  // Guild Configuration Methods
  // ===========================

  /**
   * Save or update guild configuration
   */
  async saveGuildConfig(config: any): Promise<StorageOperationResult> {
    try {
      const sql = `
        INSERT OR REPLACE INTO guild_configs (
          guild_id, guild_name, reminder_channel_id, reminder_channel_name,
          admin_role_ids, admin_role_names, default_interval_minutes,
          auto_delete_enabled, auto_delete_delay_minutes, delay_between_reminders_ms,
          max_mentions_per_reminder, use_everyone_above_limit, default_reactions,
          timezone, created_at, updated_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        config.guildId,
        config.guildName,
        config.reminderChannelId,
        config.reminderChannelName || 'Canal original',
        JSON.stringify(Array.isArray(config.adminRoleIds) ? config.adminRoleIds : []),
        JSON.stringify(Array.isArray(config.adminRoleNames) ? config.adminRoleNames : []),
        config.defaultIntervalMinutes || 60,
        config.autoDeleteEnabled ? 1 : 0,
        config.autoDeleteDelayMinutes || 60,
        config.delayBetweenRemindersMs || 2000,
        config.maxMentionsPerReminder || 50,
        config.useEveryoneAboveLimit ? 1 : 0,
        JSON.stringify(Array.isArray(config.defaultReactions) ? config.defaultReactions : ['✅', '❌', '❓']),
        config.timezone || 'Europe/Paris',
        config.createdAt?.toISOString() || new Date().toISOString(),
        config.updatedAt?.toISOString() || new Date().toISOString(),
        config.lastUsedAt?.toISOString() || new Date().toISOString(),
      ];

      const result = await this.db.run(sql, params);
      
      logger.debug(`Guild config ${config.guildId} - (${config.guildName}) saved/updated successfully in DB`);
      
      return {
        success: true,
        affectedRows: result.changes,
      };
    } catch (error) {
      logger.error('Error saving guild config:', error);
      logger.error('Guild config data:', config);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get guild configuration by guild ID
   */
  async getGuildConfig(guildId: string): Promise<any | null> {
    try {
      const sql = 'SELECT * FROM guild_configs WHERE guild_id = ?';
      const result = await this.db.get(sql, [guildId]);

      if (!result) {
        return null;
      }

      // Parse JSON fields
      return {
        guildId: result.guild_id,
        guildName: result.guild_name,
        reminderChannelId: result.reminder_channel_id,
        reminderChannelName: result.reminder_channel_name,
        adminRoleIds: JSON.parse(result.admin_role_ids || '[]'),
        adminRoleNames: JSON.parse(result.admin_role_names || '[]'),
        defaultIntervalMinutes: result.default_interval_minutes,
        autoDeleteEnabled: Boolean(result.auto_delete_enabled),
        autoDeleteDelayMinutes: result.auto_delete_delay_minutes,
        delayBetweenRemindersMs: result.delay_between_reminders_ms,
        maxMentionsPerReminder: result.max_mentions_per_reminder,
        useEveryoneAboveLimit: Boolean(result.use_everyone_above_limit),
        defaultReactions: JSON.parse(result.default_reactions || '[]'),
        timezone: result.timezone,
        createdAt: new Date(result.created_at),
        updatedAt: new Date(result.updated_at),
        lastUsedAt: new Date(result.last_used_at),
      };
    } catch (error) {
      logger.error(`Error getting guild config for ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Delete guild configuration
   */
  async deleteGuildConfig(guildId: string): Promise<StorageOperationResult> {
    try {
      const sql = 'DELETE FROM guild_configs WHERE guild_id = ?';
      const result = await this.db.run(sql, [guildId]);

      return {
        success: true,
        affectedRows: result.changes,
      };
    } catch (error) {
      logger.error(`Error deleting guild config for ${guildId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all guild configurations (for management purposes)
   */
  async getAllGuildConfigs(): Promise<any[]> {
    try {
      const sql = 'SELECT * FROM guild_configs ORDER BY last_used_at DESC';
      const results = await this.db.all(sql);

      return results.map(result => ({
        guildId: result.guild_id,
        guildName: result.guild_name,
        reminderChannelId: result.reminder_channel_id,
        reminderChannelName: result.reminder_channel_name,
        adminRoleIds: JSON.parse(result.admin_role_ids || '[]'),
        adminRoleNames: JSON.parse(result.admin_role_names || '[]'),
        defaultIntervalMinutes: result.default_interval_minutes,
        autoDeleteEnabled: Boolean(result.auto_delete_enabled),
        autoDeleteDelayMinutes: result.auto_delete_delay_minutes,
        delayBetweenRemindersMs: result.delay_between_reminders_ms,
        maxMentionsPerReminder: result.max_mentions_per_reminder,
        useEveryoneAboveLimit: Boolean(result.use_everyone_above_limit),
        defaultReactions: JSON.parse(result.default_reactions || '[]'),
        timezone: result.timezone,
        createdAt: new Date(result.created_at),
        updatedAt: new Date(result.updated_at),
        lastUsedAt: new Date(result.last_used_at),
      }));
    } catch (error) {
      logger.error('Error getting all guild configs:', error);
      return [];
    }
  }

  /**
   * Update guild config last used timestamp
   */
  async touchGuildConfig(guildId: string): Promise<void> {
    try {
      const sql = 'UPDATE guild_configs SET last_used_at = ? WHERE guild_id = ?';
      await this.db.run(sql, [new Date().toISOString(), guildId]);
    } catch (error) {
      logger.error(`Error touching guild config ${guildId}:`, error);
    }
  }
}
