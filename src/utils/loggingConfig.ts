/**
 * Logging configuration for Discord Reminder Bot.
 *
 * This module sets up centralized logging configuration for the entire application
 * with full ANSI color support matching the Python implementation.
 */

import pino, { Logger, LoggerOptions } from 'pino';
import { Settings } from '@/config/settings';
import { formatDateForLogs } from './dateUtils';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

/**
 * Log level mappings - using string levels as required by Pino
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

const LOG_LEVEL_MAP: Record<LogLevel, string> = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warn',
  ERROR: 'error',
  CRITICAL: 'fatal',
};

/**
 * Color configuration for different log levels
 */
const LEVEL_COLORS = {
  DEBUG: chalk.cyan,
  INFO: chalk.green,
  WARNING: chalk.yellow,
  ERROR: chalk.red,
  CRITICAL: chalk.magenta,
} as const;

/**
 * Color configuration for log components
 */
const COMPONENT_COLORS = {
  timestamp: chalk.gray,
  separator: chalk.gray,
  logger: chalk.white,
} as const;

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
 * Check if colors should be enabled
 */
function shouldUseColors(): boolean {
  // Force disable colors if NO_COLOR environment variable is set
  if (process.env.NO_COLOR === '1' || Settings.NO_COLOR === true) {
    return false;
  }

  // Force enable colors if FORCE_COLOR environment variable is set
  if (process.env.FORCE_COLOR === '1' || Settings.FORCE_COLOR === true) {
    return true;
  }

  // Check if LOG_COLORS is explicitly set
  if (Settings.LOG_COLORS !== undefined) {
    return Settings.LOG_COLORS;
  }

  // Check if stdout is a TTY (terminal)
  return Boolean(process.stdout.isTTY);
}

/**
 * Custom error serializer for better error logging
 */
function errorSerializer(error: Error): Record<string, unknown> {
  return {
    type: error.constructor.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause && typeof error.cause === 'object' && error.cause !== null
      ? { cause: error.cause }
      : {}),
  };
}

/**
 * Custom formatter for colorized console output
 */
function createColoredFormatter(useColors: boolean): (obj: Record<string, unknown>) => string {
  return (obj: Record<string, unknown>): string => {
    const { level, time, name, msg, err, error, ...extra } = obj;

    // Type assertion for pino log object properties
    const pinoLevel = level as number;
    const pinoTime = time as number;
    const pinoName = name as string;
    const pinoMsg = msg as string;

    // Convert pino level to our log level
    let logLevel: LogLevel = 'INFO';
    if (pinoLevel >= 60) logLevel = 'CRITICAL';
    else if (pinoLevel >= 50) logLevel = 'ERROR';
    else if (pinoLevel >= 40) logLevel = 'WARNING';
    else if (pinoLevel >= 30) logLevel = 'INFO';
    else if (pinoLevel >= 20) logLevel = 'DEBUG';

    // Format timestamp in configured timezone
    const timestamp = formatDateForLogs(new Date(pinoTime));

    // Format logger name (truncate if too long)
    const loggerName = (pinoName || 'app').padEnd(20).slice(0, 20);

    // Format level name
    const levelName = logLevel.padEnd(8);

    // Handle error objects specially - check both err/error fields and extra fields
    let errorObj = err || error;

    // Also check if there's an Error object in the extra fields (this happens when you do logger.error('msg', errorObject))
    if (!errorObj) {
      for (const [key, value] of Object.entries(extra)) {
        if (
          value instanceof Error ||
          (typeof value === 'object' && value && 'message' in value && 'stack' in value)
        ) {
          errorObj = value;
          // Remove it from extra so it's not displayed twice
          delete extra[key];
          break;
        }
      }
    }

    let errorMessage = '';
    if (errorObj && typeof errorObj === 'object') {
      if ((errorObj as any).message && (errorObj as any).stack) {
        // It's an Error object
        errorMessage = `\n  Error: ${(errorObj as any).message}`;
        if (useColors) {
          errorMessage = chalk.red(errorMessage);
        }

        // Add stack trace on new lines, indented
        if ((errorObj as any).stack && typeof (errorObj as any).stack === 'string') {
          const stackLines = (errorObj as any).stack.split('\n').slice(1); // Skip first line (it's the message)
          stackLines.forEach((line: string) => {
            errorMessage += `\n    ${line}`;
          });
          if (useColors) {
            // Apply dim style to stack trace lines
            errorMessage = errorMessage.replace(/(\n {4}.+)/g, match => chalk.dim(match));
          }
        }
      } else {
        // It's some other object
        errorMessage = `\n  ${JSON.stringify(errorObj, null, 2).split('\n').join('\n  ')}`;
        if (useColors) {
          errorMessage = chalk.yellow(errorMessage);
        }
      }
    }

    if (useColors) {
      // Get colors for this level
      const levelColor = LEVEL_COLORS[logLevel];
      const emoji = LEVEL_EMOJIS[logLevel];

      // Colorize each component
      const coloredTimestamp = COMPONENT_COLORS.timestamp(timestamp);
      const coloredLevel = levelColor.bold(`${emoji} ${levelName}`);
      const coloredLogger = COMPONENT_COLORS.logger(loggerName);
      const coloredMessage = levelColor(pinoMsg);
      const separator = COMPONENT_COLORS.separator(' | ');

      // Construct the formatted message with colored components
      let formatted = `${coloredTimestamp}${separator}${coloredLevel}${separator}${coloredLogger}${separator}${coloredMessage}`;

      // Add error information if present
      if (errorMessage) {
        formatted += errorMessage;
      }

      // Add extra fields if present (excluding error fields we already handled)
      if (Object.keys(extra).length > 0) {
        const extraStr = Object.entries(extra)
          .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              return `${key}=${JSON.stringify(value, null, 2).split('\n').join('\n    ')}`;
            }
            return `${key}=${JSON.stringify(value)}`;
          })
          .join(' ');
        formatted += ` ${chalk.dim(extraStr)}`;
      }

      return formatted;
    } else {
      // Non-colored format
      const emoji = LEVEL_EMOJIS[logLevel];
      let formatted = `${timestamp} | ${emoji} ${levelName} | ${loggerName} | ${pinoMsg}`;

      // Add error information if present
      if (errorMessage) {
        formatted += errorMessage;
      }

      // Add extra fields if present
      if (Object.keys(extra).length > 0) {
        const extraStr = Object.entries(extra)
          .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              return `${key}=${JSON.stringify(value, null, 2)}`;
            }
            return `${key}=${JSON.stringify(value)}`;
          })
          .join(' ');
        formatted += ` ${extraStr}`;
      }

      return formatted;
    }
  };
}

