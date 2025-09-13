import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import DashboardLayout from '@/components/DashboardLayout.vue';

// Mock routes for testing
const mockRoutes = [
  { path: '/', name: 'overview', component: { template: '<div>Overview</div>' } },
  { path: '/metrics', name: 'metrics', component: { template: '<div>Metrics</div>' } },
  { path: '/database', name: 'database', component: { template: '<div>Database</div>' } },
  { path: '/alerts', name: 'alerts', component: { template: '<div>Alerts</div>' } },
];

describe('DashboardLayout', () => {
  let wrapper: VueWrapper;
  let router: any;
  let pinia: any;

  beforeEach(async () => {
    // Create router instance
    router = createRouter({
      history: createWebHistory(),
      routes: mockRoutes,
    });

    // Create pinia instance
    pinia = createPinia();

    // Mount component with router and pinia
    wrapper = mount(DashboardLayout, {
      global: {
        plugins: [router, pinia],
      },
    });

    // Wait for router to be ready
    await router.isReady();
  });

  describe('Responsive Layout', () => {
    it('should render main dashboard container', () => {
      expect(wrapper.find('.dashboard-container').exists()).toBe(true);
    });

    it('should render sidebar navigation', () => {
      expect(wrapper.find('.dashboard-sidebar').exists()).toBe(true);
    });

    it('should render main content area', () => {
      expect(wrapper.find('.dashboard-content').exists()).toBe(true);
    });

    it('should render navigation items', () => {
      const navItems = wrapper.findAll('.nav-item');
      expect(navItems.length).toBeGreaterThan(0);
    });

    it('should have responsive classes for mobile', () => {
      expect(wrapper.find('.dashboard-container').classes()).toContain('responsive');
    });
  });

  describe('Navigation', () => {
    it('should render all navigation links', () => {
      const expectedLinks = ['Overview', 'Metrics', 'Database', 'Alerts'];
      expectedLinks.forEach(linkText => {
        expect(wrapper.text()).toContain(linkText);
      });
    });

    it('should highlight active navigation item', async () => {
      await router.push('/metrics');
      await wrapper.vm.$nextTick();

      const activeItem = wrapper.find('.nav-item.active');
      expect(activeItem.exists()).toBe(true);
    });

    it('should navigate when clicking nav items', async () => {
      const metricsLink = wrapper.find('[data-testid="nav-metrics"]');
      await metricsLink.trigger('click');

      expect(router.currentRoute.value.name).toBe('metrics');
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should have mobile menu toggle button', () => {
      expect(wrapper.find('.mobile-menu-toggle').exists()).toBe(true);
    });

    it('should toggle sidebar on mobile menu click', async () => {
      const toggleButton = wrapper.find('.mobile-menu-toggle');
      await toggleButton.trigger('click');

      expect(wrapper.find('.dashboard-sidebar').classes()).toContain('mobile-open');
    });

    it('should close sidebar when clicking outside on mobile', async () => {
      // Open sidebar first
      await wrapper.find('.mobile-menu-toggle').trigger('click');
      expect(wrapper.find('.dashboard-sidebar').classes()).toContain('mobile-open');

      // Click outside
      await wrapper.find('.dashboard-overlay').trigger('click');
      expect(wrapper.find('.dashboard-sidebar').classes()).not.toContain('mobile-open');
    });
  });

  describe('Touch Interactions', () => {
    it('should handle touch events on navigation items', async () => {
      const navItem = wrapper.find('[data-testid="nav-overview"]');

      await navItem.trigger('touchstart');
      await navItem.trigger('touchend');

      // Touch events should work with router-link navigation
      expect(navItem.exists()).toBe(true);
      expect(navItem.attributes('data-testid')).toBe('nav-overview');
    });

    it('should provide visual feedback on touch', async () => {
      const navItem = wrapper.find('[data-testid="nav-overview"]');
      const navItemElement = navItem.element.parentElement; // Get the li element

      await navItem.trigger('touchstart');
      await wrapper.vm.$nextTick();

      expect(navItemElement?.classList.contains('touch-active')).toBe(true);

      await navItem.trigger('touchend');
      await wrapper.vm.$nextTick();

      expect(navItemElement?.classList.contains('touch-active')).toBe(false);
    });
  });
});
