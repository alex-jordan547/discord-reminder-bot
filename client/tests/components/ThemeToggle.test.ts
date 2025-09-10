import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useThemeStore } from '@/stores/theme';

describe('ThemeToggle', () => {
  let wrapper: VueWrapper;
  let pinia: any;

  beforeEach(() => {
    pinia = createPinia();
    wrapper = mount(ThemeToggle, {
      global: {
        plugins: [pinia],
      },
    });
  });

  describe('Rendering', () => {
    it('should render theme toggle button', () => {
      expect(wrapper.find('.theme-toggle').exists()).toBe(true);
      expect(wrapper.find('button').exists()).toBe(true);
    });

    it('should show current theme icon', () => {
      const store = useThemeStore();

      // Test light theme icon
      store.setTheme('light');
      expect(wrapper.find('.theme-icon-light').exists()).toBe(true);

      // Test dark theme icon
      store.setTheme('dark');
      expect(wrapper.find('.theme-icon-dark').exists()).toBe(true);
    });

    it('should have proper accessibility attributes', () => {
      const button = wrapper.find('button');

      expect(button.attributes('aria-label')).toContain('theme');
      expect(button.attributes('role')).toBe('switch');
      expect(button.attributes('aria-pressed')).toBeDefined();
    });

    it('should show tooltip with current theme', async () => {
      const store = useThemeStore();
      store.setTheme('light');

      const button = wrapper.find('button');
      await button.trigger('mouseenter');

      expect(wrapper.find('.tooltip').exists()).toBe(true);
      expect(wrapper.find('.tooltip').text()).toContain('Switch to dark theme');
    });
  });

  describe('Theme Switching', () => {
    it('should toggle theme when clicked', async () => {
      const store = useThemeStore();
      const toggleSpy = vi.spyOn(store, 'toggleTheme');

      const button = wrapper.find('button');
      await button.trigger('click');

      expect(toggleSpy).toHaveBeenCalled();
    });

    it('should switch from light to dark', async () => {
      const store = useThemeStore();
      store.setTheme('light');

      const button = wrapper.find('button');
      await button.trigger('click');

      expect(store.currentTheme).toBe('dark');
    });

    it('should switch from dark to light', async () => {
      const store = useThemeStore();
      store.setTheme('dark');

      const button = wrapper.find('button');
      await button.trigger('click');

      expect(store.currentTheme).toBe('light');
    });

    it('should update aria-pressed attribute', async () => {
      const store = useThemeStore();
      const button = wrapper.find('button');

      store.setTheme('light');
      await wrapper.vm.$nextTick();
      expect(button.attributes('aria-pressed')).toBe('false');

      store.setTheme('dark');
      await wrapper.vm.$nextTick();
      expect(button.attributes('aria-pressed')).toBe('true');
    });
  });

  describe('Keyboard Support', () => {
    it('should toggle theme with Enter key', async () => {
      const store = useThemeStore();
      const toggleSpy = vi.spyOn(store, 'toggleTheme');

      const button = wrapper.find('button');
      await button.trigger('keydown.enter');

      expect(toggleSpy).toHaveBeenCalled();
    });

    it('should toggle theme with Space key', async () => {
      const store = useThemeStore();
      const toggleSpy = vi.spyOn(store, 'toggleTheme');

      const button = wrapper.find('button');
      await button.trigger('keydown.space');

      expect(toggleSpy).toHaveBeenCalled();
    });

    it('should be focusable', () => {
      const button = wrapper.find('button');
      expect(button.attributes('tabindex')).not.toBe('-1');
    });

    it('should show focus indicator', async () => {
      const button = wrapper.find('button');
      await button.trigger('focus');

      expect(button.classes()).toContain('focused');
    });
  });

  describe('Animation and Transitions', () => {
    it('should have transition classes', () => {
      const toggle = wrapper.find('.theme-toggle');
      expect(toggle.classes()).toContain('theme-transition');
    });

    it('should animate icon change', async () => {
      const store = useThemeStore();
      const icon = wrapper.find('.theme-icon');

      store.setTheme('light');
      await wrapper.vm.$nextTick();

      store.setTheme('dark');
      await wrapper.vm.$nextTick();

      expect(icon.classes()).toContain('icon-transition');
    });

    it('should have smooth color transitions', () => {
      const button = wrapper.find('button');
      const computedStyle = getComputedStyle(button.element);

      expect(computedStyle.transition).toContain('background-color');
      expect(computedStyle.transition).toContain('color');
    });
  });

  describe('Theme Persistence', () => {
    it('should save theme preference to localStorage', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const store = useThemeStore();

      store.setTheme('dark');

      expect(setItemSpy).toHaveBeenCalledWith('theme-preference', 'dark');
    });

    it('should load theme preference from localStorage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('dark');

      const newWrapper = mount(ThemeToggle, {
        global: {
          plugins: [createPinia()],
        },
      });

      const store = useThemeStore();
      expect(store.currentTheme).toBe('dark');
    });

    it('should apply theme to document root', async () => {
      const store = useThemeStore();

      store.setTheme('dark');
      await wrapper.vm.$nextTick();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('System Theme Detection', () => {
    it('should detect system theme preference', () => {
      // Mock matchMedia for dark theme
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const store = useThemeStore();
      store.initializeTheme();

      expect(store.systemTheme).toBe('dark');
    });

    it('should follow system theme when no preference set', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-color-scheme: light)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const store = useThemeStore();
      store.initializeTheme();

      expect(store.currentTheme).toBe('light');
    });

    it('should listen for system theme changes', () => {
      const mockAddEventListener = vi.fn();

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          media: '',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: mockAddEventListener,
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const store = useThemeStore();
      store.initializeTheme();

      expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('Custom Props', () => {
    it('should accept custom size prop', () => {
      const customWrapper = mount(ThemeToggle, {
        props: { size: 'large' },
        global: {
          plugins: [pinia],
        },
      });

      const button = customWrapper.find('button');
      expect(button.classes()).toContain('size-large');
    });

    it('should accept custom position prop', () => {
      const customWrapper = mount(ThemeToggle, {
        props: { position: 'fixed' },
        global: {
          plugins: [pinia],
        },
      });

      const toggle = customWrapper.find('.theme-toggle');
      expect(toggle.classes()).toContain('position-fixed');
    });

    it('should accept disabled prop', () => {
      const customWrapper = mount(ThemeToggle, {
        props: { disabled: true },
        global: {
          plugins: [pinia],
        },
      });

      const button = customWrapper.find('button');
      expect(button.attributes('disabled')).toBeDefined();
      expect(button.classes()).toContain('disabled');
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const store = useThemeStore();

      expect(() => {
        store.setTheme('dark');
      }).not.toThrow();
    });

    it('should fallback to light theme on errors', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage error');
      });

      const store = useThemeStore();
      store.initializeTheme();

      expect(store.currentTheme).toBe('light');
    });

    it('should handle invalid theme values', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('invalid-theme');

      const store = useThemeStore();
      store.initializeTheme();

      expect(store.currentTheme).toBe('light');
    });
  });
});
