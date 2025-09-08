/**
 * Model exports for Discord Reminder Bot
 *
 * Provides centralized exports for all data models and related types
 */

// Core models
export { BaseModel, type BaseModelData, type ModelValidationError } from './BaseModel';
export { Event, type EventData, type EventStatus, type ValidationError } from './Event';
export { GuildConfig, type GuildConfigData, DEFAULT_GUILD_CONFIG } from './GuildConfig';
export { Guild, type GuildData } from './Guild';
export { User, type UserData } from './User';
export { Reaction, type ReactionData } from './Reaction';
export { ReminderLog, type ReminderLogData, type ReminderStatus } from './ReminderLog';

// Mixins and utilities
export {
  type ValidationMixin,
  type SerializationMixin,
  type ModelMixin,
  ModelUtils,
  ModelCollection,
} from './mixins';
