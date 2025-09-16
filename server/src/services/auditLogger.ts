/**
 * Audit Logging Service
 * ====================
 * Comprehensive audit trail for security events and file operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/loggingConfig.js';

const logger = createLogger('audit');

export interface FileOperationLog {
  operation: 'upload' | 'download' | 'delete' | 'view' | 'move';
  filename: string;
  userId: string;
  fileSize?: number;
  fileType?: string;
  success: boolean;
  error?: string;
  timestamp: Date;
  processingTime?: number;
  metadata?: Record<string, any>;
}

export interface SecurityEvent {
  event: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  userId?: string;
  timestamp?: Date;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLog {
  id: string;
  type: 'file_operation' | 'security_event' | 'authentication' | 'authorization';
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  action: string;
  resource?: string;
  result: 'success' | 'failure' | 'warning';
  details: Record<string, any>;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    originalFilename?: string;
    storedPath?: string;
    checksum?: string;
    severity?: string;
    [key: string]: any;
  };
}

export class AuditLogger {
  private readonly logDir = process.env.AUDIT_LOG_DIR || './logs/audit';
  private readonly maxLogSize = 100 * 1024 * 1024; // 100MB
  private readonly maxLogFiles = 10;
  private readonly logBuffer: AuditLog[] = [];
  private readonly bufferFlushInterval = 5000; // 5 seconds

  constructor() {
    this.ensureLogDirectoryExists();
    this.startLogFlusher();
  }

  /**
   * Log file operation for audit trail
   */
  async logFileOperation(operation: FileOperationLog): Promise<void> {
    const auditEntry: AuditLog = {
      id: this.generateLogId(),
      type: 'file_operation',
      timestamp: operation.timestamp,
      userId: operation.userId,
      action: operation.operation,
      resource: operation.filename,
      result: operation.success ? 'success' : 'failure',
      details: {
        fileSize: operation.fileSize,
        fileType: operation.fileType,
        processingTime: operation.processingTime,
        error: operation.error,
      },
      metadata: {
        ipAddress: operation.metadata?.ipAddress,
        userAgent: operation.metadata?.userAgent,
        originalFilename: operation.metadata?.originalFilename,
        storedPath: operation.metadata?.storedPath,
        checksum: operation.metadata?.checksum,
      },
    };

    await this.writeAuditLog(auditEntry);

    logger.info('File operation logged', {
      operation: operation.operation,
      filename: operation.filename,
      userId: operation.userId,
      success: operation.success,
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    const auditEntry: AuditLog = {
      id: this.generateLogId(),
      type: 'security_event',
      timestamp: event.timestamp || new Date(),
      userId: event.userId,
      action: event.event,
      result: event.severity === 'critical' || event.severity === 'error' ? 'failure' : 'warning',
      details: event.details,
      metadata: {
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        severity: event.severity,
      },
    };

    await this.writeAuditLog(auditEntry);

    logger.warn('Security event logged', {
      event: event.event,
      severity: event.severity,
      userId: event.userId,
      details: event.details,
    });
  }

  /**
   * Log authentication events
   */
  async logAuthenticationEvent(
    userId: string,
    action: 'login' | 'logout' | 'token_refresh' | 'password_change',
    result: 'success' | 'failure',
    details?: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const auditEntry: AuditLog = {
      id: this.generateLogId(),
      type: 'authentication',
      timestamp: new Date(),
      userId,
      action,
      result,
      details: details || {},
      metadata: metadata || {},
    };

    await this.writeAuditLog(auditEntry);

    logger.info('Authentication event logged', {
      userId,
      action,
      result,
    });
  }

  /**
   * Log authorization events
   */
  async logAuthorizationEvent(
    userId: string,
    action: string,
    resource: string,
    result: 'success' | 'failure',
    requiredPermissions?: string[],
    userPermissions?: string[],
    metadata?: Record<string, any>,
  ): Promise<void> {
    const auditEntry: AuditLog = {
      id: this.generateLogId(),
      type: 'authorization',
      timestamp: new Date(),
      userId,
      action,
      resource,
      result,
      details: {
        requiredPermissions: requiredPermissions || [],
        userPermissions: userPermissions || [],
        authorized: result === 'success',
      },
      metadata: metadata || {},
    };

    await this.writeAuditLog(auditEntry);

    if (result === 'failure') {
      logger.warn('Authorization failed', {
        userId,
        action,
        resource,
        requiredPermissions,
        userPermissions,
      });
    }
  }

  /**
   * Get audit trail for a specific resource
   */
  async getAuditTrail(
    resource?: string,
    userId?: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number,
  ): Promise<AuditLog[]> {
    try {
      const logs = await this.readAuditLogs();

      let filtered = logs.filter(log => {
        if (resource && log.resource !== resource) return false;
        if (userId && log.userId !== userId) return false;
        if (startDate && log.timestamp < startDate) return false;
        if (endDate && log.timestamp > endDate) return false;
        return true;
      });

      // Sort by timestamp (newest first)
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply limit
      if (limit && limit > 0) {
        filtered = filtered.slice(0, limit);
      }

      return filtered;
    } catch (error) {
      logger.error('Failed to retrieve audit trail', {
        resource,
        userId,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(
    startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: Date = new Date(),
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByResult: Record<string, number>;
    topUsers: Array<{ userId: string; eventCount: number }>;
    securityEvents: number;
    failedOperations: number;
  }> {
    try {
      const logs = await this.readAuditLogs();

      const filtered = logs.filter(log => log.timestamp >= startDate && log.timestamp <= endDate);

      const stats = {
        totalEvents: filtered.length,
        eventsByType: {} as Record<string, number>,
        eventsByResult: {} as Record<string, number>,
        topUsers: [] as Array<{ userId: string; eventCount: number }>,
        securityEvents: 0,
        failedOperations: 0,
      };

      const userCounts: Record<string, number> = {};

      for (const log of filtered) {
        // Count by type
        stats.eventsByType[log.type] = (stats.eventsByType[log.type] || 0) + 1;

        // Count by result
        stats.eventsByResult[log.result] = (stats.eventsByResult[log.result] || 0) + 1;

        // Count security events
        if (log.type === 'security_event') {
          stats.securityEvents++;
        }

        // Count failed operations
        if (log.result === 'failure') {
          stats.failedOperations++;
        }

        // Count by user
        if (log.userId) {
          userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
        }
      }

      // Top users
      stats.topUsers = Object.entries(userCounts)
        .map(([userId, count]) => ({ userId, eventCount: count }))
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 10);

      return stats;
    } catch (error) {
      logger.error('Failed to generate audit statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(format: 'json' | 'csv', startDate?: Date, endDate?: Date): Promise<string> {
    try {
      const logs = await this.getAuditTrail(undefined, undefined, startDate, endDate);

      if (format === 'json') {
        return JSON.stringify(logs, null, 2);
      } else if (format === 'csv') {
        return this.convertToCSV(logs);
      } else {
        throw new Error('Unsupported export format');
      }
    } catch (error) {
      logger.error('Failed to export audit logs', {
        format,
        startDate,
        endDate,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Write audit log entry
   */
  private async writeAuditLog(entry: AuditLog): Promise<void> {
    try {
      // Add to buffer for batch writing
      this.logBuffer.push(entry);

      // Also write to main log immediately for critical events
      if (entry.type === 'security_event' || entry.result === 'failure') {
        await this.flushLogBuffer();
      }
    } catch (error) {
      logger.error('Failed to write audit log', {
        entry,
        error: error.message,
      });
    }
  }

  /**
   * Flush log buffer to file
   */
  private async flushLogBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    try {
      const logFile = this.getCurrentLogFile();
      const logEntries = this.logBuffer.splice(0, this.logBuffer.length);

      const logLines = logEntries.map(entry => JSON.stringify(entry) + '\n').join('');

      await fs.promises.appendFile(logFile, logLines, { encoding: 'utf8' });

      // Check if log file needs rotation
      await this.rotateLogFileIfNeeded(logFile);
    } catch (error) {
      logger.error('Failed to flush audit log buffer', {
        bufferSize: this.logBuffer.length,
        error: error.message,
      });
    }
  }

  /**
   * Read audit logs from files
   */
  private async readAuditLogs(): Promise<AuditLog[]> {
    try {
      const logFiles = await this.getLogFiles();
      const logs: AuditLog[] = [];

      for (const file of logFiles) {
        const content = await fs.promises.readFile(file, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const log = JSON.parse(line);
            log.timestamp = new Date(log.timestamp); // Parse timestamp
            logs.push(log);
          } catch (parseError) {
            logger.warn('Failed to parse audit log line', { file, line });
          }
        }
      }

      return logs;
    } catch (error) {
      logger.error('Failed to read audit logs', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get current log file path
   */
  private getCurrentLogFile(): string {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `audit-${dateStr}.log`);
  }

  /**
   * Get all log files sorted by date
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.logDir);
      const logFiles = files
        .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
        .map(file => path.join(this.logDir, file))
        .sort();

      return logFiles;
    } catch (error) {
      return [];
    }
  }

  /**
   * Rotate log file if it exceeds maximum size
   */
  private async rotateLogFileIfNeeded(logFile: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(logFile);

      if (stats.size >= this.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);

        await fs.promises.rename(logFile, rotatedFile);
        logger.info('Audit log file rotated', { original: logFile, rotated: rotatedFile });

        // Clean up old log files
        await this.cleanupOldLogFiles();
      }
    } catch (error) {
      logger.error('Failed to rotate log file', {
        logFile,
        error: error.message,
      });
    }
  }

  /**
   * Clean up old log files
   */
  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const files = await this.getLogFiles();

      if (files.length > this.maxLogFiles) {
        const filesToDelete = files.slice(0, files.length - this.maxLogFiles);

        for (const file of filesToDelete) {
          await fs.promises.unlink(file);
          logger.info('Old audit log file deleted', { file });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old log files', {
        error: error.message,
      });
    }
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: AuditLog[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'id',
      'type',
      'timestamp',
      'userId',
      'action',
      'resource',
      'result',
      'ipAddress',
      'userAgent',
      'details',
    ];

    const csvLines = [headers.join(',')];

    for (const log of logs) {
      const row = [
        log.id,
        log.type,
        log.timestamp.toISOString(),
        log.userId || '',
        log.action,
        log.resource || '',
        log.result,
        log.metadata.ipAddress || '',
        log.metadata.userAgent || '',
        JSON.stringify(log.details).replace(/"/g, '""'),
      ];

      csvLines.push(row.map(field => `"${field}"`).join(','));
    }

    return csvLines.join('\n');
  }

  /**
   * Generate unique log ID
   */
  private generateLogId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${timestamp}-${random}`;
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectoryExists(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true, mode: 0o750 });
      logger.info('Audit log directory created', { directory: this.logDir });
    }
  }

  /**
   * Start log buffer flusher
   */
  private startLogFlusher(): void {
    setInterval(() => {
      if (this.logBuffer.length > 0) {
        this.flushLogBuffer();
      }
    }, this.bufferFlushInterval);
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
