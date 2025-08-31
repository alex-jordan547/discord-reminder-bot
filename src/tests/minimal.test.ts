/**
 * Test minimal pour isoler le problème de la description null
 */

import { describe, it, expect } from 'vitest';
import { Event } from '@/models';

describe('Minimal Event Description Test', () => {
  it('should handle null description correctly', () => {
    const eventData = {
      messageId: '123456789012345678', // Valid Discord ID (18 digits)
      channelId: '234567890123456789', // Valid Discord ID (18 digits)  
      guildId: '345678901234567890',   // Valid Discord ID (18 digits)
      title: 'Test Event',
      description: undefined, // Change from null to undefined
      intervalMinutes: 60,
      isPaused: false,
      lastReminder: new Date(),
      usersWhoReacted: [],
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
