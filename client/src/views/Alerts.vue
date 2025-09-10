<template>
  <div class="alerts-view">
    <div class="alerts-header">
      <h1>Alerts & Notifications</h1>
      <p>Monitor and manage system alerts, warnings, and notifications</p>

      <div class="alerts-controls">
        <div class="filter-controls">
          <label for="alert-filter">Filter by type:</label>
          <select
            id="alert-filter"
            v-model="selectedFilter"
            data-testid="alert-filter"
            @change="applyFilter"
          >
            <option value="">All Alerts</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>

        <div class="action-controls">
          <button
            class="acknowledge-all-btn"
            data-testid="acknowledge-all"
            @click="acknowledgeAll"
            :disabled="!hasUnacknowledgedAlerts"
          >
            ✓ Acknowledge All
          </button>
          <button
            class="clear-acknowledged-btn"
            data-testid="clear-acknowledged"
            @click="clearAcknowledged"
            :disabled="!hasAcknowledgedAlerts"
          >
            🗑️ Clear Acknowledged
          </button>
          <button
            class="refresh-btn"
            data-testid="refresh-alerts"
            @click="refreshAlerts"
            :disabled="loading"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    </div>

    <div class="alerts-stats">
      <div class="stat-card critical">
        <div class="stat-icon">🚨</div>
        <div class="stat-content">
          <div class="stat-number">{{ alertStats.critical }}</div>
          <div class="stat-label">Critical</div>
        </div>
      </div>

      <div class="stat-card error">
        <div class="stat-icon">❌</div>
        <div class="stat-content">
          <div class="stat-number">{{ alertStats.error }}</div>
          <div class="stat-label">Errors</div>
        </div>
      </div>

      <div class="stat-card warning">
        <div class="stat-icon">⚠️</div>
        <div class="stat-content">
          <div class="stat-number">{{ alertStats.warning }}</div>
          <div class="stat-label">Warnings</div>
        </div>
      </div>

      <div class="stat-card info">
        <div class="stat-icon">ℹ️</div>
        <div class="stat-content">
          <div class="stat-number">{{ alertStats.info }}</div>
          <div class="stat-label">Info</div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-state" data-testid="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading alerts...</p>
    </div>

    <div v-else class="alerts-content">
      <AlertDisplay
        :alerts="filteredAlerts"
        :filter="selectedFilter"
        :max-alerts="20"
        :show-dismiss="true"
        :show-source="true"
        :auto-hide="false"
        data-testid="main-alerts-display"
        @acknowledge="handleAlertAcknowledge"
        @dismiss="handleAlertDismiss"
      />

      <div v-if="filteredAlerts.length === 0" class="no-alerts" data-testid="no-alerts">
        <div class="no-alerts-icon">🎉</div>
        <h3>No alerts found</h3>
        <p v-if="selectedFilter">No {{ selectedFilter }} alerts at this time.</p>
        <p v-else>All systems are running smoothly!</p>
      </div>
    </div>

    <!-- Alert Details Modal -->
    <div v-if="selectedAlert" class="alert-modal-overlay" @click="closeAlertModal">
      <div class="alert-modal" @click.stop data-testid="alert-modal">
        <div class="alert-modal-header">
          <h3>Alert Details</h3>
          <button class="close-btn" @click="closeAlertModal">✕</button>
        </div>

        <div class="alert-modal-content">
          <div class="alert-detail-row">
            <strong>Type:</strong>
            <span :class="`alert-type-badge ${selectedAlert.type}`">
              {{ selectedAlert.type.toUpperCase() }}
            </span>
          </div>

          <div class="alert-detail-row">
            <strong>Title:</strong>
            <span>{{ selectedAlert.title }}</span>
          </div>

          <div class="alert-detail-row">
            <strong>Message:</strong>
            <span>{{ selectedAlert.message }}</span>
          </div>

          <div class="alert-detail-row">
            <strong>Source:</strong>
            <span>{{ selectedAlert.source }}</span>
          </div>

          <div class="alert-detail-row">
            <strong>Timestamp:</strong>
            <span>{{ formatFullTimestamp(selectedAlert.timestamp) }}</span>
          </div>

          <div class="alert-detail-row">
            <strong>Status:</strong>
            <span :class="selectedAlert.acknowledged ? 'acknowledged' : 'unacknowledged'">
              {{ selectedAlert.acknowledged ? 'Acknowledged' : 'Unacknowledged' }}
            </span>
          </div>
        </div>

        <div class="alert-modal-actions">
          <button
            v-if="!selectedAlert.acknowledged"
            class="acknowledge-btn"
            @click="acknowledgeAlert(selectedAlert.id)"
          >
            ✓ Acknowledge
          </button>
          <button class="dismiss-btn" @click="dismissAlert(selectedAlert.id)">🗑️ Dismiss</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import AlertDisplay from '@/components/AlertDisplay.vue';
