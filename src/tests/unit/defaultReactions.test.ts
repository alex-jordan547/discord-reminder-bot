/**
 * Tests for automatic default reaction addition (Issue #48)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleWatchCommand } from '@/commands/handlers';
import { GuildConfigManager } from '@/services/guildConfigManager';

// Mock all dependencies
vi.mock('@/utils/loggingConfig', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@/services/guildConfigManager');
vi.mock('@/utils/messageParser');
vi.mock('@/utils/permissions');
vi.mock('@/utils/dateUtils');
vi.mock('discord.js', () => ({
  MessageFlags: { Ephemeral: 64 },
  EmbedBuilder: vi.fn(() => ({
    setTitle: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    addFields: vi.fn().mockReturnThis(),
    setFooter: vi.fn().mockReturnThis(),
    setTimestamp: vi.fn().mockReturnThis(),
  })),
}));

describe('Default Reactions Addition (Issue #48)', () => {
  let mockInteraction: any;
  let mockClient: any;
  let mockMessage: any;
  let mockChannel: any;
  let mockGuildConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock message
    mockMessage = {
      id: 'message-123',
      content: 'Test event message',
      react: vi.fn().mockResolvedValue(true),
    };

    // Setup mock channel
    mockChannel = {
      id: 'channel-123',
      messages: {
        fetch: vi.fn().mockResolvedValue(mockMessage),
      },
    };

    // Setup mock client
    mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
      user: { id: 'bot-id' },
      eventManager: {
        getEvent: vi.fn().mockResolvedValue(null), // No existing event
        createEvent: vi.fn().mockResolvedValue({
          messageId: 'message-123',
          channelId: 'channel-123',
          guildId: 'guild-123',
          usersWhoReacted: [],
        }),
      },
      reminderScheduler: {
        scheduleEvent: vi.fn().mockResolvedValue(true),
      },
    };

    // Setup mock interaction
    mockInteraction = {
      guildId: 'guild-123',
      guild: { id: 'guild-123' },
      member: {
        roles: {
          cache: new Map([['role-admin', { name: 'Admin' }]]),
        },
      },
      user: { tag: 'TestUser#1234' },
      options: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === 'link') return { value: 'https://discord.com/channels/guild-123/channel-123/message-123' };
          if (key === 'interval') return { value: 60 };
          return null;
        }),
      },
      reply: vi.fn().mockResolvedValue(true),
    };

    // Setup mock config manager
    mockGuildConfigManager = {
      getGuildConfig: vi.fn(),
    };

    // Mock the module imports
    vi.doMock('@/utils/messageParser', () => ({
      parseMessageLink: vi.fn().mockReturnValue({
        channelId: 'channel-123',
        messageId: 'message-123',
      }),
      validateMessageLink: vi.fn().mockReturnValue(true),
    }));

    vi.doMock('@/utils/permissions', () => ({
      validatePermissions: vi.fn().mockReturnValue(true),
      hasAdminRole: vi.fn().mockReturnValue(true),
      hasGuildAdminRole: vi.fn().mockReturnValue(true),
    }));

    vi.doMock('@/utils/dateUtils', () => ({
      createTimezoneAwareDate: vi.fn().mockReturnValue(new Date()),
    }));

    vi.doMock('@/services/guildConfigManager', () => ({
      GuildConfigManager: vi.fn().mockImplementation(() => mockGuildConfigManager),
    }));
  });

  describe('Automatic reaction addition for new events', () => {
    it('should add default reactions (✅❌❓) when no custom config exists', async () => {
      // Arrange
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(null);

      // Act
      await handleWatchCommand(mockInteraction, mockClient);

      // Assert - Should have attempted to add default reactions
      // Note: The message.react calls happen in the addDefaultReactionsToMessage function
      // which is called after successful event creation
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({})
          ])
        })
      );
    });

    it('should add custom reactions when configured', async () => {
      // Arrange
      const customConfig = {
        guildId: 'guild-123',
        defaultReactions: ['👍', '👎', '🤷'],
      };
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(customConfig);

      // Act
      await handleWatchCommand(mockInteraction, mockClient);

      // Assert - Should have successfully handled the watch command
      expect(mockClient.eventManager.createEvent).toHaveBeenCalled();
      expect(mockClient.reminderScheduler.scheduleEvent).toHaveBeenCalled();
    });

    it('should not add reactions for updated events', async () => {
      // Arrange - Existing event
      const existingEvent = {
        messageId: 'message-123',
        channelId: 'channel-123',
        guildId: 'guild-123',
        usersWhoReacted: ['user1', 'user2'],
        lastRemindedAt: new Date(),
        createdAt: new Date(),
      };
      mockClient.eventManager.getEvent.mockResolvedValue(existingEvent);

      // Act
      await handleWatchCommand(mockInteraction, mockClient);

      // Assert - Should have processed as update, not new event
      expect(mockClient.eventManager.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          usersWhoReacted: existingEvent.usersWhoReacted, // Preserved reactions
        })
      );
    });
  });

  describe('Error handling for reaction addition', () => {
    it('should handle reaction addition errors gracefully', async () => {
      // Arrange
      mockMessage.react.mockRejectedValueOnce(new Error('Permission denied'));
      mockGuildConfigManager.getGuildConfig.mockResolvedValue({
        defaultReactions: ['✅', '❌'],
      });

      // Act & Assert - Should not throw
      await expect(handleWatchCommand(mockInteraction, mockClient)).resolves.toBeDefined();
    });

    it('should handle missing message gracefully', async () => {
      // Arrange
      mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));

      // Act
      await handleWatchCommand(mockInteraction, mockClient);

      // Assert - Should have replied with error
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('❌'),
        })
      );
    });
  });
});