/**
 * Event model for Discord Reminder Bot
 *
 * TypeScript equivalent of the Python Event model with complete business logic,
 * serialization, validation, and timezone handling capabilities.
 */

import { 
  BaseModel, 
  type BaseModelData, 
  type ModelValidationError, 
  validateDiscordId, 
  validateNonEmptyString,
  validateInterval
} from './BaseModel';

export interface EventData extends BaseModelData {
  messageId: string;
  channelId: string;
  guildId: string;
  title: string;
  description?: string | undefined;
  intervalMinutes: number;
  isPaused: boolean;
  lastReminder: Date;
  usersWhoReacted: string[];
}

export interface EventStatus {
  title: string;
  messageId: string;
  channelId: string;
  guildId: string;
  intervalMinutes: number;
  isPaused: boolean;
  responseCount: number;
  missingCount: number;
  totalCount: number;
  responsePercentage: number;
  nextReminder: Date;
  timeUntilNext: number; // milliseconds
  isOverdue: boolean;
  createdAt: Date;
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Main Event class representing a Discord event being monitored for reminders
 */
export class Event extends BaseModel<EventData> {
  public readonly messageId: string;
  public readonly channelId: string;
  public readonly guildId: string;
  public title: string;
  public description?: string;
  public intervalMinutes: number;
  public isPaused: boolean;
  public lastRemindedAt: Date | null;
  public usersWhoReacted: string[];

  // Legacy compatibility
  public get lastReminder(): Date {
    return this.lastRemindedAt || this.createdAt;
  }
  public set lastReminder(value: Date) {
    this.lastRemindedAt = value;
  }

  // Overloaded constructors for compatibility
  constructor(data: EventData);
  constructor(
    messageId: string,
    channelId: string,
    guildId: string,
    title: string,
    intervalMinutes: number,
    lastRemindedAt: Date | null,
    isPaused: boolean,
    usersWhoReacted: string[],
    createdAt: Date,
    updatedAt: Date,
  );
  constructor(
    messageIdOrData: string | EventData,
    channelId?: string,
    guildId?: string,
    title?: string,
    intervalMinutes?: number,
    lastRemindedAt?: Date | null,
    isPaused?: boolean,
    usersWhoReacted?: string[],
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (typeof messageIdOrData === 'object') {
      // EventData constructor
      const data = messageIdOrData;
      super(data);
      this.messageId = data.messageId;
      this.channelId = data.channelId;
      this.guildId = data.guildId;
      this.title = data.title;
      this.description = data.description;
      this.intervalMinutes = data.intervalMinutes;
      this.isPaused = data.isPaused;
      this.lastRemindedAt = data.lastReminder ? new Date(data.lastReminder) : null;
      this.usersWhoReacted = data.usersWhoReacted || [];
    } else {
      // Individual parameter constructor
      const eventData: EventData = {
        messageId: messageIdOrData,
        channelId: channelId!,
        guildId: guildId!,
        title: title!,
        description: undefined,
        intervalMinutes: intervalMinutes!,
        isPaused: isPaused!,
        lastReminder: lastRemindedAt || new Date(),
        usersWhoReacted: usersWhoReacted ? [...usersWhoReacted] : [],
        createdAt: createdAt!,
        updatedAt: updatedAt!,
      };
      super(eventData);
      this.messageId = messageIdOrData;
      this.channelId = channelId!;
      this.guildId = guildId!;
      this.title = title!;
      this.intervalMinutes = intervalMinutes!;
      this.lastRemindedAt = lastRemindedAt ?? null;
      this.isPaused = isPaused!;
      this.usersWhoReacted = usersWhoReacted ? [...usersWhoReacted] : [];
    }
  }

  /**
   * Comprehensive validation of event data
   */
  validate(): ModelValidationError[] {
    const errors: ModelValidationError[] = [];

    // Validate Discord IDs (messageId, channelId, guildId)
    errors.push(...validateDiscordId(this.messageId, 'messageId'));
    errors.push(...validateDiscordId(this.channelId, 'channelId'));
    errors.push(...validateDiscordId(this.guildId, 'guildId'));

    // Validate title
    errors.push(...validateNonEmptyString(this.title, 'title', 100));

    // Validate description (optional but if present, check length)
    if (this.description !== undefined) {
      if (typeof this.description !== 'string') {
        errors.push({ field: 'description', message: 'Description must be a string' });
      } else if (this.description.length > 1000) {
        errors.push({ field: 'description', message: 'Description must be 1000 characters or less' });
      }
    }

    // Validate intervalMinutes
    errors.push(...validateInterval(this.intervalMinutes, 'intervalMinutes'));

    // Validate isPaused
    if (typeof this.isPaused !== 'boolean') {
      errors.push({ field: 'isPaused', message: 'isPaused must be a boolean' });
    }

    // Validate lastRemindedAt (optional but if present, must be valid date)
    if (this.lastRemindedAt !== null && !(this.lastRemindedAt instanceof Date)) {
      errors.push({ field: 'lastRemindedAt', message: 'lastRemindedAt must be a Date or null' });
    }

    // Validate usersWhoReacted
    if (!Array.isArray(this.usersWhoReacted)) {
      errors.push({ field: 'usersWhoReacted', message: 'usersWhoReacted must be an array' });
    } else {
      // Validate each user ID in the array
      this.usersWhoReacted.forEach((userId, index) => {
        if (typeof userId !== 'string') {
          errors.push({ 
            field: `usersWhoReacted[${index}]`, 
            message: 'User ID must be a string' 
          });
        } else {
          const userIdErrors = validateDiscordId(userId, `usersWhoReacted[${index}]`);
          errors.push(...userIdErrors);
        }
      });

      // Check for duplicates
      const uniqueUsers = new Set(this.usersWhoReacted);
      if (uniqueUsers.size !== this.usersWhoReacted.length) {
        errors.push({ field: 'usersWhoReacted', message: 'Duplicate user IDs are not allowed' });
      }
    }

    // Validate dates exist and are valid
    if (!this.createdAt || !(this.createdAt instanceof Date) || isNaN(this.createdAt.getTime())) {
      errors.push({ field: 'createdAt', message: 'createdAt must be a valid Date' });
    }
    if (!this.updatedAt || !(this.updatedAt instanceof Date) || isNaN(this.updatedAt.getTime())) {
      errors.push({ field: 'updatedAt', message: 'updatedAt must be a valid Date' });
    }

    // Business logic validation
    if (this.createdAt && this.updatedAt && this.createdAt > this.updatedAt) {
      errors.push({ field: 'updatedAt', message: 'updatedAt cannot be before createdAt' });
    }

    if (this.lastRemindedAt && this.createdAt && this.lastRemindedAt < this.createdAt) {
      errors.push({ 
        field: 'lastRemindedAt', 
        message: 'lastRemindedAt cannot be before createdAt' 
      });
    }

    return errors;
  }