import type { Alert } from '@/types';

// Reactive state
const loading = ref(false);
const selectedFilter = ref<'' | 'critical' | 'error' | 'warning' | 'info'>('');
const selectedAlert = ref<Alert | null>(null);
const alerts = ref<Alert[]>([]);

// Auto-refresh timer
let refreshInterval: NodeJS.Timeout | null = null;

// Computed properties
const filteredAlerts = computed(() => {
  if (!selectedFilter.value) {
    return alerts.value;
  }
  return alerts.value.filter(alert => alert.type === selectedFilter.value);
});

const alertStats = computed(() => {
  const stats = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
  };

  alerts.value.forEach(alert => {
    stats[alert.type]++;
  });

  return stats;
});

const hasUnacknowledgedAlerts = computed(() => {
  return alerts.value.some(alert => !alert.acknowledged);
});

const hasAcknowledgedAlerts = computed(() => {
  return alerts.value.some(alert => alert.acknowledged);
});

// Methods
function generateMockAlert(): Alert {
  const types: Alert['type'][] = ['critical', 'error', 'warning', 'info'];
  const sources = [
    'System Monitor',
    'Bot Service',
    'Database',
    'Network',
    'Security',
    'Performance',
  ];
  const type = types[Math.floor(Math.random() * types.length)];

  const alertTemplates = {
    critical: [
      {
        title: 'System Critical Error',
        message: 'CPU usage has exceeded 95% for more than 5 minutes',
      },
      {
        title: 'Bot Disconnected',
        message: 'Discord bot has lost connection and failed to reconnect',
      },
      { title: 'Database Connection Lost', message: 'Unable to connect to the primary database' },
      {
        title: 'Memory Exhaustion',
        message: 'System memory usage has reached critical levels (>90%)',
      },
    ],
    error: [
      {
        title: 'Command Processing Failed',
        message: 'Failed to process user command due to internal error',
      },
      { title: 'API Rate Limit Exceeded', message: 'Discord API rate limit has been exceeded' },
      { title: 'Database Query Error', message: 'Database query failed with timeout error' },
      { title: 'File System Error', message: 'Unable to write to log files - disk may be full' },
    ],
    warning: [
      {
        title: 'High Response Time',
        message: 'Average response time has increased to 2.5 seconds',
      },
      { title: 'Disk Space Low', message: 'Available disk space is below 20%' },
      { title: 'Memory Usage High', message: 'Memory usage has exceeded 75% threshold' },
      { title: 'Rate Limit Approaching', message: 'API usage is approaching rate limit threshold' },
    ],
    info: [
      { title: 'New Guild Joined', message: 'Bot has been added to a new Discord server' },
      { title: 'Scheduled Maintenance', message: 'Scheduled maintenance window begins in 2 hours' },
      { title: 'Backup Completed', message: 'Daily database backup completed successfully' },
      {
        title: 'System Update Available',
        message: 'A new system update is available for installation',
      },
    ],
  };

  const template = alertTemplates[type][Math.floor(Math.random() * alertTemplates[type].length)];

  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    title: template.title,
    message: template.message,
    source: sources[Math.floor(Math.random() * sources.length)],
    timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(), // Random time in last 24h
    acknowledged: Math.random() > 0.7, // 30% chance of being acknowledged
  };
}

async function refreshAlerts() {
  loading.value = true;

  try {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Generate some new alerts occasionally
    if (Math.random() > 0.6) {
      const newAlertsCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < newAlertsCount; i++) {
        alerts.value.unshift(generateMockAlert());
      }
    }

    // Keep only last 50 alerts
    if (alerts.value.length > 50) {
      alerts.value = alerts.value.slice(0, 50);
    }

    // Sort by timestamp (newest first)
    alerts.value.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error('Failed to refresh alerts:', error);
  } finally {
    loading.value = false;
  }
}

function applyFilter() {
  // Filter is applied automatically via computed property
}

function acknowledgeAll() {
  alerts.value.forEach(alert => {
    if (!alert.acknowledged) {
      alert.acknowledged = true;
    }
  });
}

function clearAcknowledged() {
  alerts.value = alerts.value.filter(alert => !alert.acknowledged);
}

function handleAlertAcknowledge(alertId: string) {
  const alert = alerts.value.find(a => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
  }
}

