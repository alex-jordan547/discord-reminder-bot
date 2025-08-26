/**
 * Configuration settings for Discord Reminder Bot.
 *
 * This module centralizes all application settings and provides
 * a clean interface for configuration management with TypeScript validation.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment variable schema validation
 */
const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'Discord token is required'),
  REMINDER_INTERVAL_HOURS: z.coerce.number().positive().default(24),
  USE_SEPARATE_REMINDER_CHANNEL: z.coerce.boolean().default(false),
  REMINDER_CHANNEL_NAME: z.string().default('rappels-event'),
  ADMIN_ROLES: z.string().default('Admin,Moderateur,Coach'),
  AUTO_DELETE_REMINDERS: z.coerce.boolean().default(true),
  AUTO_DELETE_DELAY_HOURS: z.coerce.number().positive().default(1),
  TEST_MODE: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).default('INFO'),
  LOG_TO_FILE: z.coerce.boolean().default(true),
  LOG_COLORS: z.coerce.boolean().optional(),
  USE_SQLITE: z.coerce.boolean().default(false),
  DATABASE_PATH: z.string().default('discord_bot.db'),
  AUTO_MIGRATE: z.coerce.boolean().default(true),
  BACKUP_JSON_ON_MIGRATION: z.coerce.boolean().default(true),
  ENABLE_FEATURE_FLAGS: z.coerce.boolean().default(true),
  ENABLE_AUTO_FALLBACK: z.coerce.boolean().default(true),
  ENABLE_HEALTH_MONITORING: z.coerce.boolean().default(true),
  FALLBACK_RETRY_DELAY_MINUTES: z.coerce.number().int().positive().default(30),
  MAX_FALLBACK_RETRIES: z.coerce.number().int().positive().default(3),
  DEGRADED_MODE_TIMEOUT_HOURS: z.coerce.number().int().positive().default(24),
  FORCE_COLOR: z.coerce.boolean().optional(),
  NO_COLOR: z.coerce.boolean().optional(),
});

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 */
let envConfig: EnvConfig;

try {
  envConfig = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}

/**
 * Application settings class with validation and utility methods
 */
export class Settings {
  // Discord Bot Configuration
  static readonly TOKEN = envConfig.DISCORD_TOKEN;
  static readonly COMMAND_PREFIX = '!';

  // Reminder Configuration
  static readonly REMINDER_INTERVAL_HOURS = envConfig.REMINDER_INTERVAL_HOURS;

  // Channel Configuration
  static readonly USE_SEPARATE_REMINDER_CHANNEL = envConfig.USE_SEPARATE_REMINDER_CHANNEL;
  static readonly REMINDER_CHANNEL_NAME = envConfig.REMINDER_CHANNEL_NAME;

  // Permission Configuration
  static readonly ADMIN_ROLES = envConfig.ADMIN_ROLES.split(',').map(role => role.trim());

  // Message Configuration
  static readonly DEFAULT_REACTIONS = ['✅', '❌', '❓'] as const;
  static readonly MAX_MENTIONS_PER_REMINDER = 50;
  static readonly MAX_TITLE_LENGTH = 100;

  // Auto-deletion Configuration
  static readonly AUTO_DELETE_REMINDERS = envConfig.AUTO_DELETE_REMINDERS;
  static readonly AUTO_DELETE_DELAY_HOURS = envConfig.AUTO_DELETE_DELAY_HOURS;
  static readonly MIN_AUTO_DELETE_HOURS = 1 / 60; // 1 minute
  static readonly MAX_AUTO_DELETE_HOURS = 168; // 7 days
  static readonly AUTO_DELETE_CHOICES = [
    1 / 60, 2 / 60, 0.05, 0.08, 0.17, 0.25, 0.5, 1, 2, 6, 12, 24, 48, 72, 168,
  ] as const;

  // Slash Command Configuration
  static readonly DEFAULT_INTERVAL_MINUTES = 60;
  static readonly MIN_INTERVAL_MINUTES = 5;
  static readonly MAX_INTERVAL_MINUTES = 1440; // 24 hours

  // Suggested interval options for slash command choices
  static readonly INTERVAL_CHOICES = [5, 15, 30, 60, 120, 360, 720, 1440] as const;

  // Timing Configuration
  static readonly REMINDER_DELAY_SECONDS = 2;

  // File Configuration
  static readonly REMINDERS_SAVE_FILE = 'watched_reminders.json';

