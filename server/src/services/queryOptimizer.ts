/**
 * Query Optimization Service
 *
 * Implements caching, connection pooling, and query optimization
 * for improved database performance
 */

import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { events, guilds, reactions, reminderLogs } from '../db/schema.js';

interface CacheConfig {
  defaultTTL: number;
  keyPrefix: string;
  enableCompression: boolean;
}

interface QueryOptimizer {
  cache: Redis | null;
  pool: Pool;
  config: CacheConfig;
}

class DatabaseQueryOptimizer implements QueryOptimizer {
  cache: Redis | null = null;
  pool: Pool;
  config: CacheConfig;
  db: any;

  constructor() {
    this.config = {
      defaultTTL: parseInt(process.env.CACHE_TTL || '300'), // 5 minutes default
      keyPrefix: 'discord_bot:',
      enableCompression: process.env.CACHE_COMPRESSION === 'true',
    };

    // Initialize Redis cache if available
    if (process.env.REDIS_URL) {
      this.cache = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.cache.on('error', err => {
        console.warn('Redis cache error:', err.message);
        this.cache = null; // Fallback to no cache
      });
    }

    // Initialize PostgreSQL connection pool
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'discord_bot',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
      statement_timeout: 5000, // Timeout individual queries after 5 seconds
      query_timeout: 5000,
      application_name: 'discord_reminder_bot',
    });

    this.db = drizzle(this.pool);
  }

  /**
   * Generate cache key with consistent format
   */
  private generateCacheKey(type: string, params: Record<string, any>): string {
    const paramString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');

    return `${this.config.keyPrefix}${type}:${paramString}`;
  }

  /**
   * Get cached result or execute query
   */
  private async getCachedOrQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    if (!this.cache) {
      return await queryFn();
    }

    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Cache read error:', error);
    }

    const result = await queryFn();

    try {
      await this.cache.setex(cacheKey, ttl || this.config.defaultTTL, JSON.stringify(result));
    } catch (error) {
      console.warn('Cache write error:', error);
    }

    return result;
  }

  /**
   * Optimized query for active events by guild
   */
  async getActiveEventsByGuild(guildId: string, limit = 50) {
    const cacheKey = this.generateCacheKey('active_events', { guildId, limit });

    return this.getCachedOrQuery(
      cacheKey,
      async () => {
        return await this.db
          .select({
            messageId: events.messageId,
            title: events.title,
            description: events.description,
            intervalMinutes: events.intervalMinutes,
            lastRemindedAt: events.lastRemindedAt,
            isPaused: events.isPaused,
            createdAt: events.createdAt,
            channelId: events.channelId,
          })
          .from(events)
          .where(and(eq(events.guildId, guildId), eq(events.isPaused, false)))
          .orderBy(events.createdAt)
          .limit(limit);
      },
      120, // 2 minutes cache for active events
    );
  }

  /**
   * Optimized query for guild metrics with aggregations
   */
  async getGuildMetrics(guildId: string) {
    const cacheKey = this.generateCacheKey('guild_metrics', { guildId });

    return this.getCachedOrQuery(
      cacheKey,
      async () => {
        // Use raw SQL for complex aggregations that are more efficient
        const result = await this.db.execute(sql`
          SELECT 
            COUNT(DISTINCT e.message_id) as total_events,
            COUNT(DISTINCT CASE WHEN e.is_paused = false THEN e.message_id END) as active_events,
            COUNT(DISTINCT r.user_id) as unique_reactors,
            COUNT(r.message_id) as total_reactions,
            COUNT(DISTINCT rl.message_id) as events_with_reminders,
            AVG(rl.execution_time_ms) as avg_reminder_time,
            MAX(e.created_at) as last_event_created
          FROM events e
          LEFT JOIN reactions r ON e.message_id = r.message_id AND r.is_removed = false
          LEFT JOIN reminder_logs rl ON e.message_id = rl.message_id
          WHERE e.guild_id = ${guildId}
        `);

        return result.rows[0] || {};
      },
      300, // 5 minutes cache for metrics
    );
  }

  /**
   * Optimized query for recent reminder activity
   */
  async getRecentReminderActivity(guildId: string, hours = 24, limit = 100) {
    const cacheKey = this.generateCacheKey('recent_activity', { guildId, hours, limit });
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.getCachedOrQuery(
      cacheKey,
      async () => {
        return await this.db
          .select({
            messageId: reminderLogs.messageId,
            reminderType: reminderLogs.reminderType,
            recipientCount: reminderLogs.recipientCount,
            successCount: reminderLogs.successCount,
            errorCount: reminderLogs.errorCount,
            executionTimeMs: reminderLogs.executionTimeMs,
            sentAt: reminderLogs.sentAt,
            eventTitle: events.title,
          })
          .from(reminderLogs)
          .innerJoin(events, eq(reminderLogs.messageId, events.messageId))
          .where(and(eq(reminderLogs.guildId, guildId), gte(reminderLogs.sentAt, since)))
          .orderBy(reminderLogs.sentAt)
          .limit(limit);
      },
      60, // 1 minute cache for recent activity
    );
  }

  /**
   * Batch update reactions for better performance
   */
  async batchUpdateReactions(
    updates: Array<{
      messageId: string;
      userId: string;
      emoji: string;
      isRemoved: boolean;
      removedAt?: Date;
    }>,
  ) {
    if (updates.length === 0) return;

    // Invalidate cache for affected messages
    const messageIds = [...new Set(updates.map(u => u.messageId))];
    await this.invalidateCache(['reactions'], messageIds);

    // Use batch insert/update for better performance
    const values = updates.map(update => ({
      messageId: update.messageId,
      userId: update.userId,
      emoji: update.emoji,
      isRemoved: update.isRemoved,
      removedAt: update.removedAt || null,
      updatedAt: new Date(),
    }));

    // PostgreSQL UPSERT for efficient batch operations
    await this.db.execute(sql`
      INSERT INTO reactions (message_id, user_id, emoji, is_removed, removed_at, updated_at, reacted_at, created_at, guild_id)
      SELECT 
        v.message_id, v.user_id, v.emoji, v.is_removed, v.removed_at, v.updated_at,
        COALESCE(r.reacted_at, now()) as reacted_at,
        COALESCE(r.created_at, now()) as created_at,
        e.guild_id
      FROM (VALUES ${sql.join(
        values.map(
          v =>
            sql`(${v.messageId}, ${v.userId}, ${v.emoji}, ${v.isRemoved}, ${v.removedAt}, ${v.updatedAt})`,
        ),
        sql`, `,
      )}) as v(message_id, user_id, emoji, is_removed, removed_at, updated_at)
      JOIN events e ON e.message_id = v.message_id
      LEFT JOIN reactions r ON r.message_id = v.message_id AND r.user_id = v.user_id AND r.emoji = v.emoji
      ON CONFLICT (message_id, user_id, emoji) 
      DO UPDATE SET 
        is_removed = EXCLUDED.is_removed,
        removed_at = EXCLUDED.removed_at,
        updated_at = EXCLUDED.updated_at
    `);
  }

  /**
   * Get performance metrics for monitoring
   */
  async getPerformanceMetrics() {
    const cacheKey = this.generateCacheKey('performance_metrics', {});

    return this.getCachedOrQuery(
      cacheKey,
      async () => {
        const dbMetrics = await this.db.execute(sql`
          SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples,
            seq_scan as sequential_scans,
            seq_tup_read as sequential_reads,
            idx_scan as index_scans,
            idx_tup_fetch as index_reads
          FROM pg_stat_user_tables 
          WHERE schemaname = 'public'
        `);

        const poolMetrics = {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
        };

        let cacheMetrics = null;
        if (this.cache) {
          try {
            const info = await this.cache.info('memory');
            cacheMetrics = {
              connected: true,
              memory: info,
            };
          } catch (error) {
            cacheMetrics = { connected: false, error: error.message };
          }
        }

        return {
          database: dbMetrics.rows,
          connectionPool: poolMetrics,
          cache: cacheMetrics,
          timestamp: new Date(),
        };
      },
      30, // 30 seconds cache for performance metrics
    );
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateCache(types: string[], messageIds?: string[]) {
    if (!this.cache) return;

    try {
      const patterns = types.map(type => `${this.config.keyPrefix}${type}:*`);

      for (const pattern of patterns) {
        const keys = await this.cache.keys(pattern);
        if (keys.length > 0) {
          await this.cache.del(...keys);
        }
      }

      // Also invalidate specific message-related caches
      if (messageIds) {
        for (const messageId of messageIds) {
          const keys = await this.cache.keys(`${this.config.keyPrefix}*:*${messageId}*`);
          if (keys.length > 0) {
            await this.cache.del(...keys);
          }
        }
      }
    } catch (error) {
      console.warn('Cache invalidation error:', error);
    }
  }

  /**
   * Cleanup and close connections
   */
  async close() {
    if (this.cache) {
      await this.cache.quit();
    }
    await this.pool.end();
  }
}

export const queryOptimizer = new DatabaseQueryOptimizer();
export { DatabaseQueryOptimizer };
