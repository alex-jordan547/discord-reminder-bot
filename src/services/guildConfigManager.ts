/**
 * Discord Reminder Bot - Guild Configuration Manager
 *
 * Manages per-server configurations with intelligent Discord API integration:
 * - Automatic discovery of channels and roles
 * - Configuration validation and defaults
 * - Smart caching and persistence
 * - Integration with Discord.js guild objects
 */

import { Client, TextChannel, ChannelType, PermissionFlagsBits } from 'discord.js';
import { createLogger } from '@/utils/loggingConfig';
import { SqliteStorage } from '@/persistence/sqliteStorage';
import { GuildConfig, type GuildConfigData } from '@/models';

const logger = createLogger('guild-config-manager');

export interface ChannelOption {
  id: string;
  name: string;
  type: string;
  position: number;
  canSend: boolean;
  isDefault?: boolean;
}

export interface RoleOption {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  isAdmin?: boolean;
  isDefault?: boolean;
}

/**
 * Guild Configuration Manager Service
 */
export class GuildConfigManager {
  private storage: SqliteStorage;
  private client: Client;
  private configCache = new Map<string, GuildConfig>();

  constructor(client: Client, storage: SqliteStorage) {
    this.client = client;
    this.storage = storage;
  }

  /**
   * Initialize the configuration manager
   */
  async initialize(): Promise<void> {
    logger.info('Guild Configuration Manager initialized');
  }

  /**
   * Get configuration for a guild (with caching)
   */
  async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
    // Check cache first
    if (this.configCache.has(guildId)) {
      const config = this.configCache.get(guildId)!;
      config.touch(); // Mark as recently used
      return config;
    }

    try {
      // Try to load from database
      const configData = await this.storage.getGuildConfig(guildId);

      if (configData) {
        const config = GuildConfig.fromJSON(configData);
        config.touch();
        this.configCache.set(guildId, config);

        // Touch in storage too
        await this.storage.touchGuildConfig(guildId);

        return config;
      }

      // Create default configuration if none exists
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        logger.warn(`Guild ${guildId} not found in client cache`);
        return null;
      }

      const defaultConfig = GuildConfig.createDefault(guildId, guild.name);
      await this.saveGuildConfig(defaultConfig);

