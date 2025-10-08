<template>
  <div class="overview-container responsive" role="main" aria-label="Dashboard Overview">
    <h1>Overview</h1>

    <!-- Status Cards -->
    <div class="status-cards mobile-stack">
      <div class="status-card" :class="getStatusClass('system')" data-testid="system-status-card">
        <h3>System Status</h3>
        <div v-if="metrics">
          <p>Memory: {{ metrics.system.memory.percentage }}%</p>
          <p>CPU: {{ metrics.system.cpu.percentage }}%</p>
        </div>
      </div>

      <div class="status-card" :class="getStatusClass('bot')" data-testid="bot-status-card">
        <h3>Bot Status</h3>
        <div v-if="metrics">
          <p>{{ metrics.bot.connected ? 'Connected' : 'Disconnected' }}</p>
          <p>Guilds: {{ metrics.bot.guilds }}</p>
          <p>Users: {{ metrics.bot.users }}</p>
        </div>
      </div>

      <div
        class="status-card"
        :class="getStatusClass('database')"
        data-testid="database-status-card"
      >
        <h3>Database</h3>
        <div v-if="metrics">
          <p>
            {{ metrics.database.connectionStatus === 'connected' ? 'Connected' : 'Disconnected' }}
          </p>
          <p>Queries: {{ metrics.database.queryCount }}</p>
        </div>
      </div>

      <div class="status-card" data-testid="uptime-card">
        <h3>Uptime</h3>
        <div v-if="metrics">
          <p>{{ formatUptime(metrics.system.uptime) }}</p>
        </div>
      </div>
    </div>

    <!-- Metrics Summary -->
    <div class="metrics-summary">
      <h2>Metrics Summary</h2>
      <div v-if="metrics" class="metrics-grid">
        <div class="metric-item">
          <span>Memory</span>
          <span data-testid="memory-usage">{{ metrics.system.memory.percentage }}%</span>
        </div>
        <div class="metric-item">
          <span>CPU</span>
          <span>{{ metrics.system.cpu.percentage }}%</span>
        </div>
        <div class="metric-item">
          <span>Guilds</span>
          <span>{{ metrics.bot.guilds }}</span>
        </div>
        <div class="metric-item">
          <span>Users</span>
          <span>{{ metrics.bot.users }}</span>
        </div>
      </div>

      <div class="mini-chart responsive-chart">
        <!-- Mini chart placeholder -->
        <div class="chart-placeholder">Chart</div>
      </div>

      <router-link to="/metrics" data-testid="view-metrics-details"> View Details </router-link>
    </div>

    <!-- Recent Activity -->
    <div class="recent-activity">
      <h2>Recent Activity</h2>
      <div v-if="recentActivities.length > 0">
        <div
          v-for="activity in recentActivities.slice(0, 10)"
          :key="activity.id"
          class="activity-item"
        >
          <div class="activity-icon">📝</div>
          <div class="activity-content">
            <p>{{ activity.description }}</p>
            <span class="activity-timestamp">{{ formatTimestamp(activity.timestamp) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>No recent activity</p>
      </div>
    </div>

    <!-- Alerts Summary -->
    <div class="alerts-summary">
      <h2>Alerts</h2>
      <div v-if="alerts.length > 0">
        <div class="alert-counts">
          <span data-testid="alert-count">{{ alerts.length }}</span>
          <div class="alert-breakdown">
            <span v-if="criticalAlerts.length > 0">{{ criticalAlerts.length }} Critical</span>
            <span v-if="warningAlerts.length > 0">{{ warningAlerts.length }} Warning</span>
            <span v-if="infoAlerts.length > 0">{{ infoAlerts.length }} Info</span>
          </div>
        </div>

        <div v-if="criticalAlerts.length > 0" class="critical-alerts alert-critical">
          <h3>Critical Alerts</h3>
          <div v-for="alert in criticalAlerts.slice(0, 3)" :key="alert.id">
            {{ alert.title }}
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>No active alerts</p>
      </div>

      <router-link to="/alerts" data-testid="view-all-alerts"> View All Alerts </router-link>
    </div>

    <!-- Connection Status -->
    <div class="connection-status" :class="connectionStatusClass">
      <span>{{ connectionStatusText }}</span>
    </div>

    <!-- Loading States -->
    <div v-if="!metrics" class="loading-skeleton">Loading...</div>

    <!-- Error State -->
    <div v-if="error" class="error-state">
      <div class="error-message">{{ error }}</div>
      <button @click="retry" data-testid="retry-button">Retry</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';

const store = useDashboardStore();

// Computed properties
const metrics = computed(() => store.metrics);
const alerts = computed(() => store.alerts);
const recentActivities = computed(() => store.recentActivities);
const error = computed(() => store.error);

const criticalAlerts = computed(() => alerts.value.filter(alert => alert.type === 'critical'));

const warningAlerts = computed(() => alerts.value.filter(alert => alert.type === 'warning'));

const infoAlerts = computed(() => alerts.value.filter(alert => alert.type === 'info'));

const connectionStatusClass = computed(() => {
  const status = store.connectionStatus.status;
  return {
    connected: status === 'connected',
    disconnected: status === 'disconnected',
    reconnecting: status === 'reconnecting',
  };
});

const connectionStatusText = computed(() => {
  const status = store.connectionStatus.status;
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'reconnecting':
      return 'Reconnecting';
    default:
      return 'Unknown';
  }
});

// Methods
function getStatusClass(type: string) {
  if (!metrics.value) return 'status-unknown';

  switch (type) {
    case 'system':
      const memoryPercent = metrics.value.system.memory.percentage;
      if (memoryPercent > 90) return 'status-critical';
      if (memoryPercent > 80) return 'status-warning';
      return 'status-healthy';

    case 'bot':
      return metrics.value.bot.connected ? 'status-healthy' : 'status-critical';

    case 'database':
      return metrics.value.database.connectionStatus === 'connected'
        ? 'status-healthy'
        : 'status-critical';

    default:
      return 'status-unknown';
  }
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

function retry() {
  // Clear error and retry
  store.$patch({ error: null });
  // Trigger data refresh
}
</script>

<style scoped>
.overview-container {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.status-card {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
}

.status-card.status-healthy {
  border-color: #10b981;
  background-color: #f0fdf4;
}

.status-card.status-warning {
  border-color: #f59e0b;
  background-color: #fffbeb;
}

.status-card.status-critical {
  border-color: #ef4444;
  background-color: #fef2f2;
}

.metrics-summary {
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: #f9fafb;
  border-radius: 4px;
}

.mini-chart {
  height: 200px;
  background: #f9fafb;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.recent-activity {
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid #f3f4f6;
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-icon {
  font-size: 1.2rem;
}

.activity-content {
  flex: 1;
}

.activity-timestamp {
  font-size: 0.875rem;
  color: #6b7280;
}

.alerts-summary {
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.alert-counts {
  margin-bottom: 1rem;
}

.alert-breakdown {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.critical-alerts {
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.alert-critical {
  background-color: #fef2f2;
  border: 1px solid #ef4444;
}

.connection-status {
  position: fixed;
  top: 1rem;
  right: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.connection-status.connected {
  background-color: #10b981;
  color: white;
}

.connection-status.disconnected {
  background-color: #ef4444;
  color: white;
}

.connection-status.reconnecting {
  background-color: #f59e0b;
  color: white;
}

.loading-skeleton {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.error-state {
  padding: 2rem;
  text-align: center;
  border: 1px solid #ef4444;
  border-radius: 8px;
  background-color: #fef2f2;
}

.error-message {
  color: #dc2626;
  margin-bottom: 1rem;
}

.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .mobile-stack {
    grid-template-columns: 1fr;
  }

  .responsive-chart {
    height: 150px;
  }
}

/* Accessibility */
.high-contrast {
  border-width: 2px;
  font-weight: 600;
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .responsive-chart,
  .status-card,
  .activity-item {
    transition: none;
  }
}

.reduced-motion {
  transition: none !important;
  animation: none !important;
}
</style>
