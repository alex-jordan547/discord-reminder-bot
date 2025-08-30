/**
 * Tests for custom reactions functionality (Issue #48)
 * 
 * Bug: When changing reaction type via /config set, it's saved in DB but 
 * reminders still show default reactions (✅❓❌)
 * 
 * Expected behavior:
 * 1. Config changes should be immediately reflected in reminder messages
 * 2. Reminder messages should describe the new reaction types chosen
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { Client, EmbedBuilder, TextChannel, Message, Guild } from 'discord.js';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { GuildConfigManager } from '@/services/guildConfigManager';
import { EventManager } from '@/services/eventManager';
import { Event as EventModel } from '@/models';
import { GuildConfig } from '@/models/GuildConfig';

// Mock Discord.js
vi.mock('discord.js', () => ({
  Client: vi.fn(),
  EmbedBuilder: vi.fn(() => ({
    setTitle: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    addFields: vi.fn().mockReturnThis(),
    setFooter: vi.fn().mockReturnThis(),
    setTimestamp: vi.fn().mockReturnThis(),
  })),
  TextChannel: vi.fn(),
  Message: vi.fn(),
  Guild: vi.fn(),
}));

// Mock internal services
vi.mock('@/services/guildConfigManager');
vi.mock('@/services/eventManager');
vi.mock('@/utils/loggingConfig', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Custom Reactions Configuration (Issue #48)', () => {
  let reminderScheduler: ReminderScheduler;
  let mockClient: any;
  let mockGuildConfigManager: any;
  let mockEventManager: any;
  let mockChannel: any;
  let mockMessage: any;
  let mockGuild: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock client
    mockClient = {
      channels: {
        fetch: vi.fn(),
      },
      user: {
        id: 'bot-id',
      },
    };

    // Setup mock channel
    mockChannel = {
      id: 'channel-123',
      permissionsFor: vi.fn().mockReturnValue({
        has: vi.fn().mockReturnValue(true),
      }),
      messages: {
        fetch: vi.fn(),
      },
      send: vi.fn().mockResolvedValue({ id: 'reminder-message-id' }),
      guild: {
        members: {
          fetch: vi.fn().mockResolvedValue(new Map()),
        },
      },
    };

    // Setup mock message
    mockMessage = {
      id: 'message-123',
      reactions: {
        cache: new Map(),
      },
    };

    // Setup mock guild
    mockGuild = {
      id: 'guild-123',
      members: {
        fetch: vi.fn().mockResolvedValue(new Map()),
      },
    };

    // Setup mock managers
    mockGuildConfigManager = {
      getGuildConfig: vi.fn(),
    };

    mockEventManager = {
      getEvent: vi.fn(),
      removeEvent: vi.fn(),
    };

    // Setup mocks returns
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    mockChannel.messages.fetch.mockResolvedValue(mockMessage);

    reminderScheduler = new ReminderScheduler(mockClient, mockEventManager);
    // Inject the mock guild config manager directly
    (reminderScheduler as any).guildConfigManager = mockGuildConfigManager;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Reminder message content with custom reactions', () => {
    it('should use default reactions (✅❌❓) when no custom config exists', async () => {
      // Arrange
      const event = createMockEvent();
      const defaultGuildConfig = createMockGuildConfig();
      
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(defaultGuildConfig);

      // Act
      await (reminderScheduler as any).sendReminder(event);

      // Assert
      expect(EmbedBuilder).toHaveBeenCalled();
      const embedInstance = (EmbedBuilder as Mock).mock.results[0].value;
      expect(embedInstance.setDescription).toHaveBeenCalledWith(
        expect.stringContaining('Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)')
      );
    });

    it('should use custom reactions when configured via /config set', async () => {
      // Arrange
      const event = createMockEvent();
      const customGuildConfig = createMockGuildConfig({
        defaultReactions: ['👍', '👎', '🤔', '❤️']
      });
      
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(customGuildConfig);

      // Act
      await (reminderScheduler as any).sendReminder(event);

      // Assert
      expect(EmbedBuilder).toHaveBeenCalled();
      const embedInstance = (EmbedBuilder as Mock).mock.results[0].value;
      expect(embedInstance.setDescription).toHaveBeenCalledWith(
        expect.stringContaining('Réagissez avec 👍 👎 🤔 ❤️')
      );
    });

    it('should describe custom reaction meanings when available', async () => {
      // Arrange
      const event = createMockEvent();
      const customGuildConfig = createMockGuildConfig({
        defaultReactions: ['👍', '👎', '🤷'],
        reactionDescriptions: {
          '👍': 'J\'aime',
          '👎': 'J\'aime pas',
          '🤷': 'Indifférent'
        }
      });
      
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(customGuildConfig);

      // Act
      await (reminderScheduler as any).sendReminder(event);

      // Assert
      expect(EmbedBuilder).toHaveBeenCalled();
      const embedInstance = (EmbedBuilder as Mock).mock.results[0].value;
      expect(embedInstance.setDescription).toHaveBeenCalledWith(
        expect.stringContaining('Réagissez avec 👍 (J\'aime), 👎 (J\'aime pas) ou 🤷 (Indifférent)')
      );
    });

    it('should immediately reflect config changes without bot restart', async () => {
      // Arrange
      const event = createMockEvent();
      
      // Initially default config
      const defaultConfig = createMockGuildConfig();
      mockGuildConfigManager.getGuildConfig.mockResolvedValueOnce(defaultConfig);

      // First reminder with default reactions
      await (reminderScheduler as any).sendReminder(event);

      // Config updated to custom reactions
      const updatedConfig = createMockGuildConfig({
        defaultReactions: ['🟢', '🔴', '🟡']
      });
      mockGuildConfigManager.getGuildConfig.mockResolvedValueOnce(updatedConfig);

      // Reset mock calls
      vi.clearAllMocks();
      (EmbedBuilder as Mock).mockImplementation(() => ({
        setTitle: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        setColor: vi.fn().mockReturnThis(),
        addFields: vi.fn().mockReturnThis(),
        setFooter: vi.fn().mockReturnThis(),
        setTimestamp: vi.fn().mockReturnThis(),
      }));

      // Act - Second reminder should use new config
      await (reminderScheduler as any).sendReminder(event);

      // Assert
      expect(EmbedBuilder).toHaveBeenCalled();
      const embedInstance = (EmbedBuilder as Mock).mock.results[0].value;
      expect(embedInstance.setDescription).toHaveBeenCalledWith(
        expect.stringContaining('Réagissez avec 🟢 🔴 🟡')
      );
    });

    it('should handle preset reaction configurations correctly', async () => {
      // Arrange
      const event = createMockEvent();
      
      // Test "Événement Gaming" preset
      const gamingConfig = createMockGuildConfig({
        defaultReactions: ['🎮', '⏰', '❌'],
        reactionDescriptions: {
          '🎮': 'Partant',
          '⏰': 'En retard',
          '❌': 'Absent'
        }
      });
      
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(gamingConfig);

      // Act
      await (reminderScheduler as any).sendReminder(event);

      // Assert
      expect(EmbedBuilder).toHaveBeenCalled();
      const embedInstance = (EmbedBuilder as Mock).mock.results[0].value;
      expect(embedInstance.setDescription).toHaveBeenCalledWith(
        expect.stringContaining('Réagissez avec 🎮 (Partant), ⏰ (En retard) ou ❌ (Absent)')
      );
    });
  });

  describe('Config persistence and retrieval', () => {
    it('should retrieve the latest guild config for each reminder', async () => {
      // Arrange
      const event = createMockEvent();
      const guildConfig = createMockGuildConfig();
      
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(guildConfig);

      // Act
      await (reminderScheduler as any).sendReminder(event);

      // Assert
      expect(mockGuildConfigManager.getGuildConfig).toHaveBeenCalledWith(event.guildId);
      expect(mockGuildConfigManager.getGuildConfig).toHaveBeenCalledTimes(1);
    });

    it('should handle missing guild config gracefully', async () => {
      // Arrange
      const event = createMockEvent();
      
      mockGuildConfigManager.getGuildConfig.mockResolvedValue(null);

      // Act & Assert - Should not throw error
      await expect((reminderScheduler as any).sendReminder(event)).resolves.toBeDefined();
    });
  });
});

// Helper functions
function createMockEvent(): EventModel {
  return {
    messageId: 'message-123',
    channelId: 'channel-123',
    guildId: 'guild-123',
    title: 'Test Event',
    intervalMinutes: 1440,
    usersWhoReacted: [],
    lastRemindedAt: null,
    isPaused: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    getReactionCount: () => 0,
  } as EventModel;
}

function createMockGuildConfig(overrides: Partial<any> = {}): GuildConfig {
  return {
    guildId: 'guild-123',
    defaultReactions: ['✅', '❌', '❓'],
    maxMentions: 50,
    autoDeleteEnabled: false,
    autoDeleteDelayHours: 24,
    ...overrides
  } as GuildConfig;
}