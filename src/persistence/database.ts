/**
 * Database configuration and connection management for Discord Reminder Bot
 * 
 * TypeScript equivalent of the Python database module with SQLite connection
 * pooling, optimized settings, and proper error handling.
 */

import sqlite3 from 'sqlite3';
import { promises as fs } from 'fs';
import path from 'path';

// Enable verbose mode in development for better debugging
if (process.env.NODE_ENV === 'development') {
  sqlite3.verbose();
}

export interface DatabaseConfig {
  path: string;
  enableWAL: boolean;
  cacheSize: number;
  enableForeignKeys: boolean;
  synchronous: 'OFF' | 'NORMAL' | 'FULL';
  journalMode: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  busyTimeout: number;
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
 * SQLite database connection manager with connection pooling
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;
  private connectionPromise: Promise<sqlite3.Database> | null = null;

  private constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: this.getDatabasePath(),
      enableWAL: true,
      cacheSize: 64000, // 64MB cache
      enableForeignKeys: true,
      synchronous: 'NORMAL', // Balance between performance and safety
      journalMode: 'WAL', // Write-Ahead Logging for better concurrency
      busyTimeout: 30000, // 30 second timeout
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

    // Ensure the directory exists
    const dbFile = path.resolve(databasePath);
    const dbDir = path.dirname(dbFile);

    // Create directory synchronously if it doesn't exist
    try {
      require('fs').mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's okay
    }

