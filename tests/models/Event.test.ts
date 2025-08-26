/**
 * Unit tests for Event model
 * 
 * Comprehensive tests for Event class functionality, validation,
 * serialization, and business logic.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Event, type EventData } from '../../src/models/Event.js';

describe('Event Model', () => {
  let testEventData: EventData;

  beforeEach(() => {
    testEventData = {
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Test Event',
      description: 'A test event description',
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date('2024-01-01T12:00:00Z'),
      requiredReactions: ['✅', '❌', '❓'],
      createdAt: new Date('2024-01-01T10:00:00Z'),
      updatedAt: new Date('2024-01-01T11:00:00Z'),
    };
  });

  describe('Constructor and Basic Properties', () => {
    test('should create Event with valid data', () => {
      const event = new Event(testEventData);

      expect(event.messageId).toBe(testEventData.messageId);
      expect(event.channelId).toBe(testEventData.channelId);
      expect(event.guildId).toBe(testEventData.guildId);
      expect(event.title).toBe(testEventData.title);
      expect(event.description).toBe(testEventData.description);
      expect(event.intervalMinutes).toBe(testEventData.intervalMinutes);
      expect(event.isPaused).toBe(testEventData.isPaused);
      expect(event.requiredReactions).toEqual(testEventData.requiredReactions);
    });

    test('should handle optional description', () => {
      const dataWithoutDescription = { ...testEventData };
      delete dataWithoutDescription.description;

      const event = new Event(dataWithoutDescription);
      expect(event.description).toBeUndefined();
    });

    test('should create deep copy of arrays and dates', () => {
      const event = new Event(testEventData);

      // Modify original data
      testEventData.requiredReactions.push('🎉');
      testEventData.lastReminder.setHours(15);

      // Event should be unchanged
      expect(event.requiredReactions).toEqual(['✅', '❌', '❓']);
      expect(event.lastReminder.getHours()).toBe(12);
    });
  });

  describe('fromDict Static Method', () => {
    test('should create Event from Python-style dictionary', () => {
      const pythonDict = {
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Test Event',
        description: 'A test event description',
        interval_minutes: 60,
        is_paused: false,
        last_reminder: '2024-01-01T12:00:00Z',
        required_reactions: ['✅', '❌', '❓'],
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      };

      const event = Event.fromDict(pythonDict);

      expect(event.messageId).toBe('123456789012345678');
      expect(event.channelId).toBe('987654321098765432');
      expect(event.guildId).toBe('111222333444555666');
      expect(event.title).toBe('Test Event');
      expect(event.intervalMinutes).toBe(60);
      expect(event.isPaused).toBe(false);
    });

    test('should handle TypeScript-style properties', () => {
      const tsDict = {
        messageId: '123456789012345678',
        channelId: '987654321098765432',
        guildId: '111222333444555666',
        title: 'Test Event',
        intervalMinutes: 60,
        isPaused: false,
        lastReminder: '2024-01-01T12:00:00Z',
        requiredReactions: ['✅', '❌'],
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T11:00:00Z',
      };

      const event = Event.fromDict(tsDict);

      expect(event.messageId).toBe('123456789012345678');
      expect(event.requiredReactions).toEqual(['✅', '❌']);
    });

    test('should apply defaults for missing properties', () => {
      const minimalDict = {
        message_id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '111222333444555666',
        title: 'Minimal Event',
      };

      const event = Event.fromDict(minimalDict);

      expect(event.intervalMinutes).toBe(60);
      expect(event.isPaused).toBe(false);
      expect(event.requiredReactions).toEqual(['✅', '❌', '❓']);
      expect(event.lastReminder).toBeInstanceOf(Date);
    });
  });

  describe('Serialization Methods', () => {
    test('toDict should return Python-style dictionary', () => {
      const event = new Event(testEventData);
      const dict = event.toDict();

      expect(dict).toMatchObject({
        message_id: testEventData.messageId,
        channel_id: testEventData.channelId,
        guild_id: testEventData.guildId,
        title: testEventData.title,
        description: testEventData.description,
        interval_minutes: testEventData.intervalMinutes,
        is_paused: testEventData.isPaused,
        required_reactions: testEventData.requiredReactions,
      });

      expect(dict.last_reminder).toBe(testEventData.lastReminder.toISOString());
      expect(dict.created_at).toBe(testEventData.createdAt.toISOString());
      expect(dict.updated_at).toBe(testEventData.updatedAt.toISOString());
    });

    test('toJSON should return TypeScript-style object', () => {
      const event = new Event(testEventData);
      const json = event.toJSON();

      expect(json).toMatchObject({
        messageId: testEventData.messageId,
        channelId: testEventData.channelId,
        guildId: testEventData.guildId,
        title: testEventData.title,
        description: testEventData.description,
        intervalMinutes: testEventData.intervalMinutes,
        isPaused: testEventData.isPaused,
        requiredReactions: testEventData.requiredReactions,
      });

      expect(json.lastReminder).toEqual(testEventData.lastReminder);
      expect(json.createdAt).toEqual(testEventData.createdAt);
      expect(json.updatedAt).toEqual(testEventData.updatedAt);
    });

    test('serialization should include computed properties', () => {
      const event = new Event(testEventData);
      const dict = event.toDict();
      const json = event.toJSON();

      expect(dict).toHaveProperty('is_due_for_reminder');
      expect(dict).toHaveProperty('next_reminder_time');
      expect(dict).toHaveProperty('reaction_count');
      expect(dict).toHaveProperty('total_users_count');
      expect(dict).toHaveProperty('missing_users_count');
      expect(dict).toHaveProperty('response_percentage');

      expect(json).toHaveProperty('isDueForReminder');
      expect(json).toHaveProperty('nextReminderTime');
      expect(json).toHaveProperty('reactionCount');
      expect(json).toHaveProperty('totalUsersCount');
      expect(json).toHaveProperty('missingUsersCount');
      expect(json).toHaveProperty('responsePercentage');
    });
  });

  describe('Reminder Due Logic', () => {
    test('should return false when event is paused', () => {
      const pausedData = { ...testEventData, isPaused: true };
      const event = new Event(pausedData);

      expect(event.isReminderDue()).toBe(false);
      expect(event.is_reminder_due()).toBe(false); // Legacy method
    });

    test('should return true when enough time has passed', () => {
      const pastData = { 
        ...testEventData, 
        lastReminder: new Date(Date.now() - 61 * 60 * 1000), // 61 minutes ago
        intervalMinutes: 60 
      };
      const event = new Event(pastData);

      expect(event.isReminderDue()).toBe(true);
    });

    test('should return false when not enough time has passed', () => {
      const recentData = { 
        ...testEventData, 
        lastReminder: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        intervalMinutes: 60 
      };
      const event = new Event(recentData);

      expect(event.isReminderDue()).toBe(false);
    });

    test('should handle edge case of exact interval', () => {
      const exactData = { 
        ...testEventData, 
        lastReminder: new Date(Date.now() - 60 * 60 * 1000), // Exactly 60 minutes ago
        intervalMinutes: 60 
      };
      const event = new Event(exactData);

      expect(event.isReminderDue()).toBe(true);
    });
  });

  describe('Next Reminder Time Calculation', () => {
    test('should calculate correct next reminder time', () => {
      const event = new Event(testEventData);
      const nextTime = event.getNextReminderTime();
      const expectedTime = new Date(testEventData.lastReminder.getTime() + (60 * 60 * 1000));

      expect(nextTime).toEqual(expectedTime);
      expect(event.nextReminderTime).toEqual(expectedTime);
    });

    test('should handle different intervals correctly', () => {
      const customIntervalData = { ...testEventData, intervalMinutes: 30 };
      const event = new Event(customIntervalData);
      const nextTime = event.getNextReminderTime();
      const expectedTime = new Date(testEventData.lastReminder.getTime() + (30 * 60 * 1000));

      expect(nextTime).toEqual(expectedTime);
    });
  });

  describe('Mark Reminder Sent', () => {
    test('should update lastReminder and updatedAt timestamps', () => {
      const event = new Event(testEventData);
      const originalLastReminder = event.lastReminder;
      const originalUpdatedAt = event.updatedAt;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        event.markReminderSent();

        expect(event.lastReminder.getTime()).toBeGreaterThan(originalLastReminder.getTime());
        expect(event.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 10);
    });
  });

  describe('User Reaction Management', () => {
    test('should track users who reacted', () => {
      const event = new Event(testEventData);

      expect(event.getReactionCount()).toBe(0);
      expect(event.getResponseCount()).toBe(0); // Legacy method

      event.updateAccessibleUsers(['user1', 'user2', 'user3']);
      
      event.addUserReaction('user1');
      event.addUserReaction('user2');

      expect(event.getReactionCount()).toBe(2);
      expect(event.hasUserReacted('user1')).toBe(true);
      expect(event.hasUserReacted('user2')).toBe(true);
      expect(event.hasUserReacted('user3')).toBe(false);
    });

    test('should prevent duplicate reactions', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1']);

      const firstAdd = event.addUserReaction('user1');
      const secondAdd = event.addUserReaction('user1');

      expect(firstAdd).toBe(true);
      expect(secondAdd).toBe(false);
      expect(event.getReactionCount()).toBe(1);
    });

    test('should prevent reactions from non-accessible users', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1']);

      const result = event.addUserReaction('user2');

      expect(result).toBe(false);
      expect(event.getReactionCount()).toBe(0);
    });

    test('should remove user reactions', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2']);

      event.addUserReaction('user1');
      event.addUserReaction('user2');
      expect(event.getReactionCount()).toBe(2);

      const removed = event.removeUserReaction('user1');
      expect(removed).toBe(true);
      expect(event.getReactionCount()).toBe(1);
      expect(event.hasUserReacted('user1')).toBe(false);

      const removedAgain = event.removeUserReaction('user1');
      expect(removedAgain).toBe(false);
    });

    test('should set users who reacted in bulk', () => {
      const event = new Event(testEventData);

      event.setUsersWhoReacted(['user1', 'user2', 'user3']);

      expect(event.getReactionCount()).toBe(3);
      expect(event.hasUserReacted('user1')).toBe(true);
      expect(event.hasUserReacted('user2')).toBe(true);
      expect(event.hasUserReacted('user3')).toBe(true);
    });
  });

  describe('Missing Users Calculation', () => {
    test('should calculate missing users correctly', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2', 'user3', 'user4']);
      event.addUserReaction('user1');
      event.addUserReaction('user3');

      const missingUsers = event.getMissingUsers();
      const missingCount = event.getMissingUsersCount();
      const legacyMissingCount = event.getMissingCount(); // Legacy method

      expect(missingUsers).toEqual(['user2', 'user4']);
      expect(missingCount).toBe(2);
      expect(legacyMissingCount).toBe(2);
    });

    test('should handle all users reacted scenario', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2']);
      event.addUserReaction('user1');
      event.addUserReaction('user2');

      expect(event.getMissingUsers()).toEqual([]);
      expect(event.getMissingUsersCount()).toBe(0);
    });

    test('should handle no users accessible scenario', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers([]);

      expect(event.getMissingUsers()).toEqual([]);
      expect(event.getMissingUsersCount()).toBe(0);
      expect(event.getTotalUsersCount()).toBe(0);
    });
  });

  describe('Response Percentage Calculation', () => {
    test('should calculate response percentage correctly', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2', 'user3', 'user4']);
      event.addUserReaction('user1');
      event.addUserReaction('user2');

      const percentage = event.getResponsePercentage();
      expect(percentage).toBe(50.0);
    });

    test('should handle no users scenario', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers([]);

      const percentage = event.getResponsePercentage();
      expect(percentage).toBe(0);
    });

    test('should round to one decimal place', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2', 'user3']); // 3 users
      event.addUserReaction('user1'); // 1 reaction

      const percentage = event.getResponsePercentage();
      expect(percentage).toBe(33.3); // 33.333... rounded to 33.3
    });
  });

  describe('Status Summary', () => {
    test('should provide comprehensive status summary', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2', 'user3']);
      event.addUserReaction('user1');

      const status = event.getStatusSummary();

      expect(status).toMatchObject({
        title: testEventData.title,
        messageId: testEventData.messageId,
        channelId: testEventData.channelId,
        guildId: testEventData.guildId,
        intervalMinutes: testEventData.intervalMinutes,
        isPaused: testEventData.isPaused,
        responseCount: 1,
        missingCount: 2,
        totalCount: 3,
        responsePercentage: 33.3,
        createdAt: testEventData.createdAt,
      });

      expect(status.nextReminder).toBeInstanceOf(Date);
      expect(status.timeUntilNext).toBeTypeOf('number');
      expect(status.isOverdue).toBeTypeOf('boolean');
    });
  });

  describe('Validation', () => {
    test('should validate valid event data', () => {
      const event = new Event(testEventData);
      const errors = event.validate();

      expect(errors).toEqual([]);
    });

    test('should detect invalid Discord IDs', () => {
      const invalidData = {
        ...testEventData,
        messageId: 'invalid',
        channelId: '12345', // Too short
        guildId: '1234567890123456789012345', // Too long
      };

      const event = new Event(invalidData);
      const errors = event.validate();

      expect(errors).toHaveLength(3);
      expect(errors.map(e => e.field)).toContain('messageId');
      expect(errors.map(e => e.field)).toContain('channelId');
      expect(errors.map(e => e.field)).toContain('guildId');
    });

    test('should detect empty title', () => {
      const invalidData = { ...testEventData, title: '' };
      const event = new Event(invalidData);
      const errors = event.validate();

      expect(errors.some(e => e.field === 'title')).toBe(true);
    });

    test('should detect title too long', () => {
      const invalidData = { ...testEventData, title: 'a'.repeat(201) };
      const event = new Event(invalidData);
      const errors = event.validate();

      expect(errors.some(e => e.field === 'title')).toBe(true);
    });

    test('should detect invalid interval', () => {
      const invalidData = { ...testEventData, intervalMinutes: 0 };
      const event = new Event(invalidData);
      const errors = event.validate();

      expect(errors.some(e => e.field === 'intervalMinutes')).toBe(true);
    });

    test('should detect empty required reactions', () => {
      const invalidData = { ...testEventData, requiredReactions: [] };
      const event = new Event(invalidData);
      const errors = event.validate();

      expect(errors.some(e => e.field === 'requiredReactions')).toBe(true);
    });

    test('should detect invalid emojis in required reactions', () => {
      const invalidData = { ...testEventData, requiredReactions: ['✅', '', 'toolongemoji'] };
      const event = new Event(invalidData);
      const errors = event.validate();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field.includes('requiredReactions'))).toBe(true);
    });

    test('fullClean should throw on validation errors', () => {
      const invalidData = { ...testEventData, title: '' };
      const event = new Event(invalidData);

      expect(() => event.fullClean()).toThrow();
    });

    test('fullClean should not throw on valid data', () => {
      const event = new Event(testEventData);

      expect(() => event.fullClean()).not.toThrow();
    });
  });

  describe('Clone and Equality', () => {
    test('should clone event with overrides', () => {
      const event = new Event(testEventData);
      event.updateAccessibleUsers(['user1', 'user2']);
      event.addUserReaction('user1');

      const cloned = event.clone({ title: 'Cloned Event' });

      expect(cloned.title).toBe('Cloned Event');
      expect(cloned.messageId).toBe(event.messageId);
      expect(cloned.getReactionCount()).toBe(1);
      expect(cloned.getTotalUsersCount()).toBe(2);
    });

    test('should check equality by message ID', () => {
      const event1 = new Event(testEventData);
      const event2 = new Event({ ...testEventData, title: 'Different Title' });
      const event3 = new Event({ ...testEventData, messageId: '999999999999999999' });

      expect(event1.equals(event2)).toBe(true);
      expect(event1.equals(event3)).toBe(false);
    });
  });

  describe('String Representation', () => {
    test('should provide meaningful string representation', () => {
      const event = new Event(testEventData);
      const str = event.toString();

      expect(str).toBe(`Event(${testEventData.messageId}, "${testEventData.title}", Guild:${testEventData.guildId})`);
    });
  });

  describe('Legacy Compatibility', () => {
    test('should support legacy updateAccessibleUsersFromBot method', async () => {
      const event = new Event(testEventData);
      
      const mockBot = {
        guilds: {
          cache: {
            get: () => ({
              members: {
                cache: new Map([
                  ['user1', {
                    id: 'user1',
                    user: { bot: false },
                    display_name: 'User One',
                    bot: false,
                  }],
                  ['bot1', {
                    id: 'bot1',
                    user: { bot: true },
                    display_name: 'Bot One',
                    bot: true,
                  }],
                ]),
              },
              channels: {
                cache: {
                  get: () => ({
                    permissionsFor: () => ({
                      has: () => true,
                    }),
                  }),
                },
              },
            }),
          },
        },
      };

      await event.updateAccessibleUsersFromBot(mockBot);

      expect(event.getTotalUsersCount()).toBe(1);
      expect(event.hasUserReacted('user1')).toBe(false);
    });
  });
});