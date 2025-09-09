import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotifications } from '@/composables/useNotifications';
import { createPinia, setActivePinia } from 'pinia';
import { useNotificationsStore } from '@/stores/notifications';

describe('useNotifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('Notification Creation', () => {
    it('should create info notification', () => {
      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      showInfo('Test info message');

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: 'Information',
          message: 'Test info message',
          persistent: false,
        })
      );
    });

    it('should create success notification', () => {
      const { showSuccess } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      showSuccess('Operation completed');

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Success',
          message: 'Operation completed',
          persistent: false,
        })
      );
    });

    it('should create warning notification', () => {
      const { showWarning } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      showWarning('Warning message');

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          title: 'Warning',
          message: 'Warning message',
          persistent: false,
        })
      );
    });

    it('should create error notification', () => {
      const { showError } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      showError('Error occurred');

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Error',
          message: 'Error occurred',
          persistent: true, // Errors should be persistent
        })
      );
    });

    it('should create notification with custom options', () => {
      const { showNotification } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      showNotification({
        type: 'info',
        title: 'Custom Title',
        message: 'Custom message',
        persistent: true,
        actions: [{ label: 'Action', handler: vi.fn() }],
      });

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: 'Custom Title',
          message: 'Custom message',
          persistent: true,
          actions: expect.arrayContaining([
            expect.objectContaining({
              label: 'Action',
              handler: expect.any(Function),
            }),
          ]),
        })
      );
    });
  });

  describe('Notification Management', () => {
    it('should dismiss notification by id', () => {
      const { dismiss } = useNotifications();
      const store = useNotificationsStore();
      const removeSpy = vi.spyOn(store, 'removeNotification');

      dismiss('test-id');

      expect(removeSpy).toHaveBeenCalledWith('test-id');
    });

    it('should dismiss all notifications', () => {
      const { dismissAll } = useNotifications();
      const store = useNotificationsStore();
      const clearSpy = vi.spyOn(store, 'clearNotifications');

      dismissAll();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('should acknowledge notification', () => {
      const { acknowledge } = useNotifications();
      const store = useNotificationsStore();
      const ackSpy = vi.spyOn(store, 'acknowledgeNotification');

      acknowledge('test-id');

      expect(ackSpy).toHaveBeenCalledWith('test-id');
    });

    it('should get notification count', () => {
      const { getCount } = useNotifications();
      const store = useNotificationsStore();
      
      // Mock store state
      store.notifications = [
        { id: '1', type: 'info', title: 'Test', message: 'Test', timestamp: '', persistent: false },
        { id: '2', type: 'error', title: 'Test', message: 'Test', timestamp: '', persistent: true },
      ];

      expect(getCount()).toBe(2);
      expect(getCount('error')).toBe(1);
      expect(getCount('info')).toBe(1);
      expect(getCount('warning')).toBe(0);
    });

    it('should get unacknowledged count', () => {
      const { getUnacknowledgedCount } = useNotifications();
      const store = useNotificationsStore();
      
      // Mock store state
      store.notifications = [
        { id: '1', type: 'info', title: 'Test', message: 'Test', timestamp: '', persistent: false, acknowledged: false },
        { id: '2', type: 'error', title: 'Test', message: 'Test', timestamp: '', persistent: true, acknowledged: true },
        { id: '3', type: 'warning', title: 'Test', message: 'Test', timestamp: '', persistent: false, acknowledged: false },
      ];

      expect(getUnacknowledgedCount()).toBe(2);
    });
  });

  describe('Sound Notifications', () => {
    it('should play sound for notifications when enabled', () => {
      const mockPlay = vi.fn();
      global.Audio = vi.fn().mockImplementation(() => ({
        play: mockPlay,
        volume: 0.5,
      }));

      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      
      // Enable sound
      store.updateSettings({
        sound: { enabled: true, volume: 0.7 },
      });

      showInfo('Test with sound');

      expect(mockPlay).toHaveBeenCalled();
    });

    it('should not play sound when disabled', () => {
      const mockPlay = vi.fn();
      global.Audio = vi.fn().mockImplementation(() => ({
        play: mockPlay,
        volume: 0.5,
      }));

      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      
      // Disable sound
      store.updateSettings({
        sound: { enabled: false, volume: 0.7 },
      });

      showInfo('Test without sound');

      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('should use correct volume setting', () => {
      const mockAudio = { play: vi.fn(), volume: 0 };
      global.Audio = vi.fn().mockImplementation(() => mockAudio);

      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      
      store.updateSettings({
        sound: { enabled: true, volume: 0.8 },
      });

      showInfo('Test volume');

      expect(mockAudio.volume).toBe(0.8);
    });

    it('should handle audio errors gracefully', () => {
      global.Audio = vi.fn().mockImplementation(() => ({
        play: vi.fn().mockRejectedValue(new Error('Audio error')),
        volume: 0.5,
      }));

      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      
      store.updateSettings({
        sound: { enabled: true, volume: 0.5 },
      });

      expect(() => {
        showInfo('Test audio error');
      }).not.toThrow();
    });
  });

  describe('Notification Filtering', () => {
    it('should respect notification type settings', () => {
      const { showInfo, showError } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      // Disable info notifications
      store.updateSettings({
        enabled: {
          system: false,
          alerts: true,
          database: true,
          security: true,
        },
      });

      showInfo('Should be filtered', { category: 'system' });
      showError('Should not be filtered', { category: 'alerts' });

      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Should not be filtered',
        })
      );
    });

    it('should allow notifications when category is enabled', () => {
      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      store.updateSettings({
        enabled: {
          system: true,
          alerts: true,
          database: true,
          security: true,
        },
      });

      showInfo('Should be allowed', { category: 'system' });

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Should be allowed',
        })
      );
    });
  });

  describe('Notification Deduplication', () => {
    it('should prevent duplicate notifications', () => {
      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      const message = 'Duplicate message';
      
      showInfo(message);
      showInfo(message); // Should be deduplicated

      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow duplicate notifications after timeout', async () => {
      vi.useFakeTimers();
      
      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      const message = 'Duplicate message';
      
      showInfo(message);
      
      // Fast-forward past deduplication timeout
      vi.advanceTimersByTime(5000);
      
      showInfo(message); // Should be allowed now

      expect(addSpy).toHaveBeenCalledTimes(2);
      
      vi.useRealTimers();
    });

    it('should deduplicate based on message and type', () => {
      const { showInfo, showError } = useNotifications();
      const store = useNotificationsStore();
      const addSpy = vi.spyOn(store, 'addNotification');

      const message = 'Same message';
      
      showInfo(message);
      showError(message); // Different type, should be allowed

      expect(addSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Notification Actions', () => {
    it('should handle notification actions', () => {
      const { showNotification } = useNotifications();
      const actionHandler = vi.fn();
      
      showNotification({
        type: 'info',
        title: 'Action Test',
        message: 'Test message',
        actions: [
          { label: 'Confirm', handler: actionHandler },
          { label: 'Cancel', handler: vi.fn() },
        ],
      });

      const store = useNotificationsStore();
      const notification = store.notifications[0];
      
      expect(notification.actions).toHaveLength(2);
      expect(notification.actions![0].label).toBe('Confirm');
      
      // Execute action
      notification.actions![0].handler();
      expect(actionHandler).toHaveBeenCalled();
    });

    it('should auto-dismiss notification after action', () => {
      const { showNotification } = useNotifications();
      const store = useNotificationsStore();
      const removeSpy = vi.spyOn(store, 'removeNotification');
      
      showNotification({
        type: 'info',
        title: 'Action Test',
        message: 'Test message',
        actions: [
          { label: 'Confirm', handler: vi.fn(), dismissAfter: true },
        ],
      });

      const notification = store.notifications[0];
      notification.actions![0].handler();
      
      expect(removeSpy).toHaveBeenCalledWith(notification.id);
    });
  });

  describe('Error Handling', () => {
    it('should handle store errors gracefully', () => {
      const { showInfo } = useNotifications();
      const store = useNotificationsStore();
      
      vi.spyOn(store, 'addNotification').mockImplementation(() => {
        throw new Error('Store error');
      });

      expect(() => {
        showInfo('Test error handling');
      }).not.toThrow();
    });

    it('should provide fallback when store is unavailable', () => {
      // Mock console.warn to verify fallback
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Create composable without store
      const { showInfo } = useNotifications();
      
      // This should not throw and should warn
      expect(() => {
        showInfo('Fallback test');
      }).not.toThrow();
    });
  });

  describe('Reactive State', () => {
    it('should provide reactive notification count', () => {
      const { notificationCount } = useNotifications();
      const store = useNotificationsStore();

      expect(notificationCount.value).toBe(0);

      store.addNotification({
        id: 'test',
        type: 'info',
        title: 'Test',
        message: 'Test',
        timestamp: new Date().toISOString(),
        persistent: false,
      });

      expect(notificationCount.value).toBe(1);
    });

    it('should provide reactive unacknowledged count', () => {
      const { unacknowledgedCount } = useNotifications();
      const store = useNotificationsStore();

      expect(unacknowledgedCount.value).toBe(0);

      store.addNotification({
        id: 'test',
        type: 'info',
        title: 'Test',
        message: 'Test',
        timestamp: new Date().toISOString(),
        persistent: false,
        acknowledged: false,
      });

      expect(unacknowledgedCount.value).toBe(1);

      store.acknowledgeNotification('test');
      expect(unacknowledgedCount.value).toBe(0);
    });

    it('should provide reactive settings', () => {
      const { settings } = useNotifications();
      const store = useNotificationsStore();

      expect(settings.value.sound.enabled).toBe(true); // Default

      store.updateSettings({
        sound: { enabled: false, volume: 0.5 },
      });

      expect(settings.value.sound.enabled).toBe(false);
    });
  });
});