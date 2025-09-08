/**
 * Discord Reminder Bot - Configuration Validation Utilities
 *
 * Comprehensive validation for:
 * - Environment variables
 * - Configuration settings
 * - Runtime data validation
 * - Input sanitization
 */

import { Settings } from '#/config/settings';
import { createLogger } from '#/utils/loggingConfig';

const logger = createLogger('validation');

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate environment configuration
 */
export function validateEnvironmentConfig(): string[] {
  const errors: string[] = [];

  try {
    // --- Required settings ---
    if (!Settings.TOKEN || Settings.TOKEN.trim() === '') {
      errors.push('DISCORD_TOKEN is required');
    } else if (!isValidDiscordToken(Settings.TOKEN)) {
      errors.push('DISCORD_TOKEN format appears invalid');
    }

    // --- Interval validation ---
    if (Settings.REMINDER_INTERVAL_HOURS <= 0) {
      errors.push('REMINDER_INTERVAL_HOURS must be greater than 0');
    }

    const maxInterval = Settings.is_test_mode() ? 168 : 24; // 1 week max in test mode, 24h in production
    if (Settings.REMINDER_INTERVAL_HOURS > maxInterval) {
      errors.push(`REMINDER_INTERVAL_HOURS cannot exceed ${maxInterval} hours`);
    }

    // --- Admin roles ---
    if (Settings.ADMIN_ROLES.some(r => r.trim() === '')) {
      errors.push('ADMIN_ROLES cannot contain empty role names');
    }

    // --- Log level ---
    const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!validLogLevels.includes(Settings.LOG_LEVEL.toUpperCase())) {
      errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
    }

    // --- Server config ---
    if (Settings.SERVER_ENABLED) {
      if (Settings.SERVER_PORT < 1 || Settings.SERVER_PORT > 65535) {
        errors.push('SERVER_PORT must be between 1 and 65535');
      }

      if (!Settings.SERVER_HOST || Settings.SERVER_HOST.trim() === '') {
        errors.push('SERVER_HOST is required when server is enabled');
      }
    }

    // --- Auto-delete ---
    if (Settings.AUTO_DELETE_REMINDERS && Settings.AUTO_DELETE_DELAY_HOURS <= 0) {
      errors.push('AUTO_DELETE_DELAY_HOURS must be greater than 0 when auto-delete is enabled');
    }

    // --- Rate limiting ---
    if (Settings.MAX_MENTIONS_PER_REMINDER < 1) {
      errors.push('MAX_MENTIONS_PER_REMINDER must be at least 1');
    }

    if (Settings.MAX_MENTIONS_PER_REMINDER > 100) {
      errors.push('MAX_MENTIONS_PER_REMINDER cannot exceed 100 (Discord API limit)');
    }

    if (Settings.DELAY_BETWEEN_REMINDERS < 1000) {
      errors.push('DELAY_BETWEEN_REMINDERS must be at least 1000ms');
    }

    // --- Database ---
    if (Settings.DATABASE_PATH && !isValidPath(Settings.DATABASE_PATH)) {
      errors.push('DATABASE_PATH contains invalid characters');
    }
  } catch (error) {
    logger.error(`Error during environment validation: ${error}`);
    errors.push('Critical error during validation');
  }

  return errors;
}

/**
 * Validate Discord token format (basic)
 */
function isValidDiscordToken(token: string): boolean {
  if (token.length < 50) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  // First part should be base64-encoded user ID
  // Second part should be base64-encoded timestamp
  // Third part should be base64-encoded HMAC
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  return parts.every(part => base64Pattern.test(part));
}
/**
 * Validate file path safety
 */
function isValidPath(path: string): boolean {
  const dangerousPatterns = [
    /\.\.\//, // directory traversal
    /^\//, // absolute paths
    /[<>:"|?*]/, // invalid filename chars
  ];

  return !dangerousPatterns.some(p => p.test(path));
}

/**
 * Validate interval minutes
 */
export function validateInterval(intervalMinutes: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    return { valid: false, error: 'Interval must be a positive integer' };
  }

  const minInterval = Settings.is_test_mode() ? 1 : 5;
  const maxInterval = Settings.is_test_mode() ? 10080 : 1440;

  if (intervalMinutes < minInterval) {
    return { valid: false, error: `Interval must be at least ${minInterval} minutes` };
  }
  if (intervalMinutes > maxInterval) {
    return { valid: false, error: `Interval cannot exceed ${maxInterval} minutes` };
  }

  return { valid: true };
}

/**
 * Validate Discord snowflake
 */
export function validateSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

/**
 * Validate event title
 */
export function validateEventTitle(title: string): {
  valid: boolean;
  error?: string;
  sanitized?: string;
} {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Title is required and must be a string' };
  }

  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Title cannot be empty' };
  }

  if (trimmed.length > 100) {
    return { valid: true, sanitized: trimmed.substring(0, 100) };
  }

  const sanitized = trimmed.replace(/[<>@]/g, '');
  return { valid: true, sanitized: sanitized || 'Untitled Event' };
}

