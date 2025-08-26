/**
 * Event model for Discord Reminder Bot
 * 
 * TypeScript equivalent of the Python Event model with complete business logic,
 * serialization, validation, and timezone handling capabilities.
 */

import { z } from 'zod';

// Validation schemas
const DiscordIdSchema = z.string().regex(/^\d{17,19}$/, 'Discord ID must be 17-19 digits');
const EmojiSchema = z.string().min(1).max(10);
const IntervalSchema = z.number().min(1).max(10080); // 1 minute to 1 week

export interface EventData {
  messageId: string;
  channelId: string;
  guildId: string;
  title: string;
  description?: string;
  intervalMinutes: number;
  isPaused: boolean;
  lastReminder: Date;
  requiredReactions: string[];
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
  public lastReminder: Date;
  public requiredReactions: string[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  // Transient properties (computed at runtime)
  private _usersWhoReacted: Set&lt;string&gt; = new Set();
  private _accessibleUsers: Set&lt;string&gt; = new Set();

  constructor(data: EventData) {
    this.messageId = data.messageId;
    this.channelId = data.channelId;
    this.guildId = data.guildId;
    this.title = data.title;
    this.description = data.description;
    this.intervalMinutes = data.intervalMinutes;
    this.isPaused = data.isPaused;
    this.lastReminder = new Date(data.lastReminder);
    this.requiredReactions = [...data.requiredReactions];
    this.createdAt = new Date(data.createdAt);
    this.updatedAt = new Date(data.updatedAt || Date.now());
  }

  /**
   * Create Event from Python-style dictionary format
   */
  static fromDict(data: Record&lt;string, any&gt;): Event {
    return new Event({
      messageId: String(data.message_id || data.messageId),
      channelId: String(data.channel_id || data.channelId),
      guildId: String(data.guild_id || data.guildId),
      title: String(data.title),
      description: data.description,
      intervalMinutes: Number(data.interval_minutes || data.intervalMinutes || 60),
      isPaused: Boolean(data.is_paused || data.isPaused || false),
      lastReminder: new Date(data.last_reminder || data.lastReminder || Date.now()),
      requiredReactions: Array.isArray(data.required_reactions) 
        ? data.required_reactions 
        : (Array.isArray(data.requiredReactions) ? data.requiredReactions : ['✅', '❌', '❓']),
      createdAt: new Date(data.created_at || data.createdAt || Date.now()),
      updatedAt: new Date(data.updated_at || data.updatedAt || Date.now()),
    });
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record&lt;string, any&gt; {
    return {
      message_id: this.messageId,
      channel_id: this.channelId,
      guild_id: this.guildId,
      title: this.title,
      description: this.description,
      interval_minutes: this.intervalMinutes,
      is_paused: this.isPaused,
      last_reminder: this.lastReminder.toISOString(),
      required_reactions: [...this.requiredReactions],
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      // Computed properties
      is_due_for_reminder: this.isReminderDue(),
      next_reminder_time: this.getNextReminderTime().toISOString(),
      reaction_count: this.getReactionCount(),
      total_users_count: this.getTotalUsersCount(),
      missing_users_count: this.getMissingUsersCount(),
      response_percentage: this.getResponsePercentage(),
    };
  }

  /**
   * Serialize to JSON format compatible with TypeScript conventions
   */
  toJSON(): EventData &amp; Record&lt;string, any&gt; {
    return {
      messageId: this.messageId,
      channelId: this.channelId,
      guildId: this.guildId,
      title: this.title,
      description: this.description,
      intervalMinutes: this.intervalMinutes,
      isPaused: this.isPaused,
      lastReminder: this.lastReminder,
      requiredReactions: [...this.requiredReactions],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Computed properties
      isDueForReminder: this.isReminderDue(),
      nextReminderTime: this.getNextReminderTime(),
      reactionCount: this.getReactionCount(),
      totalUsersCount: this.getTotalUsersCount(),
      missingUsersCount: this.getMissingUsersCount(),
      responsePercentage: this.getResponsePercentage(),
    };
  }

  /**
   * Check if this event is due for a reminder
   * Core business logic - matches Python implementation exactly
   */
  isReminderDue(): boolean {
    if (this.isPaused) {
      return false;
    }

    const timeSinceLast = Date.now() - this.lastReminder.getTime();
    const intervalMs = this.intervalMinutes * 60 * 1000;
    
    return timeSinceLast >= intervalMs;
  }

  /**
   * Calculate when the next reminder should be sent
   */
  getNextReminderTime(): Date {
    const nextTime = new Date(this.lastReminder);
    nextTime.setMilliseconds(nextTime.getMilliseconds() + (this.intervalMinutes * 60 * 1000));
    return nextTime;
  }

  /**
   * Mark that a reminder was sent for this event
   * Updates lastReminder and updatedAt timestamps
   */
  markReminderSent(): void {
    this.lastReminder = new Date();
    this.updatedAt = new Date();
  }

  /**
   * Get the number of users who have reacted to this event
   */
  getReactionCount(): number {
    return this._usersWhoReacted.size;
  }

  /**
   * Get the total number of accessible users (non-bots who can see the channel)
   */
  getTotalUsersCount(): number {
    return this._accessibleUsers.size;
  }

  /**
   * Get the number of users who haven't reacted yet
   */
  getMissingUsersCount(): number {
    return Math.max(0, this.getTotalUsersCount() - this.getReactionCount());
  }

  /**
   * Get the percentage of users who have responded
   */
  getResponsePercentage(): number {
    const total = this.getTotalUsersCount();
    if (total === 0) return 0;
    
    const percentage = (this.getReactionCount() / total) * 100;
    return Math.round(percentage * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Get list of user IDs who haven't reacted to this event
   */
  getMissingUsers(): string[] {
    const missing: string[] = [];
    for (const userId of this._accessibleUsers) {
      if (!this._usersWhoReacted.has(userId)) {
        missing.push(userId);
      }
    }
    return missing;
  }

  /**
   * Update the list of users who can access this event's channel
   * This should be called when checking permissions or when users join/leave
   */
  updateAccessibleUsers(userIds: string[]): void {
    this._accessibleUsers.clear();
    userIds.forEach(id =&gt; this._accessibleUsers.add(id));
    this.updatedAt = new Date();
  }

  /**
   * Add a user's reaction to this event
   */
  addUserReaction(userId: string): boolean {
    if (!this._accessibleUsers.has(userId)) {
      return false; // User can't access this channel
    }
    
    const wasAdded = !this._usersWhoReacted.has(userId);
    this._usersWhoReacted.add(userId);
    
    if (wasAdded) {
      this.updatedAt = new Date();
    }
    
    return wasAdded;
  }

  /**
   * Remove a user's reaction from this event
   */
  removeUserReaction(userId: string): boolean {
    const wasRemoved = this._usersWhoReacted.delete(userId);
    
    if (wasRemoved) {
      this.updatedAt = new Date();
    }
    
    return wasRemoved;
  }

  /**
   * Check if a user has reacted to this event
   */
  hasUserReacted(userId: string): boolean {
    return this._usersWhoReacted.has(userId);
  }

  /**
   * Set the list of users who have reacted (useful when loading from storage)
   */
  setUsersWhoReacted(userIds: string[]): void {
    this._usersWhoReacted.clear();
    userIds.forEach(id =&gt; this._usersWhoReacted.add(id));
    this.updatedAt = new Date();
  }

  /**
   * Get comprehensive status summary for display purposes
   * Compatible with legacy slash command interface
   */
  getStatusSummary(): EventStatus {
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
      missingCount: this.getMissingUsersCount(),
      totalCount: this.getTotalUsersCount(),
      responsePercentage: this.getResponsePercentage(),
      nextReminder,
      timeUntilNext,
      isOverdue: timeUntilNext &lt; 0,
      createdAt: this.createdAt,
    };
  }

  /**
   * Validate event data and return any validation errors
   * Comprehensive validation matching Python implementation
   */
  validate(): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate Discord IDs
    try {
      DiscordIdSchema.parse(this.messageId);
    } catch {
      errors.push({ field: 'messageId', message: 'Message ID must be a valid Discord ID (17-19 digits)' });
    }

    try {
      DiscordIdSchema.parse(this.channelId);
    } catch {
      errors.push({ field: 'channelId', message: 'Channel ID must be a valid Discord ID (17-19 digits)' });
    }

    try {
      DiscordIdSchema.parse(this.guildId);
    } catch {
      errors.push({ field: 'guildId', message: 'Guild ID must be a valid Discord ID (17-19 digits)' });
    }

    // Validate title
    if (!this.title || this.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Event title cannot be empty' });
    }
    if (this.title && this.title.length &gt; 200) {
      errors.push({ field: 'title', message: 'Event title cannot exceed 200 characters' });
    }

    // Validate interval
    try {
      IntervalSchema.parse(this.intervalMinutes);
    } catch {
      errors.push({ 
        field: 'intervalMinutes', 
        message: 'Interval must be between 1 minute and 10080 minutes (1 week)' 
      });
    }

    // Validate required reactions
    if (!Array.isArray(this.requiredReactions) || this.requiredReactions.length === 0) {
      errors.push({ field: 'requiredReactions', message: 'At least one required reaction must be specified' });
    } else {
      this.requiredReactions.forEach((emoji, index) =&gt; {
        try {
          EmojiSchema.parse(emoji);
        } catch {
          errors.push({ 
            field: `requiredReactions[${index}]`, 
            message: `Invalid emoji: '${emoji}' must be 1-10 characters` 
          });
        }
      });
    }

    // Validate dates
    if (isNaN(this.lastReminder.getTime())) {
      errors.push({ field: 'lastReminder', message: 'Last reminder must be a valid date' });
    }
    if (isNaN(this.createdAt.getTime())) {
      errors.push({ field: 'createdAt', message: 'Created at must be a valid date' });
    }
    if (isNaN(this.updatedAt.getTime())) {
      errors.push({ field: 'updatedAt', message: 'Updated at must be a valid date' });
    }

    return errors;
  }

  /**
   * Perform full validation and throw if errors exist
   */
  fullClean(): void {
    const errors = this.validate();
    if (errors.length &gt; 0) {
      const errorMessages = errors.map(e =&gt; `${e.field}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }

  /**
   * Create a copy of this event with updated properties
   */
  clone(overrides: Partial&lt;EventData&gt; = {}): Event {
    const data = { ...this.toJSON(), ...overrides };
    const cloned = new Event(data);
    
    // Copy transient state
    cloned.setUsersWhoReacted([...this._usersWhoReacted]);
    cloned.updateAccessibleUsers([...this._accessibleUsers]);
    
    return cloned;
  }

  /**
   * Check if this event equals another event (by message ID)
   */
  equals(other: Event): boolean {
    return this.messageId === other.messageId;
  }

  /**
   * String representation for debugging
   */
  toString(): string {
    return `Event(${this.messageId}, "${this.title}", Guild:${this.guildId})`;
  }

  // Legacy compatibility methods for Python migration
  
  /**
   * Legacy compatibility - Python naming convention
   */
  is_reminder_due(): boolean {
    return this.isReminderDue();
  }

  /**
   * Legacy compatibility - get response count
   */
  getResponseCount(): number {
    return this.getReactionCount();
  }

  /**
   * Legacy compatibility - get missing count
   */
  getMissingCount(): number {
    return this.getMissingUsersCount();
  }

  /**
   * Legacy compatibility - update accessible users from Discord bot instance
   * This method maintains compatibility with the Python implementation
   */
  async updateAccessibleUsersFromBot(botInstance: any): Promise&lt;void&gt; {
    try {
      // Get the guild and channel
      const guild = botInstance.guilds.cache.get(this.guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(this.channelId);
      if (!channel) return;

      // Collect accessible user IDs
      const accessibleUserIds: string[] = [];
      
      for (const [userId, member] of guild.members.cache) {
        if (!member.user.bot) {
          const permissions = channel.permissionsFor(member);
          if (permissions?.has(['ViewChannel', 'SendMessages'])) {
            accessibleUserIds.push(userId);
          }
        }
      }

      this.updateAccessibleUsers(accessibleUserIds);
    } catch (error) {
      console.warn(`Failed to update accessible users for event ${this.messageId}:`, error);
    }
  }
}

export default Event;