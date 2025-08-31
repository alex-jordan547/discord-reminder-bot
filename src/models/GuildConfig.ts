/**
 * Discord Reminder Bot - Guild Configuration Model
 *
 * Manages per-server configuration settings including:
 * - Reminder channels and behavior
 * - Admin roles and permissions
 * - Default intervals and timings
 * - Auto-deletion settings
 * - Mention limits and reactions
 */

import { BaseModel, type ModelValidationError } from './BaseModel';
import { createTimezoneAwareDate } from '@/utils/dateUtils';
import { Settings } from '@/config/settings';
import { SqliteStorage } from '@/persistence/sqliteStorage';
import { createLogger } from '@/utils/loggingConfig';

const logger = createLogger('guild-config');

/**
 * Guild-specific configuration settings
 */
export interface GuildConfigData {
  guildId: string;
  guildName: string;

  // Channel configuration
  reminderChannelId: string | null; // null = same channel, string = specific channel
  reminderChannelName: string; // Channel name for display

  // Admin configuration
  adminRoleIds: string[]; // Role IDs that can manage bot
  adminRoleNames: string[]; // Role names for display

  // Reminder timing configuration
  defaultIntervalMinutes: number; // Default reminder interval
  autoDeleteEnabled: boolean; // Enable auto-deletion of reminders
  autoDeleteDelayMinutes: number; // How long before deleting reminders
  delayBetweenRemindersMs: number; // Rate limiting between reminders

  // Mention and reaction configuration
  maxMentionsPerReminder: number; // Max individual mentions before using @everyone
  useEveryoneAboveLimit: boolean; // Use @everyone when over limit
  defaultReactions: string[]; // Default emoji reactions

  // Timezone configuration
  timezone: string; // Guild timezone (e.g., "Europe/Paris")

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date; // Track when config was last accessed
}

/**
 * Default configuration values
 */
export const DEFAULT_GUILD_CONFIG: Omit<
  GuildConfigData,
  'guildId' | 'guildName' | 'createdAt' | 'updatedAt' | 'lastUsedAt'
> = {
  // Channel defaults
  reminderChannelId: null, // Same channel by default
  reminderChannelName: 'Canal original',

  // Admin defaults (from global settings)
  adminRoleIds: [],
  adminRoleNames: Settings.ADMIN_ROLES,

  // Timing defaults
  defaultIntervalMinutes: Settings.getReminderIntervalMinutes(),
  autoDeleteEnabled: Settings.AUTO_DELETE_REMINDERS,
  autoDeleteDelayMinutes: Settings.AUTO_DELETE_DELAY_HOURS * 60, // Convert hours to minutes
  delayBetweenRemindersMs: Settings.DELAY_BETWEEN_REMINDERS,

  // Mention defaults
  maxMentionsPerReminder: Settings.MAX_MENTIONS_PER_REMINDER,
  useEveryoneAboveLimit: true,
  defaultReactions: [...Settings.DEFAULT_REACTIONS],

  // Timezone default
  timezone: Settings.TIMEZONE,
};

/**
 * Guild Configuration Model
 */
export class GuildConfig extends BaseModel<GuildConfigData> {
  constructor(data: Partial<GuildConfigData> & { guildId: string; guildName: string }) {
    const now = createTimezoneAwareDate();

    const fullData: GuildConfigData = {
      ...DEFAULT_GUILD_CONFIG,
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      lastUsedAt: data.lastUsedAt || now,
    };

    super(fullData);
  }

  // Getters for easy access
  get guildId(): string {
    return this.data.guildId;
  }
  get guildName(): string {
    return this.data.guildName;
  }
  get reminderChannelId(): string | null {
    return this.data.reminderChannelId;
  }
  get adminRoleIds(): string[] {
    return this.data.adminRoleIds;
  }
  get adminRoleNames(): string[] {
    return this.data.adminRoleNames;
  }
  get defaultIntervalMinutes(): number {
    return this.data.defaultIntervalMinutes;
  }
  get autoDeleteEnabled(): boolean {
    return this.data.autoDeleteEnabled;
  }
  get autoDeleteDelayMinutes(): number {
    return this.data.autoDeleteDelayMinutes;
  }
  get maxMentionsPerReminder(): number {
    return this.data.maxMentionsPerReminder;
  }
  get useEveryoneAboveLimit(): boolean {
    return this.data.useEveryoneAboveLimit;
  }
  get defaultReactions(): string[] {
    return this.data.defaultReactions;
  }
  get timezone(): string {
    return this.data.timezone;
  }
  get delayBetweenRemindersMs(): number {
    return this.data.delayBetweenRemindersMs;
  }

