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

import { BaseModel } from './BaseModel';
import { createTimezoneAwareDate } from '@/utils/dateUtils';
import { Settings } from '@/config/settings';

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
  touch(): void {
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
  isValid(): boolean {
    try {
      // Required fields
      if (!this.data.guildId || !this.data.guildName) {
        console.log('Missing guildId or guildName:', this.data.guildId, this.data.guildName);
        return false;
      }

      // Validate intervals - allow 0 for some fields
      if (
        typeof this.data.defaultIntervalMinutes !== 'number' ||
        this.data.defaultIntervalMinutes < 0
      ) {
        console.log('Invalid defaultIntervalMinutes:', this.data.defaultIntervalMinutes);
        return false;
      }
      if (
        typeof this.data.autoDeleteDelayMinutes !== 'number' ||
        this.data.autoDeleteDelayMinutes < 0
      ) {
        console.log('Invalid autoDeleteDelayMinutes:', this.data.autoDeleteDelayMinutes);
        return false;
      }
      if (
        typeof this.data.delayBetweenRemindersMs !== 'number' ||
        this.data.delayBetweenRemindersMs < 0
      ) {
        console.log('Invalid delayBetweenRemindersMs:', this.data.delayBetweenRemindersMs);
        return false;
      }

      // Validate limits
      if (
        typeof this.data.maxMentionsPerReminder !== 'number' ||
        this.data.maxMentionsPerReminder < 0
      ) {
        console.log('Invalid maxMentionsPerReminder:', this.data.maxMentionsPerReminder);
        return false;
      }

      // Validate arrays - ensure they exist and are arrays
      if (!Array.isArray(this.data.adminRoleIds)) {
        console.log('Invalid adminRoleIds:', this.data.adminRoleIds);
        return false;
      }
      if (!Array.isArray(this.data.adminRoleNames)) {
        console.log('Invalid adminRoleNames:', this.data.adminRoleNames);
        return false;
      }
      if (!Array.isArray(this.data.defaultReactions)) {
        console.log('Invalid defaultReactions:', this.data.defaultReactions);
        return false;
      }

      // Validate timezone (basic check)
      if (!this.data.timezone || typeof this.data.timezone !== 'string') {
        console.log('Invalid timezone:', this.data.timezone);
        return false;
      }

      // Validate dates exist
      if (!this.data.createdAt || !this.data.updatedAt || !this.data.lastUsedAt) {
        console.log(
          'Missing dates:',
          this.data.createdAt,
          this.data.updatedAt,
          this.data.lastUsedAt,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.log('Validation error:', error);
      return false;
    }
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
}
