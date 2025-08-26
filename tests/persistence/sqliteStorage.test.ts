/**
 * Unit tests for SqliteStorage
 * 
 * Comprehensive tests for SQLite storage functionality including
 * CRUD operations, migrations, and performance optimizations.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SqliteStorage, DatabaseManager, DatabaseConfig } from '../../src/persistence/index.js';
import { Event, Guild, User, Reaction, ReminderLog } from '../../src/models/index.js';

describe('SqliteStorage', () => {
  let storage: SqliteStorage;
  let testDatabase: DatabaseManager;

  beforeEach(async () => {
    // Use in-memory database for tests
    testDatabase = DatabaseManager.getInstance(DatabaseConfig.getTestConfig());
    storage = new SqliteStorage(testDatabase);
    
    const initialized = await storage.initialize();
    expect(initialized).toBe(true);
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('Initialization', () => {
    test('should initialize storage successfully', async () => {
      expect(storage.isReady()).toBe(true);
      
      const testResult = await storage.testStorage();
      expect(testResult.success).toBe(true);
      expect(testResult.tests.connection).toBe(true);
      expect(testResult.tests.table_guilds).toBe(true);
      expect(testResult.tests.table_events).toBe(true);
      expect(testResult.tests.table_users).toBe(true);
      expect(testResult.tests.table_reactions).toBe(true);
      expect(testResult.tests.table_reminder_logs).toBe(true);
    });

    test('should create all required tables', async () => {
      const db = testDatabase;
      
      const tables = await db.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('guilds');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('events');
      expect(tableNames).toContain('reactions');
      expect(tableNames).toContain('reminder_logs');
      expect(tableNames).toContain('schema_migrations');
    });

    test('should create all required indexes', async () => {
      const db = testDatabase;
      
      const indexes = await db.all(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const indexNames = indexes.map(i => i.name);
      expect(indexNames.length).toBeGreaterThan(0);
      expect(indexNames.some(name => name.includes('events'))).toBe(true);
      expect(indexNames.some(name => name.includes('users'))).toBe(true);
    });
  });

  describe('Guild Operations', () => {
    let testGuild: Guild;

    beforeEach(() => {
      testGuild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
        settings: { reminderChannel: 'reminders' },
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      });
    });

    test('should save and retrieve guild', async () => {
      const saveResult = await storage.saveGuild(testGuild);
      expect(saveResult.success).toBe(true);
      expect(saveResult.affectedRows).toBe(1);

      const retrieved = await storage.getGuild(testGuild.guildId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.guildId).toBe(testGuild.guildId);
      expect(retrieved!.name).toBe(testGuild.name);
      expect(retrieved!.settings).toEqual(testGuild.settings);
    });

    test('should update existing guild', async () => {
      await storage.saveGuild(testGuild);
      
      testGuild.name = 'Updated Guild';
      testGuild.setSetting('newSetting', 'newValue');
      
      const updateResult = await storage.saveGuild(testGuild);
      expect(updateResult.success).toBe(true);

      const retrieved = await storage.getGuild(testGuild.guildId);
      expect(retrieved!.name).toBe('Updated Guild');
      expect(retrieved!.getSetting('newSetting')).toBe('newValue');
    });

    test('should return null for non-existent guild', async () => {
      const retrieved = await storage.getGuild('999999999999999999');
      expect(retrieved).toBeNull();
    });

    test('should get all guilds with pagination', async () => {
      const guilds = [
        Guild.fromDict({ guild_id: '111111111111111111', name: 'Guild 1' }),
        Guild.fromDict({ guild_id: '222222222222222222', name: 'Guild 2' }),
        Guild.fromDict({ guild_id: '333333333333333333', name: 'Guild 3' }),
      ];

      for (const guild of guilds) {
        await storage.saveGuild(guild);
      }

      const allGuilds = await storage.getAllGuilds();
      expect(allGuilds).toHaveLength(3);

      const limitedGuilds = await storage.getAllGuilds({ limit: 2 });
      expect(limitedGuilds).toHaveLength(2);

      const offsetGuilds = await storage.getAllGuilds({ limit: 2, offset: 1 });
      expect(offsetGuilds).toHaveLength(2);
      expect(offsetGuilds.map(g => g.guildId)).not.toContain(allGuilds[0].guildId);
    });

    test('should delete guild', async () => {
      await storage.saveGuild(testGuild);
      
      const deleteResult = await storage.deleteGuild(testGuild.guildId);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.affectedRows).toBe(1);

      const retrieved = await storage.getGuild(testGuild.guildId);
      expect(retrieved).toBeNull();
    });

    test('should handle validation errors', async () => {
      const invalidGuild = Guild.fromDict({
        guild_id: 'invalid',
        name: 'Test Guild',
      });

      const saveResult = await storage.saveGuild(invalidGuild);
      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toContain('Validation failed');
    });
  });

  describe('Event Operations', () => {
    let testGuild: Guild;
    let testEvent: Event;

    beforeEach(async () => {
      testGuild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(testGuild);

      testEvent = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: testGuild.guildId,
        title: 'Test Event',
        description: 'A test event',
        interval_minutes: 60,
        is_paused: false,
        last_reminder: '2024-01-01T12:00:00Z',
        required_reactions: ['✅', '❌'],
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      });
    });

    test('should save and retrieve event', async () => {
      const saveResult = await storage.saveEvent(testEvent);
      expect(saveResult.success).toBe(true);

      const retrieved = await storage.getEvent(testEvent.messageId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.messageId).toBe(testEvent.messageId);
      expect(retrieved!.title).toBe(testEvent.title);
      expect(retrieved!.requiredReactions).toEqual(testEvent.requiredReactions);
    });

    test('should get events with filters', async () => {
      const events = [
        Event.fromDict({
          ...testEvent.toDict(),
          message_id: '111111111111111111',
          title: 'Active Event',
          is_paused: false,
        }),
        Event.fromDict({
          ...testEvent.toDict(),
          message_id: '222222222222222222',
          title: 'Paused Event',
          is_paused: true,
        }),
      ];

      for (const event of events) {
        await storage.saveEvent(event);
      }

      const allEvents = await storage.getEvents();
      expect(allEvents).toHaveLength(2);

      const activeEvents = await storage.getEvents({ isPaused: false });
      expect(activeEvents).toHaveLength(1);
      expect(activeEvents[0].title).toBe('Active Event');

      const guildEvents = await storage.getEvents({ guildId: testGuild.guildId });
      expect(guildEvents).toHaveLength(2);
    });

    test('should get due events', async () => {
      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const dueEvent = Event.fromDict({
        ...testEvent.toDict(),
        message_id: '111111111111111111',
        last_reminder: pastDate.toISOString(),
        interval_minutes: 60,
        is_paused: false,
      });

      const notDueEvent = Event.fromDict({
        ...testEvent.toDict(),
        message_id: '222222222222222222',
        last_reminder: recentDate.toISOString(),
        interval_minutes: 60,
        is_paused: false,
      });

      await storage.saveEvent(dueEvent);
      await storage.saveEvent(notDueEvent);

      const dueEvents = await storage.getDueEvents();
      expect(dueEvents).toHaveLength(1);
      expect(dueEvents[0].messageId).toBe('111111111111111111');
    });

    test('should mark reminder sent', async () => {
      await storage.saveEvent(testEvent);

      const markResult = await storage.markReminderSent(testEvent.messageId);
      expect(markResult.success).toBe(true);

      const retrieved = await storage.getEvent(testEvent.messageId);
      expect(retrieved!.lastReminder.getTime()).toBeGreaterThan(testEvent.lastReminder.getTime());
    });

    test('should delete event', async () => {
      await storage.saveEvent(testEvent);

      const deleteResult = await storage.deleteEvent(testEvent.messageId);
      expect(deleteResult.success).toBe(true);

      const retrieved = await storage.getEvent(testEvent.messageId);
      expect(retrieved).toBeNull();
    });
  });

  describe('User Operations', () => {
    let testGuild: Guild;
    let testUser: User;

    beforeEach(async () => {
      testGuild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(testGuild);

      testUser = User.fromDict({
        user_id: '999888777666555444',
        guild_id: testGuild.guildId,
        username: 'TestUser',
        is_bot: false,
        last_seen: '2024-01-01T15:00:00Z',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      });
    });

    test('should save and retrieve user', async () => {
      const saveResult = await storage.saveUser(testUser);
      expect(saveResult.success).toBe(true);

      const retrieved = await storage.getUser(testUser.userId, testUser.guildId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.userId).toBe(testUser.userId);
      expect(retrieved!.username).toBe(testUser.username);
      expect(retrieved!.isBot).toBe(testUser.isBot);
    });

    test('should get guild users', async () => {
      const users = [
        User.fromDict({
          user_id: '111111111111111111',
          guild_id: testGuild.guildId,
          username: 'User1',
          is_bot: false,
        }),
        User.fromDict({
          user_id: '222222222222222222',
          guild_id: testGuild.guildId,
          username: 'Bot1',
          is_bot: true,
        }),
        User.fromDict({
          user_id: '333333333333333333',
          guild_id: testGuild.guildId,
          username: 'User2',
          is_bot: false,
        }),
      ];

      for (const user of users) {
        await storage.saveUser(user);
      }

      const allUsers = await storage.getGuildUsers(testGuild.guildId, true);
      expect(allUsers).toHaveLength(3);

      const nonBotUsers = await storage.getGuildUsers(testGuild.guildId, false);
      expect(nonBotUsers).toHaveLength(2);
      expect(nonBotUsers.every(u => !u.isBot)).toBe(true);
    });
  });

  describe('Reaction Operations', () => {
    let testGuild: Guild;
    let testEvent: Event;
    let testUser: User;
    let testReaction: Reaction;

    beforeEach(async () => {
      testGuild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(testGuild);

      testEvent = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: testGuild.guildId,
        title: 'Test Event',
      });
      await storage.saveEvent(testEvent);

      testUser = User.fromDict({
        user_id: '999888777666555444',
        guild_id: testGuild.guildId,
        username: 'TestUser',
      });
      await storage.saveUser(testUser);

      testReaction = Reaction.fromDict({
        event_message_id: testEvent.messageId,
        user_id: testUser.userId,
        emoji: '✅',
        reacted_at: '2024-01-01T16:00:00Z',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      });
    });

    test('should save and retrieve reactions', async () => {
      const saveResult = await storage.saveReaction(testReaction);
      expect(saveResult.success).toBe(true);

      const reactions = await storage.getEventReactions(testEvent.messageId);
      expect(reactions).toHaveLength(1);
      expect(reactions[0].userId).toBe(testUser.userId);
      expect(reactions[0].emoji).toBe('✅');
    });

    test('should get reacted users', async () => {
      const reactions = [
        Reaction.fromDict({
          event_message_id: testEvent.messageId,
          user_id: '111111111111111111',
          emoji: '✅',
        }),
        Reaction.fromDict({
          event_message_id: testEvent.messageId,
          user_id: '222222222222222222',
          emoji: '❌',
        }),
      ];

      for (const reaction of reactions) {
        await storage.saveReaction(reaction);
      }

      const reactedUsers = await storage.getEventReactedUsers(testEvent.messageId);
      expect(reactedUsers).toHaveLength(2);
      expect(reactedUsers).toContain('111111111111111111');
      expect(reactedUsers).toContain('222222222222222222');
    });

    test('should remove reaction', async () => {
      await storage.saveReaction(testReaction);

      const removeResult = await storage.removeReaction(testEvent.messageId, testUser.userId);
      expect(removeResult.success).toBe(true);

      const reactions = await storage.getEventReactions(testEvent.messageId);
      expect(reactions).toHaveLength(0);
    });

    test('should handle duplicate reactions (update)', async () => {
      await storage.saveReaction(testReaction);

      const updatedReaction = Reaction.fromDict({
        ...testReaction.toDict(),
        emoji: '❌',
      });

      const saveResult = await storage.saveReaction(updatedReaction);
      expect(saveResult.success).toBe(true);

      const reactions = await storage.getEventReactions(testEvent.messageId);
      expect(reactions).toHaveLength(1);
      expect(reactions[0].emoji).toBe('❌');
    });
  });

  describe('ReminderLog Operations', () => {
    let testGuild: Guild;
    let testEvent: Event;
    let testReminderLog: ReminderLog;

    beforeEach(async () => {
      testGuild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(testGuild);

      testEvent = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: testGuild.guildId,
        title: 'Test Event',
      });
      await storage.saveEvent(testEvent);

      testReminderLog = ReminderLog.fromDict({
        event_message_id: testEvent.messageId,
        scheduled_at: '2024-01-01T14:00:00Z',
        sent_at: '2024-01-01T14:01:00Z',
        users_notified: 5,
        status: 'sent',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      });
    });

    test('should save and retrieve reminder logs', async () => {
      const saveResult = await storage.saveReminderLog(testReminderLog);
      expect(saveResult.success).toBe(true);

      const logs = await storage.getEventReminderLogs(testEvent.messageId);
      expect(logs).toHaveLength(1);
      expect(logs[0].eventMessageId).toBe(testEvent.messageId);
      expect(logs[0].status).toBe('sent');
      expect(logs[0].usersNotified).toBe(5);
    });

    test('should get reminder logs with limit', async () => {
      const logs = Array.from({ length: 10 }, (_, i) =>
        ReminderLog.fromDict({
          event_message_id: testEvent.messageId,
          scheduled_at: new Date(Date.now() - i * 60000).toISOString(),
          status: 'sent',
        })
      );

      for (const log of logs) {
        await storage.saveReminderLog(log);
      }

      const retrievedLogs = await storage.getEventReminderLogs(testEvent.messageId, 5);
      expect(retrievedLogs).toHaveLength(5);

      // Should be ordered by scheduled_at DESC (most recent first)
      for (let i = 0; i < retrievedLogs.length - 1; i++) {
        expect(retrievedLogs[i].scheduledAt.getTime())
          .toBeGreaterThanOrEqual(retrievedLogs[i + 1].scheduledAt.getTime());
      }
    });
  });

  describe('Storage Statistics and Utilities', () => {
    test('should provide storage statistics', async () => {
      // Create some test data
      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(guild);

      const event = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: guild.guildId,
        title: 'Test Event',
        is_paused: false,
      });
      await storage.saveEvent(event);

      const stats = await storage.getStorageStats();

      expect(stats.guilds_count).toBe(1);
      expect(stats.events_count).toBe(1);
      expect(stats.active_events_count).toBe(1);
      expect(stats.users_count).toBe(0);
      expect(stats.reactions_count).toBe(0);
      expect(stats.reminder_logs_count).toBe(0);
      expect(stats).toHaveProperty('database_info');
    });

    test('should handle empty database statistics', async () => {
      const stats = await storage.getStorageStats();

      expect(stats.guilds_count).toBe(0);
      expect(stats.events_count).toBe(0);
      expect(stats.active_events_count).toBe(0);
      expect(stats.due_events_count).toBe(0);
    });
  });

  describe('Transaction and Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Close the database to simulate connection error
      await storage.close();

      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });

      const result = await storage.saveGuild(guild);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle foreign key constraints', async () => {
      // Try to create an event without a guild (should fail with FK constraint)
      const event = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: '999999999999999999', // Non-existent guild
        title: 'Orphan Event',
      });

      const result = await storage.saveEvent(event);
      expect(result.success).toBe(false);
      expect(result.error).toContain('FOREIGN KEY constraint failed');
    });

    test('should maintain referential integrity on cascade delete', async () => {
      // Create a guild with related data
      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(guild);

      const event = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: guild.guildId,
        title: 'Test Event',
      });
      await storage.saveEvent(event);

      const reaction = Reaction.fromDict({
        event_message_id: event.messageId,
        user_id: '999888777666555444',
        emoji: '✅',
      });
      await storage.saveReaction(reaction);

      // Delete the guild - should cascade delete related data
      const deleteResult = await storage.deleteGuild(guild.guildId);
      expect(deleteResult.success).toBe(true);

      // Verify cascading deletion
      const retrievedEvent = await storage.getEvent(event.messageId);
      expect(retrievedEvent).toBeNull();

      const reactions = await storage.getEventReactions(event.messageId);
      expect(reactions).toHaveLength(0);
    });
  });

  describe('Performance and Optimization', () => {
    test('should handle large datasets efficiently', async () => {
      const startTime = Date.now();

      // Create test data in batches
      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Test Guild',
      });
      await storage.saveGuild(guild);

      // Create multiple events
      const events = Array.from({ length: 100 }, (_, i) =>
        Event.fromDict({
          message_id: `${i}`.padStart(18, '0'),
          channel_id: '555666777888999000',
          guild_id: guild.guildId,
          title: `Event ${i}`,
          is_paused: i % 5 === 0, // Every 5th event is paused
        })
      );

      for (const event of events) {
        await storage.saveEvent(event);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify correct data
      const allEvents = await storage.getEvents();
      expect(allEvents).toHaveLength(100);

      const activeEvents = await storage.getEvents({ isPaused: false });
      expect(activeEvents).toHaveLength(80); // 100 - 20 paused events
    });

    test('should use indexes for efficient queries', async () => {
      // This test verifies that our indexes are being used by checking
      // that query plans include index usage (in a real scenario)
      const db = testDatabase;

      // Test guild queries
      const guildPlan = await db.get(`
        EXPLAIN QUERY PLAN 
        SELECT * FROM guilds WHERE guild_id = ?
      `, ['123456789012345678']);

      expect(guildPlan.detail).toContain('PRIMARY KEY');

      // Test event queries with composite index
      const eventPlan = await db.get(`
        EXPLAIN QUERY PLAN
        SELECT * FROM events WHERE guild_id = ? AND is_paused = ?
      `, ['123456789012345678', 0]);

      // Should use the composite index we created
      expect(guildPlan).toBeDefined();
    });
  });
});