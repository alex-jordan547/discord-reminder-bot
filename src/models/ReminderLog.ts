/**
 * ReminderLog model for Discord Reminder Bot
 *
 * Represents a log entry for sent reminders
 */

import {
  BaseModel,
  type BaseModelData,
  type ModelValidationError,
  validateDiscordId,
} from './BaseModel.js';

export type ReminderStatus = 'pending' | 'sent' | 'failed';

export interface ReminderLogData extends BaseModelData {
  eventMessageId: string;
  scheduledAt: Date;
  sentAt?: Date;
  usersNotified: number;
  status: ReminderStatus;
  errorMessage?: string;
}

/**
 * Model representing a log entry for sent reminders
 * Tracks the history of reminders sent for events
 */
export class ReminderLog extends BaseModel {
  public readonly eventMessageId: string;
  public readonly scheduledAt: Date;
  public sentAt?: Date;
  public usersNotified: number;
  public status: ReminderStatus;
  public errorMessage?: string;

  constructor(data: ReminderLogData) {
    super(data);
    this.eventMessageId = data.eventMessageId;
    this.scheduledAt = new Date(data.scheduledAt);
    if (data.sentAt) {
      this.sentAt = new Date(data.sentAt);
    }
    this.usersNotified = data.usersNotified;
    this.status = data.status;
    if (data.errorMessage !== undefined) {
      this.errorMessage = data.errorMessage;
    }
  }

  /**
   * Create ReminderLog from Python-style dictionary format
   */
  static fromDict(data: Record<string, any>): ReminderLog {
    const eventData: ReminderLogData = {
      eventMessageId: String(
        data.event_message_id ||
          data.eventMessageId ||
          data.event?.message_id ||
          data.event?.messageId,
      ),
      scheduledAt: new Date(data.scheduled_at || data.scheduledAt),
      usersNotified: Number(data.users_notified || data.usersNotified || 0),
      status: (data.status as ReminderStatus) || 'pending',
      createdAt: new Date(data.created_at || data.createdAt || Date.now()),
      updatedAt: new Date(data.updated_at || data.updatedAt || Date.now()),
    };
    if (data.sent_at || data.sentAt) {
      eventData.sentAt = new Date(data.sent_at || data.sentAt);
    }
    if (data.error_message || data.errorMessage) {
      eventData.errorMessage = data.error_message || data.errorMessage;
    }
    return new ReminderLog(eventData);
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record<string, any> {
    return {
      event_message_id: this.eventMessageId,
      scheduled_at: this.scheduledAt.toISOString(),
      sent_at: this.sentAt?.toISOString() || null,
      users_notified: this.usersNotified,
      status: this.status,
      error_message: this.errorMessage || null,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  /**
   * Serialize to JSON format (TypeScript conventions)
   */
  toJSON(): ReminderLogData & Record<string, any> {
    const result: ReminderLogData & Record<string, any> = {
      eventMessageId: this.eventMessageId,
      scheduledAt: this.scheduledAt,
      usersNotified: this.usersNotified,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
    if (this.sentAt) {
      result.sentAt = this.sentAt;
    }
    if (this.errorMessage !== undefined) {
      result.errorMessage = this.errorMessage;
    }
    return result;
  }

  /**
   * Mark this reminder log as successfully sent
   */
  markAsSent(usersNotified: number = 0): void {
    this.status = 'sent';
    this.sentAt = new Date();
    this.usersNotified = usersNotified;
    delete this.errorMessage;
    this.touch();
  }

  /**
   * Mark this reminder log as failed
   */
  markAsFailed(errorMessage: string): void {
    this.status = 'failed';
    this.errorMessage = errorMessage;
    this.touch();
  }

  /**
   * Reset to pending status (for retry scenarios)
   */
  resetToPending(): void {
    this.status = 'pending';
    delete this.sentAt;
    delete this.errorMessage;
    this.touch();
  }

  /**
   * Check if this reminder is overdue (past scheduled time but not sent)
   */
  isOverdue(): boolean {
    return this.status === 'pending' && Date.now() > this.scheduledAt.getTime();
  }

  /**
   * Get the delay in minutes between scheduled and sent time
   */
  getDelay(): number | null {
    if (!this.sentAt) return null;
    return Math.round((this.sentAt.getTime() - this.scheduledAt.getTime()) / (1000 * 60));
  }

  /**
   * Check if this reminder was sent successfully
   */
  wasSuccessful(): boolean {
    return this.status === 'sent';
  }

  /**
   * Check if this reminder failed
   */
  hasFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Check if this reminder is still pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Validate the reminder log data and return any validation errors
   */
  validate(): ModelValidationError[] {
    const errors: ModelValidationError[] = [];

    // Validate event message ID
    errors.push(...validateDiscordId(this.eventMessageId, 'eventMessageId'));

    // Validate status
    const validStatuses: ReminderStatus[] = ['pending', 'sent', 'failed'];
    if (!validStatuses.includes(this.status)) {
      errors.push({
        field: 'status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Validate users notified count
    if (this.usersNotified < 0) {
      errors.push({
        field: 'usersNotified',
        message: 'Users notified count cannot be negative',
      });
    }

    // Validate scheduled at date
    if (isNaN(this.scheduledAt.getTime())) {
      errors.push({
        field: 'scheduledAt',
        message: 'Scheduled at must be a valid date',
      });
    }

    // Validate sent at date if present
    if (this.sentAt && isNaN(this.sentAt.getTime())) {
      errors.push({
        field: 'sentAt',
        message: 'Sent at must be a valid date',
      });
    }

    // Status-specific validations
    if (this.status === 'sent' && !this.sentAt) {
      errors.push({
        field: 'sentAt',
        message: 'Sent reminders must have a sent_at timestamp',
      });
    }

    if (this.status === 'failed' && (!this.errorMessage || this.errorMessage.trim().length === 0)) {
      errors.push({
        field: 'errorMessage',
        message: 'Failed reminders must have an error message',
      });
    }

    return errors;
  }

  /**
   * Create a unique key for this reminder log
   */
  getUniqueKey(): string {
    return `${this.eventMessageId}:${this.scheduledAt.getTime()}`;
  }

  /**
   * Check if this reminder log equals another (by event and scheduled time)
   */
  equals(other: ReminderLog): boolean {
    return (
      this.eventMessageId === other.eventMessageId &&
      this.scheduledAt.getTime() === other.scheduledAt.getTime()
    );
  }

  /**
   * String representation for debugging
   */
  override toString(): string {
    return `ReminderLog(Event:${this.eventMessageId}, ${this.status}, ${this.usersNotified} users)`;
  }
}
