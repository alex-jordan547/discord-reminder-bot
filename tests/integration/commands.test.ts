/**
 * Functional tests for Discord command handlers
 * 
 * Tests the integration between slash commands, handlers, and services
 * to ensure the migrated functionality works correctly.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { 
  handleWatchCommand, 
  handleUnwatchCommand, 
  handleListCommand, 
  handleStatusCommand 
} from '../../src/commands/handlers.js';

// Mock Discord.js objects
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
  eventManager: {
    createEvent: vi.fn(),
    removeEvent: vi.fn(),
    getEventsByGuild: vi.fn(),
    getTotalEventCount: vi.fn(),
  },
  reminderScheduler: {
    scheduleEvent: vi.fn(),
    unscheduleEvent: vi.fn(),
    getStatus: vi.fn(),
  },
};

const mockInteraction = {
  guild: {
    id: '111222333444555666',
  },
  guildId: '111222333444555666',
  member: {
    roles: {
      cache: new Map([
        ['adminRole', { name: 'Admin' }],
      ]),
    },
  },
  options: {
    get: vi.fn(),
  },
  reply: vi.fn(),
  user: {
    tag: 'testuser#1234',
  },
};

const mockChannel = {
  id: '987654321098765432',
  messages: {
    fetch: vi.fn(),
  },
  permissionsFor: vi.fn(),
};

const mockMessage = {
  id: '123456789012345678',
  content: 'Test event message for testing',
};

describe('Command Handlers Integration', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock behaviors
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    mockChannel.messages.fetch.mockResolvedValue(mockMessage);
    mockChannel.permissionsFor.mockReturnValue({
      has: vi.fn().mockReturnValue(true),
    });
    mockInteraction.options.get.mockImplementation((name) => {
      const options = {
        'link': { value: 'https://discord.com/channels/111222333444555666/987654321098765432/123456789012345678' },
        'interval': { value: 60 },
      };
      return options[name] || null;
    });
  });

  describe('Watch Command', () => {
    test('should successfully create and schedule new event', async () => {
      // Setup
      const mockEvent = {
        messageId: '123456789012345678',
        channelId: '987654321098765432',
        guildId: '111222333444555666',
        title: 'Test event message for testing',
        intervalMinutes: 60,
      };
      
      mockClient.eventManager.createEvent.mockResolvedValue(mockEvent);
      
      // Execute
      await handleWatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockClient.eventManager.createEvent).toHaveBeenCalledWith({
        messageId: '123456789012345678',
        channelId: '987654321098765432',
        guildId: '111222333444555666',
        title: 'Test event message for testing',
        intervalMinutes: 60,
        lastRemindedAt: null,
        isPaused: false,
        usersWhoReacted: [],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      
      expect(mockClient.reminderScheduler.scheduleEvent).toHaveBeenCalledWith(mockEvent);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '✅ Event Watch Started',
            color: 0x00AE86,
          }),
        })],
      });
    });

    test('should validate permissions before creating event', async () => {
      // Setup - member without admin role
      const nonAdminInteraction = {
        ...mockInteraction,
        member: {
          roles: {
            cache: new Map(), // No admin roles
          },
        },
      };
      
      // Execute
      await handleWatchCommand(nonAdminInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith('❌ You need administrator permissions to use this command.');
      expect(mockClient.eventManager.createEvent).not.toHaveBeenCalled();
    });

    test('should validate message link format', async () => {
      // Setup - invalid message link
      mockInteraction.options.get.mockImplementation((name) => {
        if (name === 'link') {
          return { value: 'invalid-link' };
        }
        return { value: 60 };
      });
      
      // Execute
      await handleWatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith('❌ Invalid Discord message link format.');
      expect(mockClient.eventManager.createEvent).not.toHaveBeenCalled();
    });

    test('should validate interval bounds', async () => {
      // Setup - interval too large
      mockInteraction.options.get.mockImplementation((name) => {
        const options = {
          'link': { value: 'https://discord.com/channels/111222333444555666/987654321098765432/123456789012345678' },
          'interval': { value: 50000 }, // Too large
        };
        return options[name] || null;
      });
      
      // Execute  
      await handleWatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('❌ Interval must be between'));
      expect(mockClient.eventManager.createEvent).not.toHaveBeenCalled();
    });
  });

  describe('Unwatch Command', () => {
    test('should successfully remove event and unschedule', async () => {
      // Setup
      mockClient.eventManager.removeEvent.mockResolvedValue(true);
      
      // Execute
      await handleUnwatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockClient.eventManager.removeEvent).toHaveBeenCalledWith(
        '123456789012345678',
        '111222333444555666'
      );
      expect(mockClient.reminderScheduler.unscheduleEvent).toHaveBeenCalledWith('123456789012345678');
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '⏹️ Event Watch Stopped',
            color: 0xFF6B6B,
          }),
        })],
      });
    });

    test('should handle non-existent event gracefully', async () => {
      // Setup
      mockClient.eventManager.removeEvent.mockResolvedValue(false);
      
      // Execute
      await handleUnwatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith('❌ This message is not currently being watched.');
      expect(mockClient.reminderScheduler.unscheduleEvent).not.toHaveBeenCalled();
    });
  });

  describe('List Command', () => {
    test('should display list of watched events', async () => {
      // Setup
      const mockEvents = [
        {
          messageId: '123456789012345678',
          channelId: '987654321098765432',
          title: 'Event 1',
          intervalMinutes: 60,
          lastRemindedAt: new Date('2024-01-01T12:00:00Z'),
          usersWhoReacted: ['user1', 'user2'],
        },
        {
          messageId: '123456789012345679',
          channelId: '987654321098765433',
          title: 'Event 2', 
          intervalMinutes: 120,
          lastRemindedAt: new Date('2024-01-01T11:00:00Z'),
          usersWhoReacted: ['user3'],
        },
      ];
      
      mockClient.eventManager.getEventsByGuild.mockResolvedValue(mockEvents);
      
      // Execute
      await handleListCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockClient.eventManager.getEventsByGuild).toHaveBeenCalledWith('111222333444555666');
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '📋 Watched Events',
            description: 'Currently watching 2 event(s) in this server:',
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: '1. Event 1',
                value: expect.stringContaining('Reactions: 2'),
              }),
              expect.objectContaining({
                name: '2. Event 2',
                value: expect.stringContaining('Reactions: 1'),
              }),
            ]),
          }),
        })],
      });
    });

    test('should handle empty event list', async () => {
      // Setup
      mockClient.eventManager.getEventsByGuild.mockResolvedValue([]);
      
      // Execute
      await handleListCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '📋 Watched Events',
            description: 'No events are currently being watched in this server.',
            color: 0xFFA500,
          }),
        })],
      });
    });
  });

  describe('Status Command', () => {
    test('should display comprehensive bot status', async () => {
      // Setup
      const mockSchedulerStatus = {
        status: 'active',
        nextCheck: new Date('2024-01-01T13:00:00Z'),
        activeEvents: 5,
        lastReminderSent: new Date('2024-01-01T12:30:00Z'),
      };
      
      mockClient.eventManager.getTotalEventCount.mockResolvedValue(10);
      mockClient.eventManager.getEventsByGuild.mockResolvedValue([{}, {}]); // 2 events
      mockClient.reminderScheduler.getStatus.mockReturnValue(mockSchedulerStatus);
      mockClient.guilds.cache.size = 3;
      
      // Mock process methods
      vi.spyOn(process, 'uptime').mockReturnValue(3661); // 1h 1min 1s
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 50 * 1024 * 1024, // 50MB
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0,
      });
      
      // Execute
      await handleStatusCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '📊 Bot Status',
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: '🤖 Bot Info',
                value: expect.stringMatching(/Servers: 3.*Uptime: 1h 1m/),
              }),
              expect.objectContaining({
                name: '📊 Events',
                value: 'Total: 10\\nThis Server: 2',
              }),
              expect.objectContaining({
                name: '⏰ Scheduler',
                value: expect.stringContaining('Status: active'),
              }),
              expect.objectContaining({
                name: '💾 Memory Usage',
                value: '50MB',
              }),
            ]),
          }),
        })],
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle channel fetch errors gracefully', async () => {
      // Setup
      mockClient.channels.fetch.mockRejectedValue(new Error('Channel not found'));
      
      // Execute
      await handleWatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith('❌ Could not find the specified channel.');
      expect(mockClient.eventManager.createEvent).not.toHaveBeenCalled();
    });

    test('should handle message fetch errors gracefully', async () => {
      // Setup
      mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));
      
      // Execute
      await handleWatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith('❌ Could not find the specified message.');
      expect(mockClient.eventManager.createEvent).not.toHaveBeenCalled();
    });

    test('should handle permission errors gracefully', async () => {
      // Setup
      mockChannel.permissionsFor.mockReturnValue({
        has: vi.fn().mockReturnValue(false), // No permissions
      });
      
      // Execute
      await handleWatchCommand(mockInteraction as any, mockClient as any);
      
      // Verify
      expect(mockInteraction.reply).toHaveBeenCalledWith('❌ I do not have permission to read/send messages in that channel.');
      expect(mockClient.eventManager.createEvent).not.toHaveBeenCalled();
    });
  });
});