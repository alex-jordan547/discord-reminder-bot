/**
 * Drizzle ORM schema for Discord Reminder Bot
 *
 * Defines all database tables with proper types and relationships
 */

import { sqliteTable, text, integer, real, unique, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Events table - core table for tracking Discord events and reminders
export const events = sqliteTable(
  'events',
  {
    messageId: text('message_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    guildId: text('guild_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    intervalMinutes: integer('interval_minutes').notNull(),
    isPaused: integer('is_paused', { mode: 'boolean' }).notNull().default(false),
    lastRemindedAt: integer('last_reminded_at', { mode: 'timestamp' }),
    usersWhoReacted: text('users_who_reacted').notNull().default('[]'), // JSON array of user IDs
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => ({
    guildChannelIdx: index('idx_events_guild_channel').on(table.guildId, table.channelId),
    updatedAtIdx: index('idx_events_updated_at').on(table.updatedAt),
  }),
);

// Users table - tracks Discord users across guilds
export const users = sqliteTable(
  'users',
  {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    username: text('username').notNull(),
    isBot: integer('is_bot', { mode: 'boolean' }).notNull().default(false),
    lastSeen: integer('last_seen', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => ({
    pk: unique().on(table.userId, table.guildId),
    guildIdx: index('idx_users_guild').on(table.guildId),
    lastSeenIdx: index('idx_users_last_seen').on(table.lastSeen),
  }),
);

// Guilds table - tracks Discord server configurations
export const guilds = sqliteTable(
  'guilds',
  {
    guildId: text('guild_id').primaryKey(),
    guildName: text('guild_name').notNull(),
    ownerId: text('owner_id').notNull(),
    memberCount: integer('member_count').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    leftAt: integer('left_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => ({
    activeIdx: index('idx_guilds_active').on(table.isActive),
    joinedAtIdx: index('idx_guilds_joined_at').on(table.joinedAt),
  }),
);

// Guild configs table - stores per-guild configuration settings
export const guildConfigs = sqliteTable('guild_configs', {
  guildId: text('guild_id')
    .primaryKey()
    .references(() => guilds.guildId, { onDelete: 'cascade' }),
  
  // Channel configuration
  reminderChannelId: text('reminder_channel_id'),
  reminderChannelName: text('reminder_channel_name').notNull().default(''),
  
  // Admin configuration  
  adminRoleIds: text('admin_role_ids').notNull().default('[]'), // JSON array of role IDs
  adminRoleNames: text('admin_role_names').notNull().default('[]'), // JSON array of role names
  
  // Reminder timing configuration
  defaultIntervalMinutes: integer('default_interval_minutes').notNull().default(60),
  autoDeleteEnabled: integer('auto_delete_enabled', { mode: 'boolean' }).notNull().default(false),
  autoDeleteDelayMinutes: integer('auto_delete_delay_minutes').notNull().default(5),
  delayBetweenRemindersMs: integer('delay_between_reminders_ms').notNull().default(1000),
  
  // Mention and reaction configuration
  maxMentionsPerReminder: integer('max_mentions_per_reminder').notNull().default(50),
  useEveryoneAboveLimit: integer('use_everyone_above_limit', { mode: 'boolean' }).notNull().default(true),
  defaultReactions: text('default_reactions').notNull().default('["✅","❌","❓"]'), // JSON array
  
  // Timezone configuration
  timezone: text('timezone').notNull().default('UTC'),
  
  // Legacy/deprecated fields for backwards compatibility
  allowedRoles: text('allowed_roles').notNull().default('[]'), // JSON array of role IDs (deprecated)
  blockedChannels: text('blocked_channels').notNull().default('[]'), // JSON array of channel IDs
  maxEventsPerGuild: integer('max_events_per_guild').notNull().default(50),
  enableAutoCleanup: integer('enable_auto_cleanup', { mode: 'boolean' }).notNull().default(true),
  cleanupDays: integer('cleanup_days').notNull().default(30),
  dateFormat: text('date_format').notNull().default('YYYY-MM-DD HH:mm'),
  
  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Reactions table - tracks user reactions to events
export const reactions = sqliteTable(
  'reactions',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => events.messageId, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    emoji: text('emoji').notNull(),
    isRemoved: integer('is_removed', { mode: 'boolean' }).notNull().default(false),
    reactedAt: integer('reacted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    removedAt: integer('removed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => ({
    pk: unique().on(table.messageId, table.userId, table.emoji),
    messageIdx: index('idx_reactions_message').on(table.messageId),
    userIdx: index('idx_reactions_user').on(table.userId),
    guildIdx: index('idx_reactions_guild').on(table.guildId),
    reactedAtIdx: index('idx_reactions_reacted_at').on(table.reactedAt),
  }),
);

// Reminder logs table - tracks when reminders were sent
export const reminderLogs = sqliteTable(
  'reminder_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id')
      .notNull()
      .references(() => events.messageId, { onDelete: 'cascade' }),
    channelId: text('channel_id').notNull(),
    guildId: text('guild_id').notNull(),
    reminderType: text('reminder_type').notNull(), // 'scheduled', 'manual', 'test'
    recipientCount: integer('recipient_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    errorDetails: text('error_details'), // JSON object with error information
    executionTimeMs: real('execution_time_ms'),
    sentAt: integer('sent_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => ({
    messageIdx: index('idx_reminder_logs_message').on(table.messageId),
    guildIdx: index('idx_reminder_logs_guild').on(table.guildId),
    sentAtIdx: index('idx_reminder_logs_sent_at').on(table.sentAt),
    typeIdx: index('idx_reminder_logs_type').on(table.reminderType),
  }),
);

// Export table types for TypeScript inference
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;

export type GuildConfig = typeof guildConfigs.$inferSelect;
export type NewGuildConfig = typeof guildConfigs.$inferInsert;

export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;

export type ReminderLog = typeof reminderLogs.$inferSelect;
export type NewReminderLog = typeof reminderLogs.$inferInsert;