  // Database Configuration
  static readonly USE_SQLITE = envConfig.USE_SQLITE;
  static readonly DATABASE_PATH = envConfig.DATABASE_PATH;
  static readonly AUTO_MIGRATE = envConfig.AUTO_MIGRATE;
  static readonly BACKUP_JSON_ON_MIGRATION = envConfig.BACKUP_JSON_ON_MIGRATION;

  // Feature Flags Configuration
  static readonly ENABLE_FEATURE_FLAGS = envConfig.ENABLE_FEATURE_FLAGS;
  static readonly ENABLE_AUTO_FALLBACK = envConfig.ENABLE_AUTO_FALLBACK;
  static readonly ENABLE_HEALTH_MONITORING = envConfig.ENABLE_HEALTH_MONITORING;

  // Fallback Configuration
  static readonly FALLBACK_RETRY_DELAY_MINUTES = envConfig.FALLBACK_RETRY_DELAY_MINUTES;
  static readonly MAX_FALLBACK_RETRIES = envConfig.MAX_FALLBACK_RETRIES;
  static readonly DEGRADED_MODE_TIMEOUT_HOURS = envConfig.DEGRADED_MODE_TIMEOUT_HOURS;

  // Logging Configuration
  static readonly LOG_LEVEL = envConfig.LOG_LEVEL;
  static readonly LOG_TO_FILE = envConfig.LOG_TO_FILE;
  static readonly LOG_COLORS = envConfig.LOG_COLORS;
  static readonly FORCE_COLOR = envConfig.FORCE_COLOR;
  static readonly NO_COLOR = envConfig.NO_COLOR;

  /**
   * Validate and clamp an interval value to acceptable range.
   * In test mode, allows more flexible intervals including sub-minute intervals.
   */
  static validateIntervalMinutes(intervalMinutes: number): number {
    if (this.isTestMode()) {
      // Test mode: very flexible intervals (30 seconds to 1 week)
      return Math.max(0.5, Math.min(10080.0, intervalMinutes));
    } else {
      // Production mode: standard intervals (integers only)
      const intInterval = Math.floor(intervalMinutes);
      return Math.max(this.MIN_INTERVAL_MINUTES, Math.min(this.MAX_INTERVAL_MINUTES, intInterval));
    }
  }

  /**
   * Validate and clamp an auto-deletion delay to acceptable range.
   */
  static validateAutoDeleteHours(hours: number): number {
    return Math.max(this.MIN_AUTO_DELETE_HOURS, Math.min(this.MAX_AUTO_DELETE_HOURS, hours));
  }

  /**
   * Format an auto-deletion delay for user-friendly display.
   */
  static formatAutoDeleteDisplay(hours: number): string {
    if (hours < 1) {
      const minutes = Math.floor(hours * 60);
      return `${minutes} minute(s)`;
    } else if (hours === 1) {
      return '1 heure';
    } else if (hours < 24) {
      if (hours === Math.floor(hours)) {
        return `${Math.floor(hours)} heure(s)`;
      } else {
        return `${hours} heure(s)`;
      }
    } else if (hours === 24) {
      return '1 jour';
    } else if (hours < 168) {
      const days = hours / 24;
      if (days === Math.floor(days)) {
        return `${Math.floor(days)} jour(s)`;
      } else {
        return `${days.toFixed(1)} jour(s)`;
      }
    } else {
      const days = Math.floor(hours / 24);
      return `${days} jour(s)`;
    }
  }