  /**
   * Legacy validation method for backward compatibility
   * @deprecated Use validate() method instead for detailed error information
   */
  isValid(): boolean {
    return this.validate().length === 0;
  }

  /**
   * Create Event from Python-style dictionary format
   */
  static fromDict(data: Record<string, any>): Event {
    return new Event({
      messageId: String(data.message_id || data.messageId),
      channelId: String(data.channel_id || data.channelId),
      guildId: String(data.guild_id || data.guildId),
      title: String(data.title),
      description: data.description,
      intervalMinutes: Number(data.interval_minutes || data.intervalMinutes || 60),
      isPaused: Boolean(data.is_paused || data.isPaused || false),
      lastReminder: new Date(data.last_reminder || data.lastReminder || Date.now()),
      usersWhoReacted: Array.isArray(data.users_who_reacted)
        ? data.users_who_reacted
        : Array.isArray(data.usersWhoReacted)
          ? data.usersWhoReacted
          : [],
      createdAt: new Date(data.created_at || data.createdAt || Date.now()),
      updatedAt: new Date(data.updated_at || data.updatedAt || Date.now()),
    });
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record<string, any> {
    return {
      message_id: this.messageId,
      channel_id: this.channelId,
      guild_id: this.guildId,
      title: this.title,
      description: this.description,
      interval_minutes: this.intervalMinutes,
      is_paused: this.isPaused,
      last_reminder: this.lastReminder.toISOString(),
      users_who_reacted: [...this.usersWhoReacted],
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      // Computed properties
      reaction_count: this.usersWhoReacted.length,
      response_percentage: this.getResponsePercentage(),
    };
  }

  /**
   * Serialize to JSON format compatible with TypeScript conventions
   */
  toJSON(): EventData {
    return {
      messageId: this.messageId,
      channelId: this.channelId,
      guildId: this.guildId,
      title: this.title,
      description: this.description,
      intervalMinutes: this.intervalMinutes,
      isPaused: this.isPaused,
      lastReminder: this.lastReminder,
      usersWhoReacted: [...this.usersWhoReacted],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Check if reminder is due
   */
  isReminderDue(): boolean {
    const now = Date.now();
    const lastActivity = this.lastRemindedAt || this.createdAt;
    const timeSinceLast = now - lastActivity.getTime();
    const intervalMs = this.intervalMinutes * 60 * 1000;

    return timeSinceLast >= intervalMs;
  }

  /**
   * Get next reminder time
   */
  getNextReminderTime(): Date {
    const lastActivity = this.lastRemindedAt || this.createdAt;
    return new Date(lastActivity.getTime() + this.intervalMinutes * 60 * 1000);
  }

  /**
   * Get reaction count
   */
  getReactionCount(): number {
    return this.usersWhoReacted.length;
  }

  /**
   * Get response percentage (simplified)
   */
  getResponsePercentage(): number {
    // Simplified calculation - would need guild member count for accurate percentage
    return this.usersWhoReacted.length > 0 ? 100 : 0;
  }

  /**
   * Get event status
   */
  getStatus(): EventStatus {
    const nextReminder = this.getNextReminderTime();
    const timeUntilNext = nextReminder.getTime() - Date.now();

    return {
      title: this.title,
      messageId: this.messageId,
      channelId: this.channelId,
      guildId: this.guildId,
      intervalMinutes: this.intervalMinutes,
      isPaused: this.isPaused,
      responseCount: this.getReactionCount(),
      missingCount: 0, // Would need guild member count
      totalCount: this.getReactionCount(), // Simplified
      responsePercentage: this.getResponsePercentage(),
      nextReminder,
      timeUntilNext,
      isOverdue: timeUntilNext < 0,
      createdAt: this.createdAt,
    };
  }

  /**
   * Create a copy of this event with updated properties
   */
  clone(overrides: Partial<EventData> = {}): Event {
    const data = { ...this.toJSON(), ...overrides };
    return new Event(data);
  }
}