  /**
   * Update configuration with new values
   */
  updateConfig(updates: Partial<GuildConfigData>): void {
    Object.assign(this.data, updates);
    this.data.updatedAt = createTimezoneAwareDate();
    this.touch(); // Mark as accessed
  }

  /**
   * Mark configuration as recently used
   */
  override touch(): void {
    this.data.lastUsedAt = createTimezoneAwareDate();
  }

  /**
   * Check if this guild uses a separate reminder channel
   */
  usesSeparateChannel(): boolean {
    return this.data.reminderChannelId !== null;
  }

  /**
   * Get auto-delete delay in hours for compatibility
   */
  getAutoDeleteDelayHours(): number {
    return this.data.autoDeleteDelayMinutes / 60;
  }

  /**
   * Set auto-delete delay from hours
   */
  setAutoDeleteDelayHours(hours: number): void {
    this.data.autoDeleteDelayMinutes = hours * 60;
    this.data.updatedAt = createTimezoneAwareDate();
  }

  /**
   * Validate configuration values
   */
  validate(): ModelValidationError[] {
    const errors: ModelValidationError[] = [];

    try {
      // Required fields
      if (!this.data.guildId || !this.data.guildName) {
        if (!this.data.guildId) {
          errors.push({ field: 'guildId', message: 'Guild ID is required' });
        }
        if (!this.data.guildName) {
          errors.push({ field: 'guildName', message: 'Guild name is required' });
        }
      }

      // Validate intervals - allow 0 for some fields
      if (
        typeof this.data.defaultIntervalMinutes !== 'number' ||
        this.data.defaultIntervalMinutes < 0
      ) {
        errors.push({
          field: 'defaultIntervalMinutes',
          message: 'Default interval must be a non-negative number',
        });
      }
      if (
        typeof this.data.autoDeleteDelayMinutes !== 'number' ||
        this.data.autoDeleteDelayMinutes < 0
      ) {
        errors.push({
          field: 'autoDeleteDelayMinutes',
          message: 'Auto delete delay must be a non-negative number',
        });
      }
      if (
        typeof this.data.delayBetweenRemindersMs !== 'number' ||
        this.data.delayBetweenRemindersMs < 0
      ) {
        errors.push({
          field: 'delayBetweenRemindersMs',
          message: 'Delay between reminders must be a non-negative number',
        });
      }

      // Validate limits
      if (
        typeof this.data.maxMentionsPerReminder !== 'number' ||
        this.data.maxMentionsPerReminder < 0
      ) {
        errors.push({
          field: 'maxMentionsPerReminder',
          message: 'Max mentions per reminder must be a non-negative number',
        });
      }

      // Validate arrays - ensure they exist and are arrays
      if (!Array.isArray(this.data.adminRoleIds)) {
        errors.push({ field: 'adminRoleIds', message: 'Admin role IDs must be an array' });
      }
      if (!Array.isArray(this.data.adminRoleNames)) {
        errors.push({ field: 'adminRoleNames', message: 'Admin role names must be an array' });
      }
      if (!Array.isArray(this.data.defaultReactions)) {
        errors.push({ field: 'defaultReactions', message: 'Default reactions must be an array' });
      }

      // Validate timezone (basic check)
      if (!this.data.timezone || typeof this.data.timezone !== 'string') {
        errors.push({ field: 'timezone', message: 'Timezone must be a non-empty string' });
      }

      // Validate dates exist
      if (!this.data.createdAt) {
        errors.push({ field: 'createdAt', message: 'Created at date is required' });
      }
      if (!this.data.updatedAt) {
        errors.push({ field: 'updatedAt', message: 'Updated at date is required' });
      }
      if (!this.data.lastUsedAt) {
        errors.push({ field: 'lastUsedAt', message: 'Last used at date is required' });
      }
    } catch (error) {
      errors.push({ field: 'general', message: `Validation error: ${error}` });
    }

    return errors;
  }