  /**
   * Format an interval in minutes for user-friendly display.
   * Supports sub-minute intervals in test mode and extended ranges.
   */
  static formatIntervalDisplay(minutes: number): string {
    if (minutes < 1) {
      if (minutes === 0.5) {
        return '30 secondes';
      } else if (minutes < 0.5) {
        const seconds = Math.floor(minutes * 60);
        return `${seconds} seconde(s)`;
      } else {
        const seconds = Math.floor(minutes * 60);
        return `${seconds} seconde(s)`;
      }
    } else if (minutes === 1) {
      return '1 minute';
    } else if (minutes < 60) {
      if (minutes === Math.floor(minutes)) {
        return `${Math.floor(minutes)} minute(s)`;
      } else {
        return `${minutes} minute(s)`;
      }
    } else if (minutes === 60) {
      return '1 heure';
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours} heure(s)`;
      } else {
        if (remainingMinutes === Math.floor(remainingMinutes)) {
          return `${hours}h${Math.floor(remainingMinutes)}m`;
        } else {
          return `${hours}h${remainingMinutes}m`;
        }
      }
    } else if (minutes === 1440) {
      return '1 jour';
    } else if (minutes < 10080) {
      // Less than a week
      const days = Math.floor(minutes / 1440);
      const remainingHours = Math.floor((minutes % 1440) / 60);
      const remainingMins = minutes % 60;

      const parts: string[] = [];
      if (days > 0) {
        parts.push(`${days}j`);
      }
      if (remainingHours > 0) {
        parts.push(`${remainingHours}h`);
      }
      if (remainingMins > 0) {
        if (remainingMins === Math.floor(remainingMins)) {
          parts.push(`${Math.floor(remainingMins)}m`);
        } else {
          parts.push(`${remainingMins}m`);
        }
      }

      return parts.length > 0 ? parts.join('') : '0 minutes';
    } else {
      // More than a week
      const days = Math.floor(minutes / 1440);
      return `${days} jour(s)`;
    }
  }

  /**
   * Get the reminder interval converted to minutes.
   */
  static getReminderIntervalMinutes(): number {
    return Math.floor(this.REMINDER_INTERVAL_HOURS * 60);
  }

  /**
   * Check if the bot is running in test mode (rapid reminders).
   */
  static isTestMode(): boolean {
    // Check explicit TEST_MODE environment variable first
    if (envConfig.TEST_MODE) {
      return true;
    }

    // Fallback to checking reminder interval for backward compatibility
    return this.REMINDER_INTERVAL_HOURS < 1;
  }

  /**
   * Get admin roles as a comma-separated string for display.
   */
  static getAdminRolesStr(): string {
    return this.ADMIN_ROLES.join(', ');
  }

  /**
   * Get timestamp for embed display.
   */
  static getEmbedTimestamp(): Date {
    return new Date();
  }

  /**
   * Get custom formatted timestamp for footer display.
   * In test mode, includes seconds for more precise timing.
   */
  static getCustomFooterTimestamp(): string {
    const now = new Date();
    if (this.isTestMode()) {
      // Test mode: display with seconds for more precision
      return now.toLocaleTimeString('fr-FR');
    } else {
      // Production mode: standard display without seconds
      return now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
  }

  /**
   * Log the current configuration settings (excluding sensitive data).
   */
  static logConfiguration(logger: { info: (message: string) => void }): void {
    logger.info('=== Discord Reminder Bot Configuration ===');
    logger.info(`Command prefix: ${this.COMMAND_PREFIX}`);

    // Log reminder interval in a user-friendly format
    if (this.REMINDER_INTERVAL_HOURS < 1) {
      logger.info(`Reminder interval: ${this.getReminderIntervalMinutes()} minutes`);
    } else {
      logger.info(`Reminder interval: ${this.REMINDER_INTERVAL_HOURS} hours`);
    }

    // Log channel configuration
    if (this.USE_SEPARATE_REMINDER_CHANNEL) {
      logger.info(`Reminder mode: Separate channel (#${this.REMINDER_CHANNEL_NAME})`);
    } else {
      logger.info('Reminder mode: Same channel as original message');
    }

    // Log admin roles
    logger.info(`Admin roles: ${this.getAdminRolesStr()}`);
    logger.info(`Max mentions per reminder: ${this.MAX_MENTIONS_PER_REMINDER}`);
    logger.info(`Default reactions: ${this.DEFAULT_REACTIONS.join(', ')}`);

    // Log database configuration
    if (this.USE_SQLITE) {
      logger.info(`Database: SQLite (${this.DATABASE_PATH})`);
      logger.info(`Auto-migration: ${this.AUTO_MIGRATE ? 'Enabled' : 'Disabled'}`);
      logger.info(
        `JSON backup on migration: ${this.BACKUP_JSON_ON_MIGRATION ? 'Enabled' : 'Disabled'}`,
      );
    } else {
      logger.info('Database: JSON file storage');
    }

    // Log feature flags configuration
    if (this.ENABLE_FEATURE_FLAGS) {
      logger.info('Feature flags: Enabled');
      logger.info(`Auto-fallback: ${this.ENABLE_AUTO_FALLBACK ? 'Enabled' : 'Disabled'}`);
      logger.info(
        `Health monitoring: ${this.ENABLE_HEALTH_MONITORING ? 'Enabled' : 'Disabled'}`,
      );
    } else {
      logger.info('Feature flags: Disabled');
    }

    logger.info('==========================================');
  }
}

/**
 * Standard messages used throughout the application.
 */
export class Messages {
  // Error messages
  static readonly INVALID_LINK_FORMAT =
    "❌ Format de lien invalide. Pour obtenir le lien d'un message:\n" +
    '1. Faites clic droit sur le message\n' +
    "2. Sélectionnez 'Copier le lien du message'\n" +
    '3. Collez le lien complet dans la commande';

