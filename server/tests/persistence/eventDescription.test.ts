/**
 * Test for Event description field handling fix
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteStorage } from '#/persistence/sqliteStorage';
import { Event } from '#/models';

describe('Event Description Field Handling', () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    // Create in-memory database for testing
    storage = new SqliteStorage();
    await storage.initialize();
  });

  it('should handle undefined description when saving and retrieving events', async () => {
    // Create an event with undefined description
    const eventData = {
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '555666777888999000',
      title: 'Test Event',
      description: undefined, // Change from null to undefined
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      usersWhoReacted: ['123456789012345678', '987654321098765432'], // Valid Discord IDs
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const event = new Event(eventData);

    // Check validation errors
    const errors = event.validate();
    expect(errors).toHaveLength(0);

    // Save the event
    const saveResult = await storage.saveEvent(event);
    expect(saveResult.success).toBe(true);

    // Check what's actually stored in the database
    const row = await (storage as any).db.get('SELECT * FROM events WHERE message_id = ?', [
      eventData.messageId,
    ]);
    expect(row.description).toBeNull();

    // Retrieve the event
    const retrievedEvent = await storage.getEvent(eventData.messageId);
    expect(retrievedEvent).toBeDefined();

    // Check that the retrieved event is valid
    expect(retrievedEvent!.isValid()).toBe(true);
    expect(retrievedEvent!.messageId).toBe(eventData.messageId);
    expect(retrievedEvent!.title).toBe(eventData.title);
    expect(retrievedEvent!.description).toBeUndefined();
  });

  it('should handle null description from database correctly', async () => {
    // Create an event with undefined description
    const eventData = {
      messageId: '111111111111111111',
      channelId: '222222222222222222',
      guildId: '333333333333333333',
      title: 'Test Event 2',
      description: undefined,
      intervalMinutes: 30,
      isPaused: true,
      lastReminder: new Date(),
      usersWhoReacted: ['444444444444444444', '555555555555555555'], // Valid Discord IDs
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const event = new Event(eventData);

    // Check validation errors
    const errors = event.validate();
    expect(errors).toHaveLength(0);

    // Save the event
    const saveResult = await storage.saveEvent(event);
    expect(saveResult.success).toBe(true);

    // Check what's actually stored in the database
    const row = await (storage as any).db.get('SELECT * FROM events WHERE message_id = ?', [
      eventData.messageId,
    ]);
    expect(row.description).toBeNull();

    // Simulate the issue where description is null
    row.description = null;

    // Parse the row using Event.fromDict (this should handle null correctly now)
    const parsedEvent = Event.fromDict(row);

    // Check that the parsed event is valid
    expect(parsedEvent.isValid()).toBe(true);
    expect(parsedEvent.description).toBeUndefined();
  });

  it('should handle string description correctly', async () => {
    // Create an event with a string description
    const eventData = {
      messageId: '999999999999999999',
      channelId: '888888888888888888',
      guildId: '777777777777777777',
      title: 'Test Event 3',
      description: 'This is a test description',
      intervalMinutes: 45,
      isPaused: false,
      lastReminder: new Date(),
      usersWhoReacted: ['666666666666666666', '555555555555555555'], // Valid Discord IDs
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const event = new Event(eventData);

    // Check validation errors
    const errors = event.validate();
    expect(errors).toHaveLength(0);

    // Save the event
    const saveResult = await storage.saveEvent(event);
    expect(saveResult.success).toBe(true);

    // Retrieve the event
    const retrievedEvent = await storage.getEvent(eventData.messageId);
    expect(retrievedEvent).toBeDefined();
    expect(retrievedEvent!.isValid()).toBe(true);
    expect(retrievedEvent!.messageId).toBe(eventData.messageId);
    expect(retrievedEvent!.title).toBe(eventData.title);
    expect(retrievedEvent!.description).toBe(eventData.description);
  });

  // Simple test to isolate the problem
  it('should handle null description in EventData constructor', () => {
    const eventData = {
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '555666777888999000',
      title: 'Test Event',
      description: null, // This is what we get from the database
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      usersWhoReacted: ['123456789012345678', '987654321098765432'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const event = new Event(eventData);

    expect(event.isValid()).toBe(true);
    expect(event.description).toBeUndefined();
  });

  // Even simpler test
  it('should handle null description with individual parameters', () => {
    const event = new Event(
      '123456789012345678',
      '987654321098765432',
      '555666777888999000',
      'Test Event',
      60,
      new Date(),
      false,
      ['123456789012345678', '987654321098765432'],
      new Date(),
      new Date(),
    );

    expect(event.isValid()).toBe(true);
    expect(event.description).toBeUndefined();
  });
});
