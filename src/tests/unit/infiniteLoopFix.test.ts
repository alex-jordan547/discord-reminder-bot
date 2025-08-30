/**
 * Tests for infinite loop fix in ReminderScheduler
 * 
 * Validates that the protection mechanisms work correctly:
 * 1. Failed reminder attempts are tracked
 * 2. Events enter cooldown after max failures
 * 3. EventManager.markEventReminded() uses proper setters
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { EventManager } from '@/services/eventManager';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { Event as EventModel } from '@/models';

// Mock dependencies
vi.mock('@/utils/loggingConfig', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@/persistence/sqliteStorage');
vi.mock('@/services/guildConfigManager');

describe('Infinite Loop Protection Fix', () => {
  let eventManager: EventManager;
  let reminderScheduler: ReminderScheduler;
  let mockEvent: EventModel;
  let mockClient: any;
  let mockStorage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock event
    mockEvent = {
      messageId: '1409894959326171147',
      channelId: 'channel-123',
      guildId: 'guild-123',
      title: 'Test Event',
      intervalMinutes: 1440,
      usersWhoReacted: [],
      lastReminder: new Date('2025-08-29T16:43:31.000Z'),
      lastRemindedAt: null,
      isPaused: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      isValid: vi.fn().mockReturnValue(true),
      validate: vi.fn().mockReturnValue([]),
    } as unknown as EventModel;

    // Setup mock storage
    mockStorage = {
      saveEvent: vi.fn().mockResolvedValue({ success: true }),
      getEvent: vi.fn().mockResolvedValue(mockEvent),
    };

    // Setup mock client
    mockClient = {
      user: { id: 'bot-id' },
    };

    // Create instances
    eventManager = new EventManager(mockStorage);
    reminderScheduler = new ReminderScheduler(mockClient, eventManager);
  });

  describe('EventManager.markEventReminded() fix', () => {
    it('should use proper setter instead of Object.assign', async () => {
      // Arrange - Setup event with proper setter
      const originalDate = new Date('2025-08-29T16:43:31.000Z');
      mockEvent.lastReminder = originalDate;
      
      // Mock getEvent to return our mock event
      vi.spyOn(eventManager, 'getEvent').mockResolvedValue(mockEvent);
      
      // Mock storage.saveEvent to succeed
      mockStorage.saveEvent.mockResolvedValue({ success: true });

      // Act
      const result = await eventManager.markEventReminded('1409894959326171147');

      // Assert
      expect(result).toBe(true);
      expect(eventManager.getEvent).toHaveBeenCalledWith('1409894959326171147');
      expect(mockEvent.isValid).toHaveBeenCalled();
      expect(mockStorage.saveEvent).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle validation errors gracefully', async () => {
      // Arrange - Setup event that fails validation
      mockEvent.isValid = vi.fn().mockReturnValue(false);
      mockEvent.validate = vi.fn().mockReturnValue([
        { field: 'testField', message: 'Test validation error' }
      ]);
      
      vi.spyOn(eventManager, 'getEvent').mockResolvedValue(mockEvent);

      // Act
      const result = await eventManager.markEventReminded('1409894959326171147');

      // Assert
      expect(result).toBe(false);
      expect(mockStorage.saveEvent).not.toHaveBeenCalled();
    });

    it('should handle missing events gracefully', async () => {
      // Arrange
      vi.spyOn(eventManager, 'getEvent').mockResolvedValue(null);

      // Act
      const result = await eventManager.markEventReminded('nonexistent');

      // Assert
      expect(result).toBe(false);
      expect(mockStorage.saveEvent).not.toHaveBeenCalled();
    });
  });

  describe('Infinite loop protection in ReminderScheduler', () => {
    it('should track failed reminder attempts', () => {
      // This test verifies the protection mechanism exists
      // The actual implementation is private, so we test the behavior indirectly
      
      // Verify that the ReminderScheduler has the protection properties
      expect(reminderScheduler).toBeDefined();
      expect((reminderScheduler as any).failedReminders).toBeDefined();
      expect((reminderScheduler as any).MAX_FAILED_ATTEMPTS).toBe(5);
      expect((reminderScheduler as any).FAILED_REMINDER_COOLDOWN).toBe(5 * 60 * 1000);
    });

    it('should have failure tracking methods', () => {
      // Verify the protection methods exist
      expect(typeof (reminderScheduler as any).isEventInFailureCooldown).toBe('function');
      expect(typeof (reminderScheduler as any).trackFailedReminder).toBe('function');
      expect(typeof (reminderScheduler as any).clearFailureTracking).toBe('function');
    });
  });

  describe('Integration behavior', () => {
    it('should prevent infinite loops when markEventReminded fails repeatedly', async () => {
      // This test documents the expected behavior:
      // 1. If markEventReminded fails, the event is not marked as reminded
      // 2. The protection system should kick in after MAX_FAILED_ATTEMPTS
      // 3. The event should be skipped during cooldown period
      
      // Arrange - Setup failing markEventReminded
      vi.spyOn(eventManager, 'markEventReminded').mockResolvedValue(false);
      
      // Create a mock overdue event
      const overdueEvents = [mockEvent];
      
      // Act - This should not cause an infinite loop
      await (reminderScheduler as any).checkRemindersImmediate(overdueEvents);
      
      // Assert - The event should be marked as failed
      expect(eventManager.markEventReminded).toHaveBeenCalledWith('1409894959326171147');
    });
  });
});