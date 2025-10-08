/**
 * Error Reporting Service
 * =======================
 * Comprehensive error logging, reporting, and administrator notification system
 * with context preservation and intelligent error categorization.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/loggingConfig.js';

const logger = createLogger('error-reporting');

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  operation?: string;
  url?: string;
  method?: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: Date;
  stack?: string;
  environment: string;
}

export interface ErrorReport {
  id: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  category: 'network' | 'database' | 'authentication' | 'validation' | 'business' | 'system';
  message: string;
  error?: Error;
  context: ErrorContext;
  metadata: Record<string, any>;
  resolved: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export interface ErrorStats {
  total: number;
  byLevel: Record<ErrorReport['level'], number>;
  byCategory: Record<ErrorReport['category'], number>;
  resolved: number;
  unresolved: number;
  recentErrors: number; // Last 24 hours
}

export interface NotificationConfig {
  webhookUrl?: string;
  emailEndpoint?: string;
  slackWebhook?: string;
  threshold: {
    critical: number; // Notify immediately
    high: number; // Notify after N occurrences
    medium: number; // Notify after N occurrences
    low: number; // Daily summary
  };
}

const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  threshold: {
    critical: 1,
    high: 3,
    medium: 10,
    low: 50,
  },
};

export class ErrorReportingService {
  private errors: Map<string, ErrorReport> = new Map();
  private notificationConfig: NotificationConfig;
  private errorCounts: Map<string, number> = new Map();
  private lastNotification: Map<string, Date> = new Map();

  constructor(config: Partial<NotificationConfig> = {}) {
    this.notificationConfig = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
    this.initializeService();
  }

  /**
   * Initialize the service
   */
  private async initializeService() {
    // Load existing errors from file
    await this.loadErrorsFromDisk();

    // Set up cleanup interval (daily)
    setInterval(
      () => {
        this.cleanupOldErrors();
      },
      24 * 60 * 60 * 1000,
    ); // 24 hours
  }

  /**
   * Report a new error
   */
  public async reportError(
    message: string,
    error: Error | null = null,
    context: Partial<ErrorContext> = {},
    metadata: Record<string, any> = {},
  ): Promise<ErrorReport> {
    const errorId = this.generateErrorId();
    const level = this.determineErrorLevel(error, context);
    const category = this.categorizeError(error, context);

    const errorReport: ErrorReport = {
      id: errorId,
      level,
      category,
      message,
      error: error || undefined,
      context: {
        timestamp: new Date(),
        environment: process.env.NODE_ENV || 'development',
        ...context,
        stack: error?.stack,
      },
      metadata,
      resolved: false,
      createdAt: new Date(),
    };

    // Store error
    this.errors.set(errorId, errorReport);

    // Log error with appropriate level
    this.logError(errorReport);

    // Update error counts for notification logic
    const errorKey = `${category}-${level}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // Check if notification should be sent
    await this.checkNotificationThreshold(errorReport);

    // Save to disk
    await this.saveErrorToDisk(errorReport);

    return errorReport;
  }

  /**
   * Determine error severity level
   */
  private determineErrorLevel(
    error: Error | null,
    context: Partial<ErrorContext>,
  ): ErrorReport['level'] {
    // Critical: System crashes, database failures, security breaches
    if (
      error?.message.includes('ECONNREFUSED') ||
      error?.message.includes('database') ||
      context.operation?.includes('auth') ||
      error?.message.includes('EPERM')
    ) {
      return 'critical';
    }

    // High: API failures, important operation failures
    if (
      error?.name === 'ValidationError' ||
      error?.message.includes('timeout') ||
      context.operation?.includes('payment') ||
      context.operation?.includes('export')
    ) {
      return 'high';
    }

    // Medium: User errors, recoverable failures
    if (
      error?.name === 'TypeError' ||
      error?.message.includes('not found') ||
      context.operation?.includes('upload')
    ) {
      return 'medium';
    }

    // Low: Minor issues, warnings
    return 'low';
  }

  /**
   * Categorize error by type
   */
  private categorizeError(
    error: Error | null,
    context: Partial<ErrorContext>,
  ): ErrorReport['category'] {
    if (error?.message.includes('fetch') || error?.message.includes('network') || context.url) {
      return 'network';
    }

    if (
      error?.message.includes('database') ||
      error?.message.includes('sql') ||
      error?.message.includes('connection')
    ) {
      return 'database';
    }

    if (
      context.operation?.includes('auth') ||
      error?.message.includes('unauthorized') ||
      error?.message.includes('forbidden')
    ) {
      return 'authentication';
    }

    if (
      error?.name === 'ValidationError' ||
      error?.message.includes('validation') ||
      error?.message.includes('invalid')
    ) {
      return 'validation';
    }

    if (error?.message.includes('business') || context.operation?.includes('business')) {
      return 'business';
    }

    return 'system';
  }

  /**
   * Log error with appropriate level
   */
  private logError(errorReport: ErrorReport) {
    const logMessage = `[${errorReport.category.toUpperCase()}] ${errorReport.message}`;
    const contextInfo = {
      id: errorReport.id,
      level: errorReport.level,
      category: errorReport.category,
      context: errorReport.context,
      metadata: errorReport.metadata,
    };

    switch (errorReport.level) {
      case 'critical':
        logger.error(logMessage, contextInfo);
        break;
      case 'high':
        logger.error(logMessage, contextInfo);
        break;
      case 'medium':
        logger.warn(logMessage, contextInfo);
        break;
      case 'low':
        logger.info(logMessage, contextInfo);
        break;
    }
  }

  /**
   * Check if notification threshold is reached
   */
  private async checkNotificationThreshold(errorReport: ErrorReport) {
    const threshold = this.notificationConfig.threshold[errorReport.level];
    const errorKey = `${errorReport.category}-${errorReport.level}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;

    if (currentCount >= threshold) {
      await this.sendNotification(errorReport, currentCount);
      // Reset counter after notification
      this.errorCounts.set(errorKey, 0);
      this.lastNotification.set(errorKey, new Date());
    }
  }

  /**
   * Send notification to administrators
   */
  private async sendNotification(errorReport: ErrorReport, errorCount: number) {
    const notification = {
      title: `${errorReport.level.toUpperCase()} Error Alert`,
      message: errorReport.message,
      level: errorReport.level,
      category: errorReport.category,
      count: errorCount,
      errorId: errorReport.id,
      timestamp: errorReport.createdAt.toISOString(),
      context: {
        operation: errorReport.context.operation,
        userId: errorReport.context.userId,
        url: errorReport.context.url,
      },
      environment: errorReport.context.environment,
    };

    const promises: Promise<void>[] = [];

    // Webhook notification
    if (this.notificationConfig.webhookUrl) {
      promises.push(this.sendWebhookNotification(notification));
    }

    // Email notification
    if (this.notificationConfig.emailEndpoint) {
      promises.push(this.sendEmailNotification(notification));
    }

    // Slack notification
    if (this.notificationConfig.slackWebhook) {
      promises.push(this.sendSlackNotification(notification));
    }

    // Wait for all notifications to complete (with error handling)
    await Promise.allSettled(promises);
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(notification: any): Promise<void> {
    try {
      const response = await fetch(this.notificationConfig.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        throw new Error(`Webhook notification failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: any): Promise<void> {
    try {
      const emailData = {
        to: 'admin@example.com',
        subject: notification.title,
        html: this.generateEmailTemplate(notification),
      };

      const response = await fetch(this.notificationConfig.emailEndpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        throw new Error(`Email notification failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to send email notification:', error);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(notification: any): Promise<void> {
    try {
      const slackPayload = {
        text: notification.title,
        attachments: [
          {
            color: this.getSlackColor(notification.level),
            fields: [
              { title: 'Message', value: notification.message, short: false },
              { title: 'Level', value: notification.level.toUpperCase(), short: true },
              { title: 'Category', value: notification.category, short: true },
              { title: 'Count', value: notification.count.toString(), short: true },
              { title: 'Environment', value: notification.environment, short: true },
              { title: 'Error ID', value: notification.errorId, short: true },
              { title: 'Time', value: notification.timestamp, short: true },
            ],
          },
        ],
      };

      const response = await fetch(this.notificationConfig.slackWebhook!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        throw new Error(`Slack notification failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to send Slack notification:', error);
    }
  }

  /**
   * Generate email template
   */
  private generateEmailTemplate(notification: any): string {
    return `
      <h2>${notification.title}</h2>
      <p><strong>Message:</strong> ${notification.message}</p>
      <p><strong>Level:</strong> ${notification.level.toUpperCase()}</p>
      <p><strong>Category:</strong> ${notification.category}</p>
      <p><strong>Count:</strong> ${notification.count}</p>
      <p><strong>Environment:</strong> ${notification.environment}</p>
      <p><strong>Error ID:</strong> ${notification.errorId}</p>
      <p><strong>Timestamp:</strong> ${notification.timestamp}</p>
      ${notification.context.operation ? `<p><strong>Operation:</strong> ${notification.context.operation}</p>` : ''}
      ${notification.context.url ? `<p><strong>URL:</strong> ${notification.context.url}</p>` : ''}
    `;
  }

  /**
   * Get Slack color for error level
   */
  private getSlackColor(level: string): string {
    switch (level) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'good';
      case 'low':
        return '#439FE0';
      default:
        return 'good';
    }
  }

  /**
   * Acknowledge error
   */
  public acknowledgeError(errorId: string, acknowledgedBy: string): boolean {
    const error = this.errors.get(errorId);
    if (!error) return false;

    error.acknowledgedBy = acknowledgedBy;
    error.acknowledgedAt = new Date();

    logger.info(`Error ${errorId} acknowledged by ${acknowledgedBy}`);
    return true;
  }

  /**
   * Resolve error
   */
  public resolveError(errorId: string): boolean {
    const error = this.errors.get(errorId);
    if (!error) return false;

    error.resolved = true;
    logger.info(`Error ${errorId} marked as resolved`);
    return true;
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): ErrorStats {
    const errors = Array.from(this.errors.values());
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return {
      total: errors.length,
      byLevel: {
        low: errors.filter(e => e.level === 'low').length,
        medium: errors.filter(e => e.level === 'medium').length,
        high: errors.filter(e => e.level === 'high').length,
        critical: errors.filter(e => e.level === 'critical').length,
      },
      byCategory: {
        network: errors.filter(e => e.category === 'network').length,
        database: errors.filter(e => e.category === 'database').length,
        authentication: errors.filter(e => e.category === 'authentication').length,
        validation: errors.filter(e => e.category === 'validation').length,
        business: errors.filter(e => e.category === 'business').length,
        system: errors.filter(e => e.category === 'system').length,
      },
      resolved: errors.filter(e => e.resolved).length,
      unresolved: errors.filter(e => !e.resolved).length,
      recentErrors: errors.filter(e => e.createdAt > oneDayAgo).length,
    };
  }

  /**
   * Get errors by criteria
   */
  public getErrors(
    criteria: {
      level?: ErrorReport['level'];
      category?: ErrorReport['category'];
      resolved?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): ErrorReport[] {
    let errors = Array.from(this.errors.values());

    if (criteria.level) {
      errors = errors.filter(e => e.level === criteria.level);
    }

    if (criteria.category) {
      errors = errors.filter(e => e.category === criteria.category);
    }

    if (typeof criteria.resolved === 'boolean') {
      errors = errors.filter(e => e.resolved === criteria.resolved);
    }

    // Sort by creation date (newest first)
    errors.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = criteria.offset || 0;
    const limit = criteria.limit || errors.length;
    return errors.slice(offset, offset + limit);
  }

  /**
   * Export error log
   */
  public async exportErrorLog(format: 'json' | 'csv' = 'json'): Promise<string> {
    const errors = Array.from(this.errors.values());

    if (format === 'json') {
      return JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          stats: this.getErrorStats(),
          errors: errors.map(e => ({
            ...e,
            createdAt: e.createdAt.toISOString(),
            acknowledgedAt: e.acknowledgedAt?.toISOString(),
            context: {
              ...e.context,
              timestamp: e.context.timestamp.toISOString(),
            },
          })),
        },
        null,
        2,
      );
    }

    // CSV format
    const headers = [
      'ID',
      'Level',
      'Category',
      'Message',
      'Resolved',
      'Created At',
      'Operation',
      'User ID',
    ];
    const rows = errors.map(e => [
      e.id,
      e.level,
      e.category,
      `"${e.message.replace(/"/g, '""')}"`,
      e.resolved ? 'Yes' : 'No',
      e.createdAt.toISOString(),
      e.context.operation || '',
      e.context.userId || '',
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save error to disk
   */
  private async saveErrorToDisk(errorReport: ErrorReport) {
    try {
      const logsDir = path.resolve(process.cwd(), 'logs', 'errors');
      await fs.mkdir(logsDir, { recursive: true });

      const filename = `${errorReport.createdAt.toISOString().split('T')[0]}.jsonl`;
      const filepath = path.join(logsDir, filename);

      const logEntry =
        JSON.stringify({
          ...errorReport,
          createdAt: errorReport.createdAt.toISOString(),
          acknowledgedAt: errorReport.acknowledgedAt?.toISOString(),
          context: {
            ...errorReport.context,
            timestamp: errorReport.context.timestamp.toISOString(),
          },
        }) + '\n';

      await fs.appendFile(filepath, logEntry);
    } catch (error) {
      logger.error('Failed to save error to disk:', error);
    }
  }

  /**
   * Load errors from disk
   */
  private async loadErrorsFromDisk() {
    try {
      const logsDir = path.resolve(process.cwd(), 'logs', 'errors');
      const files = await fs.readdir(logsDir).catch(() => []);

      // Load recent error files (last 7 days)
      const recentFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .slice(-7); // Last 7 files

      for (const file of recentFiles) {
        const filepath = path.join(logsDir, file);
        const content = await fs.readFile(filepath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const errorData = JSON.parse(line);
            const errorReport: ErrorReport = {
              ...errorData,
              createdAt: new Date(errorData.createdAt),
              acknowledgedAt: errorData.acknowledgedAt
                ? new Date(errorData.acknowledgedAt)
                : undefined,
              context: {
                ...errorData.context,
                timestamp: new Date(errorData.context.timestamp),
              },
            };

            this.errors.set(errorReport.id, errorReport);
          } catch (parseError) {
            logger.warn(`Failed to parse error log entry: ${parseError}`);
          }
        }
      }

      logger.info(`Loaded ${this.errors.size} errors from disk`);
    } catch (error) {
      logger.error('Failed to load errors from disk:', error);
    }
  }

  /**
   * Clean up old errors (keep last 30 days)
   */
  private async cleanupOldErrors() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDelete: string[] = [];

    for (const [id, error] of this.errors) {
      if (error.createdAt < thirtyDaysAgo) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => this.errors.delete(id));

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old error reports`);
    }
  }
}

// Singleton instance
export const errorReporting = new ErrorReportingService();
