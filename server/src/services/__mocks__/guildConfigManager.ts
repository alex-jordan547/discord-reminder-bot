import { vi } from 'vitest';
import { GuildConfig } from '../../models/GuildConfig.js';

export class GuildConfigManager {
  private store: Map<string, any> = new Map();

  constructor() {}

  async initialize(): Promise<void> {
    return;
  }

  async getGuildConfig(guildId: string): Promise<any> {
    if (this.store.has(guildId)) {
      return this.store.get(guildId);
    }
    const cfg = GuildConfig.createDefault(guildId, `Guild ${guildId}`);
    this.store.set(guildId, cfg);
    return cfg;
  }

  async saveGuildConfig(config: any): Promise<boolean> {
    this.store.set(config.guildId, config);
    return true;
  }

  async updateGuildConfig(guildId: string, updates: any): Promise<boolean> {
    const existing =
      (await this.getGuildConfig(guildId)) ||
      GuildConfig.createDefault(guildId, `Guild ${guildId}`);
    existing.updateConfig(updates);
    this.store.set(guildId, existing);
    return true;
  }

  // Alias expected by tests
  async updateConfig(guildId: string, updates: any): Promise<boolean> {
    // Basic validation: defaultReactions must be array length 2-10 if provided
    if (updates.defaultReactions !== undefined) {
      if (
        !Array.isArray(updates.defaultReactions) ||
        updates.defaultReactions.length < 2 ||
        updates.defaultReactions.length > 10
      ) {
        throw new Error('Invalid reactions');
      }
    }
    return this.updateGuildConfig(guildId, updates);
  }
}