// Global reference to file destination for proper cleanup
let fileDestination: pino.DestinationStream | null = null;

/**
 * Setup logging configuration
 */
export function setupLogging(options: {
  logLevel?: LogLevel;
  logToFile?: boolean;
  logFilePath?: string;
  useColors?: boolean;
}): Logger {
  const {
    logLevel = Settings.LOG_LEVEL,
    logToFile = Settings.LOG_TO_FILE,
    logFilePath,
    useColors = shouldUseColors(),
  } = options;

  // Convert string log level to pino level
  const pinoLevel = LOG_LEVEL_MAP[logLevel] || 'info';

  const pinoOptions: LoggerOptions = {
    base: null,
    level: pinoLevel,
    name: 'discord-reminder-bot',
    // Add error serializer to handle Error objects properly
    serializers: {
      err: errorSerializer,
      error: errorSerializer,
    },
  };

  // Create streams
  const streams: pino.StreamEntry[] = [];

  // Console stream with colored formatter
  streams.push({
    level: pinoLevel as pino.Level,
    stream: {
      write: (chunk: string) => {
        // Parse the JSON log entry
        try {
          const logObj = JSON.parse(chunk);
          const formatted = createColoredFormatter(useColors)(logObj);
          process.stdout.write(formatted + '\n');
        } catch (err) {
          // Fallback to raw output if parsing fails
          process.stdout.write(chunk);
        }
      },
    },
  });

  // File stream (without colors)
  if (logToFile) {
    const filePath = logFilePath || `logs/bot_${new Date().toISOString().slice(0, 10)}.log`;

    // Create logs directory if it doesn't exist
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      // Directory creation failed, continue without file logging
      console.warn(`Warning: Could not create logs directory: ${err}`);
    }

    // Create file destination with proper error handling
    try {
      fileDestination = pino.destination({
        dest: filePath,
        sync: false,
        mkdir: true,
        // Add these options to prevent sonic-boom issues
        append: true,
        minLength: 0, // Flush immediately
      });

      // Handle destination errors
      (fileDestination as any).on('error', (err: any) => {
        console.warn('File logging error:', err.message);
      });

      streams.push({
        level: pinoLevel as pino.Level,
        stream: fileDestination,
      });
    } catch (err) {
      console.warn(`Warning: Could not create file destination: ${err}`);
    }
  }

  // Create the logger with multiple streams
  const logger = pino(pinoOptions, pino.multistream(streams));

  // Configure discord.js logging to be less verbose
  const discordLogger = logger.child({ name: 'discord' });
  discordLogger.level = 'warn';

  // Log the logging configuration
  logger.info('=' + '='.repeat(48) + '=');
  logger.info('Discord Reminder Bot - Logging Initialized');
  logger.info(`Log Level: ${logLevel}`);
  logger.info('Console Logging: Enabled');
  logger.info(`Colors: ${useColors ? 'Enabled' : 'Disabled'}`);
  logger.info(`File Logging: ${logToFile ? 'Enabled' : 'Disabled'}`);
  if (logToFile && logFilePath) {
    logger.info(`Log File: ${logFilePath}`);
  }
  logger.info('=' + '='.repeat(48) + '=');

  return logger;
}

/**
 * Gracefully close logging resources
 */