/**
 * Validate user IDs
 */
export function validateUserIdList(userIds: string[]): {
  valid: boolean;
  error?: string;
  sanitized?: string[];
} {
  if (!Array.isArray(userIds)) {
    return { valid: false, error: 'User IDs must be an array' };
  }

  const validIds = userIds.filter(id => typeof id === 'string' && validateSnowflake(id));

  if (validIds.length !== userIds.length) {
    logger.warn(`Filtered out ${userIds.length - validIds.length} invalid user IDs`);
  }

  return { valid: true, sanitized: [...new Set(validIds)] };
}

/**
 * Validate config object
 */
export function validateConfigObject(config: any): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be an object'], warnings: [] };
  }

  // required
  const requiredFields = ['TOKEN'];
  for (const field of requiredFields) {
    if (!(field in config) || !config[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // optionals
  if ('REMINDER_INTERVAL_HOURS' in config) {
    const interval = config.REMINDER_INTERVAL_HOURS;
    if (typeof interval !== 'number' || interval <= 0) {
      errors.push('REMINDER_INTERVAL_HOURS must be a positive number');
    }
  }

  if ('ADMIN_ROLES' in config) {
    if (!Array.isArray(config.ADMIN_ROLES)) {
      errors.push('ADMIN_ROLES must be an array');
    } else if (config.ADMIN_ROLES.some((r: any) => typeof r !== 'string')) {
      errors.push('All ADMIN_ROLES must be strings');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Runtime validation for Event objects
 */
export function validateEventData(eventData: any): {
  valid: boolean;
  errors: string[];
  sanitized?: any;
} {
  const errors: string[] = [];
  const sanitized: any = {};

  if (!eventData.messageId || !validateSnowflake(eventData.messageId)) {
    errors.push('Valid messageId is required');
  } else {
    sanitized.messageId = eventData.messageId;
  }

  if (!eventData.channelId || !validateSnowflake(eventData.channelId)) {
    errors.push('Valid channelId is required');
  } else {
    sanitized.channelId = eventData.channelId;
  }

  if (!eventData.guildId || !validateSnowflake(eventData.guildId)) {
    errors.push('Valid guildId is required');
  } else {
    sanitized.guildId = eventData.guildId;
  }

  const titleValidation = validateEventTitle(eventData.title);
  if (!titleValidation.valid) {
    errors.push(titleValidation.error!);
  } else {
    sanitized.title = titleValidation.sanitized || eventData.title;
  }

  const intervalValidation = validateInterval(eventData.intervalMinutes);
  if (!intervalValidation.valid) {
    errors.push(intervalValidation.error!);
  } else {
    sanitized.intervalMinutes = eventData.intervalMinutes;
  }

  const userIdsValidation = validateUserIdList(eventData.usersWhoReacted || []);
  if (!userIdsValidation.valid) {
    errors.push(userIdsValidation.error!);
  } else {
    sanitized.usersWhoReacted = userIdsValidation.sanitized || [];
  }

  sanitized.lastRemindedAt =
    eventData.lastRemindedAt instanceof Date ? eventData.lastRemindedAt : null;
  sanitized.isPaused = Boolean(eventData.isPaused);
  sanitized.createdAt = eventData.createdAt instanceof Date ? eventData.createdAt : new Date();
  sanitized.updatedAt = new Date();

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined,
  };
}

/**
 * Sanitize arbitrary string input
 */
/*
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '') // control chars
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // strip scripts
    .replace(/javascript:/gi, '') // javascript urls
    .replace(/on\w+\s*=/gi, ''); // inline event handlers
}
*/

/**
 * Generate validation report
 */
export function generateValidationReport(): {
  environment: { valid: boolean; errors: string[] };
  settings: { valid: boolean; issues: string[] };
  summary: string;
} {
  const envErrors = validateEnvironmentConfig();
  const envValid = envErrors.length === 0;

  const settingsIssues: string[] = [];
  try {
    Settings.logConfiguration(logger);
  } catch (error) {
    settingsIssues.push(`Settings logging failed: ${error}`);
  }

  const settingsValid = settingsIssues.length === 0;

  let summary = 'Configuration Validation Complete:\n';
  summary += `- Environment: ${envValid ? '✅ Valid' : '❌ Issues found'}\n`;
  summary += `- Settings: ${settingsValid ? '✅ Valid' : '❌ Issues found'}`;

  if (!envValid) {
    summary += `\n\nEnvironment Issues (${envErrors.length}):`;
    envErrors.forEach(e => (summary += `\n  - ${e}`));
  }

  if (!settingsValid) {
    summary += `\n\nSettings Issues (${settingsIssues.length}):`;
    settingsIssues.forEach(i => (summary += `\n  - ${i}`));
  }

  return {
    environment: { valid: envValid, errors: envErrors },
    settings: { valid: settingsValid, issues: settingsIssues },
    summary,
  };
}
