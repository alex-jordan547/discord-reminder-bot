import { computed } from 'vue';
import { useNotificationStore } from '@/stores/notifications';
import type { Notification, NotificationSettings } from '@/types';

/**
 * Composable for managing notifications
 */
export function useNotifications() {
  const store = useNotificationStore();

  // Computed properties
  const notifications = computed(() => store.notifications);
  const visibleNotifications = computed(() => store.visibleNotifications);
  const filteredNotifications = computed(() => store.filteredNotifications);
  const settings = computed(() => store.settings);

  // Methods
  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const fullNotification: Notification = {
      ...notification,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };

    store.addNotification(fullNotification);
    return fullNotification.id;
  };

  const removeNotification = (id: string) => {
    store.removeNotification(id);
  };

  const clearAll = () => {
    store.clearAll();
  };

  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    store.updateSettings(newSettings);
  };

  // Convenience methods for different notification types
  const showInfo = (title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({
      type: 'info',
      title,
      message,
      priority: 'medium',
      autoHide: true,
      hideDelay: 5000,
      ...options,
    });
  };

  const showSuccess = (title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({
      type: 'success',
      title,
      message,
      priority: 'medium',
      autoHide: true,
      hideDelay: 4000,
      ...options,
    });
  };

  const showWarning = (title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({
      type: 'warning',
      title,
      message,
      priority: 'high',
      autoHide: true,
      hideDelay: 6000,
      ...options,
    });
  };

  const showError = (title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({
      type: 'error',
      title,
      message,
      priority: 'critical',
      autoHide: false, // Errors should be manually dismissed
      persistent: true,
      ...options,
    });
  };

  // Utility function to generate unique IDs
  const generateId = (): string => {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  return {
    // State
    notifications,
    visibleNotifications,
    filteredNotifications,
    settings,

    // Actions
    addNotification,
    removeNotification,
    clearAll,
    updateSettings,

    // Convenience methods
    showInfo,
    showSuccess,
    showWarning,
    showError,
  };
}
