/**
 * Ultra-simple logging configuration for Discord Reminder Bot.
 * Console-only logging for maximum Docker compatibility.
 */

import { Settings } from '../config/settings.js';
import { formatDateForLogs } from './dateUtils.js';

/**
 * Log levels
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50,
};

/**
 * Emojis for log levels
 */
const LEVEL_EMOJIS = {
  DEBUG: '🔧',
  INFO: 'ℹ️',
  WARNING: '⚠️',
  ERROR: '❌',
  CRITICAL: '🚨',
} as const;

/**
 * Simple logger interface compatible with existing code
 */
export interface Logger {
  debug(msg: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  fatal(msg: string, ...args: any[]): void;
  child(options: any): Logger;
  level: string;
}

/**
 * Current global log level
 */
let currentLogLevel: LogLevel = 'INFO';

/**
 * Simple console-based logger implementation
 */
class ConsoleLogger implements Logger {
  private name: string;
  public level: string = 'info';

  constructor(name: string = 'app') {
    this.name = name;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[currentLogLevel];
  }

  private formatMessage(level: LogLevel, msg: string, ...args: any[]): string {
    const timestamp = formatDateForLogs(new Date());
    const emoji = LEVEL_EMOJIS[level];
    const loggerName = this.name.padEnd(20).slice(0, 20);
    const levelName = level.padEnd(8);

    let formatted = `${timestamp} | ${emoji} ${levelName} | ${loggerName} | ${msg}`;

    // Handle additional arguments
    if (args.length > 0) {
      const extraArgs = args.map(arg => {
        if (arg instanceof Error) {
          return `\n  Error: ${arg.message}\n  Stack: ${arg.stack}`;
        } else if (typeof arg === 'object' && arg !== null) {
          return `\n  ${JSON.stringify(arg, null, 2)}`;
        }
        return String(arg);
      }).join(' ');
      formatted += ` ${extraArgs}`;
    }

    return formatted;
  }

  debug(msg: string, ...args: any[]): void {
    if (this.shouldLog('DEBUG')) {
      console.log(this.formatMessage('DEBUG', msg, ...args));
    }
  }

  info(msg: string, ...args: any[]): void {
    if (this.shouldLog('INFO')) {
      console.log(this.formatMessage('INFO', msg, ...args));
    }
  }

  warn(msg: string, ...args: any[]): void {
    if (this.shouldLog('WARNING')) {
      console.warn(this.formatMessage('WARNING', msg, ...args));
    }
  }

  error(msg: string, ...args: any[]): void {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatMessage('ERROR', msg, ...args));
    }
  }

  fatal(msg: string, ...args: any[]): void {
    if (this.shouldLog('CRITICAL')) {
      console.error(this.formatMessage('CRITICAL', msg, ...args));
    }
  }

  child(options: any): Logger {
    const childName = options?.name || options?.component || this.name;
    return new ConsoleLogger(childName);
  }
}

/**
 * Setup logging configuration - ultra simple console-only version
 */
export function setupLogging(options: {
  logLevel?: LogLevel;
  logToFile?: boolean;
  logFilePath?: string;
  useColors?: boolean;
}): Logger {
  const {
    logLevel = Settings.LOG_LEVEL || 'INFO',
  } = options;

  // Set global log level
  currentLogLevel = logLevel;

  // Create main logger
  const logger = new ConsoleLogger('discord-reminder-bot');

  // Log initialization
  setTimeout(() => {
    logger.info('=' + '='.repeat(48) + '=');
    logger.info('Discord Reminder Bot - Console Logging Initialized');
    logger.info(`Log Level: ${logLevel}`);
    logger.info('Console Logging: Enabled');
    logger.info('File Logging: Disabled (Console Only)');
    logger.info('=' + '='.repeat(48) + '=');
  }, 0);

  return logger;
}

/**
 * No-op for compatibility
 */
export function closeLogging(): Promise<void> {
  return Promise.resolve();
}

/**
 * Get log level from environment with fallback
 */
export function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
  return envLevel && envLevel in LOG_LEVEL_VALUES ? envLevel : 'INFO';
}

/**
 * File logging is disabled in this simple implementation
 */
export function shouldLogToFile(): boolean {
  return false;
}

/**
 * Test function for logging levels
 */
export function testColorizedLogging(logger: Logger): void {
  logger.debug('🔧 DEBUG - Simple console debug message');
  logger.info('ℹ️ INFO - Simple console info message');
  logger.warn('⚠️ WARNING - Simple console warning message');
  logger.error('❌ ERROR - Simple console error message');
  logger.fatal('🚨 CRITICAL - Simple console critical message');
}

/**
 * Test function for error logging
 */
export function testErrorLogging(logger: Logger): void {
  const testError = new Error('Test error message');
  logger.error('Error occurred', testError);
  logger.error('Error with context', testError, { userId: '12345', operation: 'test' });
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get the default configured logger instance
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = setupLogging({
      logLevel: getLogLevelFromEnv(),
    });
  }
  return defaultLogger;
}

/**
 * Create a child logger with a specific name
 */
export function createLogger(name: string): Logger {
  return new ConsoleLogger(name);
}

export default getDefaultLogger;

/**
 * Serialize error objects for structured logging
 */
export function serializeError(error: Error): Record<string, any> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}
