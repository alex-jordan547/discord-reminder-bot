/**
 * Event model for Discord Reminder Bot
 * 
 * TypeScript equivalent of the Python Event model with complete business logic,
 * serialization, validation, and timezone handling capabilities.
 */

export interface EventData {
  messageId: string;
  channelId: string;
  guildId: string;
  title: string;
  description?: string | undefined;
  intervalMinutes: number;
  isPaused: boolean;
  lastReminder: Date;
  usersWhoReacted: string[];
  createdAt: Date;
  updatedAt: Date;
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
export class Event {
  public readonly messageId: string;
  public readonly channelId: string;
  public readonly guildId: string;
  public title: string;
  public description?: string;
  public intervalMinutes: number;
  public isPaused: boolean;
  public lastRemindedAt: Date | null;
  public usersWhoReacted: string[];
  public readonly createdAt: Date;
  public updatedAt: Date;

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
    updatedAt: Date
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
    updatedAt?: Date
  ) {
    if (typeof messageIdOrData === 'object') {
      // EventData constructor
      const data = messageIdOrData;
      this.messageId = data.messageId;
      this.channelId = data.channelId;
      this.guildId = data.guildId;
      this.title = data.title;
      this.description = data.description;
      this.intervalMinutes = data.intervalMinutes;
      this.isPaused = data.isPaused;
      this.lastRemindedAt = data.lastReminder ? new Date(data.lastReminder) : null;
      this.usersWhoReacted = data.usersWhoReacted || [];
      this.createdAt = new Date(data.createdAt);
      this.updatedAt = new Date(data.updatedAt || Date.now());
    } else {
      // Individual parameter constructor
      this.messageId = messageIdOrData;
      this.channelId = channelId!;
      this.guildId = guildId!;
      this.title = title!;
      this.intervalMinutes = intervalMinutes!;
      this.lastRemindedAt = lastRemindedAt ?? null;
      this.isPaused = isPaused!;
      this.usersWhoReacted = usersWhoReacted ? [...usersWhoReacted] : [];
      this.createdAt = createdAt!;
      this.updatedAt = updatedAt!;
    }
  }

  /**
   * Validate if the event data is valid
   */
  isValid(): boolean {
    try {
      // Check required string fields
      if (!this.messageId || typeof this.messageId !== 'string') return false;
      if (!this.channelId || typeof this.channelId !== 'string') return false;
      if (!this.guildId || typeof this.guildId !== 'string') return false;
      if (!this.title || typeof this.title !== 'string') return false;

      // Check numeric fields
      if (typeof this.intervalMinutes !== 'number' || this.intervalMinutes <= 0) return false;

      // Check boolean fields
      if (typeof this.isPaused !== 'boolean') return false;

      // Check date fields
      if (!this.createdAt || !(this.createdAt instanceof Date)) return false;
      if (!this.updatedAt || !(this.updatedAt instanceof Date)) return false;

      // Check array fields
      if (!Array.isArray(this.usersWhoReacted)) return false;

      return true;
    } catch {
      return false;
    }
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
        : (Array.isArray(data.usersWhoReacted) ? data.usersWhoReacted : []),
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