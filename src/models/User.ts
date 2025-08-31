/**
 * User model for Discord Reminder Bot
 *
 * Represents a Discord user within a guild context
 */

import {
  BaseModel,
  type BaseModelData,
  type ModelValidationError,
  validateDiscordId,
  validateNonEmptyString,
} from './BaseModel.js';

export interface UserData extends BaseModelData {
  userId: string;
  guildId: string;
  username: string;
  isBot: boolean;
  lastSeen: Date;
}

/**
 * Model representing a Discord user within a guild context
 * Tracks user information and activity per guild
 */
export class User extends BaseModel {
  public readonly userId: string;
  public readonly guildId: string;
  public username: string;
  public isBot: boolean;
  public lastSeen: Date;

  constructor(data: UserData) {
    super(data);
    this.userId = data.userId;
    this.guildId = data.guildId;
    this.username = data.username;
    this.isBot = data.isBot;
    this.lastSeen = new Date(data.lastSeen);
  }

  /**
   * Create User from Python-style dictionary format
   */
  static fromDict(data: Record<string, any>): User {
    return new User({
      userId: String(data.user_id || data.userId),
      guildId: String(data.guild_id || data.guildId || data.guild?.guild_id || data.guild?.guildId),
      username: String(data.username),
      isBot: Boolean(data.is_bot || data.isBot || false),
      lastSeen: new Date(data.last_seen || data.lastSeen || Date.now()),
      createdAt: new Date(data.created_at || data.createdAt || Date.now()),
      updatedAt: new Date(data.updated_at || data.updatedAt || Date.now()),
    });
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record<string, any> {
    return {
      user_id: this.userId,
      guild_id: this.guildId,
      username: this.username,
      is_bot: this.isBot,
      last_seen: this.lastSeen.toISOString(),
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  /**
   * Serialize to JSON format (TypeScript conventions)
   */
  toJSON(): UserData & Record<string, any> {
    return {
      userId: this.userId,
      guildId: this.guildId,
      username: this.username,
      isBot: this.isBot,
      lastSeen: this.lastSeen,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Update the user's last seen timestamp
   */
  updateLastSeen(): void {
    this.lastSeen = new Date();
    this.touch();
  }

  /**
   * Update the username
   */
  updateUsername(newUsername: string): void {
    if (this.username !== newUsername) {
      this.username = newUsername;
      this.touch();
    }
  }

  /**
   * Check if this user has been seen recently (within specified hours)
   */
  isRecentlyActive(hoursThreshold: number = 24): boolean {
    const hoursAgo = Date.now() - hoursThreshold * 60 * 60 * 1000;
    return this.lastSeen.getTime() > hoursAgo;
  }

  /**
   * Validate the user data and return any validation errors
   */
  validate(): ModelValidationError[] {
    const errors: ModelValidationError[] = [];

    // Validate user ID
    errors.push(...validateDiscordId(this.userId, 'userId'));

    // Validate guild ID
    errors.push(...validateDiscordId(this.guildId, 'guildId'));

    // Validate username
    errors.push(...validateNonEmptyString(this.username, 'username', 100));

    // Validate last seen date
    if (isNaN(this.lastSeen.getTime())) {
      errors.push({
        field: 'lastSeen',
        message: 'Last seen must be a valid date',
      });
    }

    return errors;
  }

  /**
   * Create a unique key for this user within the guild context
   */
  getUniqueKey(): string {
    return `${this.guildId}:${this.userId}`;
  }

  /**
   * Check if this user equals another user (by user ID and guild)
   */
  equals(other: User): boolean {
    return this.userId === other.userId && this.guildId === other.guildId;
  }

  /**
   * String representation for debugging
   */
  override toString(): string {
    return `User(${this.userId}, "${this.username}", Guild:${this.guildId})`;
  }
}
