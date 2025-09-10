import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AlertDisplay from '@/components/AlertDisplay.vue';
import type { Alert } from '@/types';

describe('AlertDisplay', () => {
  const mockAlerts: Alert[] = [
    {
      id: '1',
      type: 'critical',
      title: 'High Memory Usage',
      message: 'Memory usage has exceeded 90%',
      timestamp: '2024-01-01T10:00:00Z',
      acknowledged: false,
      source: 'system',
    },
    {
      id: '2',
      type: 'warning',
      title: 'Bot Disconnection',
      message: 'Bot temporarily disconnected from Discord',
      timestamp: '2024-01-01T09:55:00Z',
      acknowledged: false,
      source: 'bot',
    },
    {
      id: '3',
      type: 'info',
      title: 'Database Backup Complete',
      message: 'Scheduled database backup completed successfully',
      timestamp: '2024-01-01T09:50:00Z',
      acknowledged: true,
      source: 'database',
    },
    {
      id: '4',
      type: 'error',
      title: 'Command Execution Failed',
      message: 'Failed to execute reminder command for user 12345',
      timestamp: '2024-01-01T09:45:00Z',
      acknowledged: false,
      source: 'bot',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all alerts with correct priority order', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: mockAlerts,
      },
    });

    await nextTick();

    const alertItems = wrapper.findAll('[data-testid="alert-item"]');
    expect(alertItems).toHaveLength(4);

    // Should be ordered by priority: critical, error, warning, info
    expect(alertItems[0].classes()).toContain('alert-critical');
    expect(alertItems[1].classes()).toContain('alert-error');
    expect(alertItems[2].classes()).toContain('alert-warning');
    expect(alertItems[3].classes()).toContain('alert-info');
  });

  it('should display alert with correct styling based on type', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]], // critical alert
      },
    });

    await nextTick();

    const alertItem = wrapper.find('[data-testid="alert-item"]');
    expect(alertItem.classes()).toContain('alert-critical');
    expect(alertItem.find('[data-testid="alert-icon"]').classes()).toContain('icon-critical');
  });

  it('should show alert title and message correctly', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="alert-title"]').text()).toBe('High Memory Usage');
    expect(wrapper.find('[data-testid="alert-message"]').text()).toBe(
      'Memory usage has exceeded 90%',
    );
  });

  it('should format timestamp correctly', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
      },
    });

    await nextTick();

    const timestamp = wrapper.find('[data-testid="alert-timestamp"]');
    expect(timestamp.exists()).toBe(true);
    expect(timestamp.text()).toMatch(/\d{2}:\d{2}:\d{2}/); // HH:MM:SS format
  });

  it('should show acknowledge button for unacknowledged alerts', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]], // unacknowledged alert
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="acknowledge-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="acknowledged-badge"]').exists()).toBe(false);
  });

  it('should show acknowledged badge for acknowledged alerts', async () => {
    // Find the acknowledged alert
    const acknowledgedAlert = mockAlerts.find(alert => alert.acknowledged);
    expect(acknowledgedAlert).toBeDefined();

    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [acknowledgedAlert!],
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="acknowledge-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="acknowledged-badge"]').exists()).toBe(true);
  });

  it('should emit acknowledge event when acknowledge button is clicked', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
      },
    });

    await wrapper.find('[data-testid="acknowledge-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('acknowledge')).toBeTruthy();
    expect(wrapper.emitted('acknowledge')[0]).toEqual(['1']);
  });

  it('should emit dismiss event when dismiss button is clicked', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
        showDismiss: true,
      },
    });

    await wrapper.find('[data-testid="dismiss-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('dismiss')).toBeTruthy();
    expect(wrapper.emitted('dismiss')[0]).toEqual(['1']);
  });

  it('should apply Vue transitions for alert animations', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [],
      },
    });

    // Add alerts to trigger transition
    await wrapper.setProps({ alerts: [mockAlerts[0]] });
    await nextTick();

    expect(wrapper.find('[data-testid="alert-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="alert-list"]').attributes('name')).toBe('alert-list');
  });

  it('should filter alerts by type when filter is applied', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: mockAlerts,
        filter: 'critical',
      },
    });

    await nextTick();

    const alertItems = wrapper.findAll('[data-testid="alert-item"]');
    expect(alertItems).toHaveLength(1);
    expect(alertItems[0].classes()).toContain('alert-critical');
  });

  it('should limit displayed alerts when maxAlerts prop is set', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: mockAlerts,
        maxAlerts: 2,
      },
    });

    await nextTick();

    const alertItems = wrapper.findAll('[data-testid="alert-item"]');
    expect(alertItems).toHaveLength(2);
  });

  it('should show "show more" button when alerts exceed maxAlerts', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: mockAlerts,
        maxAlerts: 2,
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="show-more-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="show-more-btn"]').text()).toContain('2 more');
  });

  it('should expand to show all alerts when "show more" is clicked', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: mockAlerts,
        maxAlerts: 2,
      },
    });

    await wrapper.find('[data-testid="show-more-btn"]').trigger('click');
    await nextTick();

    const alertItems = wrapper.findAll('[data-testid="alert-item"]');
    expect(alertItems).toHaveLength(4);
    expect(wrapper.find('[data-testid="show-less-btn"]').exists()).toBe(true);
  });

  it('should show empty state when no alerts are present', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [],
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="empty-alerts"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty-alerts"]').text()).toContain('No alerts');
  });

  it('should show source badge for each alert', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
        showSource: true,
      },
    });

    await nextTick();

    const sourceBadge = wrapper.find('[data-testid="alert-source"]');
    expect(sourceBadge.exists()).toBe(true);
    expect(sourceBadge.text()).toBe('system');
  });

  it('should handle real-time alert updates with transitions', async () => {
    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
      },
    });

    // Add new alert
    const newAlert: Alert = {
      id: '5',
      type: 'warning',
      title: 'New Alert',
      message: 'This is a new alert',
      timestamp: '2024-01-01T10:05:00Z',
      acknowledged: false,
      source: 'system',
    };

    await wrapper.setProps({ alerts: [newAlert, mockAlerts[0]] });
    await nextTick();

    const alertItems = wrapper.findAll('[data-testid="alert-item"]');
    expect(alertItems).toHaveLength(2);
  });

  it('should auto-hide alerts after specified duration', async () => {
    vi.useFakeTimers();

    const wrapper = mount(AlertDisplay, {
      props: {
        alerts: [mockAlerts[0]],
        autoHide: true,
        autoHideDuration: 5000,
      },
    });

    await nextTick();

    expect(wrapper.findAll('[data-testid="alert-item"]')).toHaveLength(1);

    // Fast-forward time
    vi.advanceTimersByTime(5000);
    await nextTick();

    expect(wrapper.emitted('autoHide')).toBeTruthy();
    expect(wrapper.emitted('autoHide')[0]).toEqual(['1']);

    vi.useRealTimers();
  });
});
