/**
 * Test minimal pour isoler le problème de la description null
 */

import { describe, it, expect } from 'vitest';
import { Event } from '@/models/Event';

describe('Minimal Event Description Test', () => {
  it('should handle null description correctly', () => {
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
    
    // Check that the event description is undefined
    expect(event.description).toBeUndefined();
    
    // Check validation errors
    const errors = event.validate();
    expect(errors).toHaveLength(0);
    
    expect(event.isValid()).toBe(true);
  });
});