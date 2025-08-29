import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GuildRepository } from '@/persistence/database';
import { setupTestDatabase, clearTestData, createTestData } from '../db/testSetup';
import * as schema from '@/db/schema.js';
import { db } from '@/db/index.js';

describe('GuildRepository', () => {
  let guildRepo: GuildRepository;
  let testDrizzle: any;

  beforeEach(async () => {
    const { testDrizzle: testDb } = await setupTestDatabase();
    testDrizzle = testDb;
    await clearTestData();

    guildRepo = new GuildRepository();
    vi.spyOn(db, 'getDb').mockResolvedValue(testDrizzle);
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe('getById', () => {
    it('should return guild if it exists', async () => {
      // Arrange
      const testGuild = createTestData.guild();
      await testDrizzle.insert(schema.guilds).values(testGuild);

      // Act
      const result = await guildRepo.getById(testGuild.guildId);

      // Assert
      expect(result).toBeDefined();
      expect(result?.guildId).toBe(testGuild.guildId);
      expect(result?.name).toBe(testGuild.name);
    });

    it('should return null if guild does not exist', async () => {
      // Act
      const result = await guildRepo.getById('nonexistent-guild');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('should create new guild', async () => {
      // Arrange
      const testGuild = createTestData.guild();

      // Act
      const result = await guildRepo.upsert(testGuild);

      // Assert
      expect(result).toBeDefined();
      expect(result.guildId).toBe(testGuild.guildId);
      expect(result.name).toBe(testGuild.name);
    });

    it('should update existing guild', async () => {
      // Arrange
      const testGuild = createTestData.guild();
      await testDrizzle.insert(schema.guilds).values(testGuild);

      const updatedGuild = { ...testGuild, guildName: 'Updated Guild Name' };

      // Act
      const result = await guildRepo.upsert(updatedGuild);

      // Assert
      expect(result).toBeDefined();
      expect(result?.guildName).toBe('Updated Guild Name');
    });
  });
});
