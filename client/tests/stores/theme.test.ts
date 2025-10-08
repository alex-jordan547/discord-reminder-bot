import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useThemeStore } from '@/stores/theme';

describe('Theme Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with light theme by default', () => {
      const themeStore = useThemeStore();
      expect(themeStore.currentTheme).toBe('light');
    });

    it('should load theme from localStorage if available', () => {
      // Mock localStorage.getItem to return 'dark'
      vi.mocked(localStorage.getItem).mockReturnValue('dark');

      // Create fresh pinia instance to test initialization
      setActivePinia(createPinia());
      const themeStore = useThemeStore();

      expect(themeStore.currentTheme).toBe('dark');
    });

    it('should have correct computed properties', () => {
      const themeStore = useThemeStore();
      expect(themeStore.isDark).toBe(false);
      expect(themeStore.isLight).toBe(true);
    });
  });

  describe('Theme Switching', () => {
    it('should switch from light to dark theme', () => {
      const themeStore = useThemeStore();

      themeStore.setTheme('dark');

      expect(themeStore.currentTheme).toBe('dark');
      expect(themeStore.isDark).toBe(true);
      expect(themeStore.isLight).toBe(false);
    });

    it('should switch from dark to light theme', () => {
      const themeStore = useThemeStore();
      themeStore.setTheme('dark');

      themeStore.setTheme('light');

      expect(themeStore.currentTheme).toBe('light');
      expect(themeStore.isDark).toBe(false);
      expect(themeStore.isLight).toBe(true);
    });

    it('should toggle theme correctly', () => {
      const themeStore = useThemeStore();

      themeStore.toggleTheme();
      expect(themeStore.currentTheme).toBe('dark');

      themeStore.toggleTheme();
      expect(themeStore.currentTheme).toBe('light');
    });
  });

  describe('Persistence', () => {
    it('should save theme to localStorage when changed', () => {
      const themeStore = useThemeStore();

      themeStore.setTheme('dark');

      expect(localStorage.setItem).toHaveBeenCalledWith('dashboard-theme', 'dark');
    });

    it('should persist theme across store instances', () => {
      const themeStore1 = useThemeStore();
      themeStore1.setTheme('dark');

      // Verify localStorage was set
      expect(localStorage.setItem).toHaveBeenCalledWith('dashboard-theme', 'dark');

      // Mock localStorage.getItem to return 'dark' for new instance
      vi.mocked(localStorage.getItem).mockReturnValue('dark');

      // Create new store instance
      setActivePinia(createPinia());
      const themeStore2 = useThemeStore();

      expect(themeStore2.currentTheme).toBe('dark');
    });
  });

  describe('DOM Integration', () => {
    it('should apply theme class to document body', () => {
      const themeStore = useThemeStore();

      themeStore.setTheme('dark');

      expect(document.body.classList.contains('theme-dark')).toBe(true);
    });

    it('should remove previous theme class when switching', () => {
      const themeStore = useThemeStore();

      themeStore.setTheme('dark');
      expect(document.body.classList.contains('theme-dark')).toBe(true);

      themeStore.setTheme('light');
      expect(document.body.classList.contains('theme-dark')).toBe(false);
      expect(document.body.classList.contains('theme-light')).toBe(true);
    });
  });
});
