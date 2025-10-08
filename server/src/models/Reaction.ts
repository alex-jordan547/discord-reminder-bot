/**
 * Reaction model for Discord Reminder Bot
 *
 * Represents a user's reaction to an event
 */

import {
  BaseModel,
  type BaseModelData,
  type ModelValidationError,
  validateDiscordId,
  validateEmoji,
} from './BaseModel.js';

export interface ReactionData extends BaseModelData {
  eventMessageId: string;
  userId: string;
  emoji: string;
  reactedAt: Date;
}

/**
 * Model representing a user's reaction to an event
 * Tracks which users have reacted to which events with which emojis
 */
export class Reaction extends BaseModel {
  public readonly eventMessageId: string;
  public readonly userId: string;
  public emoji: string;
  public reactedAt: Date;

  constructor(data: ReactionData) {
    super(data);
    this.eventMessageId = data.eventMessageId;
    this.userId = data.userId;
    this.emoji = data.emoji;
    this.reactedAt = new Date(data.reactedAt);
  }

  /**
   * Create Reaction from Python-style dictionary format
   */
  static fromDict(data: Record<string, any>): Reaction {
    return new Reaction({
      eventMessageId: String(
        data.event_message_id ||
          data.eventMessageId ||
          data.event?.message_id ||
          data.event?.messageId,
      ),
      userId: String(data.user_id || data.userId),
      emoji: String(data.emoji),
      reactedAt: new Date(data.reacted_at || data.reactedAt || Date.now()),
      createdAt: new Date(data.created_at || data.createdAt || Date.now()),
      updatedAt: new Date(data.updated_at || data.updatedAt || Date.now()),
    });
  }

  /**
   * Convert to Python-style dictionary format
   */
  toDict(): Record<string, any> {
    return {
      event_message_id: this.eventMessageId,
      user_id: this.userId,
      emoji: this.emoji,
      reacted_at: this.reactedAt.toISOString(),
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  /**
   * Serialize to JSON format (TypeScript conventions)
   */
  toJSON(): ReactionData & Record<string, any> {
    return {
      eventMessageId: this.eventMessageId,
      userId: this.userId,
      emoji: this.emoji,
      reactedAt: this.reactedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Update the emoji (if user changes their reaction)
   */
  updateEmoji(newEmoji: string): void {
    if (this.emoji !== newEmoji) {
      this.emoji = newEmoji;
      this.reactedAt = new Date();
      this.touch();
    }
  }

  /**
   * Check if this reaction was made recently (within specified hours)
   */
  isRecent(hoursThreshold: number = 24): boolean {
    const hoursAgo = Date.now() - hoursThreshold * 60 * 60 * 1000;
    return this.reactedAt.getTime() > hoursAgo;
  }

  /**
   * Validate the reaction data and return any validation errors
   */
  validate(): ModelValidationError[] {
    const errors: ModelValidationError[] = [];

    // Validate event message ID
    errors.push(...validateDiscordId(this.eventMessageId, 'eventMessageId'));

    // Validate user ID
    errors.push(...validateDiscordId(this.userId, 'userId'));

    // Validate emoji
    errors.push(...validateEmoji(this.emoji, 'emoji'));

    // Validate reacted at date
    if (isNaN(this.reactedAt.getTime())) {
      errors.push({
        field: 'reactedAt',
        message: 'Reacted at must be a valid date',
      });
    }

    return errors;
  }

  /**
   * Create a unique key for this reaction
   */
  getUniqueKey(): string {
    return `${this.eventMessageId}:${this.userId}`;
  }

  /**
   * Check if this reaction equals another reaction (by event and user)
   */
  equals(other: Reaction): boolean {
    return this.eventMessageId === other.eventMessageId && this.userId === other.userId;
  }

  /**
   * String representation for debugging
   */
  override toString(): string {
    return `Reaction(${this.userId}, "${this.emoji}", Event:${this.eventMessageId})`;
  }
}