export function closeLogging(): Promise<void> {
  return new Promise(resolve => {
    if (fileDestination) {
      // Close the file destination properly
      (fileDestination as any).end(() => {
        fileDestination = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Get log level from environment with fallback
 */
export function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
  return envLevel && envLevel in LOG_LEVEL_MAP ? envLevel : 'INFO';
}

/**
 * Check if file logging should be enabled
 */
export function shouldLogToFile(): boolean {
  return process.env.LOG_TO_FILE?.toLowerCase() === 'true';
}

/**
 * Test function to demonstrate colorized logging
 */
export function testColorizedLogging(logger: Logger): void {
  logger.debug('🔧 DEBUG - Timestamp, niveau, logger et message colorisés');
  logger.info('ℹ️ INFO - Hiérarchie visuelle parfaite avec couleurs');
  logger.warn('⚠️ WARNING - Structure complète colorisée');
  logger.error('❌ ERROR - Détection instantanée des erreurs');
  logger.fatal('🚨 CRITICAL - Maximum de visibilité');
}

/**
 * Test function to demonstrate error logging
 */
export function testErrorLogging(logger: Logger): void {
  // Test with a real Error object
  const testError = new Error('This is a test error message');
  testError.stack =
    'Error: This is a test error message\n    at testErrorLogging (/path/to/file.ts:123:45)\n    at someFunction (/path/to/file.ts:67:89)';

  logger.error('Error fetching selectable messages', testError);

  // Test with error as named parameter (recommended)
  logger.error('Error fetching selectable messages', { err: testError });

  // Test with custom object
  logger.error('Custom error object', { customData: { id: 123, status: 'failed' } });

  // Test with multiple parameters
  logger.error('Complex error scenario', {
    err: testError,
    userId: '12345',
    operation: 'fetchMessages',
    retryCount: 3,
  });
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
      logToFile: shouldLogToFile(),
      useColors: shouldUseColors(),
    });
  }
  return defaultLogger;
}

/**
 * Create a child logger with a specific name and error handling wrapper
 */
export function createLogger(name: string): Logger {
  const parentLogger = getDefaultLogger();
  const childLogger = parentLogger.child({ name });

  // Create a wrapper that handles Error objects properly
  const wrappedLogger = Object.create(childLogger);

  // Override the error method to handle Error objects as second parameter
  wrappedLogger.error = function (messageOrObj: any, ...args: any[]) {
    // If second argument is an Error object, put it in the err field
    if (args.length > 0 && args[0] instanceof Error) {
      const error = args[0];
      const additionalData = args.length > 1 ? args[1] : {};
      return childLogger.error({ err: error, ...additionalData }, messageOrObj);
    }
    // If second argument is an object with error data
    else if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      return childLogger.error(args[0], messageOrObj);
    }
    // Otherwise, use normal Pino behavior
    else {
      return childLogger.error(messageOrObj, ...args);
    }
  };

  // Override other log levels to maintain consistency
  ['debug', 'info', 'warn', 'fatal'].forEach(level => {
    wrappedLogger[level] = function (messageOrObj: any, ...args: any[]) {
      if (args.length > 0 && args[0] instanceof Error) {
        const error = args[0];
        const additionalData = args.length > 1 ? args[1] : {};
        return (childLogger as any)[level]({ err: error, ...additionalData }, messageOrObj);
      } else if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
        return (childLogger as any)[level](args[0], messageOrObj);
      } else {
        return (childLogger as any)[level](messageOrObj, ...args);
      }
    };
  });

  // Preserve other properties and methods
  Object.setPrototypeOf(wrappedLogger, childLogger);

  return wrappedLogger as Logger;
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
    ...(error.cause && typeof error.cause === 'object' && error.cause !== null
      ? { cause: error.cause }
      : {}),
  };
}

/**
 * Format error objects for logging
 */
export function formatErrorForLogging(errorObj: any): string {
  let errorMessage = '';

  // Type guard for error objects
  if (errorObj && typeof errorObj === 'object') {
    if ('message' in errorObj && 'stack' in errorObj) {
      const error = errorObj as Error;
      errorMessage = `\n  Error: ${error.message}`;

      // Log relevant properties
      if ('code' in errorObj) errorMessage += `\n  Code: ${(errorObj as any).code}`;
      if ('path' in errorObj) errorMessage += `\n  Path: ${(errorObj as any).path}`;
      if ('errno' in errorObj) errorMessage += `\n  Errno: ${(errorObj as any).errno}`;

      // Format stack trace
      if (error.stack && typeof error.stack === 'string') {
        const stackLines = error.stack.split('\n').slice(1); // Skip first line (it's the message)
        stackLines.forEach((line: string) => {
          if (line.trim()) {
            errorMessage += `\n    ${line.trim()}`;
          }
        });
      }
    } else {
      // Generic object
      errorMessage = `\n  Object: ${JSON.stringify(errorObj, null, 2)}`;
    }
  } else {
    // Primitive or other type
    errorMessage = `\n  Value: ${String(errorObj)}`;
  }

  return errorMessage;
}