      logger.info(`Created default configuration for guild ${guild.name} (${guildId})`);
      return defaultConfig;
    } catch (error) {
      logger.error(`Error getting guild config for ${guildId}: ${error}`);
      return null;
    }
  }

  /**
   * Save guild configuration
   */
  async saveGuildConfig(config: GuildConfig): Promise<boolean> {
    try {
      if (!config.isValid()) {
        logger.error(`Invalid guild configuration for ${config.guildId}`);
        return false;
      }

      logger.debug(`Attempting to save guild config for ${config.guildId}:`, config.toJSON());
      const result = await this.storage.saveGuildConfig(config.toJSON());

      if (result.success) {
        // Update cache
        this.configCache.set(config.guildId, config);
        logger.debug(`Guild configuration saved for ${config.guildName} (${config.guildId})`);
        return true;
      } else {
        logger.error(`Failed to save guild config: ${result.error}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error saving guild config:`, error);
      return false;
    }
  }

  /**
   * Update guild configuration with partial data
   */
  async updateGuildConfig(guildId: string, updates: Partial<GuildConfigData>): Promise<boolean> {
    try {
      const config = await this.getGuildConfig(guildId);
      if (!config) {
        logger.error(`Guild config not found for ${guildId}`);
        return false;
      }

      config.updateConfig(updates);
      return await this.saveGuildConfig(config);
    } catch (error) {
      logger.error(`Error updating guild config for ${guildId}:`, error);
      return false;
    }
  }

  /**
   * Delete guild configuration
   */
  async deleteGuildConfig(guildId: string): Promise<boolean> {
    try {
      const result = await this.storage.deleteGuildConfig(guildId);

      if (result.success) {
        this.configCache.delete(guildId);
        logger.info(`Guild configuration deleted for ${guildId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error deleting guild config for ${guildId}:`, error);
      return false;
    }
  }

  /**
   * Get all available text channels for a guild
   */
  async getGuildChannels(guildId: string): Promise<ChannelOption[]> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        logger.error(`Guild ${guildId} not found`);
        return [];
      }

      const botMember = guild.members.cache.get(this.client.user!.id);
      if (!botMember) {
        logger.error(`Bot member not found in guild ${guildId}`);
        return [];
      }

      const textChannels = guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildText)
        .map(channel => {
          const textChannel = channel as TextChannel;
          const permissions = textChannel.permissionsFor(botMember);

          return {
            id: textChannel.id,
            name: textChannel.name,
            type: 'text',
            position: textChannel.position,
            canSend:
              permissions?.has([
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel,
              ]) || false,
            isDefault: textChannel.id === guild.systemChannelId,
          };
        })
        .sort((a, b) => a.position - b.position);

      return Array.from(textChannels.values());
    } catch (error) {
      logger.error(`Error getting channels for guild ${guildId}:`, error);
      return [];
    }
  }

  /**
   * Get all available roles for a guild (filtering out managed roles)
   */
  async getGuildRoles(guildId: string): Promise<RoleOption[]> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        logger.error(`Guild ${guildId} not found`);
        return [];
      }

      logger.debug(`Getting roles for guild ${guild.name} (${guildId})`);
      logger.debug(`Total roles in cache: ${guild.roles.cache.size}`);

      const currentConfig = await this.getGuildConfig(guildId);

      // Log all roles for debugging
      guild.roles.cache.forEach(role => {
        logger.debug(
          `Role: ${role.name} (${role.id}) - managed: ${role.managed}, isEveryone: ${role.id === guild.id}, position: ${role.position}`,
        );
      });

      const roles = guild.roles.cache
        .filter(role => !role.managed && role.id !== guild.id) // Exclude @everyone and bot roles
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          managed: role.managed,
          isAdmin: role.permissions.has(PermissionFlagsBits.Administrator),
          isDefault: currentConfig?.adminRoleIds.includes(role.id) || false,
        }))
        .sort((a, b) => b.position - a.position); // Sort by position, highest first

      logger.debug(`Filtered roles count: ${roles.length}`);
      roles.forEach(role => {
        logger.debug(`Filtered role: ${role.name} - isAdmin: ${role.isAdmin}`);
      });

      return Array.from(roles.values());
    } catch (error) {
      logger.error(`Error getting roles for guild ${guildId}:`, error);
      return [];
    }
  }

  /**
   * Get suggested configuration based on guild analysis
   */
  async getSuggestedConfig(guildId: string): Promise<Partial<GuildConfigData>> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return {};
      }

      const channels = await this.getGuildChannels(guildId);
      const roles = await this.getGuildRoles(guildId);

      // Smart suggestions based on guild structure
      const suggestions: Partial<GuildConfigData> = {};

      // Channel suggestions
      const reminderChannel = channels.find(
        c =>
          c.name.includes('rappel') ||
          c.name.includes('reminder') ||
          c.name.includes('event') ||
          c.name.includes('annonce'),
      );

      if (reminderChannel && reminderChannel.canSend) {
        suggestions.reminderChannelId = reminderChannel.id;
        suggestions.reminderChannelName = reminderChannel.name;
      }

      // Role suggestions - prioritize admin roles
      const adminRoles = roles
        .filter(
          r =>
            r.isAdmin ||
            ['admin', 'moderateur', 'mod', 'coach', 'manager', 'staff'].some(keyword =>
              r.name.toLowerCase().includes(keyword),
            ),
        )
        .slice(0, 3); // Limit to 3 roles

      if (adminRoles.length > 0) {
        suggestions.adminRoleIds = adminRoles.map(r => r.id);
        suggestions.adminRoleNames = adminRoles.map(r => r.name);
      }

      // Smart defaults based on guild size
      const memberCount = guild.memberCount || 0;

      if (memberCount > 100) {
        suggestions.maxMentionsPerReminder = 30; // Smaller servers can handle more mentions
        suggestions.useEveryoneAboveLimit = true;
        suggestions.delayBetweenRemindersMs = 3000; // Longer delay for bigger servers
      } else if (memberCount > 50) {
        suggestions.maxMentionsPerReminder = 40;
        suggestions.delayBetweenRemindersMs = 2500;
      }

      // Default interval suggestions
      if (memberCount > 200) {
        suggestions.defaultIntervalMinutes = 120; // 2 hours for very active servers
      } else if (memberCount > 50) {
        suggestions.defaultIntervalMinutes = 90; // 1.5 hours for active servers
      }

      return suggestions;
    } catch (error) {
      logger.error(`Error getting suggested config for guild ${guildId}:`, error);
      return {};
    }
  }

  /**
   * Validate configuration values
   */
  validateConfig(updates: Partial<GuildConfigData>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (updates.defaultIntervalMinutes !== undefined) {
      if (updates.defaultIntervalMinutes < 1) {
        errors.push("L'intervalle par défaut doit être d'au moins 1 minute");
      } else if (updates.defaultIntervalMinutes > 10080) {
        errors.push("L'intervalle par défaut ne peut pas dépasser 1 semaine (10080 minutes)");
      }
    }

    if (updates.autoDeleteDelayMinutes !== undefined) {
      if (updates.autoDeleteDelayMinutes < 1) {
        errors.push("Le délai de suppression automatique doit être d'au moins 1 minute");
      } else if (updates.autoDeleteDelayMinutes > 10080) {
        errors.push('Le délai de suppression automatique ne peut pas dépasser 1 semaine');
      }
    }

    if (updates.maxMentionsPerReminder !== undefined) {
      if (updates.maxMentionsPerReminder < 0) {
        errors.push('Le nombre maximum de mentions ne peut pas être négatif');
      } else if (updates.maxMentionsPerReminder > 100) {
        errors.push('Le nombre maximum de mentions ne peut pas dépasser 100');
      }
    }

    if (updates.delayBetweenRemindersMs !== undefined) {
      if (updates.delayBetweenRemindersMs < 1000) {
        errors.push("Le délai entre rappels doit être d'au moins 1 seconde (1000ms)");
      } else if (updates.delayBetweenRemindersMs > 60000) {
        errors.push('Le délai entre rappels ne peut pas dépasser 1 minute (60000ms)');
      }
    }

    if (updates.defaultReactions !== undefined) {
      if (!Array.isArray(updates.defaultReactions)) {
        errors.push('Les réactions par défaut doivent être un tableau');
      } else if (updates.defaultReactions.length === 0) {
        errors.push('Au moins une réaction par défaut est requise');
      } else if (updates.defaultReactions.length > 10) {
        errors.push('Pas plus de 10 réactions par défaut autorisées');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear configuration cache (useful for testing)
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; guilds: string[] } {
    return {
      size: this.configCache.size,
      guilds: Array.from(this.configCache.keys()),
    };
  }
}
