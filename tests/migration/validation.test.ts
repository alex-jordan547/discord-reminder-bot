/**
 * Migration validation tests
 * 
 * Comprehensive tests to ensure TypeScript migration preserves all
 * Python functionality and maintains API compatibility.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Event, Guild, User, Reaction, ReminderLog } from '../../src/models/index.js';
import { SqliteStorage, createStorage } from '../../src/persistence/index.js';

describe('Migration Validation - Python to TypeScript', () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = await createStorage();
  });

  describe('Event Model Compatibility', () => {
    test('should maintain Python Event model API compatibility', () => {
      const pythonData = {
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Python Compatible Event',
        description: 'Event created from Python data',
        interval_minutes: 1440, // 24 hours
        is_paused: false,
        last_reminder: '2024-01-01T12:00:00.000Z',
        required_reactions: ['✅', '❌', '❓'],
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T11:00:00.000Z',
      };

      const event = Event.fromDict(pythonData);

      // Test Python-style property access
      expect(event.messageId).toBe(pythonData.message_id);
      expect(event.channelId).toBe(pythonData.channel_id);
      expect(event.guildId).toBe(pythonData.guild_id);
      expect(event.intervalMinutes).toBe(pythonData.interval_minutes);
      expect(event.isPaused).toBe(pythonData.is_paused);

      // Test Python-style method compatibility
      expect(event.is_reminder_due()).toBe(event.isReminderDue());
      expect(event.getResponseCount()).toBe(event.getReactionCount());
      expect(event.getMissingCount()).toBe(event.getMissingUsersCount());

      // Test serialization back to Python format
      const backToPython = event.toDict();
      expect(backToPython.message_id).toBe(pythonData.message_id);
      expect(backToPython.is_paused).toBe(pythonData.is_paused);
      expect(backToPython.interval_minutes).toBe(pythonData.interval_minutes);
    });

    test('should preserve all business logic from Python Event', () => {
      const now = new Date();
      const pastReminder = new Date(now.getTime() - 61 * 60 * 1000); // 61 minutes ago

      const dueEvent = Event.fromDict({
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Due Event',
        interval_minutes: 60,
        is_paused: false,
        last_reminder: pastReminder.toISOString(),
        required_reactions: ['✅', '❌'],
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

      const pausedEvent = Event.fromDict({
        ...dueEvent.toDict(),
        message_id: '987654321098765432',
        is_paused: true,
      });

      // Test reminder due logic (core business logic)
      expect(dueEvent.isReminderDue()).toBe(true);
      expect(pausedEvent.isReminderDue()).toBe(false);

      // Test next reminder calculation
      const nextReminder = dueEvent.getNextReminderTime();
      const expectedNext = new Date(pastReminder.getTime() + (60 * 60 * 1000));
      expect(nextReminder.getTime()).toBe(expectedNext.getTime());

      // Test user reaction tracking
      dueEvent.updateAccessibleUsers(['user1', 'user2', 'user3']);
      dueEvent.addUserReaction('user1');
      dueEvent.addUserReaction('user2');

      expect(dueEvent.getReactionCount()).toBe(2);
      expect(dueEvent.getTotalUsersCount()).toBe(3);
      expect(dueEvent.getMissingUsersCount()).toBe(1);
      expect(dueEvent.getResponsePercentage()).toBe(66.7);
    });

    test('should validate data like Python Event model', () => {
      const invalidEvent = Event.fromDict({
        message_id: 'invalid_id', // Too short
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: '', // Empty title
        interval_minutes: 0, // Invalid interval
        required_reactions: [], // No reactions
      });

      const errors = invalidEvent.validate();
      expect(errors.length).toBeGreaterThan(0);

      // Should have specific validation errors
      expect(errors.some(e => e.field === 'messageId')).toBe(true);
      expect(errors.some(e => e.field === 'title')).toBe(true);
      expect(errors.some(e => e.field === 'intervalMinutes')).toBe(true);
      expect(errors.some(e => e.field === 'requiredReactions')).toBe(true);
    });
  });

  describe('Storage Layer Compatibility', () => {
    test('should maintain SQLite schema compatibility', async () => {
      // Verify all Python tables exist with correct structure
      const stats = await storage.getStorageStats();
      
      expect(stats).toHaveProperty('guilds_count');
      expect(stats).toHaveProperty('events_count');
      expect(stats).toHaveProperty('users_count');
      expect(stats).toHaveProperty('reactions_count');
      expect(stats).toHaveProperty('reminder_logs_count');
      expect(stats).toHaveProperty('active_events_count');
      expect(stats).toHaveProperty('due_events_count');
    });

    test('should support Python-style CRUD operations', async () => {
      // Create models from Python-style data
      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Migration Test Guild',
        settings: JSON.stringify({
          reminder_channel: 'reminders',
          admin_roles: ['Admin', 'Moderator']
        }),
      });

      const event = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: guild.guildId,
        title: 'Migration Test Event',
        description: 'Testing Python compatibility',
        interval_minutes: 60,
        is_paused: false,
        last_reminder: new Date().toISOString(),
        required_reactions: ['✅', '❌', '❓'],
      });

      const user = User.fromDict({
        user_id: '999888777666555444',
        guild_id: guild.guildId,
        username: 'TestUser',
        is_bot: false,
        last_seen: new Date().toISOString(),
      });

      // Test storage operations
      const guildResult = await storage.saveGuild(guild);
      expect(guildResult.success).toBe(true);

      const eventResult = await storage.saveEvent(event);
      expect(eventResult.success).toBe(true);

      const userResult = await storage.saveUser(user);
      expect(userResult.success).toBe(true);

      // Test retrieval and verify Python compatibility
      const retrievedGuild = await storage.getGuild(guild.guildId);
      expect(retrievedGuild).not.toBeNull();
      expect(retrievedGuild!.toDict().guild_id).toBe(guild.guildId);

      const retrievedEvent = await storage.getEvent(event.messageId);
      expect(retrievedEvent).not.toBeNull();
      expect(retrievedEvent!.toDict().message_id).toBe(event.messageId);

      const retrievedUser = await storage.getUser(user.userId, guild.guildId);
      expect(retrievedUser).not.toBeNull();
      expect(retrievedUser!.toDict().user_id).toBe(user.userId);
    });

    test('should maintain Python query compatibility', async () => {
      // Setup test data
      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Query Test Guild',
      });
      await storage.saveGuild(guild);

      const activeEvent = Event.fromDict({
        message_id: '111111111111111111',
        channel_id: '555666777888999000',
        guild_id: guild.guildId,
        title: 'Active Event',
        is_paused: false,
        interval_minutes: 60,
        last_reminder: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      });

      const pausedEvent = Event.fromDict({
        message_id: '222222222222222222',
        channel_id: '555666777888999000',
        guild_id: guild.guildId,
        title: 'Paused Event',
        is_paused: true,
        interval_minutes: 60,
      });

      await storage.saveEvent(activeEvent);
      await storage.saveEvent(pausedEvent);

      // Test Python-compatible query methods
      const allEvents = await storage.getEvents();
      expect(allEvents.length).toBe(2);

      const activeEvents = await storage.getEvents({ isPaused: false });
      expect(activeEvents.length).toBe(1);
      expect(activeEvents[0].title).toBe('Active Event');

      const guildEvents = await storage.getEvents({ guildId: guild.guildId });
      expect(guildEvents.length).toBe(2);

      const dueEvents = await storage.getDueEvents();
      expect(dueEvents.length).toBe(1); // Only the active event with old reminder
      expect(dueEvents[0].messageId).toBe('111111111111111111');
    });
  });

  describe('Complete Workflow Compatibility', () => {
    test('should support full Python event lifecycle', async () => {
      // Setup: Create guild and event (Python style)
      const guild = Guild.fromDict({
        guild_id: '123456789012345678',
        name: 'Lifecycle Test Guild',
        settings: JSON.stringify({ reminder_channel: 'reminders' }),
      });
      await storage.saveGuild(guild);

      const event = Event.fromDict({
        message_id: '987654321098765432',
        channel_id: '555666777888999000',
        guild_id: guild.guildId,
        title: 'Lifecycle Test Event',
        interval_minutes: 60,
        is_paused: false,
        last_reminder: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
        required_reactions: ['✅', '❌', '❓'],
      });
      await storage.saveEvent(event);

      // Step 1: Check if event is due for reminder (Python logic)
      expect(event.is_reminder_due()).toBe(true);

      // Step 2: Simulate users reacting
      const users = ['user1', 'user2', 'user3', 'user4'];
      event.updateAccessibleUsers(users);

      const reaction1 = Reaction.fromDict({
        event_message_id: event.messageId,
        user_id: 'user1',
        emoji: '✅',
        reacted_at: new Date().toISOString(),
      });

      const reaction2 = Reaction.fromDict({
        event_message_id: event.messageId,
        user_id: 'user2',
        emoji: '❌',
        reacted_at: new Date().toISOString(),
      });

      await storage.saveReaction(reaction1);
      await storage.saveReaction(reaction2);

      // Update event's internal state
      const reactedUsers = await storage.getEventReactedUsers(event.messageId);
      event.setUsersWhoReacted(reactedUsers);

      // Step 3: Calculate response statistics (Python compatibility)
      expect(event.getResponseCount()).toBe(2);
      expect(event.getMissingCount()).toBe(2);
      expect(event.getResponsePercentage()).toBe(50.0);

      // Step 4: Mark reminder sent
      event.markReminderSent();
      await storage.markReminderSent(event.messageId);

      // Step 5: Log the reminder
      const reminderLog = ReminderLog.fromDict({
        event_message_id: event.messageId,
        scheduled_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        users_notified: event.getMissingCount(),
        status: 'sent',
      });
      await storage.saveReminderLog(reminderLog);

      // Verify the complete workflow
      const finalEvent = await storage.getEvent(event.messageId);
      expect(finalEvent).not.toBeNull();
      expect(finalEvent!.isReminderDue()).toBe(false); // Should not be due anymore

      const logs = await storage.getEventReminderLogs(event.messageId);
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe('sent');
    });

    test('should maintain Python compatibility for status summaries', () => {
      const event = Event.fromDict({
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Status Test Event',
        interval_minutes: 120,
        is_paused: false,
        last_reminder: '2024-01-01T12:00:00.000Z',
        required_reactions: ['✅', '❌'],
        created_at: '2024-01-01T10:00:00.000Z',
      });

      event.updateAccessibleUsers(['user1', 'user2', 'user3']);
      event.addUserReaction('user1');

      const status = event.getStatusSummary();

      // Verify Python-compatible status structure
      expect(status).toMatchObject({
        title: 'Status Test Event',
        messageId: '123456789012345678',
        channelId: '987654321098765432',
        guildId: '111222333444555666',
        intervalMinutes: 120,
        isPaused: false,
        responseCount: 1,
        missingCount: 2,
        totalCount: 3,
        responsePercentage: 33.3,
      });

      expect(status.nextReminder).toBeInstanceOf(Date);
      expect(typeof status.timeUntilNext).toBe('number');
      expect(typeof status.isOverdue).toBe('boolean');
      expect(status.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Data Integrity and Migration Safety', () => {
    test('should handle Python data edge cases', () => {
      // Test with missing optional fields
      const minimalEvent = Event.fromDict({
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Minimal Event',
      });

      expect(minimalEvent.intervalMinutes).toBe(60); // Default
      expect(minimalEvent.isPaused).toBe(false); // Default
      expect(minimalEvent.requiredReactions).toEqual(['✅', '❌', '❓']); // Default
      expect(minimalEvent.lastReminder).toBeInstanceOf(Date);

      // Test with null/undefined values
      const eventWithNulls = Event.fromDict({
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Event with Nulls',
        description: null,
        interval_minutes: 60,
      });

      expect(eventWithNulls.description).toBeUndefined();
    });

    test('should preserve all validation constraints from Python', () => {
      const testCases = [
        {
          name: 'Invalid Discord ID',
          data: { message_id: 'invalid', channel_id: '987654321098765432', guild_id: '111222333444555666', title: 'Test' },
          expectedError: 'messageId'
        },
        {
          name: 'Empty title',
          data: { message_id: '123456789012345678', channel_id: '987654321098765432', guild_id: '111222333444555666', title: '' },
          expectedError: 'title'
        },
        {
          name: 'Invalid interval',
          data: { message_id: '123456789012345678', channel_id: '987654321098765432', guild_id: '111222333444555666', title: 'Test', interval_minutes: -1 },
          expectedError: 'intervalMinutes'
        },
        {
          name: 'No required reactions',
          data: { message_id: '123456789012345678', channel_id: '987654321098765432', guild_id: '111222333444555666', title: 'Test', required_reactions: [] },
          expectedError: 'requiredReactions'
        }
      ];

      for (const testCase of testCases) {
        const event = Event.fromDict(testCase.data);
        const errors = event.validate();
        
        expect(errors.some(e => e.field === testCase.expectedError), 
          `Expected validation error for field '${testCase.expectedError}' in test case '${testCase.name}'`
        ).toBe(true);
      }
    });
  });
});