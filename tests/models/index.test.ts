/**
 * Integration tests for model exports and collections
 * 
 * Tests the model index exports and model collection functionality
 */

import { describe, test, expect } from 'vitest';
import { Event, Guild, User, Reaction, ReminderLog, ModelCollection, ValidationMixin } from '../../src/models/index.js';

describe('Model Index Exports', () => {
  test('should export all model classes', () => {
    expect(Event).toBeDefined();
    expect(Guild).toBeDefined();
    expect(User).toBeDefined();
    expect(Reaction).toBeDefined();
    expect(ReminderLog).toBeDefined();
  });

  test('should export utility classes', () => {
    expect(ModelCollection).toBeDefined();
  });

  test('should create model instances from exports', () => {
    const event = new Event({
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Test Event',
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      requiredReactions: ['✅'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(event).toBeInstanceOf(Event);
    expect(event.title).toBe('Test Event');
  });
});

describe('ModelCollection', () => {
  test('should manage collection of models with validation', () => {
    const collection = new ModelCollection<Event>();
    
    const event1 = new Event({
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Event 1',
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      requiredReactions: ['✅'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const event2 = new Event({
      messageId: '987654321098765432',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Event 2',
      intervalMinutes: 30,
      isPaused: true,
      lastReminder: new Date(),
      requiredReactions: ['❌'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    collection.add(event1);
    collection.add(event2);

    expect(collection.count()).toBe(2);
    expect(collection.isEmpty()).toBe(false);

    const activeEvents = collection.find(e => !e.isPaused);
    expect(activeEvents).toHaveLength(1);
    expect(activeEvents[0].title).toBe('Event 1');

    const firstPaused = collection.findFirst(e => e.isPaused);
    expect(firstPaused?.title).toBe('Event 2');
  });

  test('should validate all models in collection', () => {
    const collection = new ModelCollection<Event>();
    
    const validEvent = new Event({
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Valid Event',
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      requiredReactions: ['✅'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const invalidEvent = new Event({
      messageId: 'invalid',
      channelId: '987654321098765432',
      guildId: '111222333444555666',
      title: 'Invalid Event',
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      requiredReactions: ['✅'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Valid event should be added successfully
    expect(() => collection.add(validEvent)).not.toThrow();

    // Invalid event should throw during validation
    expect(() => collection.add(invalidEvent)).toThrow();

    expect(collection.count()).toBe(1);
  });

  test('should serialize collection to various formats', () => {
    const collection = new ModelCollection<Guild>();
    
    const guild1 = Guild.fromDict({
      guild_id: '123456789012345678',
      name: 'Guild 1',
      settings: { test: 'value1' }
    });

    const guild2 = Guild.fromDict({
      guild_id: '987654321098765432',
      name: 'Guild 2',
      settings: { test: 'value2' }
    });

    collection.add(guild1);
    collection.add(guild2);

    const dictArray = collection.toDict();
    expect(dictArray).toHaveLength(2);
    expect(dictArray[0]).toHaveProperty('guild_id');
    expect(dictArray[0]).toHaveProperty('name');

    const jsonArray = collection.toJSON();
    expect(jsonArray).toHaveLength(2);
    expect(jsonArray[0]).toHaveProperty('guildId');
    expect(jsonArray[0]).toHaveProperty('name');
  });

  test('should handle collection operations correctly', () => {
    const collection = new ModelCollection<User>();
    
    const user1 = User.fromDict({
      user_id: '123456789012345678',
      guild_id: '987654321098765432',
      username: 'User1',
      is_bot: false
    });

    const user2 = User.fromDict({
      user_id: '111222333444555666',
      guild_id: '987654321098765432',
      username: 'User2',
      is_bot: true
    });

    // Test adding and retrieving
    collection.add(user1);
    collection.add(user2);
    expect(collection.count()).toBe(2);

    // Test getting all
    const allUsers = collection.getAll();
    expect(allUsers).toHaveLength(2);

    // Test removing
    const removed = collection.remove(user1);
    expect(removed).toBe(true);
    expect(collection.count()).toBe(1);

    // Test removing non-existent
    const removedAgain = collection.remove(user1);
    expect(removedAgain).toBe(false);

    // Test clear
    collection.clear();
    expect(collection.isEmpty()).toBe(true);
  });
});