function handleAlertDismiss(alertId: string) {
  alerts.value = alerts.value.filter(a => a.id !== alertId);

  // Close modal if the dismissed alert was selected
  if (selectedAlert.value?.id === alertId) {
    selectedAlert.value = null;
  }
}

function acknowledgeAlert(alertId: string) {
  handleAlertAcknowledge(alertId);
  if (selectedAlert.value?.id === alertId) {
    selectedAlert.value.acknowledged = true;
  }
}

function dismissAlert(alertId: string) {
  handleAlertDismiss(alertId);
  selectedAlert.value = null;
}

function closeAlertModal() {
  selectedAlert.value = null;
}

function formatFullTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    refreshAlerts();
  }, 30000); // Refresh every 30 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Lifecycle
onMounted(async () => {
  // Generate initial alerts
  for (let i = 0; i < 15; i++) {
    alerts.value.push(generateMockAlert());
  }

  // Sort by timestamp
  alerts.value.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Start auto-refresh
  startAutoRefresh();
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<style scoped>
.alerts-view {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.alerts-header {
  margin-bottom: 2rem;
}

.alerts-header h1 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 2rem;
  font-weight: 700;
}

.alerts-header p {
  margin: 0 0 1.5rem 0;
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.alerts-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-controls label {
  font-weight: 600;
  color: var(--text-primary);
}

.filter-controls select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.action-controls {
  display: flex;
  gap: 0.5rem;
}

.acknowledge-all-btn,
.clear-acknowledged-btn,
.refresh-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.acknowledge-all-btn:hover,
.clear-acknowledged-btn:hover,
.refresh-btn:hover {
  background: var(--bg-tertiary);
}

.acknowledge-all-btn:disabled,
.clear-acknowledged-btn:disabled,
.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alerts-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  border-left: 4px solid;
}

.stat-card.critical {
  border-left-color: #ef4444;
}

.stat-card.error {
  border-left-color: #f97316;
}

.stat-card.warning {
  border-left-color: #f59e0b;
}

.stat-card.info {
  border-left-color: #3b82f6;
}

.stat-icon {
  font-size: 2rem;
}

.stat-content {
  flex: 1;
}

.stat-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--bg-tertiary);
  border-top: 4px solid var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.alerts-content {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid var(--border-color);
}

.no-alerts {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.no-alerts-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.no-alerts h3 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 1.5rem;
}

.no-alerts p {
  margin: 0;
  font-size: 1.1rem;
}

/* Alert Modal */
.alert-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.alert-modal {
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 0;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}

.alert-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.alert-modal-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.25rem;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.alert-modal-content {
  padding: 1.5rem;
}

.alert-detail-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  align-items: flex-start;
}

.alert-detail-row strong {
  min-width: 100px;
  color: var(--text-primary);
}

.alert-type-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.alert-type-badge.critical {
  background: #fef2f2;
  color: #ef4444;
}

.alert-type-badge.error {
  background: #fff7ed;
  color: #f97316;
}

.alert-type-badge.warning {
  background: #fffbeb;
  color: #f59e0b;
}

.alert-type-badge.info {
  background: #eff6ff;
  color: #3b82f6;
}

.acknowledged {
  color: var(--success-color);
  font-weight: 600;
}

.unacknowledged {
  color: var(--error-color);
  font-weight: 600;
}

.alert-modal-actions {
  display: flex;
  gap: 0.5rem;
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
  justify-content: flex-end;
}

.acknowledge-btn,
.dismiss-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.acknowledge-btn {
  background: var(--success-color);
  color: white;
  border-color: var(--success-color);
}

.acknowledge-btn:hover {
  background: #059669;
}

.dismiss-btn {
  background: var(--error-color);
  color: white;
  border-color: var(--error-color);
}

.dismiss-btn:hover {
  background: #dc2626;
}

/* Responsive design */
@media (max-width: 768px) {
  .alerts-view {
    padding: 1rem;
  }

  .alerts-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .action-controls {
    justify-content: center;
    flex-wrap: wrap;
  }

  .alerts-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .alert-modal {
    width: 95%;
    margin: 1rem;
  }

  .alert-detail-row {
    flex-direction: column;
    gap: 0.25rem;
  }

  .alert-detail-row strong {
    min-width: auto;
  }
}

@media (max-width: 480px) {
  .alerts-header h1 {
    font-size: 1.5rem;
  }

  .alerts-stats {
    grid-template-columns: 1fr;
  }

  .action-controls {
    flex-direction: column;
  }
}
</style>
