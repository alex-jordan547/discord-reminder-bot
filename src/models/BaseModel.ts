/**
 * Base model class and validation utilities
 *
 * Provides common functionality for all models including validation,
 * serialization, and timestamp management.
 */

import { z } from 'zod';

// Validation schemas
export const DiscordIdSchema = z.string().regex(/^\d{17,19}$/, 'Discord ID must be 17-19 digits');
export const EmojiSchema = z.string().min(1).max(10);
export const IntervalSchema = z.number().min(1).max(10080); // 1 minute to 1 week

export interface ModelValidationError {
  field: string;
  message: string;
}

export interface SerializableModel {
  toDict(): Record<string, any>;
  toJSON(): Record<string, any>;
  validate(): ModelValidationError[];
  fullClean(): void;
}

export interface BaseModelData {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Base model class that provides common functionality for all models
 * Includes automatic timestamps, validation, and serialization capabilities
 */
export abstract class BaseModel implements SerializableModel {
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(data: BaseModelData) {
    this.createdAt = new Date(data.createdAt || Date.now());
    this.updatedAt = new Date(data.updatedAt || Date.now());
  }

  /**
   * Update the updated_at timestamp (equivalent to Python's save override)
   */
  protected touch(): void {
    this.updatedAt = new Date();
  }

  /**
   * Perform model cleaning and validation before save
   * Override this method in subclasses for custom cleaning logic
   */
  protected clean(): void {
    // Default implementation - override in subclasses
  }

  /**
   * Perform full model validation including field validation and custom cleaning
   */
  fullClean(): void {
    // Run custom cleaning logic
    this.clean();

    // Run validation and throw if errors exist
    const errors = this.validate();
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.field}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }

  // Abstract methods that must be implemented by subclasses
  abstract toDict(): Record<string, any>;
  abstract toJSON(): Record<string, any>;
  abstract validate(): ModelValidationError[];
}

/**
 * Validation helper functions
 */

export function validateDiscordId(id: string, fieldName: string = 'id'): ModelValidationError[] {
  try {
    DiscordIdSchema.parse(id);
    return [];
  } catch {
    return [
      {
        field: fieldName,
        message: 'Must be a valid Discord ID (17-19 digits)',
      },
    ];
  }
}

export function validateEmoji(emoji: string, fieldName: string = 'emoji'): ModelValidationError[] {
  try {
    EmojiSchema.parse(emoji);
    return [];
  } catch {
    return [
      {
        field: fieldName,
        message: 'Must be a valid emoji (1-10 characters)',
      },
    ];
  }
}

export function validateInterval(
  minutes: number,
  fieldName: string = 'intervalMinutes',
): ModelValidationError[] {
  try {
    IntervalSchema.parse(minutes);
    return [];
  } catch {
    return [
      {
        field: fieldName,
        message: 'Must be between 1 minute and 10080 minutes (1 week)',
      },
    ];
  }
}

export function validateJsonString(
  jsonStr: string,
  fieldName: string = 'jsonField',
): ModelValidationError[] {
  try {
    JSON.parse(jsonStr);
    return [];
  } catch {
    return [
      {
        field: fieldName,
        message: 'Must be valid JSON',
      },
    ];
  }
}

export function validateNonEmptyString(
  value: string,
  fieldName: string,
  maxLength?: number,
): ModelValidationError[] {
  const errors: ModelValidationError[] = [];

  if (!value || value.trim().length === 0) {
    errors.push({
      field: fieldName,
      message: 'Cannot be empty',
    });
  }

  if (maxLength && value.length > maxLength) {
    errors.push({
      field: fieldName,
      message: `Cannot exceed ${maxLength} characters`,
    });
  }

  return errors;
}