  /**
   * Check if configuration is valid (legacy method for backward compatibility)
   */
  isValid(): boolean {
    return this.validate().length === 0;
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record<string, any> {
    return {
      guild_id: this.data.guildId,
      guild_name: this.data.guildName,
      reminder_channel_id: this.data.reminderChannelId,
      reminder_channel_name: this.data.reminderChannelName,
      admin_role_ids: [...this.data.adminRoleIds],
      admin_role_names: [...this.data.adminRoleNames],
      default_interval_minutes: this.data.defaultIntervalMinutes,
      auto_delete_enabled: this.data.autoDeleteEnabled,
      auto_delete_delay_minutes: this.data.autoDeleteDelayMinutes,
      delay_between_reminders_ms: this.data.delayBetweenRemindersMs,
      max_mentions_per_reminder: this.data.maxMentionsPerReminder,
      use_everyone_above_limit: this.data.useEveryoneAboveLimit,
      default_reactions: [...this.data.defaultReactions],
      timezone: this.data.timezone,
      created_at: this.data.createdAt.toISOString(),
      updated_at: this.data.updatedAt.toISOString(),
      last_used_at: this.data.lastUsedAt.toISOString(),
    };
  }

  /**
   * Get formatted display values for UI
   */
  getDisplayValues(): {
    reminderChannel: string;
    adminRoles: string;
    defaultInterval: string;
    autoDelete: string;
    mentionLimit: string;
    reactions: string;
    timezone: string;
  } {
    return {
      reminderChannel: this.usesSeparateChannel()
        ? `#${this.data.reminderChannelName}`
        : 'Canal original du message',

      adminRoles:
        this.data.adminRoleNames.length > 0
          ? this.data.adminRoleNames.join(', ')
          : 'Aucun rôle configuré',

      defaultInterval: Settings.formatIntervalDisplay(this.data.defaultIntervalMinutes),

      autoDelete: this.data.autoDeleteEnabled
        ? `Oui (${Settings.formatAutoDeleteDisplay(this.getAutoDeleteDelayHours())})`
        : 'Non',

      mentionLimit: this.data.useEveryoneAboveLimit
        ? `${this.data.maxMentionsPerReminder} (puis @everyone)`
        : `${this.data.maxMentionsPerReminder} (max)`,

      reactions: this.data.defaultReactions.join(' '),

      timezone: this.data.timezone,
    };
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): GuildConfigData {
    return { ...this.data };
  }

  /**
   * Create from JSON data
   */
  static fromJSON(json: any): GuildConfig {
    // Parse dates if they're strings
    const data = {
      ...json,
      createdAt: typeof json.createdAt === 'string' ? new Date(json.createdAt) : json.createdAt,
      updatedAt: typeof json.updatedAt === 'string' ? new Date(json.updatedAt) : json.updatedAt,
      lastUsedAt: typeof json.lastUsedAt === 'string' ? new Date(json.lastUsedAt) : json.lastUsedAt,
    };

    return new GuildConfig(data);
  }

  /**
   * Create default configuration for a guild
   */
  static createDefault(guildId: string, guildName: string): GuildConfig {
    return new GuildConfig({ guildId, guildName });
  }

  /**
   * Create from storage data - alias for fromJSON for legacy compatibility
   */
  static fromStorageData(data: any): GuildConfig {
    return GuildConfig.fromJSON(data);
  }

  /**
   * Récupère la configuration d'une guilde à partir de son guildId
   */
  static async findByGuildId(guildId: string): Promise<GuildConfig | null> {
    const storage = new SqliteStorage();
    await storage.initialize();

    const row = await storage.getGuildConfig(guildId);
    if (!row) {
      return null;
    }

    return GuildConfig.fromStorageData(row);
  }
}
