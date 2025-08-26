/**
 * Model exports for Discord Reminder Bot
 * 
 * Provides centralized exports for all data models and related types
 */

export { Event, type EventData, type EventStatus, type ValidationError } from './Event.js';
export { Guild, type GuildData } from './Guild.js';
export { User, type UserData } from './User.js';  
export { Reaction, type ReactionData } from './Reaction.js';
export { ReminderLog, type ReminderLogData, type ReminderStatus } from './ReminderLog.js';

// Re-export validation and serialization mixins
export { ValidationMixin, SerializationMixin } from './mixins.js';

// Model collections and utilities
export { 
  BaseModel,
  type ModelValidationError,
  type SerializableModel,
  validateDiscordId,
  validateEmoji,
  validateInterval
} from './BaseModel.js';