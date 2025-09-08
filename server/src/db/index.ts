/**
 * Database connection and configuration using Drizzle ORM with better-sqlite3
 *
 * This replaces the old sqlite3-based database implementation with a modern,
 * type-safe approach using Drizzle ORM as recommended in the project documentation.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { createLogger } from '#/utils/loggingConfig';
import path from 'path';
import { promises as fs } from 'fs';
// Type for Node.js file system errors
interface ErrnoException extends Error {
  code?: string;
  errno?: number;
  path?: string;
}

const logger = createLogger('database');

export interface DatabaseConfig {
  path: string;
  enableWAL: boolean;
  cacheSize: number;
  enableForeignKeys: boolean;
  synchronous: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  journalMode: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  busyTimeout: number;
  enableMigrations: boolean;
}

export interface DatabaseInfo {
  databasePath: string;
  databaseExists: boolean;
  databaseName: string;
  databaseSizeBytes?: number;
  databaseSizeMB?: number;
  isConnected: boolean;
  isReady: boolean;
}

/**
 * Modern database manager using Drizzle ORM and better-sqlite3
 * Provides type-safe database operations with excellent performance
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private sqlite: Database.Database | null = null;
  private drizzleDb: ReturnType<typeof drizzle> | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;

  private constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: this.getDatabasePath(),
      enableWAL: true,
      cacheSize: 64000, // 64MB cache
      enableForeignKeys: true,
      synchronous: 'NORMAL', // Balance between performance and safety
      journalMode: 'WAL', // Write-Ahead Logging for better concurrency
      busyTimeout: 30000, // 30 second timeout
      enableMigrations: true,
      ...config,
    };
  }

  /**
   * Get the singleton database manager instance
   */
  static getInstance(config?: Partial<DatabaseConfig>): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config);
    }
    return DatabaseManager.instance;
  }

  /**
   * Get the database file path based on environment configuration
   */
  private getDatabasePath(): string {
    const databaseName = process.env.DATABASE_NAME || 'discord_bot.db';
    const databasePath = process.env.DATABASE_PATH || databaseName;
    const dbFile = path.resolve(databasePath);

    // Ensure the directory exists
    const dbDir = path.dirname(dbFile);
    try {
      require('fs').mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      logger.error(`Could not create database directory ${dbDir}:`, error);
      // Directory might already exist, that's okay
    }

    return dbFile;
  }

  /**
   * Initialize the database connection with optimized settings
   */
  async connect(): Promise<ReturnType<typeof drizzle>> {
    if (this.drizzleDb && this.isInitialized) {
      return this.drizzleDb;
    }

    try {
      // Create better-sqlite3 connection
      this.sqlite = new Database(this.config.path);

      // Configure SQLite for optimal performance
      this.configurePragmas();

      // Initialize Drizzle ORM
      this.drizzleDb = drizzle(this.sqlite, { schema });

      // Run migrations if enabled
      if (this.config.enableMigrations) {
        await this.runMigrations();
      }

      this.isInitialized = true;
      logger.info(`Database connected with Drizzle ORM: ${this.config.path}`);

      return this.drizzleDb;
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw new Error(
        `Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Configure SQLite pragmas for optimal performance and safety
   */
  private configurePragmas(): void {
    if (!this.sqlite) throw new Error('SQLite connection not initialized');

    const pragmas = [
      `PRAGMA journal_mode = ${this.config.journalMode}`,
      `PRAGMA cache_size = ${this.config.cacheSize}`,
      `PRAGMA foreign_keys = ${this.config.enableForeignKeys ? 'ON' : 'OFF'}`,
      `PRAGMA synchronous = ${this.config.synchronous}`,
      `PRAGMA busy_timeout = ${this.config.busyTimeout}`,
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456', // 256MB memory-mapped I/O
      'PRAGMA optimize', // Enable query planner optimizations
    ];

    for (const pragma of pragmas) {
      try {
        this.sqlite.exec(pragma);
        logger.debug(`Applied pragma: ${pragma}`);
      } catch (error) {
        logger.warn(`Failed to apply pragma: ${pragma}`, error);
      }
    }
  }

  /**
   * Run database migrations using Drizzle Kit
   */
  private async runMigrations(): Promise<void> {
    if (!this.sqlite) throw new Error('SQLite connection not initialized');

    try {
      const migrationsFolder = path.join(process.cwd(), 'drizzle/migrations');

      // Check if migrations folder exists
      try {
        await fs.access(migrationsFolder);
        logger.info('Running database migrations...');
        migrate(drizzle(this.sqlite), { migrationsFolder });
        logger.info('Database migrations completed successfully');
      } catch (error) {
        if ((error as ErrnoException).code === 'ENOENT') {
          logger.info('No migrations folder found, skipping migrations');
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Migration failed:', error);
      throw new Error(
        `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get the Drizzle database instance (main interface for queries)
   */
  async getDb(): Promise<ReturnType<typeof drizzle>> {
    return this.connect();
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async transaction<T>(callback: (_tx: any) => Promise<T>): Promise<T> {
    const database = await this.connect();
    return database.transaction(callback);
  }

  /**
   * Get database information and statistics
   */
  async getInfo(): Promise<DatabaseInfo> {
    const databasePath = this.config.path;
    const databaseExists = require('fs').existsSync(databasePath);
    const databaseName = path.basename(databasePath);

    let databaseSizeBytes: number | undefined;
    let databaseSizeMB: number | undefined;

    if (databaseExists) {
      try {
        const stats = await fs.stat(databasePath);
        databaseSizeBytes = stats.size;
        databaseSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
      } catch (error) {
        logger.warn('Could not get database file size:', error);
      }
    }

    const result: DatabaseInfo = {
      databasePath,
      databaseExists,
      databaseName,
      isConnected: this.sqlite !== null,
      isReady: this.isInitialized,
    };
    if (databaseSizeBytes !== undefined) {
      result.databaseSizeBytes = databaseSizeBytes;
    }
    if (databaseSizeMB !== undefined) {
      result.databaseSizeMB = databaseSizeMB;
    }
    return result;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.sqlite) {
      this.sqlite.close();
      this.sqlite = null;
      this.drizzleDb = null;
      this.isInitialized = false;
      logger.info('Database connection closed');
    }
  }

  /**
   * Check database health and connectivity
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: string }> {
    try {
      const db = await this.connect();
      // Simple query to test connectivity
      await db.select().from(schema.guilds).limit(1);
      return { status: 'healthy', details: 'Database is responsive' };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        details: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get raw SQLite connection for advanced operations (use sparingly)
   */
  getRawConnection(): Database.Database | null {
    return this.sqlite;
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();

// Export schema for use in other modules
export { schema };

// Export Drizzle ORM utilities that might be useful
export { eq, and, or, not, isNull, isNotNull, like, desc, asc } from 'drizzle-orm';
