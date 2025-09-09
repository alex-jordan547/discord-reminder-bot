import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import NotificationContainer from '@/components/NotificationContainer.vue';
import { useNotificationsStore } from '@/stores/notifications';
import { createMockAlert } from '../setup';

describe('NotificationContainer', () => {
  let wrapper: VueWrapper;
  let pinia: any;

  beforeEach(() => {
    pinia = createPinia();
    wrapper = mount(NotificationContainer, {
      global: {
        plugins: [pinia],
      },
    });
  });

  describe('Rendering', () => {
    it('should render notification container', () => {
      expect(wrapper.find('.notification-container').exists()).toBe(true);
    });

    it('should render notifications from store', async () => {
      const store = useNotificationsStore();
      const mockNotification = {
        id: 'test-1',
        type: 'info' as const,
        title: 'Test Notification',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      };

      store.addNotification(mockNotification);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.toast-notification').exists()).toBe(true);
      expect(wrapper.text()).toContain('Test Notification');
    });

    it('should limit visible notifications to maximum', async () => {
      const store = useNotificationsStore();
      
      // Add more than max notifications
      for (let i = 0; i < 7; i++) {
        store.addNotification({
          id: `test-${i}`,
          type: 'info' as const,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          timestamp: new Date().toISOString(),
          persistent: false,
        });
      }
      
      await wrapper.vm.$nextTick();
      
      const notifications = wrapper.findAll('.toast-notification');
      expect(notifications.length).toBeLessThanOrEqual(5); // Max 5 visible
    });
  });

  describe('Notification Management', () => {
    it('should handle notification dismissal', async () => {
      const store = useNotificationsStore();
      const mockNotification = {
        id: 'test-dismiss',
        type: 'info' as const,
        title: 'Dismissible',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      };

      store.addNotification(mockNotification);
      await wrapper.vm.$nextTick();

      const dismissButton = wrapper.find('[data-testid="dismiss-notification"]');
      await dismissButton.trigger('click');

      expect(store.notifications.find(n => n.id === 'test-dismiss')).toBeUndefined();
    });

    it('should auto-dismiss non-persistent notifications', async () => {
      vi.useFakeTimers();
      
      const store = useNotificationsStore();
      const mockNotification = {
        id: 'test-auto-dismiss',
        type: 'info' as const,
        title: 'Auto Dismiss',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      };

      store.addNotification(mockNotification);
      await wrapper.vm.$nextTick();

      // Fast-forward time
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(store.notifications.find(n => n.id === 'test-auto-dismiss')).toBeUndefined();
      
      vi.useRealTimers();
    });

    it('should not auto-dismiss persistent notifications', async () => {
      vi.useFakeTimers();
      
      const store = useNotificationsStore();
      const mockNotification = {
        id: 'test-persistent',
        type: 'error' as const,
        title: 'Persistent Error',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: true,
      };

      store.addNotification(mockNotification);
      await wrapper.vm.$nextTick();

      // Fast-forward time
      vi.advanceTimersByTime(10000);
      await wrapper.vm.$nextTick();

      expect(store.notifications.find(n => n.id === 'test-persistent')).toBeDefined();
      
      vi.useRealTimers();
    });
  });

  describe('Notification Types', () => {
    it('should render different notification types with correct styling', async () => {
      const store = useNotificationsStore();
      const types = ['info', 'success', 'warning', 'error'] as const;

      for (const type of types) {
        store.addNotification({
          id: `test-${type}`,
          type,
          title: `${type} notification`,
          message: 'Test message',
          timestamp: new Date().toISOString(),
          persistent: false,
        });
      }

      await wrapper.vm.$nextTick();

      for (const type of types) {
        const notification = wrapper.find(`[data-notification-type="${type}"]`);
        expect(notification.exists()).toBe(true);
        expect(notification.classes()).toContain(`notification-${type}`);
      }
    });

    it('should show appropriate icons for notification types', async () => {
      const store = useNotificationsStore();
      
      store.addNotification({
        id: 'test-error-icon',
        type: 'error',
        title: 'Error',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      });

      await wrapper.vm.$nextTick();

      const errorNotification = wrapper.find('[data-notification-type="error"]');
      expect(errorNotification.find('.notification-icon').exists()).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      expect(wrapper.find('.notification-container').attributes('role')).toBe('region');
      expect(wrapper.find('.notification-container').attributes('aria-label')).toBe('Notifications');
    });

    it('should support keyboard navigation', async () => {
      const store = useNotificationsStore();
      
      store.addNotification({
        id: 'test-keyboard',
        type: 'info',
        title: 'Keyboard Test',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      });

      await wrapper.vm.$nextTick();

      const notification = wrapper.find('.toast-notification');
      expect(notification.attributes('tabindex')).toBe('0');
      
      // Test keyboard dismissal
      await notification.trigger('keydown.escape');
      expect(store.notifications.find(n => n.id === 'test-keyboard')).toBeUndefined();
    });

    it('should announce notifications to screen readers', async () => {
      const store = useNotificationsStore();
      
      store.addNotification({
        id: 'test-announce',
        type: 'info',
        title: 'Screen Reader Test',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      });

      await wrapper.vm.$nextTick();

      const notification = wrapper.find('.toast-notification');
      expect(notification.attributes('aria-live')).toBe('polite');
      expect(notification.attributes('aria-atomic')).toBe('true');
    });
  });

  describe('Animation and Transitions', () => {
    it('should apply enter/leave transitions', async () => {
      const store = useNotificationsStore();
      
      store.addNotification({
        id: 'test-transition',
        type: 'info',
        title: 'Transition Test',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        persistent: false,
      });

      await wrapper.vm.$nextTick();

      const transitionGroup = wrapper.find('.notification-list');
      expect(transitionGroup.exists()).toBe(true);
      expect(transitionGroup.classes()).toContain('notification-transition');
    });

    it('should handle stacking animations', async () => {
      const store = useNotificationsStore();
      
      // Add multiple notifications quickly
      for (let i = 0; i < 3; i++) {
        store.addNotification({
          id: `test-stack-${i}`,
          type: 'info',
          title: `Stacked ${i}`,
          message: 'Test message',
          timestamp: new Date().toISOString(),
          persistent: false,
        });
      }

      await wrapper.vm.$nextTick();

      const notifications = wrapper.findAll('.toast-notification');
      expect(notifications.length).toBe(3);
      
      // Check stacking order
      notifications.forEach((notification, index) => {
        expect(notification.attributes('data-stack-index')).toBe(index.toString());
      });
    });
  });
});