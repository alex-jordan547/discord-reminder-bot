import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

export type Theme = 'light' | 'dark';

export const useThemeStore = defineStore('theme', () => {
  // State
  const currentTheme = ref<Theme>('light');

  // Computed properties
  const isDark = computed(() => currentTheme.value === 'dark');
  const isLight = computed(() => currentTheme.value === 'light');

  // Initialize theme from localStorage
  const initializeTheme = () => {
    try {
      const savedTheme = localStorage.getItem('dashboard-theme') as Theme;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        currentTheme.value = savedTheme;
      }
    } catch (error) {
      // Handle cases where localStorage is not available
      console.warn('localStorage not available, using default theme');
    }
    applyThemeToDOM();
  };

  // Apply theme class to document body
  const applyThemeToDOM = () => {
    // Remove existing theme classes
    document.body.classList.remove('theme-light', 'theme-dark');
    // Add current theme class
    document.body.classList.add(`theme-${currentTheme.value}`);
  };

  // Actions
  const setTheme = (theme: Theme) => {
    currentTheme.value = theme;
    localStorage.setItem('dashboard-theme', theme);
    applyThemeToDOM();
  };

  const toggleTheme = () => {
    const newTheme = currentTheme.value === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // Watch for theme changes to apply to DOM
  watch(currentTheme, () => {
    applyThemeToDOM();
  });

  // Initialize theme on store creation
  initializeTheme();

  return {
    // State
    currentTheme,

    // Computed
    isDark,
    isLight,

    // Actions
    setTheme,
    toggleTheme,
  };
});
