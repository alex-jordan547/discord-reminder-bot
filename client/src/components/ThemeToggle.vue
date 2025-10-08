<template>
  <button
    class="theme-toggle"
    @click="toggleTheme"
    :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
    :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
  >
    <span class="theme-icon">
      {{ isDark ? '☀️' : '🌙' }}
    </span>
    <span class="theme-text">
      {{ isDark ? 'Light' : 'Dark' }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();
const { isDark, toggleTheme } = themeStore;
</script>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.875rem;
  font-weight: 500;
}

.theme-toggle:hover {
  background: var(--hover-bg);
  border-color: var(--border-hover);
}

.theme-toggle:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.theme-icon {
  font-size: 1rem;
  line-height: 1;
}

.theme-text {
  font-size: 0.875rem;
}

/* Mobile styles */
@media (max-width: 768px) {
  .theme-toggle {
    padding: 0.75rem;
    min-width: 48px;
    min-height: 48px;
    justify-content: center;
  }

  .theme-text {
    display: none;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .theme-toggle {
    border-width: 2px;
  }

  .theme-toggle:focus {
    outline-width: 3px;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .theme-toggle {
    transition: none;
  }
}
</style>
