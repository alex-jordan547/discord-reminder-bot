<template>
  <div class="dashboard-container responsive">
    <!-- Mobile overlay -->
    <div v-if="isMobileMenuOpen" class="dashboard-overlay" @click="closeMobileMenu"></div>

    <!-- Mobile menu toggle -->
    <button
      class="mobile-menu-toggle"
      @click="toggleMobileMenu"
      :aria-label="isMobileMenuOpen ? 'Close menu' : 'Open menu'"
    >
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
    </button>

    <!-- Sidebar Navigation -->
    <nav class="dashboard-sidebar" :class="{ 'mobile-open': isMobileMenuOpen }">
      <div class="sidebar-header">
        <h2>Dashboard</h2>
        <ThemeToggle />
      </div>

      <ul class="nav-list">
        <li
          v-for="item in navigationItems"
          :key="item.name"
          class="nav-item"
          :class="{
            active: $route.name === item.name,
            'touch-active': touchActiveItem === item.name,
          }"
        >
          <router-link
            :to="{ name: item.name }"
            :data-testid="`nav-${item.name}`"
            class="nav-link"
            @touchstart="handleTouchStart(item.name, $event)"
            @touchend="handleTouchEnd(item.name, $event)"
            @click="handleNavClick"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-text">{{ item.label }}</span>
          </router-link>
        </li>
      </ul>
    </nav>

    <!-- Main Content Area -->
    <main class="dashboard-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import ThemeToggle from '@/components/ThemeToggle.vue';

// Navigation items configuration
const navigationItems = [
  { name: 'overview', label: 'Overview', icon: '📊' },
  { name: 'metrics', label: 'Metrics', icon: '📈' },
  { name: 'database', label: 'Database', icon: '🗄️' },
  { name: 'alerts', label: 'Alerts', icon: '🚨' },
];

// Mobile menu state
const isMobileMenuOpen = ref(false);
const touchActiveItem = ref<string | null>(null);

// Route for active navigation highlighting
const route = useRoute();

// Mobile menu functions
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
};

// Touch interaction handlers
const handleTouchStart = (itemName: string, event: TouchEvent) => {
  touchActiveItem.value = itemName;
};

const handleTouchEnd = (itemName: string, event: TouchEvent) => {
  touchActiveItem.value = null;
  // Navigate on touch end for better UX
  // The router-link will handle the navigation automatically
};

const handleNavClick = () => {
  // Close mobile menu when navigating
  if (isMobileMenuOpen.value) {
    closeMobileMenu();
  }
};

// Handle window resize for responsive behavior
const handleResize = () => {
  if (window.innerWidth > 768 && isMobileMenuOpen.value) {
    closeMobileMenu();
  }
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.dashboard-container {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-primary);
  position: relative;
}

.dashboard-container.responsive {
  /* Responsive container styles */
}

/* Mobile overlay */
.dashboard-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 998;
  display: none;
}

/* Mobile menu toggle */
.mobile-menu-toggle {
  display: none;
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 1000;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.75rem;
  cursor: pointer;
  flex-direction: column;
  gap: 0.25rem;
}

.hamburger-line {
  width: 1.5rem;
  height: 2px;
  background-color: var(--text-primary);
  transition: all 0.3s ease;
}

/* Sidebar */
.dashboard-sidebar {
  width: 250px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  padding: 1.5rem 0;
  overflow-y: auto;
  transition: transform 0.3s ease;
}

.sidebar-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 1.5rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-item {
  margin-bottom: 0.25rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  border-radius: 0;
  position: relative;
}

.nav-link:hover {
  background-color: var(--hover-bg);
  color: var(--text-primary);
}

.nav-item.active .nav-link {
  background-color: var(--primary-bg);
  color: var(--primary-text);
  border-right: 3px solid var(--primary-color);
}

.nav-item.touch-active .nav-link {
  background-color: var(--hover-bg);
  transform: scale(0.98);
}

.nav-icon {
  font-size: 1.25rem;
  width: 1.5rem;
  text-align: center;
}

.nav-text {
  font-weight: 500;
}

/* Main content */
.dashboard-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  background-color: var(--bg-primary);
}

/* Mobile styles */
@media (max-width: 768px) {
  .mobile-menu-toggle {
    display: flex;
  }

  .dashboard-overlay {
    display: block;
  }

  .dashboard-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 999;
    transform: translateX(-100%);
  }

  .dashboard-sidebar.mobile-open {
    transform: translateX(0);
  }

  .dashboard-content {
    padding: 5rem 1rem 1rem;
    width: 100%;
  }
}

/* Touch-friendly interactions */
@media (hover: none) and (pointer: coarse) {
  .nav-link {
    padding: 1rem 1.5rem;
    min-height: 48px;
  }

  .mobile-menu-toggle {
    padding: 1rem;
    min-width: 48px;
    min-height: 48px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .nav-item.active .nav-link {
    border-right-width: 4px;
  }

  .dashboard-sidebar {
    border-right-width: 2px;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .dashboard-sidebar,
  .nav-link,
  .hamburger-line {
    transition: none;
  }
}
</style>
