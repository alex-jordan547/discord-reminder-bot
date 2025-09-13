import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Notification, NotificationSettings } from '@/types';

const STORAGE_KEY_NOTIFICATIONS = 'dashboard-notifications';
const STORAGE_KEY_SETTINGS = 'dashboard-notification-settings';

const defaultSettings: NotificationSettings = {
  enabled: {
    system: true,
    alerts: true,
    database: true,
    security: true,
  },
  types: ['info', 'warning', 'error', 'success'],
  maxVisible: 5,
  autoHide: true,
  hideDelay: 5000,
  priority: {
    low: true,
    medium: true,
    high: true,
    critical: true,
  },
  sound: {
    enabled: true,
    volume: 0.5,
  },
  desktop: false,
  display: {
    duration: 5000,
    maxVisible: 5,
    position: 'top-right',
  },
};

export const useNotificationsStore = defineStore('notifications', () => {
  // State
  const notifications = ref<Notification[]>([]);
  const settings = ref<NotificationSettings>({ ...defaultSettings });
  const timers = new Map<string, number>();

  // Computed
  const visibleNotifications = computed(() => {
    const maxVisible = settings.value.maxVisible || settings.value.display?.maxVisible || 5;
    return filteredNotifications.value.slice(0, maxVisible);
  });

  const filteredNotifications = computed(() => {
    return notifications.value.filter(notification => {
      // Filter by type
      if (settings.value.types && !settings.value.types.includes(notification.type)) {
        return false;
      }

      // Filter by priority
      if (settings.value.priority && !settings.value.priority[notification.priority]) {
        return false;
      }

      // Filter by category
      if (
        notification.category &&
        settings.value.enabled &&
        typeof settings.value.enabled === 'object'
      ) {
        const categoryEnabled =
          settings.value.enabled[notification.category as keyof typeof settings.value.enabled];
        if (categoryEnabled === false) {
          return false;
        }
      }

      return true;
    });
  });

  // Priority order for sorting
  const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

  // Actions
  const addNotification = (notification: Notification) => {
    // For now, always allow notifications to be added for testing
    // TODO: Re-enable filtering based on settings later

    // Check for deduplication
    const existingIndex = notifications.value.findIndex(
      n => n.title === notification.title && n.message === notification.message,
    );

    if (existingIndex !== -1) {
      // Update existing notification timestamp
      notifications.value[existingIndex].timestamp = notification.timestamp;
      return;
    }

    // Add notification and sort immediately
    notifications.value.push(notification);

    // Sort by priority (critical first, then high, medium, low)
    notifications.value = notifications.value.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      const priorityDiff = bPriority - aPriority;

      if (priorityDiff !== 0) return priorityDiff;
      // If same priority, sort by timestamp (newest first)
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Set up auto-hide timer if enabled
    const autoHideEnabled =
      typeof settings.value.autoHide === 'boolean' ? settings.value.autoHide : true;

    if (notification.autoHide && autoHideEnabled) {
      const delay =
        notification.hideDelay ||
        settings.value.hideDelay ||
        settings.value.display?.duration ||
        5000;
      const timer = window.setTimeout(() => {
        removeNotification(notification.id);
      }, delay);

      timers.set(notification.id, timer);
    }

    // Persist to localStorage
    persistNotifications();
  };

  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications.value.splice(index, 1);

      // Clear timer if exists
      const timer = timers.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.delete(id);
      }

      persistNotifications();
    }
  };

  const clearAll = () => {
    // Clear all timers
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();

    notifications.value = [];
    persistNotifications();
  };

  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    settings.value = { ...settings.value, ...newSettings };
    persistSettings();
  };

  // Persistence
  const persistNotifications = () => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifications.value));
    } catch (error) {
      console.warn('Failed to persist notifications to localStorage:', error);
    }
  };

  const persistSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
    } catch (error) {
      console.warn('Failed to persist notification settings to localStorage:', error);
    }
  };

  const restoreFromStorage = () => {
    try {
      // Restore notifications
      const savedNotifications = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
      if (savedNotifications) {
        const parsed = JSON.parse(savedNotifications);
        notifications.value = Array.isArray(parsed) ? parsed : [];
      }

      // Restore settings
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        settings.value = { ...defaultSettings, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to restore from localStorage:', error);
      notifications.value = [];
      settings.value = { ...defaultSettings };
    }
  };

  // Initialize store
  restoreFromStorage();

  // Watch for settings changes to update timers
  watch(
    () => settings.value.autoHide,
    newValue => {
      if (!newValue) {
        // Clear all timers if auto-hide is disabled
        timers.forEach(timer => clearTimeout(timer));
        timers.clear();
      }
    },
  );

  return {
    // State
    notifications,
    settings,

    // Computed
    visibleNotifications,
    filteredNotifications,

    // Actions
    addNotification,
    removeNotification,
    clearAll,
    updateSettings,
    clearNotifications: clearAll,
    acknowledgeNotification: (id: string) => {
      const notification = notifications.value.find(n => n.id === id);
      if (notification) {
        notification.acknowledged = true;
        persistNotifications();
      }
    },
    resetToDefaults: () => {
      settings.value = { ...defaultSettings };
      persistSettings();
    },
  };
});

// Alias for compatibility
export const useNotificationStore = useNotificationsStore;
