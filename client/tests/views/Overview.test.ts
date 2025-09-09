import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import Overview from '@/views/Overview.vue';
import { useDashboardStore } from '@/stores/dashboard';
import { createMockMetrics, createMockAlert, createMockActivity } from '../setup';

// Mock Chart.js components
vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="mock-line-chart"></div>' },
  Bar: { template: '<div class="mock-bar-chart"></div>' },
  Doughnut: { template: '<div class="mock-doughnut-chart"></div>' },
}));

describe('Overview', () => {
  let wrapper: VueWrapper;
  let router: any;
  let pinia: any;

  beforeEach(async () => {
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'overview', component: Overview },
        { path: '/metrics', name: 'metrics', component: { template: '<div>Metrics</div>' } },
        { path: '/alerts', name: 'alerts', component: { template: '<div>Alerts</div>' } },
      ],
    });

    pinia = createPinia();

    wrapper = mount(Overview, {
      global: {
        plugins: [router, pinia],
      },
    });

    await router.isReady();
  });

  describe('Rendering', () => {
    it('should render overview container', () => {
      expect(wrapper.find('.overview-container').exists()).toBe(true);
    });

    it('should render status cards', () => {
      expect(wrapper.find('.status-cards').exists()).toBe(true);
      expect(wrapper.findAll('.status-card').length).toBeGreaterThan(0);
    });

    it('should render metrics summary', () => {
      expect(wrapper.find('.metrics-summary').exists()).toBe(true);
    });

    it('should render recent activity section', () => {
      expect(wrapper.find('.recent-activity').exists()).toBe(true);
    });

    it('should render alerts summary', () => {
      expect(wrapper.find('.alerts-summary').exists()).toBe(true);
    });
  });

  describe('Status Cards', () => {
    it('should display system status', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const statusCard = wrapper.find('[data-testid="system-status-card"]');
      expect(statusCard.exists()).toBe(true);
      expect(statusCard.text()).toContain('System Status');
    });

    it('should display bot status', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const botCard = wrapper.find('[data-testid="bot-status-card"]');
      expect(botCard.exists()).toBe(true);
      expect(botCard.text()).toContain('Bot Status');
      expect(botCard.text()).toContain('Connected');
    });

    it('should display database status', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const dbCard = wrapper.find('[data-testid="database-status-card"]');
      expect(dbCard.exists()).toBe(true);
      expect(dbCard.text()).toContain('Database');
      expect(dbCard.text()).toContain('Connected');
    });

    it('should display uptime information', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const uptimeCard = wrapper.find('[data-testid="uptime-card"]');
      expect(uptimeCard.exists()).toBe(true);
      expect(uptimeCard.text()).toContain('Uptime');
    });

    it('should show correct status colors', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      // Test healthy status
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      let systemCard = wrapper.find('[data-testid="system-status-card"]');
      expect(systemCard.classes()).toContain('status-healthy');

      // Test warning status
      mockMetrics.system.memory.percentage = 85;
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      systemCard = wrapper.find('[data-testid="system-status-card"]');
      expect(systemCard.classes()).toContain('status-warning');

      // Test critical status
      mockMetrics.system.memory.percentage = 95;
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      systemCard = wrapper.find('[data-testid="system-status-card"]');
      expect(systemCard.classes()).toContain('status-critical');
    });
  });

  describe('Metrics Summary', () => {
    it('should display key metrics', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const metricsSection = wrapper.find('.metrics-summary');
      expect(metricsSection.text()).toContain('Memory');
      expect(metricsSection.text()).toContain('CPU');
      expect(metricsSection.text()).toContain('Guilds');
      expect(metricsSection.text()).toContain('Users');
    });

    it('should show metric values', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const metricsSection = wrapper.find('.metrics-summary');
      expect(metricsSection.text()).toContain('50%'); // Memory percentage
      expect(metricsSection.text()).toContain('25%'); // CPU percentage
      expect(metricsSection.text()).toContain('5'); // Guilds count
      expect(metricsSection.text()).toContain('100'); // Users count
    });

    it('should render mini charts', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.mini-chart').exists()).toBe(true);
      expect(wrapper.findAll('.mini-chart').length).toBeGreaterThan(0);
    });

    it('should link to detailed metrics view', async () => {
      const viewDetailsLink = wrapper.find('[data-testid="view-metrics-details"]');
      expect(viewDetailsLink.exists()).toBe(true);
      
      await viewDetailsLink.trigger('click');
      expect(router.currentRoute.value.name).toBe('metrics');
    });
  });

  describe('Recent Activity', () => {
    it('should display recent activities', async () => {
      const store = useDashboardStore();
      const mockActivity = createMockActivity();
      
      store.addActivity(mockActivity);
      await wrapper.vm.$nextTick();

      const activitySection = wrapper.find('.recent-activity');
      expect(activitySection.text()).toContain('Recent Activity');
      expect(activitySection.text()).toContain(mockActivity.description);
    });

    it('should show activity timestamps', async () => {
      const store = useDashboardStore();
      const mockActivity = createMockActivity();
      
      store.addActivity(mockActivity);
      await wrapper.vm.$nextTick();

      const activityItem = wrapper.find('.activity-item');
      expect(activityItem.exists()).toBe(true);
      expect(activityItem.find('.activity-timestamp').exists()).toBe(true);
    });

    it('should show activity types with icons', async () => {
      const store = useDashboardStore();
      const activities = [
        { ...createMockActivity(), id: '1', type: 'command', description: 'Command executed' },
        { ...createMockActivity(), id: '2', type: 'error', description: 'Error occurred' },
        { ...createMockActivity(), id: '3', type: 'system', description: 'System event' },
      ];
      
      activities.forEach(activity => store.addActivity(activity));
      await wrapper.vm.$nextTick();

      const activityItems = wrapper.findAll('.activity-item');
      expect(activityItems.length).toBe(3);
      
      activityItems.forEach(item => {
        expect(item.find('.activity-icon').exists()).toBe(true);
      });
    });

    it('should limit displayed activities', async () => {
      const store = useDashboardStore();
      
      // Add more activities than the display limit
      for (let i = 0; i < 15; i++) {
        store.addActivity({
          ...createMockActivity(),
          id: `activity-${i}`,
          description: `Activity ${i}`,
        });
      }
      
      await wrapper.vm.$nextTick();

      const activityItems = wrapper.findAll('.activity-item');
      expect(activityItems.length).toBeLessThanOrEqual(10); // Assuming limit of 10
    });

    it('should show empty state when no activities', () => {
      const activitySection = wrapper.find('.recent-activity');
      expect(activitySection.find('.empty-state').exists()).toBe(true);
      expect(activitySection.text()).toContain('No recent activity');
    });
  });

  describe('Alerts Summary', () => {
    it('should display alert count', async () => {
      const store = useDashboardStore();
      const mockAlert = createMockAlert();
      
      store.addAlert(mockAlert);
      await wrapper.vm.$nextTick();

      const alertsSection = wrapper.find('.alerts-summary');
      expect(alertsSection.text()).toContain('Alerts');
      expect(alertsSection.text()).toContain('1'); // Alert count
    });

    it('should show critical alerts prominently', async () => {
      const store = useDashboardStore();
      const criticalAlert = { ...createMockAlert(), type: 'critical' as const, id: 'critical-1' };
      
      store.addAlert(criticalAlert);
      await wrapper.vm.$nextTick();

      const criticalSection = wrapper.find('.critical-alerts');
      expect(criticalSection.exists()).toBe(true);
      expect(criticalSection.classes()).toContain('alert-critical');
    });

    it('should group alerts by type', async () => {
      const store = useDashboardStore();
      const alerts = [
        { ...createMockAlert(), id: '1', type: 'critical' as const },
        { ...createMockAlert(), id: '2', type: 'warning' as const },
        { ...createMockAlert(), id: '3', type: 'warning' as const },
        { ...createMockAlert(), id: '4', type: 'info' as const },
      ];
      
      alerts.forEach(alert => store.addAlert(alert));
      await wrapper.vm.$nextTick();

      const alertsSummary = wrapper.find('.alerts-summary');
      expect(alertsSummary.text()).toContain('1 Critical');
      expect(alertsSummary.text()).toContain('2 Warning');
      expect(alertsSummary.text()).toContain('1 Info');
    });

    it('should link to alerts view', async () => {
      const viewAlertsLink = wrapper.find('[data-testid="view-all-alerts"]');
      expect(viewAlertsLink.exists()).toBe(true);
      
      await viewAlertsLink.trigger('click');
      expect(router.currentRoute.value.name).toBe('alerts');
    });

    it('should show empty state when no alerts', () => {
      const alertsSection = wrapper.find('.alerts-summary');
      expect(alertsSection.find('.empty-state').exists()).toBe(true);
      expect(alertsSection.text()).toContain('No active alerts');
    });
  });

  describe('Real-time Updates', () => {
    it('should update when metrics change', async () => {
      const store = useDashboardStore();
      const initialMetrics = createMockMetrics();
      
      store.updateMetrics(initialMetrics);
      await wrapper.vm.$nextTick();

      let memoryValue = wrapper.find('[data-testid="memory-usage"]');
      expect(memoryValue.text()).toContain('50%');

      // Update metrics
      const updatedMetrics = { ...initialMetrics };
      updatedMetrics.system.memory.percentage = 75;
      
      store.updateMetrics(updatedMetrics);
      await wrapper.vm.$nextTick();

      memoryValue = wrapper.find('[data-testid="memory-usage"]');
      expect(memoryValue.text()).toContain('75%');
    });

    it('should update when new alerts are added', async () => {
      const store = useDashboardStore();
      
      let alertCount = wrapper.find('[data-testid="alert-count"]');
      expect(alertCount.text()).toContain('0');

      store.addAlert(createMockAlert());
      await wrapper.vm.$nextTick();

      alertCount = wrapper.find('[data-testid="alert-count"]');
      expect(alertCount.text()).toContain('1');
    });

    it('should update when new activities are added', async () => {
      const store = useDashboardStore();
      
      expect(wrapper.findAll('.activity-item').length).toBe(0);

      store.addActivity(createMockActivity());
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll('.activity-item').length).toBe(1);
    });
  });

  describe('Connection Status', () => {
    it('should show connection status indicator', () => {
      expect(wrapper.find('.connection-status').exists()).toBe(true);
    });

    it('should show connected state', async () => {
      const store = useDashboardStore();
      
      store.updateConnectionStatus({
        status: 'connected',
        lastConnected: new Date().toISOString(),
        reconnectAttempts: 0,
      });
      
      await wrapper.vm.$nextTick();

      const statusIndicator = wrapper.find('.connection-status');
      expect(statusIndicator.classes()).toContain('connected');
      expect(statusIndicator.text()).toContain('Connected');
    });

    it('should show disconnected state', async () => {
      const store = useDashboardStore();
      
      store.updateConnectionStatus({
        status: 'disconnected',
        lastConnected: new Date().toISOString(),
        reconnectAttempts: 0,
      });
      
      await wrapper.vm.$nextTick();

      const statusIndicator = wrapper.find('.connection-status');
      expect(statusIndicator.classes()).toContain('disconnected');
      expect(statusIndicator.text()).toContain('Disconnected');
    });

    it('should show reconnecting state', async () => {
      const store = useDashboardStore();
      
      store.updateConnectionStatus({
        status: 'reconnecting',
        lastConnected: new Date().toISOString(),
        reconnectAttempts: 2,
      });
      
      await wrapper.vm.$nextTick();

      const statusIndicator = wrapper.find('.connection-status');
      expect(statusIndicator.classes()).toContain('reconnecting');
      expect(statusIndicator.text()).toContain('Reconnecting');
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive classes', () => {
      expect(wrapper.find('.overview-container').classes()).toContain('responsive');
    });

    it('should stack cards on mobile', () => {
      const statusCards = wrapper.find('.status-cards');
      expect(statusCards.classes()).toContain('mobile-stack');
    });

    it('should adjust chart sizes for mobile', () => {
      const charts = wrapper.findAll('.mini-chart');
      charts.forEach(chart => {
        expect(chart.classes()).toContain('responsive-chart');
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state when no data', () => {
      const loadingElements = wrapper.findAll('.loading-skeleton');
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    it('should hide loading state when data is available', async () => {
      const store = useDashboardStore();
      const mockMetrics = createMockMetrics();
      
      store.updateMetrics(mockMetrics);
      await wrapper.vm.$nextTick();

      const loadingElements = wrapper.findAll('.loading-skeleton');
      expect(loadingElements.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing metrics gracefully', () => {
      const store = useDashboardStore();
      store.updateMetrics(null);
      
      expect(() => wrapper.vm.$nextTick()).not.toThrow();
      expect(wrapper.find('.error-state').exists()).toBe(true);
    });

    it('should show error message for failed data loading', async () => {
      const store = useDashboardStore();
      
      // Simulate error state
      store.$patch({ error: 'Failed to load dashboard data' });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.error-message').exists()).toBe(true);
      expect(wrapper.text()).toContain('Failed to load dashboard data');
    });

    it('should provide retry functionality on error', async () => {
      const store = useDashboardStore();
      const retrySpy = vi.spyOn(store, 'fetchDashboardData');
      
      store.$patch({ error: 'Network error' });
      await wrapper.vm.$nextTick();

      const retryButton = wrapper.find('[data-testid="retry-button"]');
      expect(retryButton.exists()).toBe(true);
      
      await retryButton.trigger('click');
      expect(retrySpy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const overview = wrapper.find('.overview-container');
      expect(overview.attributes('role')).toBe('main');
      expect(overview.attributes('aria-label')).toBe('Dashboard Overview');
    });

    it('should have proper heading structure', () => {
      const headings = wrapper.findAll('h1, h2, h3, h4, h5, h6');
      expect(headings.length).toBeGreaterThan(0);
      
      const mainHeading = wrapper.find('h1');
      expect(mainHeading.exists()).toBe(true);
      expect(mainHeading.text()).toContain('Dashboard');
    });

    it('should support keyboard navigation', async () => {
      const focusableElements = wrapper.findAll('button, a, [tabindex="0"]');
      expect(focusableElements.length).toBeGreaterThan(0);
      
      const firstFocusable = focusableElements[0];
      await firstFocusable.trigger('focus');
      
      expect(document.activeElement).toBe(firstFocusable.element);
    });

    it('should have proper color contrast', () => {
      const statusCards = wrapper.findAll('.status-card');
      statusCards.forEach(card => {
        expect(card.classes()).toContain('high-contrast');
      });
    });
  });
});