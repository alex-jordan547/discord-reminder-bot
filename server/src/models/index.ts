/**
 * Model exports for Discord Reminder Bot
 *
 * Provides centralized exports for all data models and related types
 */

// Core models
export { BaseModel, type BaseModelData, type ModelValidationError } from './BaseModel.js';
export { Event, type EventData, type EventStatus, type ValidationError } from './Event.js';
export { GuildConfig, type GuildConfigData, DEFAULT_GUILD_CONFIG } from './GuildConfig.js';
export { Guild, type GuildData } from './Guild.js';
export { User, type UserData } from './User.js';
export { Reaction, type ReactionData } from './Reaction.js';
export { ReminderLog, type ReminderLogData, type ReminderStatus } from './ReminderLog.js';

// Mixins and utilities
export {
  type ValidationMixin,
  type SerializationMixin,
  type ModelMixin,
  ModelUtils,
  ModelCollection,
} from './mixins.js';
