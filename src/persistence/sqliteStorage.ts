/**
 * SQLite storage implementation for Discord Reminder Bot
 * 
 * Provides comprehensive CRUD operations, migrations, and optimized queries
 * for all model types with connection pooling and transaction support.
 */

import { DatabaseManager, getDatabase } from './database';
import { Event } from '../models/index';
import type { EventData } from '../models/Event';

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
      
      console.log('SQLite storage initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize SQLite storage:', error);
      return false;
    }
  }

  /**
   * Create all database tables with proper relationships and indexes
   */
  private async createTables(): Promise<void> {
    const tableCreationSQL = [
      // Guilds table
      {
        sql: `
          CREATE TABLE IF NOT EXISTS guilds (
            guild_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            settings TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `,
        params: [],
      },

      // Users table  
      {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            username TEXT NOT NULL,
            is_bot INTEGER DEFAULT 0,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, guild_id),
            FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
          )
        `,
        params: [],
      },

      // Events table
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
            required_reactions TEXT DEFAULT '["✅", "❌", "❓"]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
          )
        `,
        params: [],
      },

      // Reactions table
      {
        sql: `
          CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            reacted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (event_message_id, user_id),
            FOREIGN KEY (event_message_id) REFERENCES events(message_id) ON DELETE CASCADE
          )
        `,
        params: [],
      },

      // Reminder logs table
      {
        sql: `
          CREATE TABLE IF NOT EXISTS reminder_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_message_id TEXT NOT NULL,
            scheduled_at DATETIME NOT NULL,
            sent_at DATETIME,
            users_notified INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_message_id) REFERENCES events(message_id) ON DELETE CASCADE
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
      // Guild indexes
      { sql: 'CREATE INDEX IF NOT EXISTS idx_guilds_created_at ON guilds(created_at)', params: [] },

      // User indexes
      { sql: 'CREATE INDEX IF NOT EXISTS idx_users_guild_id ON users(guild_id)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_users_is_bot ON users(is_bot)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen)', params: [] },

      // Event indexes (matching Python implementation)
      { sql: 'CREATE INDEX IF NOT EXISTS idx_events_guild_paused ON events(guild_id, is_paused)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_events_reminder_interval ON events(last_reminder, interval_minutes)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_events_guild_created ON events(guild_id, created_at)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_events_guild_paused_reminder ON events(guild_id, is_paused, last_reminder)', params: [] },

      // Reaction indexes
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reactions_event_id ON reactions(event_message_id)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON reactions(user_id)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reactions_emoji ON reactions(event_message_id, emoji)', params: [] },

      // Reminder log indexes
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reminder_logs_event_scheduled ON reminder_logs(event_message_id, scheduled_at)', params: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reminder_logs_status_scheduled ON reminder_logs(status, scheduled_at)', params: [] },
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
  private async runMigration(version: number, description: string, migrationSQL: string[]): Promise<void> {
    // Check if migration already applied
    const existing = await this.db.get(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [version]
    );

    if (existing) {
      return; // Migration already applied
    }

    console.log(`Running migration ${version}: ${description}`);
    
    const statements = migrationSQL.map(sql => ({ sql, params: [] }));
    statements.push({
      sql: 'INSERT INTO schema_migrations (version) VALUES (?)',
      params: [version]
    });

    await this.db.executeTransaction(statements);
    console.log(`Migration ${version} completed`);
  }

  // ==================== GUILD OPERATIONS ====================

  /**
   * Create or update a guild
   */
  async saveGuild(guild: Guild): Promise<StorageOperationResult> {
    try {
      guild.fullClean(); // Validate before saving
      const data = guild.toDict();

      await this.db.run(`
        INSERT OR REPLACE INTO guilds 
        (guild_id, name, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        data.guild_id,
        data.name,
        data.settings,
        data.created_at,
        data.updated_at
      ]);

      return { success: true, affectedRows: 1 };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to save guild: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Get a guild by ID
   */
  async getGuild(guildId: string): Promise<Guild | null> {
    try {
      const row = await this.db.get(
        'SELECT * FROM guilds WHERE guild_id = ?',
        [guildId]
      );

      return row ? Guild.fromDict(row) : null;
    } catch (error) {
      console.error('Failed to get guild:', error);
      return null;
    }
  }

  /**
   * Get all guilds with pagination
   */
  async getAllGuilds(options: PaginationOptions = {}): Promise<Guild[]> {
    try {
      const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options;
      
      const rows = await this.db.all(`
        SELECT * FROM guilds 
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      return rows.map(row => Guild.fromDict(row));
    } catch (error) {
      console.error('Failed to get all guilds:', error);
      return [];
    }
  }

  /**
   * Delete a guild and all related data
   */
  async deleteGuild(guildId: string): Promise<StorageOperationResult> {
    try {
      const result = await this.db.run(
        'DELETE FROM guilds WHERE guild_id = ?',
        [guildId]
      );

      return { 
        success: true, 
        affectedRows: result.changes 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to delete guild: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  // ==================== EVENT OPERATIONS ====================

  /**
   * Create or update an event
   */
  async saveEvent(event: Event): Promise<StorageOperationResult> {
    try {
      event.fullClean(); // Validate before saving
      const data = event.toDict();

      await this.db.run(`
        INSERT OR REPLACE INTO events 
        (message_id, channel_id, guild_id, title, description, interval_minutes, 
         is_paused, last_reminder, required_reactions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.message_id,
        data.channel_id,
        data.guild_id,
        data.title,
        data.description,
        data.interval_minutes,
        data.is_paused ? 1 : 0,
        data.last_reminder,
        JSON.stringify(data.required_reactions),
        data.created_at,
        data.updated_at
      ]);

      return { success: true, affectedRows: 1 };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to save event: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Get an event by message ID
   */
  async getEvent(messageId: string): Promise<Event | null> {
    try {
      const row = await this.db.get(
        'SELECT * FROM events WHERE message_id = ?',
        [messageId]
      );

      if (!row) return null;

      // Parse required_reactions JSON
      if (typeof row.required_reactions === 'string') {
        try {
          row.required_reactions = JSON.parse(row.required_reactions);
        } catch {
          row.required_reactions = ['✅', '❌', '❓'];
        }
      }

      return Event.fromDict(row);
    } catch (error) {
      console.error('Failed to get event:', error);
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

      const rows = await this.db.all(`
        SELECT * FROM events 
        WHERE ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT ? OFFSET ?
      `, params);

      return rows.map(row => {
        // Parse required_reactions JSON
        if (typeof row.required_reactions === 'string') {
          try {
            row.required_reactions = JSON.parse(row.required_reactions);
          } catch {
            row.required_reactions = ['✅', '❌', '❓'];
          }
        }
        return Event.fromDict(row);
      });
    } catch (error) {
      console.error('Failed to get events:', error);
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
        // Parse required_reactions JSON
        if (typeof row.required_reactions === 'string') {
          try {
            row.required_reactions = JSON.parse(row.required_reactions);
          } catch {
            row.required_reactions = ['✅', '❌', '❓'];
          }
        }
        return Event.fromDict(row);
      });
    } catch (error) {
      console.error('Failed to get due events:', error);
      return [];
    }
  }

  /**
   * Update event's last reminder timestamp
   */
  async markReminderSent(messageId: string): Promise<StorageOperationResult> {
    try {
      const result = await this.db.run(`
        UPDATE events 
        SET last_reminder = datetime('now'), updated_at = datetime('now')
        WHERE message_id = ?
      `, [messageId]);

      return { 
        success: true, 
        affectedRows: result.changes 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to mark reminder sent: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(messageId: string): Promise<StorageOperationResult> {
    try {
      const result = await this.db.run(
        'DELETE FROM events WHERE message_id = ?',
        [messageId]
      );

      return { 
        success: true, 
        affectedRows: result.changes 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to delete event: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  // ==================== USER OPERATIONS ====================

  /**
   * Create or update a user
   */
  async saveUser(user: User): Promise<StorageOperationResult> {
    try {
      user.fullClean(); // Validate before saving
      const data = user.toDict();

      await this.db.run(`
        INSERT OR REPLACE INTO users 
        (user_id, guild_id, username, is_bot, last_seen, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        data.user_id,
        data.guild_id,
        data.username,
        data.is_bot ? 1 : 0,
        data.last_seen,
        data.created_at,
        data.updated_at
      ]);

      return { success: true, affectedRows: 1 };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to save user: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Get a user by user ID and guild ID
   */
  async getUser(userId: string, guildId: string): Promise<User | null> {
    try {
      const row = await this.db.get(
        'SELECT * FROM users WHERE user_id = ? AND guild_id = ?',
        [userId, guildId]
      );

      return row ? User.fromDict(row) : null;
    } catch (error) {
      console.error('Failed to get user:', error);
      return null;
    }
  }

  /**
   * Get all users in a guild
   */
  async getGuildUsers(guildId: string, includeBot: boolean = false): Promise<User[]> {
    try {
      let sql = 'SELECT * FROM users WHERE guild_id = ?';
      const params = [guildId];

      if (!includeBot) {
        sql += ' AND is_bot = 0';
      }

      sql += ' ORDER BY username ASC';

      const rows = await this.db.all(sql, params);
      return rows.map(row => User.fromDict(row));
    } catch (error) {
      console.error('Failed to get guild users:', error);
      return [];
    }
  }

  // ==================== REACTION OPERATIONS ====================

  /**
   * Add or update a user's reaction to an event
   */
  async saveReaction(reaction: Reaction): Promise<StorageOperationResult> {
    try {
      reaction.fullClean(); // Validate before saving
      const data = reaction.toDict();

      await this.db.run(`
        INSERT OR REPLACE INTO reactions 
        (event_message_id, user_id, emoji, reacted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        data.event_message_id,
        data.user_id,
        data.emoji,
        data.reacted_at,
        data.created_at,
        data.updated_at
      ]);

      return { success: true, affectedRows: 1 };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to save reaction: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Remove a user's reaction from an event
   */
  async removeReaction(eventMessageId: string, userId: string): Promise<StorageOperationResult> {
    try {
      const result = await this.db.run(
        'DELETE FROM reactions WHERE event_message_id = ? AND user_id = ?',
        [eventMessageId, userId]
      );

      return { 
        success: true, 
        affectedRows: result.changes 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to remove reaction: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Get all reactions for an event
   */
  async getEventReactions(eventMessageId: string): Promise<Reaction[]> {
    try {
      const rows = await this.db.all(
        'SELECT * FROM reactions WHERE event_message_id = ? ORDER BY reacted_at ASC',
        [eventMessageId]
      );

      return rows.map(row => Reaction.fromDict(row));
    } catch (error) {
      console.error('Failed to get event reactions:', error);
      return [];
    }
  }

  /**
   * Get users who have reacted to an event
   */
  async getEventReactedUsers(eventMessageId: string): Promise<string[]> {
    try {
      const rows = await this.db.all(
        'SELECT DISTINCT user_id FROM reactions WHERE event_message_id = ?',
        [eventMessageId]
      );

      return rows.map(row => row.user_id);
    } catch (error) {
      console.error('Failed to get event reacted users:', error);
      return [];
    }
  }

  // ==================== REMINDER LOG OPERATIONS ====================

  /**
   * Save a reminder log entry
   */
  async saveReminderLog(reminderLog: ReminderLog): Promise<StorageOperationResult> {
    try {
      reminderLog.fullClean(); // Validate before saving
      const data = reminderLog.toDict();

      await this.db.run(`
        INSERT INTO reminder_logs 
        (event_message_id, scheduled_at, sent_at, users_notified, status, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.event_message_id,
        data.scheduled_at,
        data.sent_at,
        data.users_notified,
        data.status,
        data.error_message,
        data.created_at,
        data.updated_at
      ]);

      return { success: true, affectedRows: 1 };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to save reminder log: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Get reminder logs for an event
   */
  async getEventReminderLogs(eventMessageId: string, limit: number = 50): Promise<ReminderLog[]> {
    try {
      const rows = await this.db.all(`
        SELECT * FROM reminder_logs 
        WHERE event_message_id = ? 
        ORDER BY scheduled_at DESC 
        LIMIT ?
      `, [eventMessageId, limit]);

      return rows.map(row => ReminderLog.fromDict(row));
    } catch (error) {
      console.error('Failed to get event reminder logs:', error);
      return [];
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get comprehensive statistics about the database
   */
  async getStorageStats(): Promise<Record<string, any>> {
    try {
      const stats: Record<string, any> = {};

      // Table row counts
      const tables = ['guilds', 'users', 'events', 'reactions', 'reminder_logs'];
      for (const table of tables) {
        const result = await this.db.get(`SELECT COUNT(*) as count FROM ${table}`);
        stats[`${table}_count`] = result?.count || 0;
      }

      // Event-specific stats
      const activeEvents = await this.db.get(
        'SELECT COUNT(*) as count FROM events WHERE is_paused = 0'
      );
      stats.active_events_count = activeEvents?.count || 0;

      const dueEvents = await this.db.get(`
        SELECT COUNT(*) as count FROM events 
        WHERE is_paused = 0 
        AND (julianday('now') - julianday(last_reminder)) * 24 * 60 >= interval_minutes
      `);
      stats.due_events_count = dueEvents?.count || 0;

      // Database info
      const dbInfo = await this.db.getDatabaseInfo();
      stats.database_info = dbInfo;

      return stats;
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {};
    }
  }

  /**
   * Test storage functionality
   */
  async testStorage(): Promise<{success: boolean, tests: Record<string, boolean>}> {
    const tests: Record<string, boolean> = {};
    let allPassed = true;

    try {
      // Test basic connection
      tests.connection = await this.db.isAvailable();
      if (!tests.connection) allPassed = false;

      // Test table existence
      const tables = ['guilds', 'users', 'events', 'reactions', 'reminder_logs'];
      for (const table of tables) {
        try {
          await this.db.get(`SELECT COUNT(*) FROM ${table}`);
          tests[`table_${table}`] = true;
        } catch {
          tests[`table_${table}`] = false;
          allPassed = false;
        }
      }

      return { success: allPassed, tests };
    } catch (error) {
      console.error('Storage test failed:', error);
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
}