    return dbFile;
  }

  /**
   * Initialize the database connection with optimized settings
   */
  async connect(): Promise<sqlite3.Database> {
    if (this.db && this.isInitialized) {
      return this.db;
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.createConnection();
    return this.connectionPromise;
  }

  /**
   * Create a new database connection with proper configuration
   */
  private async createConnection(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const database = new sqlite3.Database(
        this.config.path,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        async (err) => {
          if (err) {
            reject(new Error(`Failed to connect to database: ${err.message}`));
            return;
          }

          try {
            // Apply optimized SQLite settings
            await this.configurePragmas(database);
            
            this.db = database;
            this.isInitialized = true;
            
            console.log(`Database connected: ${this.config.path}`);
            resolve(database);
          } catch (configError) {
            database.close();
            reject(configError);
          }
        }
      );
    });
  }

  /**
   * Configure SQLite pragmas for optimal performance and safety
   */
  private async configurePragmas(database: sqlite3.Database): Promise<void> {
    const pragmas = [
      `PRAGMA journal_mode = ${this.config.journalMode}`,
      `PRAGMA cache_size = ${this.config.cacheSize}`,
      `PRAGMA foreign_keys = ${this.config.enableForeignKeys ? 'ON' : 'OFF'}`,
      `PRAGMA synchronous = ${this.config.synchronous}`,
      `PRAGMA busy_timeout = ${this.config.busyTimeout}`,
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456', // 256MB memory-mapped I/O
    ];

    for (const pragma of pragmas) {
      await this.run(pragma, [], database);
    }
  }

  /**
   * Execute a SQL statement (wrapper for better error handling)
   */
  async run(sql: string, params: any[] = [], database?: sqlite3.Database): Promise<sqlite3.RunResult> {
    const db = database || await this.connect();
    
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          reject(new Error(`SQL execution failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * Execute a SQL query and return all results
   */
  async all<T = any>(sql: string, params: any[] = [], database?: sqlite3.Database): Promise<T[]> {
    const db = database || await this.connect();
    
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`SQL query failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * Execute a SQL query and return the first result
   */
  async get<T = any>(sql: string, params: any[] = [], database?: sqlite3.Database): Promise<T | undefined> {
    const db = database || await this.connect();
    
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`SQL query failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve(row as T);
        }
      });
    });
  }

  /**
   * Execute a SQL query and return each result via callback
   */
  async each<T = any>(
    sql: string, 
    params: any[] = [], 
    callback: (row: T) => void,
    database?: sqlite3.Database
  ): Promise<number> {
    const db = database || await this.connect();
    
    return new Promise((resolve, reject) => {
      db.each(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`SQL query failed: ${err.message}\nSQL: ${sql}`));
        } else {
          callback(row as T);
        }
      }, (err, count) => {
        if (err) {
          reject(err);
        } else {
          resolve(count);
        }
      });
    });
  }

  /**
   * Execute multiple SQL statements in a transaction
   */
  async executeTransaction(statements: Array<{sql: string, params?: any[]}>): Promise<void> {
    const db = await this.connect();
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        let errorOccurred = false;
        let completedCount = 0;
        
        const handleCompletion = () => {
          completedCount++;
          if (completedCount === statements.length) {
            if (errorOccurred) {
              db.run('ROLLBACK', (err) => {
                if (err) console.error('Rollback failed:', err);
                reject(new Error('Transaction rolled back due to error'));
              });
            } else {
              db.run('COMMIT', (err) => {
                if (err) {
                  reject(new Error(`Commit failed: ${err.message}`));
                } else {
                  resolve();
                }
              });
            }
          }
        };

        for (const statement of statements) {
          db.run(statement.sql, statement.params || [], function(err) {
            if (err) {
              console.error('Transaction statement failed:', err);
              errorOccurred = true;
            }
            handleCompletion();
          });
        }
      });
    });
  }

  /**
   * Check if the database is available and accessible
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.get('SELECT 1 as test');
      return true;
    } catch (error) {
      console.warn('Database not available:', error);
      return false;
    }
  }

  /**
   * Get information about the current database
   */
  async getDatabaseInfo(): Promise<DatabaseInfo> {
    const dbExists = require('fs').existsSync(this.config.path);
    
    const info: DatabaseInfo = {
      databasePath: this.config.path,
      databaseExists: dbExists,
      databaseName: path.basename(this.config.path),
      isConnected: this.db !== null && this.isInitialized,
      isReady: await this.isAvailable(),
    };

    if (dbExists) {
      try {
        const stats = await fs.stat(this.config.path);
        info.databaseSizeBytes = stats.size;
        info.databaseSizeMB = Math.round(stats.size / (1024 * 1024) * 100) / 100;
      } catch (error) {
        console.warn('Could not get database file info:', error);
      }
    }

    return info;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(new Error(`Failed to close database: ${err.message}`));
          } else {
            this.db = null;
            this.isInitialized = false;
            this.connectionPromise = null;
            console.log('Database connection closed');
            resolve();
          }
        });
      });
    }
  }

  /**
   * Optimize database by running VACUUM and ANALYZE
   */
  async optimize(): Promise<void> {
    console.log('Optimizing database...');
    
    await this.run('VACUUM');
    await this.run('ANALYZE');
    
    console.log('Database optimization complete');
  }

  /**
   * Get database connection for direct access (use carefully)
   */
  getRawConnection(): sqlite3.Database | null {
    return this.db;
  }

  /**
   * Test database connection with comprehensive diagnostics
   */
  async testConnection(): Promise<{success: boolean, diagnostics: Record<string, any>}> {
    const diagnostics: Record<string, any> = {};
    
    try {
      // Basic connection test
      const testResult = await this.get('SELECT 1 as test');
      diagnostics.basicQuery = testResult?.test === 1;
      
      // Check pragmas
      const journalMode = await this.get('PRAGMA journal_mode');
      diagnostics.journalMode = journalMode;
      
      const foreignKeys = await this.get('PRAGMA foreign_keys');
      diagnostics.foreignKeys = foreignKeys;
      
      const cacheSize = await this.get('PRAGMA cache_size');
      diagnostics.cacheSize = cacheSize;
      
      // Database info
      const dbInfo = await this.getDatabaseInfo();
      diagnostics.databaseInfo = dbInfo;
      
      return { success: true, diagnostics };
    } catch (error) {
      diagnostics.error = error instanceof Error ? error.message : String(error);
      return { success: false, diagnostics };
    }
  }
}

/**
 * Configuration class for different environments
 */
export class DatabaseConfig {
  /**
   * Check if we're running in test mode
   */
  static isTestMode(): boolean {
    return process.env.TEST_MODE?.toLowerCase() === 'true' || 
           process.env.NODE_ENV === 'test';
  }

  /**
   * Get test database configuration (in-memory)
   */
  static getTestConfig(): Partial<DatabaseConfig> {
    return {
      path: ':memory:',
      journalMode: 'MEMORY',
      synchronous: 'OFF',
    };
  }

  /**
   * Get production database configuration
   */
  static getProductionConfig(): Partial<DatabaseConfig> {
    return {
      enableWAL: true,
      cacheSize: 64000,
      synchronous: 'NORMAL',
      journalMode: 'WAL',
    };
  }

  /**
   * Get development database configuration
   */
  static getDevelopmentConfig(): Partial<DatabaseConfig> {
    return {
      enableWAL: true,
      cacheSize: 32000,
      synchronous: 'NORMAL',
      journalMode: 'WAL',
    };
  }

  /**
   * Get appropriate configuration based on environment
   */
  static getConfiguredDatabase(): DatabaseManager {
    let config: Partial<DatabaseConfig>;

    if (this.isTestMode()) {
      config = this.getTestConfig();
      console.log('Using in-memory database for testing');
    } else if (process.env.NODE_ENV === 'production') {
      config = this.getProductionConfig();
    } else {
      config = this.getDevelopmentConfig();
    }

    return DatabaseManager.getInstance(config);
  }
}

// Export singleton instance getter
export const getDatabase = (): DatabaseManager => {
  return DatabaseConfig.getConfiguredDatabase();
};