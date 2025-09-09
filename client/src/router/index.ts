import { createRouter, createWebHistory } from 'vue-router';

// Lazy load components for better performance
const Overview = () => import('@/views/Overview.vue');
const Metrics = () => import('@/views/Metrics.vue');
const Database = () => import('@/views/Database.vue');
const Alerts = () => import('@/views/Alerts.vue');

const routes = [
  {
    path: '/',
    name: 'overview',
    component: Overview,
    meta: {
      title: 'Overview',
      description: 'Dashboard overview with key metrics and status'
    }
  },
  {
    path: '/metrics',
    name: 'metrics',
    component: Metrics,
    meta: {
      title: 'Metrics',
      description: 'Detailed system and bot metrics visualization'
    }
  },
  {
    path: '/database',
    name: 'database',
    component: Database,
    meta: {
      title: 'Database',
      description: 'Database management and export/import tools'
    }
  },
  {
    path: '/alerts',
    name: 'alerts',
    component: Alerts,
    meta: {
      title: 'Alerts',
      description: 'System alerts and notifications'
    }
  },
  {
    // Catch-all route for 404s
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  }
});

// Navigation guards
router.beforeEach((to, from, next) => {
  // Update document title
  if (to.meta?.title) {
    document.title = `${to.meta.title} - Discord Bot Dashboard`;
  } else {
    document.title = 'Discord Bot Dashboard';
  }
  
  next();
});

export default router;