/**
 * Test minimal 2 pour isoler le problème de la description null
 */

import { describe, it, expect } from 'vitest';
import { Event } from '@/models/Event';

describe('Minimal Event Description Test 2', () => {
  it('should handle null description correctly in validate method', () => {
    // Create an event with null description directly
    const event: any = new Event(
      '123456789012345678',
      '987654321098765432',
      '555666777888999000',
      'Test Event',
      60,
      new Date(),
      false,
      ['123456789012345678', '987654321098765432'],
      new Date(),
      new Date()
    );
    
    // Set description to null directly
    event.description = null;
    
    // Check that the event description is null before validation
    expect(event.description).toBeNull();
    
    // Call validate method
    const errors = event.validate();
    
    // Check that the event description is now undefined after validation
    expect(event.description).toBeUndefined();
    
    // Check that there are no validation errors
    expect(errors).toHaveLength(0);
    
    expect(event.isValid()).toBe(true);
  });
});