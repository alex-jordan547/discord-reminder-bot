import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNotificationStore } from '@/stores/notifications';
import type { Notification, NotificationSettings } from '@/types';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Set up localStorage mock before any imports
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Notification Store', () => {
  let store: ReturnType<typeof useNotificationStore>;

  const mockNotification: Notification = {
    id: 'test-1',
    type: 'info',
    title: 'Test Notification',
    message: 'This is a test message',
    timestamp: new Date().toISOString(),
    priority: 'medium',
    autoHide: true,
    hideDelay: 3000
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Notification queue with priority and deduplication using Pinia store', () => {
    it('should create notification store successfully', () => {
      // Store should be created successfully
      expect(() => {
        store = useNotificationStore();
      }).not.toThrow();
      
      expect(store).toBeDefined();
      expect(store.notifications).toBeDefined();
      expect(store.settings).toBeDefined();
    });

    it('should add notification successfully', () => {
      store = useNotificationStore();
      
      store.addNotification(mockNotification);
      
      expect(store.notifications).toHaveLength(1);
      expect(store.notifications[0]).toEqual(mockNotification);
    });

    it('should implement priority-based ordering', () => {
      store = useNotificationStore();
      
      const lowPriority: Notification = { ...mockNotification, id: 'low', priority: 'low', title: 'Low Priority', message: 'Low priority message' };
      const highPriority: Notification = { ...mockNotification, id: 'high', priority: 'high', title: 'High Priority', message: 'High priority message' };
      const criticalPriority: Notification = { ...mockNotification, id: 'critical', priority: 'critical', title: 'Critical Priority', message: 'Critical priority message' };
      
      store.addNotification(lowPriority);
      store.addNotification(highPriority);
      store.addNotification(criticalPriority);
      
      // Should be ordered by priority: critical, high, low
      expect(store.notifications).toHaveLength(3);
      expect(store.notifications[0].priority).toBe('critical');
      expect(store.notifications[1].priority).toBe('high');
      expect(store.notifications[2].priority).toBe('low');
    });

    it('should implement deduplication', () => {
      store = useNotificationStore();
      
      const duplicate1 = { ...mockNotification, id: 'dup-1' };
      const duplicate2 = { ...mockNotification, id: 'dup-2', title: 'Test Notification' }; // Same title
      
      store.addNotification(duplicate1);
      store.addNotification(duplicate2);
      
      // Should deduplicate based on title and message
      expect(store.notifications).toHaveLength(1);
    });

    it('should enforce max visible notifications limit', () => {
      store = useNotificationStore();
      store.settings.maxVisible = 3;
      
      for (let i = 0; i < 5; i++) {
        store.addNotification({ 
          ...mockNotification, 
          id: `test-${i}`,
          title: `Test Notification ${i}`, // Different titles to avoid deduplication
          message: `Message ${i}`
        });
      }
      
      expect(store.notifications).toHaveLength(5); // All notifications stored
      expect(store.visibleNotifications).toHaveLength(3); // But only 3 visible
    });

    it('should remove notification successfully', () => {
      store = useNotificationStore();
      
      store.addNotification(mockNotification);
      expect(store.notifications).toHaveLength(1);
      
      store.removeNotification(mockNotification.id);
      expect(store.notifications).toHaveLength(0);
    });

    it('should clear all notifications', () => {
      store = useNotificationStore();
      
      store.addNotification({ ...mockNotification, id: 'test-1', title: 'Test 1' });
      store.addNotification({ ...mockNotification, id: 'test-2', title: 'Test 2' });
      
      expect(store.notifications).toHaveLength(2);
      
      store.clearAll();
      expect(store.notifications).toHaveLength(0);
    });
  });

  describe('Notification persistence and restoration on page reload with localStorage', () => {
    it('should persist notifications to localStorage', () => {
      store = useNotificationStore();
      
      store.addNotification(mockNotification);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'dashboard-notifications',
        expect.stringContaining(mockNotification.id)
      );
    });

    it('should restore notifications from localStorage', () => {
      const savedNotifications = JSON.stringify([mockNotification]);
      localStorageMock.getItem.mockReturnValueOnce(savedNotifications).mockReturnValueOnce(null);
      
      store = useNotificationStore();
      
      expect(localStorageMock.getItem).toHaveBeenCalledWith('dashboard-notifications');
      expect(store.notifications).toHaveLength(1);
      expect(store.notifications[0].id).toBe(mockNotification.id);
    });

    it('should persist settings to localStorage', () => {
      store = useNotificationStore();
      
      const newSettings: NotificationSettings = {
        enabled: false,
        types: ['error', 'warning'],
        maxVisible: 5,
        autoHide: false,
        hideDelay: 5000,
        priority: {
          low: false,
          medium: true,
          high: true,
          critical: true
        },
        sound: true,
        desktop: false
      };
      
      store.updateSettings(newSettings);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'dashboard-notification-settings',
        JSON.stringify(newSettings)
      );
    });
  });

  describe('Notification settings and filtering options with Vue forms', () => {
    it('should update settings successfully', () => {
      store = useNotificationStore();
      
      const newSettings: Partial<NotificationSettings> = {
        maxVisible: 10,
        autoHide: false
      };
      
      store.updateSettings(newSettings);
      
      expect(store.settings.maxVisible).toBe(10);
      expect(store.settings.autoHide).toBe(false);
    });

    it('should implement type-based filtering', () => {
      store = useNotificationStore();
      store.settings.types = ['error', 'warning']; // Only show errors and warnings
      
      const infoNotification: Notification = { ...mockNotification, type: 'info', title: 'Info' };
      const errorNotification: Notification = { ...mockNotification, id: 'error-1', type: 'error', title: 'Error' };
      
      store.addNotification(infoNotification);
      store.addNotification(errorNotification);
      
      expect(store.filteredNotifications).toHaveLength(1);
      expect(store.filteredNotifications[0].type).toBe('error');
    });

    it('should implement priority-based filtering', () => {
      store = useNotificationStore();
      store.settings.priority.low = false; // Don't show low priority
      
      const lowNotification: Notification = { ...mockNotification, priority: 'low', title: 'Low' };
      const highNotification: Notification = { ...mockNotification, id: 'high-1', priority: 'high', title: 'High' };
      
      store.addNotification(lowNotification);
      store.addNotification(highNotification);
      
      expect(store.filteredNotifications).toHaveLength(1);
      expect(store.filteredNotifications[0].priority).toBe('high');
    });

    it('should implement auto-hide timer management', () => {
      store = useNotificationStore();
      
      const autoHideNotification: Notification = {
        ...mockNotification,
        autoHide: true,
        hideDelay: 1000
      };
      
      store.addNotification(autoHideNotification);
      expect(store.notifications).toHaveLength(1);
      
      vi.advanceTimersByTime(1000);
      
      expect(store.notifications).toHaveLength(0);
    });
  });
});