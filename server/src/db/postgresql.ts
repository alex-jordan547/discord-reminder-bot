/**
 * PostgreSQL connection and configuration management
 * Implements connection pooling, health checks, and retry mechanisms with exponential backoff
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { createLogger } from '#/utils/loggingConfig';
import type { 
  DatabaseConfig, 
  DatabaseManager, 
  HealthCheckResult, 
  ConnectionStats, 
  PoolInfo, 
  CircuitBreakerState 
} from './types';

const logger = createLogger('postgresql');

export class PostgreSQLManager implements DatabaseManager {
  private pool: Pool | null = null;
  private drizzleDb: ReturnType<typeof drizzle> | null = null;
  private config: DatabaseConfig;
  private connectionStats: ConnectionStats;
  private circuitBreaker: CircuitBreakerState;

  constructor(config: DatabaseConfig) {
    this.validateConfig(config);
    this.config = { ...config };
    
    this.connectionStats = {
      totalAttempts: 0,
      successfulConnections: 0,
      failedAttempts: 0,
      consecutiveFailures: 0
    };

    this.circuitBreaker = {
      state: 'closed',
      failureCount: 0
    };
  }

  private validateConfig(config: DatabaseConfig): void {
    if (config.type !== 'postgresql') {
      throw new Error('Invalid database configuration: type must be postgresql');
    }

    if (!config.host || config.host.trim() === '') {
      throw new Error('Invalid database configuration: host is required');
    }

    if (!config.port || config.port <= 0 || config.port > 65535) {
      throw new Error('Invalid database configuration: port must be between 1 and 65535');
    }

    if (!config.database || config.database.trim() === '') {
      throw new Error('Invalid database configuration: database name is required');
    }

    if (!config.username || config.username.trim() === '') {
      throw new Error('Invalid database configuration: username is required');
    }

    if (!config.password || config.password.trim() === '') {
      throw new Error('Invalid database configuration: password is required');
    }

    if (config.poolSize !== undefined && config.poolSize <= 0) {
      throw new Error('Invalid database configuration: poolSize must be positive');
    }

    if (config.connectionTimeout !== undefined && config.connectionTimeout < 0) {
      throw new Error('Invalid database configuration: connectionTimeout must be non-negative');
    }

    if (config.idleTimeout !== undefined && config.idleTimeout < 0) {
      throw new Error('Invalid database configuration: idleTimeout must be non-negative');
    }

    if (config.maxLifetime !== undefined && config.maxLifetime < 0) {
      throw new Error('Invalid database configuration: maxLifetime must be non-negative');
    }
  }

  async connect(): Promise<void> {
    if (this.pool && !this.pool.ended) {
      return;
    }

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      max: this.config.poolSize || 10,
      connectionTimeoutMillis: this.config.connectionTimeout || 30000,
      idleTimeoutMillis: this.config.idleTimeout || 10000,
      maxUses: this.config.maxLifetime ? Math.floor(this.config.maxLifetime / 1000) : undefined,
      ssl: this.config.ssl ? {
        rejectUnauthorized: this.config.sslMode !== 'allow'
      } : false
    };

    this.pool = new Pool(poolConfig);
    this.drizzleDb = drizzle(this.pool, { schema });

    // Test the connection
    const client = await this.pool.connect();
    await client.query('SELECT 1');
    client.release();

    logger.info(`PostgreSQL connected: ${this.config.host}:${this.config.port}/${this.config.database}`);
  }

  async connectWithRetry(): Promise<void> {
    if (this.circuitBreaker.state === 'open') {
      const now = new Date();
      if (this.circuitBreaker.nextAttemptTime && now < this.circuitBreaker.nextAttemptTime) {
        throw new Error('Circuit breaker is open, connection attempts blocked');
      } else {
        this.circuitBreaker.state = 'half-open';
      }
    }

    const maxRetries = this.config.retryAttempts || 3;
    const baseDelay = this.config.retryDelay || 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.connectionStats.totalAttempts++;

      try {
        await this.connect();
        
        // Success - reset circuit breaker and stats
        this.connectionStats.successfulConnections++;
        this.connectionStats.consecutiveFailures = 0;
        this.connectionStats.lastSuccessfulConnection = new Date();
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failureCount = 0;
        
        return;
      } catch (error) {
        lastError = error as Error;
        this.connectionStats.failedAttempts++;
        this.connectionStats.consecutiveFailures++;
        this.connectionStats.lastFailedConnection = new Date();
        this.connectionStats.lastError = lastError;
        
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = new Date();

        // Check if we should open the circuit breaker
        const threshold = this.config.circuitBreakerThreshold || 5;
        if (this.circuitBreaker.failureCount >= threshold) {
          this.circuitBreaker.state = 'open';
          const timeout = this.config.circuitBreakerTimeout || 60000;
          this.circuitBreaker.nextAttemptTime = new Date(Date.now() + timeout);
          logger.warn(`Circuit breaker opened after ${this.circuitBreaker.failureCount} failures`);
        }

        if (attempt < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
          logger.warn(`Connection attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Connection failed after all retry attempts');
  }

  async close(): Promise<void> {
    if (this.pool && !this.pool.ended) {
      await this.pool.end();
      this.pool = null;
      this.drizzleDb = null;
      logger.info('PostgreSQL connection closed');
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      if (!this.pool || this.pool.ended) {
        return {
          status: 'unhealthy',
          details: 'No active connection pool',
          timestamp: new Date(),
          responseTime: Date.now() - startTime
        };
      }

      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      return {
        status: 'healthy',
        details: 'Database is responsive',
        timestamp: new Date(),
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  getConfig(): DatabaseConfig {
    return { ...this.config };
  }

  getConnectionStats(): ConnectionStats {
    return { ...this.connectionStats };
  }

  async getPoolInfo(): Promise<PoolInfo> {
    if (!this.pool || this.pool.ended) {
      return {
        totalConnections: 0,
        idleConnections: 0,
        activeConnections: 0,
        maxConnections: 0,
        waitingClients: 0
      };
    }

    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      maxConnections: this.pool.options.max || 10,
      waitingClients: this.pool.waitingCount
    };
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Get Drizzle database instance for queries
   */
  async getDb(): Promise<ReturnType<typeof drizzle>> {
    if (!this.drizzleDb) {
      await this.connect();
    }
    return this.drizzleDb!;
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const db = await this.getDb();
    return db.transaction(callback);
  }

  /**
   * Get environment-based database configuration
   */
  static getEnvironmentConfig(): DatabaseConfig {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const databaseType = process.env.DATABASE_TYPE as 'postgresql' | 'sqlite';

    // Default to SQLite in development, PostgreSQL in production
    if (!databaseType) {
      if (nodeEnv === 'production') {
        return this.getPostgreSQLConfig();
      } else {
        return this.getSQLiteConfig();
      }
    }

    if (databaseType === 'postgresql') {
      return this.getPostgreSQLConfig();
    } else {
      return this.getSQLiteConfig();
    }
  }

  private static getPostgreSQLConfig(): DatabaseConfig {
    const databaseUrl = process.env.DATABASE_URL;
    
    let config: DatabaseConfig;
    
    if (databaseUrl) {
      config = this.parseConnectionString(databaseUrl);
    } else {
      config = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'discord_bot',
        username: 'discord_user',
        password: '',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000,
        retryAttempts: 3,
        retryDelay: 1000,
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 60000
      };
    }

    // Override with individual environment variables if they exist
    if (process.env.DATABASE_HOST) config.host = process.env.DATABASE_HOST;
    if (process.env.DATABASE_PORT) config.port = parseInt(process.env.DATABASE_PORT);
    if (process.env.DATABASE_NAME) config.database = process.env.DATABASE_NAME;
    if (process.env.DATABASE_USER) config.username = process.env.DATABASE_USER;
    if (process.env.DATABASE_PASSWORD) config.password = process.env.DATABASE_PASSWORD;
    if (process.env.DATABASE_SSL) config.ssl = process.env.DATABASE_SSL === 'true';
    if (process.env.DATABASE_POOL_SIZE) config.poolSize = parseInt(process.env.DATABASE_POOL_SIZE);
    if (process.env.DATABASE_CONNECTION_TIMEOUT) config.connectionTimeout = parseInt(process.env.DATABASE_CONNECTION_TIMEOUT);
    if (process.env.DATABASE_IDLE_TIMEOUT) config.idleTimeout = parseInt(process.env.DATABASE_IDLE_TIMEOUT);
    if (process.env.DATABASE_MAX_LIFETIME) config.maxLifetime = parseInt(process.env.DATABASE_MAX_LIFETIME);
    if (process.env.DATABASE_RETRY_ATTEMPTS) config.retryAttempts = parseInt(process.env.DATABASE_RETRY_ATTEMPTS);
    if (process.env.DATABASE_RETRY_DELAY) config.retryDelay = parseInt(process.env.DATABASE_RETRY_DELAY);
    if (process.env.DATABASE_CIRCUIT_BREAKER_THRESHOLD) config.circuitBreakerThreshold = parseInt(process.env.DATABASE_CIRCUIT_BREAKER_THRESHOLD);
    if (process.env.DATABASE_CIRCUIT_BREAKER_TIMEOUT) config.circuitBreakerTimeout = parseInt(process.env.DATABASE_CIRCUIT_BREAKER_TIMEOUT);

    return config;
  }

  private static getSQLiteConfig(): DatabaseConfig {
    return {
      type: 'sqlite',
      path: process.env.DATABASE_PATH || './data/discord_bot.db'
    };
  }

  /**
   * Parse PostgreSQL connection string
   */
  static parseConnectionString(connectionString: string): DatabaseConfig {
    try {
      const url = new URL(connectionString);
      
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1), // Remove leading slash
        username: url.username,
        password: url.password,
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      // Parse query parameters
      const params = url.searchParams;
      if (params.has('sslmode')) {
        config.ssl = params.get('sslmode') !== 'disable';
        config.sslMode = params.get('sslmode') as any;
      }

      return config;
    } catch (error) {
      throw new Error(`Invalid connection string: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}