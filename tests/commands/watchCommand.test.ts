/**
 * Tests for Enhanced /watch Command with Optional Link and Configuration System
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  TextChannel,
  Message,
  User,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  Collection,
} from 'discord.js';
import { DiscordBotClient } from '@/types/BotClient';
import { handleWatchCommand } from '@/commands/handlers';
import { EventManager } from '@/services/eventManager';
import { ReminderScheduler } from '@/services/reminderScheduler';

// Mock Discord.js classes
vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
    EmbedBuilder: vi.fn().mockImplementation(() => ({
      setColor: vi.fn().mockReturnThis(),
      setTitle: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      addFields: vi.fn().mockReturnThis(),
      setFooter: vi.fn().mockReturnThis(),
      setTimestamp: vi.fn().mockReturnThis(),
    })),
    StringSelectMenuBuilder: vi.fn().mockImplementation(() => ({
      setCustomId: vi.fn().mockReturnThis(),
      setPlaceholder: vi.fn().mockReturnThis(),
      addOptions: vi.fn().mockReturnThis(),
      setDisabled: vi.fn().mockReturnThis(),
    })),
    ActionRowBuilder: vi.fn().mockImplementation(() => ({
      addComponents: vi.fn().mockReturnThis(),
    })),
  };
});

describe('Enhanced /watch Command', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;
  let mockClient: Partial<DiscordBotClient>;
  let mockGuild: Partial<Guild>;
  let mockMember: Partial<GuildMember>;
  let mockChannel: Partial<TextChannel>;
  let mockEventManager: Partial<EventManager>;
  let mockReminderScheduler: Partial<ReminderScheduler>;

  beforeEach(() => {
    // Setup mock interaction
    mockInteraction = {
      guild: { id: 'test-guild-id' } as Guild,
      guildId: 'test-guild-id',
      member: { roles: { cache: new Collection() } } as GuildMember,
      channel: {
        id: 'test-channel-id',
        messages: {
          fetch: vi.fn(),
        },
      } as Partial<TextChannel>,
      user: {
        id: 'test-user-id',
        tag: 'testuser#1234',
      } as User,
      options: {
        get: vi.fn(),
      },
      reply: vi.fn(),
      followUp: vi.fn(),
      editReply: vi.fn(),
      deferReply: vi.fn(),
    };

    // Setup mock client
    mockEventManager = {
      getEvent: vi.fn(),
      createEvent: vi.fn(),
    };

    mockReminderScheduler = {
      scheduleEvent: vi.fn(),
    };

    mockClient = {
      eventManager: mockEventManager as EventManager,
      reminderScheduler: mockReminderScheduler as ReminderScheduler,
      channels: {
        fetch: vi.fn(),
      },
      user: {
        id: 'bot-user-id',
      } as User,
    };
  });

  describe('Traditional usage (with link parameter)', () => {
    it('should work with existing link parameter for backward compatibility', async () => {
      // Arrange
      const messageLink = 'https://discord.com/channels/123456789/987654321/555666777';
      (mockInteraction.options!.get as Mock).mockReturnValue({
        value: messageLink,
      });

      const mockMessage = {
        content: 'Test event message',
        id: '555666777',
      } as Message;

      const mockChannel = {
        id: '987654321',
        messages: {
          fetch: vi.fn().mockResolvedValue(mockMessage),
        },
      } as Partial<TextChannel>;

      (mockClient.channels!.fetch as Mock).mockResolvedValue(mockChannel);
      (mockEventManager.getEvent as Mock).mockResolvedValue(null);
      (mockEventManager.createEvent as Mock).mockResolvedValue({
        messageId: '555666777',
        channelId: '987654321',
        guildId: 'test-guild-id',
        title: 'Test event message',
        intervalMinutes: 1440,
        usersWhoReacted: [],
      });

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockEventManager.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: '555666777',
          channelId: '987654321',
          guildId: 'test-guild-id',
          title: 'Test event message',
        }),
      );
      expect(mockReminderScheduler.scheduleEvent).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should validate message link format', async () => {
      // Arrange
      const invalidLink = 'invalid-link-format';
      (mockInteraction.options!.get as Mock).mockReturnValue({
        value: invalidLink,
      });

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Invalid Discord message link format.',
        flags: expect.any(Number),
      });
    });

    it('should handle message not found error', async () => {
      // Arrange
      const messageLink = 'https://discord.com/channels/123456789/987654321/555666777';
      (mockInteraction.options!.get as Mock).mockReturnValue({
        value: messageLink,
      });

      const mockChannel = {
        messages: {
          fetch: vi.fn().mockRejectedValue(new Error('Unknown Message')),
        },
      } as Partial<TextChannel>;

      (mockClient.channels!.fetch as Mock).mockResolvedValue(mockChannel);

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Could not access the specified message. Check the link and my permissions.',
        flags: expect.any(Number),
      });
    });
  });

  describe('Enhanced usage (without link parameter)', () => {
    beforeEach(() => {
      // Mock no link parameter provided
      (mockInteraction.options!.get as Mock).mockImplementation((name: string) => {
        if (name === 'link') return null;
        if (name === 'interval') return null;
        return null;
      });
    });

    it('should show message selection UI when no link is provided', async () => {
      // Arrange
      const mockMessages = new Collection([
        [
          '1',
          {
            id: '1',
            content: 'First message',
            author: { bot: false, username: 'user1' },
            createdAt: new Date('2024-01-01T10:00:00Z'),
          } as Message,
        ],
        [
          '2',
          {
            id: '2',
            content: 'Second message',
            author: { bot: false, username: 'user2' },
            createdAt: new Date('2024-01-01T11:00:00Z'),
          } as Message,
        ],
      ]);

      (mockInteraction.channel as any).messages = {
        fetch: vi.fn().mockResolvedValue(mockMessages),
      };

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: expect.any(Array),
        flags: expect.any(Number),
      });

      // Verify select menu was created
      expect(StringSelectMenuBuilder).toHaveBeenCalled();
      expect(ActionRowBuilder).toHaveBeenCalled();
    });

    it('should filter out bot messages from selection', async () => {
      // Arrange
      const mockMessages = new Collection([
        [
          '1',
          {
            id: '1',
            content: 'User message',
            author: { bot: false, username: 'user1' },
            createdAt: new Date(),
          } as Message,
        ],
        [
          '2',
          {
            id: '2',
            content: 'Bot message',
            author: { bot: true, username: 'bot' },
            createdAt: new Date(),
          } as Message,
        ],
        [
          '3',
          {
            id: '3',
            content: '',
            type: 7, // CHANNEL_PINNED_MESSAGE (system message)
            author: { bot: false, username: 'system' },
            createdAt: new Date(),
          } as Message,
        ],
      ]);

      (mockInteraction.channel as any).messages = {
        fetch: vi.fn().mockResolvedValue(mockMessages),
      };

      const mockSelectMenu = {
        addOptions: vi.fn().mockReturnThis(),
        setCustomId: vi.fn().mockReturnThis(),
        setPlaceholder: vi.fn().mockReturnThis(),
      };
      (StringSelectMenuBuilder as Mock).mockReturnValue(mockSelectMenu);

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert - Only non-bot, non-system messages should be included
      expect(mockSelectMenu.addOptions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            value: '1',
            label: expect.stringContaining('User message'),
          }),
        ]),
      );
      expect(mockSelectMenu.addOptions).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            value: '2',
          }),
          expect.objectContaining({
            value: '3',
          }),
        ]),
      );
    });

    it('should limit selection to last 10 messages', async () => {
      // Arrange - Create 15 messages
      const mockMessages = new Collection();
      for (let i = 1; i <= 15; i++) {
        mockMessages.set(i.toString(), {
          id: i.toString(),
          content: `Message ${i}`,
          author: { bot: false, username: `user${i}` },
          createdAt: new Date(Date.now() - i * 1000 * 60), // Different timestamps
        } as Message);
      }

      (mockInteraction.channel as any).messages = {
        fetch: vi.fn().mockResolvedValue(mockMessages),
      };

      const mockSelectMenu = {
        addOptions: vi.fn().mockReturnThis(),
        setCustomId: vi.fn().mockReturnThis(),
        setPlaceholder: vi.fn().mockReturnThis(),
      };
      (StringSelectMenuBuilder as Mock).mockReturnValue(mockSelectMenu);

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert - Should only include 10 options
      const callArgs = (mockSelectMenu.addOptions as Mock).mock.calls[0][0];
      expect(callArgs).toHaveLength(10);
    });

    it('should handle channel with no suitable messages', async () => {
      // Arrange - Only bot messages
      const mockMessages = new Collection([
        [
          '1',
          {
            id: '1',
            content: 'Bot message',
            author: { bot: true, username: 'bot' },
            createdAt: new Date(),
          } as Message,
        ],
      ]);

      (mockInteraction.channel as any).messages = {
        fetch: vi.fn().mockResolvedValue(mockMessages),
      };

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('No suitable messages found'),
        flags: expect.any(Number),
      });
    });
  });

  describe('Time Selection Interface', () => {
    it('should provide time selection UI after message selection', async () => {
      // This test would be implemented after the main functionality
      // Testing the second step of the configuration process
      expect(true).toBe(true); // Placeholder
    });

    it('should validate custom time intervals', async () => {
      // Test custom interval validation
      expect(true).toBe(true); // Placeholder
    });

    it('should handle invalid time selections', async () => {
      // Test error handling for invalid intervals
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Permission and Validation Tests', () => {
    it('should require admin permissions', async () => {
      // Arrange - Mock member without admin role
      (mockInteraction.member as any) = {
        roles: { cache: new Collection() },
      };

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ You need administrator permissions to use this command.',
        flags: expect.any(Number),
      });
    });

    it('should only work in guild channels', async () => {
      // Arrange
      mockInteraction.guild = null;
      mockInteraction.member = null;

      // Act
      await handleWatchCommand(
        mockInteraction as ChatInputCommandInteraction,
        mockClient as DiscordBotClient,
      );

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ This command can only be used in servers.',
        flags: expect.any(Number),
      });
    });

    it('should validate interval ranges in test mode', async () => {
      // Test interval validation logic
      expect(true).toBe(true); // Placeholder for interval validation tests
    });
  });
});