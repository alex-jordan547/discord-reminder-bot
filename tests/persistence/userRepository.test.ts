/**
 * Tests for UserRepository with Drizzle ORM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository } from '@/persistence/database.js';
import { setupTestDatabase, clearTestData, createTestData } from '../db/testSetup.js';
import * as schema from '@/db/schema.js';
import { db } from '@/db/index.js';

describe('UserRepository', () => {
  let userRepo: UserRepository;
  let testDrizzle: any;

  beforeEach(async () => {
    const { testDrizzle: testDb } = await setupTestDatabase();
    testDrizzle = testDb;
    await clearTestData();

    userRepo = new UserRepository();
    vi.spyOn(db, 'getDb').mockResolvedValue(testDrizzle);
  });

  describe('getByGuild', () => {
    it('should return all users for a guild', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const userData1 = createTestData.user({ username: 'User1' });
      const userData2 = createTestData.user({
        userId: '777888999',
        username: 'User2',
      });

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.users).values([userData1, userData2]);

      // Act
      const users = await userRepo.getByGuild(guildData.guildId);

      // Assert
      expect(users).toHaveLength(2);
      expect(users.find(u => u.username === 'User1')).toBeDefined();
      expect(users.find(u => u.username === 'User2')).toBeDefined();
    });

    it('should return empty array for guild with no users', async () => {
      // Act
      const users = await userRepo.getByGuild('nonexistent-guild');

      // Assert
      expect(users).toHaveLength(0);
    });
  });

  describe('getByUserAndGuild', () => {
    it('should return user by userId and guildId', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const userData = createTestData.user();

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.users).values(userData);

      // Act
      const user = await userRepo.getByUserAndGuild(userData.userId, userData.guildId);

      // Assert
      expect(user).toBeDefined();
      expect(user?.username).toBe(userData.username);
      expect(user?.userId).toBe(userData.userId);
      expect(user?.guildId).toBe(userData.guildId);
    });

    it('should return undefined for non-existent user', async () => {
      // Act
      const user = await userRepo.getByUserAndGuild('nonexistent-user', 'nonexistent-guild');

      // Assert
      expect(user).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('should create new user when user does not exist', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const userData = createTestData.user();

      await testDrizzle.insert(schema.guilds).values(guildData);

      // Act
      const upsertedUser = await userRepo.upsert(userData);

      // Assert
      expect(upsertedUser).toBeDefined();
      expect(upsertedUser.username).toBe(userData.username);
      expect(upsertedUser.userId).toBe(userData.userId);
    });

    it('should update existing user when user exists', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const userData = createTestData.user({ username: 'OriginalName' });
      const updatedUserData = { ...userData, username: 'UpdatedName' };

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.users).values(userData);

      // Act
      const upsertedUser = await userRepo.upsert(updatedUserData);

      // Assert
      expect(upsertedUser.username).toBe('UpdatedName');
      expect(upsertedUser.userId).toBe(userData.userId);

      // Verify only one user exists
      const allUsers = await userRepo.getByGuild(guildData.guildId);
      expect(allUsers).toHaveLength(1);
    });

    it('should throw error if upsert fails', async () => {
      // Arrange
      const userData = createTestData.user();
      vi.spyOn(userRepo, 'getByUserAndGuild').mockResolvedValueOnce(undefined);

      // Mock the insert chain properly
      const mockValues = vi.fn().mockRejectedValueOnce(new Error('Insert failed'));
      const mockInsert = vi.fn().mockReturnValueOnce({ values: mockValues });
      vi.spyOn(testDrizzle, 'insert').mockReturnValueOnce(mockInsert(testDrizzle.users));

      // Act & Assert
      await expect(userRepo.upsert(userData)).rejects.toThrow();
    });
  });

  describe('updateLastSeen', () => {
    it('should update lastSeen timestamp for existing user', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const userData = createTestData.user({
        lastSeen: new Date('2023-01-01T00:00:00.000Z'), // Set a specific old timestamp
      });

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.users).values(userData);

      // Get the original user to verify the initial timestamp
      const originalUser = await userRepo.getByUserAndGuild(userData.userId, userData.guildId);
      const originalTimestamp = originalUser?.lastSeen.getTime();
      expect(originalTimestamp).toBe(new Date('2023-01-01T00:00:00.000Z').getTime());

      // Act - Update the lastSeen timestamp
      await userRepo.updateLastSeen(userData.userId, userData.guildId);

      // Assert - Verify the timestamp was actually updated
      const updatedUser = await userRepo.getByUserAndGuild(userData.userId, userData.guildId);
      expect(updatedUser?.lastSeen).toBeInstanceOf(Date);
      expect(updatedUser?.lastSeen.getTime()).toBeGreaterThan(originalTimestamp!);

      // Verify other fields remain unchanged
      expect(updatedUser?.userId).toBe(userData.userId);
      expect(updatedUser?.guildId).toBe(userData.guildId);
      expect(updatedUser?.username).toBe(userData.username);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      vi.spyOn(db, 'getDb').mockRejectedValueOnce(new Error('Database error'));

      // Act & Assert
      await expect(userRepo.updateLastSeen('user1', 'guild1')).rejects.toThrow('Database error');
    });
  });
});
