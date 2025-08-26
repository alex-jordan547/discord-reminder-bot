/**
 * Functional tests for ReminderScheduler
 * 
 * Tests the complete reminder scheduling and sending functionality
 * to ensure the migrated Python logic works correctly.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReminderScheduler } from '../../src/services/reminderScheduler.js';
import { EventManager } from '../../src/services/eventManager.js';
import { Event } from '../../src/models/Event.js';

// Mock Discord.js
const mockClient = {
  channels: {
    fetch: vi.fn(),
  },
  guilds: {
    cache: new Map(),
  },
  user: {
    id: '123456789012345678',
  },
};

const mockChannel = {
  id: '987654321098765432',
  messages: {
    fetch: vi.fn(),
  },
  permissionsFor: vi.fn(),
  send: vi.fn(),
};

const mockMessage = {
  id: '123456789012345678',
  content: 'Test event message',
  guild: {
    id: '111222333444555666',
    members: {
      fetch: vi.fn(),
      cache: new Map([
        ['user1', { user: { id: 'user1', bot: false } }],
        ['user2', { user: { id: 'user2', bot: false } }],
        ['user3', { user: { id: 'user3', bot: false } }],
      ]),
    },
  },
  reactions: {
    cache: new Map(),
  },
};

describe('ReminderScheduler Integration', () => {
  let scheduler: ReminderScheduler;
  let eventManager: EventManager;
  let testEvent: Event;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create test event
    testEvent = new Event({
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Test Event',
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(Date.now() - 70 * 60 * 1000), // 70 minutes ago (overdue)
      requiredReactions: ['✅', '❌', '❓'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Setup accessible users
    testEvent.updateAccessibleUsers(['user1', 'user2', 'user3']);
    
    // Setup some reactions (user1 has reacted, user2 and user3 haven't)
    testEvent.addUserReaction('user1');

    // Create event manager mock
    eventManager = {
      getActiveEvents: vi.fn(),
      getEventsNeedingReminders: vi.fn(),
      getNextReminderTime: vi.fn(),
      markEventReminded: vi.fn(),
      removeEvent: vi.fn(),
      getTotalEventCount: vi.fn(),
    } as any;

    // Create scheduler
    scheduler = new ReminderScheduler(mockClient as any, eventManager);

    // Setup default mock behaviors
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    mockChannel.messages.fetch.mockResolvedValue(mockMessage);
    mockChannel.permissionsFor.mockReturnValue({
      has: vi.fn().mockReturnValue(true),
    });
    mockChannel.send.mockResolvedValue({ id: 'reminder123', delete: vi.fn() });
    
    eventManager.getActiveEvents.mockResolvedValue([testEvent]);
    eventManager.getEventsNeedingReminders.mockResolvedValue([testEvent]);
    eventManager.markEventReminded.mockResolvedValue(true);
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('Dynamic Scheduling Logic', () => {
    test('should enter sleep mode when no events exist', async () => {
      // Setup - no active events
      eventManager.getActiveEvents.mockResolvedValue([]);
      
      // Start scheduler
      await scheduler.initialize();
      
      // Wait for scheduling to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify sleep mode
      const status = scheduler.getStatus();
      expect(status.status).toBe('sleeping');
      expect(status.nextCheck).toBeNull();
    });

    test('should schedule next check based on earliest reminder time', async () => {
      // Setup - event due in 30 minutes
      const futureEvent = new Event({
        ...testEvent.toJSON(),
        messageId: '123456789012345679',
        lastReminder: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      });
      
      eventManager.getActiveEvents.mockResolvedValue([futureEvent]);
      eventManager.getEventsNeedingReminders.mockResolvedValue([]);
      
      // Start scheduler
      await scheduler.initialize();
      
      // Wait for scheduling
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify active status with next check scheduled
      const status = scheduler.getStatus();
      expect(status.status).toBe('active');
      expect(status.nextCheck).toBeInstanceOf(Date);
      expect(status.nextCheck!.getTime()).toBeGreaterThan(Date.now());
    });

    test('should handle overdue reminders immediately', async () => {
      // Setup - overdue event
      eventManager.getEventsNeedingReminders.mockResolvedValue([testEvent]);
      
      // Start scheduler
      await scheduler.initialize();
      
      // Wait for immediate processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify reminder was sent
      expect(mockChannel.send).toHaveBeenCalled();
      expect(eventManager.markEventReminded).toHaveBeenCalledWith(testEvent.messageId);
      
      // Verify statistics updated
      const status = scheduler.getStatus();
      expect(status.lastReminderSent).toBeInstanceOf(Date);
    });
  });

  describe('Reminder Sending Logic', () => {
    test('should send reminder with correct format matching Python implementation', async () => {
      // Force immediate reminder check
      eventManager.getEventsNeedingReminders.mockResolvedValue([testEvent]);
      
      await scheduler.forceCheck();
      
      // Verify reminder message format
      expect(mockChannel.send).toHaveBeenCalledWith({
        content: '<@user2> <@user3>',
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '🔔 Rappel: Test Event',
            description: expect.stringContaining('Merci de mettre votre disponibilité'),
            color: 0xFFA500, // Orange color like Python
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: '📊 Statistiques',
                value: expect.stringMatching(/✅ Ont répondu: \*\*1\*\*.*❌ Manquants: \*\*2\*\*.*👥 Total joueurs: \*\*3\*\*/),
              }),
              expect.objectContaining({
                name: '🔗 Lien vers l\'évènement',
                value: expect.stringContaining(`https://discord.com/channels/${testEvent.guildId}/${testEvent.channelId}/${testEvent.messageId}`),
              }),
            ]),
          }),
        })],
        allowedMentions: {
          users: ['user2', 'user3'],
          repliedUser: false,
        },
      });
    });

    test('should handle mention limit (≤50 users) like Python implementation', async () => {
      // Setup - create event with 60 missing users
      const manyUsers = Array.from({ length: 60 }, (_, i) => `user${i}`);
      testEvent.updateAccessibleUsers(manyUsers);
      // Only first user has reacted
      testEvent.setUsersWhoReacted(['user0']);
      
      await scheduler.forceCheck();
      
      // Verify only 50 users are mentioned
      const sendCall = mockChannel.send.mock.calls[0][0];
      const mentionedUsers = sendCall.content.split(' ').filter(mention => mention.startsWith('<@')).length;
      expect(mentionedUsers).toBe(50);
      
      // Verify mention limit in allowedMentions
      expect(sendCall.allowedMentions.users).toHaveLength(50);
      
      // Verify footer mentions remaining users
      const embed = sendCall.embeds[0];
      expect(embed.data.footer?.text).toContain('9 personne(s) supplémentaire(s)');
    });

    test('should skip reminder when all users have reacted', async () => {
      // Setup - all users have reacted
      testEvent.setUsersWhoReacted(['user1', 'user2', 'user3']);
      
      await scheduler.forceCheck();
      
      // Verify no reminder sent
      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    test('should handle deleted messages by auto-removing event', async () => {
      // Setup - message fetch fails (deleted message)
      mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));
      eventManager.removeEvent.mockResolvedValue(true);
      
      await scheduler.forceCheck();
      
      // Verify event was removed
      expect(eventManager.removeEvent).toHaveBeenCalledWith(testEvent.messageId, testEvent.guildId);
      
      // Verify no reminder sent
      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    test('should update event reactions from Discord message', async () => {
      // Setup - mock Discord message with reactions
      const mockReaction = {
        emoji: { name: '✅', toString: () => '✅' },
        users: {
          fetch: vi.fn().mockResolvedValue(new Map([
            ['user2', { id: 'user2', bot: false }],
            ['user3', { id: 'user3', bot: false }],
          ])),
        },
      };
      
      mockMessage.reactions.cache = new Map([['✅', mockReaction]]);
      
      await scheduler.forceCheck();
      
      // Verify reactions were fetched and processed
      expect(mockReaction.users.fetch).toHaveBeenCalled();
      
      // Since user2 and user3 now have reactions, only remaining users should be mentioned
      // (This tests the reaction update logic)
      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.not.stringContaining('<@user2>'), // user2 should not be mentioned if they reacted
        })
      );
    });
  });

  describe('Error Recovery', () => {
    test('should handle channel permission errors gracefully', async () => {
      // Setup - no channel permissions
      mockChannel.permissionsFor.mockReturnValue({
        has: vi.fn().mockReturnValue(false),
      });
      
      await scheduler.forceCheck();
      
      // Verify no reminder sent, but no error thrown
      expect(mockChannel.send).not.toHaveBeenCalled();
      expect(eventManager.markEventReminded).toHaveBeenCalledWith(testEvent.messageId);
    });

    test('should handle channel fetch errors gracefully', async () => {
      // Setup - channel not found
      mockClient.channels.fetch.mockRejectedValue(new Error('Channel not found'));
      
      await scheduler.forceCheck();
      
      // Verify error handled gracefully
      expect(mockChannel.send).not.toHaveBeenCalled();
      expect(eventManager.markEventReminded).toHaveBeenCalledWith(testEvent.messageId);
    });

    test('should continue with other events if one fails', async () => {
      // Setup - multiple events, one with error
      const workingEvent = new Event({
        ...testEvent.toJSON(),
        messageId: '123456789012345679',
        channelId: '987654321098765433',
      });
      workingEvent.updateAccessibleUsers(['user1', 'user2']);
      workingEvent.setUsersWhoReacted(['user1']); // user2 needs reminder
      
      const failingEvent = new Event({
        ...testEvent.toJSON(), 
        messageId: '123456789012345680',
        channelId: '999999999999999999', // Will cause channel fetch to fail
      });
      
      eventManager.getEventsNeedingReminders.mockResolvedValue([testEvent, workingEvent, failingEvent]);
      
      // Setup mocks - working channel for workingEvent, failed fetch for failingEvent
      mockClient.channels.fetch.mockImplementation((channelId) => {
        if (channelId === '987654321098765433') {
          return Promise.resolve(mockChannel);
        } else if (channelId === '999999999999999999') {
          return Promise.reject(new Error('Channel not found'));
        }
        return Promise.resolve(mockChannel);
      });
      
      await scheduler.forceCheck();
      
      // Verify working events still processed despite one failure
      expect(mockChannel.send).toHaveBeenCalled();
      expect(eventManager.markEventReminded).toHaveBeenCalledTimes(3); // All events marked as processed
    });
  });

  describe('Statistics and Status', () => {
    test('should provide accurate scheduler statistics', async () => {
      // Setup
      eventManager.getTotalEventCount.mockResolvedValue(10);
      eventManager.getActiveEvents.mockResolvedValue([testEvent, testEvent]); // 2 active
      eventManager.getNextReminderTime.mockResolvedValue(new Date(Date.now() + 30 * 60 * 1000));
      
      const stats = await scheduler.getStatistics();
      
      expect(stats).toEqual({
        totalEvents: 10,
        activeEvents: 2,
        nextReminderIn: expect.any(Number),
        lastReminderSent: null, // No reminders sent yet
        status: 'stopped', // Not initialized yet
      });
      
      expect(stats.nextReminderIn).toBeGreaterThan(25 * 60 * 1000); // ~30 minutes
      expect(stats.nextReminderIn).toBeLessThan(35 * 60 * 1000);
    });
  });
});