  static readonly MESSAGE_NOT_FOUND = '❌ Message introuvable.';
  static readonly CHANNEL_NOT_FOUND = '❌ Canal introuvable.';
  static readonly WRONG_SERVER = "❌ Ce message n'est pas sur ce serveur!";
  static readonly REMINDER_NOT_WATCHED = "❌ Ce message n'est pas surveillé.";
  static readonly REMINDER_NOT_ON_SERVER = "❌ Ce rappel n'est pas sur ce serveur.";
  static readonly NO_REMINDERS_TO_REMIND = '📭 Aucun rappel à envoyer sur ce serveur.';
  static readonly NO_WATCHED_REMINDERS = '📭 Aucun rappel surveillé sur ce serveur.';

  // Success messages
  static readonly REMINDER_ADDED = '✅ Rappel ajouté à la surveillance!';
  static readonly REMINDER_REMOVED = '✅ Rappel **{}** retiré de la surveillance.';
  static readonly REMINDER_SENT = '✅ Rappel envoyé! {} personne(s) notifiée(s) au total.';
  static readonly CHANNEL_CREATED = '✅ Canal #{} créé sur le serveur {}';
  static readonly INTERVAL_UPDATED = '✅ Intervalle mis à jour : {} pour le rappel **{}**';
  static readonly REMINDER_PAUSED = '⏸️ Rappel **{}** mis en pause.';
  static readonly REMINDER_RESUMED = '▶️ Rappel **{}** repris.';

  // Slash command responses
  static readonly SLASH_WATCH_SUCCESS = 'Rappel ajouté avec succès!';
  static readonly SLASH_UNWATCH_SUCCESS = 'Rappel retiré de la surveillance.';
  static readonly SLASH_REMIND_SUCCESS = 'Rappel envoyé!';
  static readonly SLASH_INTERVAL_SUCCESS = 'Intervalle mis à jour.';
  static readonly SLASH_PAUSE_SUCCESS = 'Rappels mis en pause.';
  static readonly SLASH_RESUME_SUCCESS = 'Rappels repris.';

  // Info messages
  static readonly NO_SAVE_FILE = 'ℹ️ Aucune sauvegarde trouvée, démarrage avec une liste vide';
  static readonly BOT_CONNECTED = '✅ Bot connecté en tant que {}';
  static readonly REMINDERS_LOADED = '✅ {} rappel(s) chargés depuis la sauvegarde';

  // Warning messages
  static readonly NO_CHANNEL_PERMISSIONS = '⚠️ Pas les permissions pour créer le canal #{}';
  static readonly MENTION_LIMIT_EXCEEDED =
    '⚠️ +{} autres personnes non mentionnées (limite Discord)';

  // Event-related messages (new terminology)
  static readonly EVENT_ADDED = '✅ Événement ajouté à la surveillance!';
  static readonly EVENT_REMOVED = '✅ Événement **{}** retiré de la surveillance.';
  static readonly EVENT_PAUSED = '⏸️ Événement **{}** mis en pause.';
  static readonly EVENT_RESUMED = '▶️ Événement **{}** repris.';
  static readonly EVENT_NOT_WATCHED = "❌ Cet événement n'est pas surveillé.";
  static readonly EVENT_NOT_ON_SERVER = "❌ Cet événement n'est pas sur ce serveur.";
  static readonly NO_EVENTS_TO_REMIND = '📭 Aucun événement à rappeler sur ce serveur.';
  static readonly NO_WATCHED_EVENTS = '📭 Aucun événement surveillé sur ce serveur.';
  static readonly EVENTS_LOADED = '✅ {} événement(s) chargés depuis la sauvegarde';

  // Legacy aliases for compatibility with existing code
  // TODO: Remove these aliases after complete migration
  static readonly MATCH_ADDED = this.EVENT_ADDED;
  static readonly MATCH_REMOVED = this.EVENT_REMOVED;
  static readonly MATCH_PAUSED = this.EVENT_PAUSED;
  static readonly MATCH_RESUMED = this.EVENT_RESUMED;
  static readonly MATCH_NOT_WATCHED = this.EVENT_NOT_WATCHED;
  static readonly MATCH_NOT_ON_SERVER = this.EVENT_NOT_ON_SERVER;
  static readonly NO_MATCHES_TO_REMIND = this.NO_EVENTS_TO_REMIND;
  static readonly NO_WATCHED_MATCHES = this.NO_WATCHED_EVENTS;
  static readonly MATCHES_LOADED = this.EVENTS_LOADED;
}

export default Settings;