/**
 * Guild model for Discord Reminder Bot
 *
 * Represents a Discord guild (server) with settings and metadata
 */

import {
  BaseModel,
  type BaseModelData,
  type ModelValidationError,
  validateDiscordId,
  validateNonEmptyString,
  validateJsonString,
} from './BaseModel.js';

export interface GuildData extends BaseModelData {
  guildId: string;
  name: string;
  settings: Record<string, any>;
}

/**
 * Model representing a Discord guild (server)
 * Stores guild-specific settings and metadata
 */
export class Guild extends BaseModel {
  public readonly guildId: string;
  public name: string;
  public settings: Record<string, any>;

  constructor(data: GuildData) {
    super(data);
    this.guildId = data.guildId;
    this.name = data.name;
    this.settings = data.settings || {};
  }

  /**
   * Create Guild from Python-style dictionary format
   */
  static fromDict(data: Record<string, any>): Guild {
    let settings = {};

    // Handle settings that might be JSON string or object
    if (typeof data.settings === 'string') {
      try {
        settings = JSON.parse(data.settings);
      } catch {
        settings = {};
      }
    } else if (typeof data.settings === 'object' && data.settings !== null) {
      settings = data.settings;
    }

    return new Guild({
      guildId: String(data.guild_id || data.guildId),
      name: String(data.name),
      settings,
      createdAt: new Date(data.created_at || data.createdAt || Date.now()),
      updatedAt: new Date(data.updated_at || data.updatedAt || Date.now()),
    });
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record<string, any> {
    return {
      guild_id: this.guildId,
      name: this.name,
      settings: JSON.stringify(this.settings),
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  /**
   * Serialize to JSON format (TypeScript conventions)
   */
  toJSON(): GuildData & Record<string, any> {
    return {
      guildId: this.guildId,
      name: this.name,
      settings: { ...this.settings },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get a setting value with optional default
   */
  getSetting<T = any>(key: string, defaultValue?: T): T {
    return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
  }

  /**
   * Set a setting value
   */
  setSetting(key: string, value: any): void {
    this.settings[key] = value;
    this.touch();
  }

  /**
   * Remove a setting
   */
  removeSetting(key: string): boolean {
    if (key in this.settings) {
      delete this.settings[key];
      this.touch();
      return true;
    }
    return false;
  }

  /**
   * Update multiple settings at once
   */
  updateSettings(newSettings: Record<string, any>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.touch();
  }

  /**
   * Clear all settings
   */
  clearSettings(): void {
    this.settings = {};
    this.touch();
  }

  /**
   * Validate the guild data and return any validation errors
   */
  validate(): ModelValidationError[] {
    const errors: ModelValidationError[] = [];

    // Validate guild ID
    errors.push(...validateDiscordId(this.guildId, 'guildId'));

    // Validate name
    errors.push(...validateNonEmptyString(this.name, 'name', 100));

    // Validate settings can be serialized to JSON
    try {
      JSON.stringify(this.settings);
    } catch {
      errors.push({
        field: 'settings',
        message: 'Settings must be serializable to JSON',
      });
    }

    return errors;
  }

  /**
   * String representation for debugging
   */
  toString(): string {
    return `Guild(${this.guildId}, "${this.name}")`;
  }
}
