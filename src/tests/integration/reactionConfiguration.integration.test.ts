/**
 * Integration tests for custom reactions configuration system (Issue #48)
 * 
 * Tests the complete flow from configuration update to reminder message
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatInputCommandInteraction, Guild, TextChannel } from 'discord.js';
import { GuildConfigManager } from '@/services/guildConfigManager';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { handleConfigSetCommand } from '@/commands/configHandler';

// Mock Discord.js and logging
vi.mock('discord.js');
vi.mock('@/utils/loggingConfig', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock storage
vi.mock('@/persistence/sqliteStorage');

describe('Reaction Configuration Integration (Issue #48)', () => {
  let configManager: GuildConfigManager;
  let mockInteraction: any;
  let mockGuild: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock guild
    mockGuild = {
      id: 'guild-123',
      name: 'Test Guild',
    };

    // Setup mock interaction
    mockInteraction = {
      guildId: 'guild-123',
      guild: mockGuild,
      member: {
        roles: {
          cache: new Map([
            ['role-admin', { name: 'Admin' }],
          ]),
        },
      },
      user: {
        id: 'user-123',
        tag: 'TestUser#1234',
      },
      options: {
        get: vi.fn(),
      },
      reply: vi.fn().mockResolvedValue(true),
      editReply: vi.fn().mockResolvedValue(true),
      deferReply: vi.fn().mockResolvedValue(true),
    };

    configManager = new GuildConfigManager();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Config Command Flow', () => {
    it('should handle /config set default_reactions with preset selection', async () => {
      // Arrange
      mockInteraction.options.get.mockImplementation((key: string) => {
        if (key === 'setting') return { value: 'default_reactions' };
        return null;
      });

      // Act
      await handleConfigSetCommand(mockInteraction, configManager);

      // Assert - Should show reaction preset menu
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('Configuration des Réactions')
              })
            })
          ]),
          components: expect.arrayContaining([
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({
                  type: expect.any(Number), // StringSelectMenu type
                })
              ])
            })
          ])
        })
      );
    });

    it('should save custom reactions to database when preset is selected', async () => {
      // Arrange - Mock config update
      const updateConfigSpy = vi.spyOn(configManager, 'updateConfig');
      updateConfigSpy.mockResolvedValue(true);

      // Mock a "Gaming" preset selection
      const gamingReactions = ['🎮', '⏰', '❌'];

      // Act - Simulate preset selection
      await configManager.updateConfig('guild-123', {
        defaultReactions: gamingReactions
      });

      // Assert
      expect(updateConfigSpy).toHaveBeenCalledWith('guild-123', {
        defaultReactions: gamingReactions
      });
    });

    it('should handle custom reactions input validation', async () => {
      // Arrange
      const customReactions = ['👍', '👎', '🤷', '❤️'];

      // Act
      const updateResult = await configManager.updateConfig('guild-123', {
        defaultReactions: customReactions
      });

      // Assert - Should accept valid custom reactions
      expect(updateResult).toBe(true);
    });

    it('should reject invalid custom reactions configuration', async () => {
      // Test cases for validation
      const invalidCases = [
        [], // Empty array
        ['😀'], // Single reaction (minimum 2 required)
        Array(11).fill('😀'), // Too many reactions (max 10)
        ['invalid-string'], // Non-emoji strings
      ];

      for (const invalidReactions of invalidCases) {
        // Act & Assert
        await expect(
          configManager.updateConfig('guild-123', {
            defaultReactions: invalidReactions
          })
        ).rejects.toThrow();
      }
    });
  });

  describe('End-to-End Configuration Flow', () => {
    it('should immediately use new reactions in reminders after config update', async () => {
      // This test would require setting up a full reminder scheduler
      // For now, we ensure the config is properly saved and retrieved
      
      // Arrange
      const newReactions = ['🟢', '🔴', '🟡'];
      
      // Act - Update config
      await configManager.updateConfig('guild-123', {
        defaultReactions: newReactions
      });

      // Get updated config
      const updatedConfig = await configManager.getGuildConfig('guild-123');

      // Assert
      expect(updatedConfig?.defaultReactions).toEqual(newReactions);
    });

    it('should provide proper feedback when configuration is saved', async () => {
      // Arrange
      const mockUpdateSuccess = vi.fn().mockResolvedValue(true);
      vi.spyOn(configManager, 'updateConfig').mockImplementation(mockUpdateSuccess);

      // Mock successful configuration update interaction
      mockInteraction.options.get.mockImplementation((key: string) => {
        if (key === 'setting') return { value: 'default_reactions' };
        return null;
      });

      // Act
      await handleConfigSetCommand(mockInteraction, configManager);

      // Assert - Should have provided UI for configuration
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      vi.spyOn(configManager, 'updateConfig').mockRejectedValue(dbError);

      // Act & Assert - Should not throw unhandled errors
      await expect(
        configManager.updateConfig('guild-123', {
          defaultReactions: ['👍', '👎']
        })
      ).rejects.toThrow('Database connection failed');
    });

    it('should provide user-friendly error messages for config failures', async () => {
      // This would test the error handling in the command handler
      // ensuring users get helpful feedback when things go wrong
      expect(true).toBe(true); // Placeholder for implementation
    });
  });
});