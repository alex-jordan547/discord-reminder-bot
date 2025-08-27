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
 * Custom formatter for colorized console output
 */
function createColoredFormatter(useColors: boolean): (obj: Record<string, unknown>) => string {
  return (obj: Record<string, unknown>): string => {
    const { level, time, name, msg, ...extra } = obj;

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

      // Add extra fields if present
      if (Object.keys(extra).length > 0) {
        const extraStr = Object.entries(extra)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(' ');
        formatted += ` ${chalk.dim(extraStr)}`;
      }

      return formatted;
    } else {
      // Non-colored format
      const emoji = LEVEL_EMOJIS[logLevel];
      let formatted = `${timestamp} | ${emoji} ${levelName} | ${loggerName} | ${pinoMsg}`;

      // Add extra fields if present
      if (Object.keys(extra).length > 0) {
        const extraStr = Object.entries(extra)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
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
      fileDestination.on('error', err => {
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
      fileDestination.end(() => {
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
 * Create a child logger with a specific name
 */
export function createLogger(name: string): Logger {
  const parentLogger = getDefaultLogger();
  return parentLogger.child({ name });
}

export default getDefaultLogger;
