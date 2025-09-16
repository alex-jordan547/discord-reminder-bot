/**
 * Database Failover Service
 * =========================
 * Automatic failover system that switches from PostgreSQL to SQLite
 * when PostgreSQL becomes unavailable, with automatic backup and recovery.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/loggingConfig.js';
import { Settings } from '../config/settings.js';

const logger = createLogger('db-failover');

export interface DatabaseConnection {
  type: 'postgresql' | 'sqlite';
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: Date;
  errorCount: number;
  config: any;
}

export interface FailoverConfig {
  maxRetries: number;
  retryInterval: number;
  healthCheckInterval: number;
  backupBeforeFailover: boolean;
  autoRecovery: boolean;
  notificationEndpoint?: string;
}

export interface BackupInfo {
  id: string;
  timestamp: Date;
  sourceType: 'postgresql' | 'sqlite';
  filePath: string;
  size: number;
  checksum: string;
}

const DEFAULT_CONFIG: FailoverConfig = {
  maxRetries: 3,
  retryInterval: 5000,
  healthCheckInterval: 30000,
  backupBeforeFailover: true,
  autoRecovery: true,
};

export class DatabaseFailoverService {
  private connections: Map<string, DatabaseConnection> = new Map();
  private activeConnection: DatabaseConnection | null = null;
  private config: FailoverConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private backups: BackupInfo[] = [];
  private isFailingOver = false;

  constructor(config: Partial<FailoverConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeConnections();
    this.startHealthCheck();
  }

  /**
   * Initialize database connections
   */
  private initializeConnections() {
    // PostgreSQL connection
    this.connections.set('postgresql', {
      type: 'postgresql',
      status: 'disconnected',
      lastCheck: new Date(),
      errorCount: 0,
      config: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'discord_bot',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD,
      },
    });

    // SQLite connection
    this.connections.set('sqlite', {
      type: 'sqlite',
      status: 'connected',
      lastCheck: new Date(),
      errorCount: 0,
      config: {
        path: path.resolve(process.cwd(), 'data', 'discord_bot.db'),
      },
    });
  }

  /**
   * Test database connection health
   */
  private async testConnection(connection: DatabaseConnection): Promise<boolean> {
    try {
      if (connection.type === 'postgresql') {
        // Test PostgreSQL connection
        const { Client } = await import('pg');
        const client = new Client(connection.config);

        await client.connect();
        await client.query('SELECT 1');
        await client.end();

        return true;
      } else {
        // Test SQLite connection
        const sqlite3 = await import('better-sqlite3');
        const Database = sqlite3.default;

        try {
          const db = new Database(connection.config.path);
          db.prepare('SELECT 1').get();
          db.close();
          return true;
        } catch (error) {
          return false;
        }
      }
    } catch (error) {
      logger.error(`Connection test failed for ${connection.type}:`, error);
      return false;
    }
  }

  /**
   * Update connection status
   */
  private async updateConnectionStatus(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const isHealthy = await this.testConnection(connection);
    const previousStatus = connection.status;

    if (isHealthy) {
      connection.status = 'connected';
      connection.errorCount = 0;
    } else {
      connection.status = 'error';
      connection.errorCount++;
    }

    connection.lastCheck = new Date();

    // Log status changes
    if (previousStatus !== connection.status) {
      logger.info(
        `Database ${connectionId} status changed: ${previousStatus} → ${connection.status}`,
      );

      if (connection.status === 'error') {
        await this.handleConnectionFailure(connectionId);
      } else if (connection.status === 'connected' && previousStatus === 'error') {
        await this.handleConnectionRecovery(connectionId);
      }
    }
  }

  /**
   * Handle connection failure
   */
  private async handleConnectionFailure(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    logger.warn(`Database connection ${connectionId} failed (attempts: ${connection.errorCount})`);

    // If this is the active connection and we've exceeded max retries, initiate failover
    if (
      this.activeConnection?.type === connectionId &&
      connection.errorCount >= this.config.maxRetries &&
      !this.isFailingOver
    ) {
      await this.initiateFailover();
    }

    // Send notification if configured
    if (this.config.notificationEndpoint) {
      await this.sendNotification({
        type: 'connection_failure',
        database: connectionId,
        errorCount: connection.errorCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle connection recovery
   */
  private async handleConnectionRecovery(connectionId: string) {
    logger.info(`Database connection ${connectionId} recovered`);

    // If auto-recovery is enabled and this is the preferred connection, switch back
    if (
      this.config.autoRecovery &&
      connectionId === 'postgresql' &&
      this.activeConnection?.type === 'sqlite'
    ) {
      logger.info('Auto-recovery: switching back to PostgreSQL');
      await this.switchToConnection('postgresql');
    }

    // Send notification
    if (this.config.notificationEndpoint) {
      await this.sendNotification({
        type: 'connection_recovery',
        database: connectionId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Create database backup
   */
  private async createBackup(sourceConnection: DatabaseConnection): Promise<BackupInfo | null> {
    try {
      const backupId = `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date();
      const backupDir = path.resolve(process.cwd(), 'backups');

      // Ensure backup directory exists
      await fs.mkdir(backupDir, { recursive: true });

      const backupPath = path.join(backupDir, `${backupId}.sql`);

      if (sourceConnection.type === 'postgresql') {
        // PostgreSQL backup using pg_dump
        const { execSync } = await import('child_process');
        const config = sourceConnection.config;

        const command = `pg_dump -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} --no-password > ${backupPath}`;

        // Set password via environment variable
        const env = { ...process.env, PGPASSWORD: config.password };
        execSync(command, { env });
      } else {
        // SQLite backup - copy the file
        await fs.copyFile(sourceConnection.config.path, backupPath);
      }

      // Calculate file size and checksum
      const stats = await fs.stat(backupPath);
      const fileContent = await fs.readFile(backupPath);
      const checksum = require('crypto').createHash('md5').update(fileContent).digest('hex');

      const backupInfo: BackupInfo = {
        id: backupId,
        timestamp,
        sourceType: sourceConnection.type,
        filePath: backupPath,
        size: stats.size,
        checksum,
      };

      this.backups.push(backupInfo);
      logger.info(`Backup created: ${backupId} (${this.formatFileSize(stats.size)})`);

      return backupInfo;
    } catch (error) {
      logger.error('Failed to create backup:', error);
      return null;
    }
  }

  /**
   * Initiate database failover
   */
  private async initiateFailover() {
    if (this.isFailingOver) {
      logger.warn('Failover already in progress, skipping');
      return;
    }

    this.isFailingOver = true;
    logger.info('Initiating database failover...');

    try {
      // Create backup if configured
      if (this.config.backupBeforeFailover && this.activeConnection) {
        logger.info('Creating backup before failover...');
        const backup = await this.createBackup(this.activeConnection);
        if (backup) {
          logger.info(`Backup completed: ${backup.id}`);
        } else {
          logger.warn('Backup failed, continuing with failover');
        }
      }

      // Switch to fallback connection (SQLite)
      const sqliteConnection = this.connections.get('sqlite');
      if (sqliteConnection && sqliteConnection.status === 'connected') {
        await this.switchToConnection('sqlite');
        logger.info('Failover completed successfully');
      } else {
        logger.error('Failover failed: SQLite connection not available');
        throw new Error('No fallback connection available');
      }

      // Send notification
      if (this.config.notificationEndpoint) {
        await this.sendNotification({
          type: 'failover_completed',
          from: this.activeConnection?.type,
          to: 'sqlite',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Failover failed:', error);

      if (this.config.notificationEndpoint) {
        await this.sendNotification({
          type: 'failover_failed',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      this.isFailingOver = false;
    }
  }

  /**
   * Switch to specified connection
   */
  private async switchToConnection(connectionType: 'postgresql' | 'sqlite') {
    const connection = this.connections.get(connectionType);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Cannot switch to ${connectionType}: connection not available`);
    }

    this.activeConnection = connection;
    logger.info(`Switched to ${connectionType} database`);

    // Update application settings to use the new connection
    if (connectionType === 'sqlite') {
      process.env.DB_TYPE = 'sqlite';
    } else {
      process.env.DB_TYPE = 'postgresql';
    }
  }

  /**
   * Send notification to configured endpoint
   */
  private async sendNotification(data: any) {
    try {
      if (!this.config.notificationEndpoint) return;

      const response = await fetch(this.config.notificationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: 'database-failover',
          ...data,
        }),
      });

      if (!response.ok) {
        throw new Error(`Notification failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to send notification:', error);
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck() {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      for (const connectionId of this.connections.keys()) {
        await this.updateConnectionStatus(connectionId);
      }
    }, this.config.healthCheckInterval);

    logger.info(`Health check started (interval: ${this.config.healthCheckInterval}ms)`);
  }

  /**
   * Stop health check monitoring
   */
  public stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Health check stopped');
    }
  }

  /**
   * Get current status
   */
  public getStatus() {
    return {
      activeConnection: this.activeConnection?.type || null,
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        id,
        type: conn.type,
        status: conn.status,
        errorCount: conn.errorCount,
        lastCheck: conn.lastCheck.toISOString(),
      })),
      backups: this.backups.length,
      isFailingOver: this.isFailingOver,
      config: {
        maxRetries: this.config.maxRetries,
        autoRecovery: this.config.autoRecovery,
        healthCheckInterval: this.config.healthCheckInterval,
      },
    };
  }

  /**
   * Get backup information
   */
  public getBackups(): BackupInfo[] {
    return [...this.backups];
  }

  /**
   * Manually trigger failover
   */
  public async triggerFailover(): Promise<void> {
    if (this.isFailingOver) {
      throw new Error('Failover already in progress');
    }

    logger.info('Manual failover triggered');
    await this.initiateFailover();
  }

  /**
   * Manually trigger recovery to PostgreSQL
   */
  public async triggerRecovery(): Promise<void> {
    const pgConnection = this.connections.get('postgresql');
    if (!pgConnection || pgConnection.status !== 'connected') {
      throw new Error('PostgreSQL connection not available');
    }

    logger.info('Manual recovery to PostgreSQL triggered');
    await this.switchToConnection('postgresql');
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown() {
    logger.info('Shutting down database failover service');
    this.stopHealthCheck();
  }
}

// Singleton instance
export const databaseFailover = new DatabaseFailoverService();
