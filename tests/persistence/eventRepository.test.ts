/**
 * Tests for EventRepository with Drizzle ORM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventRepository } from '@/persistence/database.js';
import { setupTestDatabase, clearTestData, createTestData } from '../db/testSetup.js';
import * as schema from '@/db/schema.js';
import { db } from '@/db/index.js';

describe('EventRepository', () => {
  let eventRepo: EventRepository;
  let testDrizzle: any;

  beforeEach(async () => {
    const { testDrizzle: testDb } = await setupTestDatabase();
    testDrizzle = testDb;
    await clearTestData();

    // Create test repository and mock the database connection
    eventRepo = new EventRepository();
    vi.spyOn(db, 'getDb').mockResolvedValue(testDrizzle);
  });

  describe('getByGuild', () => {
    it('should return all events for a guild', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData1 = createTestData.event({ title: 'Event 1' });
      const eventData2 = createTestData.event({
        messageId: '999888777',
        title: 'Event 2',
      });

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values([eventData1, eventData2]);

      // Act
      const events = await eventRepo.getByGuild(guildData.guildId);

      // Assert
      expect(events).toHaveLength(2);
      expect(events.find(e => e.title === 'Event 1')).toBeDefined();
      expect(events.find(e => e.title === 'Event 2')).toBeDefined();
    });

    it('should return empty array for guild with no events', async () => {
      // Act
      const events = await eventRepo.getByGuild('nonexistent-guild');

      // Assert
      expect(events).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      vi.spyOn(db, 'getDb').mockRejectedValueOnce(new Error('Database connection failed'));

      // Act & Assert
      await expect(eventRepo.getByGuild('test-guild')).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('getByMessageId', () => {
    it('should return event by message ID', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData = createTestData.event();

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values(eventData);

      // Act
      const event = await eventRepo.getByMessageId(eventData.messageId);

      // Assert
      expect(event).toBeDefined();
      expect(event?.title).toBe(eventData.title);
      expect(event?.messageId).toBe(eventData.messageId);
    });

    it('should return undefined for non-existent message ID', async () => {
      // Act
      const event = await eventRepo.getByMessageId('nonexistent-message');

      // Assert
      expect(event).toBeUndefined();
    });
  });

  describe('getDueForReminder', () => {
    it('should return events that are not paused and have no reminder sent', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData1 = createTestData.event({
        isPaused: false,
        lastRemindedAt: null,
      });
      const eventData2 = createTestData.event({
        messageId: '999888777',
        isPaused: true,
        lastRemindedAt: null,
      });

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values([eventData1, eventData2]);

      // Act
      const events = await eventRepo.getDueForReminder();

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].messageId).toBe(eventData1.messageId);
      expect(events[0].isPaused).toBe(false);
    });
  });

  describe('create', () => {
    it('should create a new event', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData = createTestData.event();

      await testDrizzle.insert(schema.guilds).values(guildData);

      // Act
      const createdEvent = await eventRepo.create(eventData);

      // Assert
      expect(createdEvent).toBeDefined();
      expect(createdEvent.title).toBe(eventData.title);
      expect(createdEvent.messageId).toBe(eventData.messageId);
    });

    it('should throw error if event creation fails', async () => {
      // Arrange - Force database error by mocking insert to fail
      const eventData = createTestData.event();
      vi.spyOn(testDrizzle, 'insert').mockImplementation(() => {
        throw new Error('Database insert failed');
      });

      // Act & Assert
      await expect(eventRepo.create(eventData)).rejects.toThrow('Database insert failed');
    });
  });

  describe('update', () => {
    it('should update an existing event', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData = createTestData.event();
      const updates = { title: 'Updated Event Title', isPaused: true };

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values(eventData);

      // Act
      const updatedEvent = await eventRepo.update(eventData.messageId, updates);

      // Assert
      expect(updatedEvent.title).toBe(updates.title);
      expect(updatedEvent.isPaused).toBe(updates.isPaused);
    });

    it('should throw error if event does not exist', async () => {
      // Act & Assert
      await expect(eventRepo.update('nonexistent-message', { title: 'New Title' })).rejects.toThrow(
        'Event not found after update',
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing event', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData = createTestData.event();

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values(eventData);

      // Act
      await eventRepo.delete(eventData.messageId);

      // Assert
      const deletedEvent = await eventRepo.getByMessageId(eventData.messageId);
      expect(deletedEvent).toBeUndefined();
    });
  });

  describe('updateUsersWhoReacted', () => {
    it('should update users who reacted to an event', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData = createTestData.event();
      const userIds = ['user1', 'user2', 'user3'];

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values(eventData);

      // Act
      await eventRepo.updateUsersWhoReacted(eventData.messageId, userIds);

      // Assert
      const updatedEvent = await eventRepo.getByMessageId(eventData.messageId);
      expect(updatedEvent?.usersWhoReacted).toBe(JSON.stringify(userIds));
    });
  });

  describe('markAsReminded', () => {
    it('should mark event as reminded with current timestamp', async () => {
      // Arrange
      const guildData = createTestData.guild();
      const eventData = createTestData.event({ lastRemindedAt: null });

      await testDrizzle.insert(schema.guilds).values(guildData);
      await testDrizzle.insert(schema.events).values(eventData);

      // Act
      await eventRepo.markAsReminded(eventData.messageId);

      // Assert
      const updatedEvent = await eventRepo.getByMessageId(eventData.messageId);
      expect(updatedEvent?.lastRemindedAt).not.toBeNull();
      expect(updatedEvent?.lastRemindedAt).toBeInstanceOf(Date);
    });
  });
});
