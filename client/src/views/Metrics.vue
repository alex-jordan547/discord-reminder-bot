<template>
  <div class="metrics-view">
    <div class="metrics-header">
      <h1>Metrics Dashboard</h1>
      <p>Real-time monitoring and visualization of system and bot metrics</p>
      
      <div class="metrics-controls">
        <div class="time-range-selector">
          <label for="time-range">Time Range:</label>
          <select 
            id="time-range" 
            v-model="selectedTimeRange" 
            data-testid="time-range-select"
            @change="handleTimeRangeChange"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>
        
        <div class="refresh-controls">
          <button 
            :class="['refresh-btn', { active: autoRefresh }]"
            data-testid="auto-refresh-toggle"
            @click="toggleAutoRefresh"
          >
            {{ autoRefresh ? '⏸️ Pause' : '▶️ Auto Refresh' }}
          </button>
          <button 
            class="manual-refresh-btn"
            data-testid="manual-refresh"
            @click="refreshMetrics"
            :disabled="loading"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading && !hasData" class="loading-state" data-testid="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading metrics data...</p>
    </div>

    <div v-else class="metrics-content">
      <!-- System Metrics Section -->
      <section class="metrics-section">
        <h2>System Metrics</h2>
        <div class="metrics-grid system-metrics">
          <div class="metric-card">
            <h3>CPU Usage</h3>
            <SystemMetricsChart
              :metrics="currentSystemMetrics"
              type="cpu"
              :real-time="autoRefresh"
              :max-data-points="maxDataPoints"
              data-testid="cpu-chart"
            />
          </div>
          
          <div class="metric-card">
            <h3>Memory Usage</h3>
            <SystemMetricsChart
              :metrics="currentSystemMetrics"
              type="memory"
              :real-time="autoRefresh"
              :max-data-points="maxDataPoints"
              data-testid="memory-chart"
            />
          </div>
          
          <div class="metric-card">
            <h3>Network Activity</h3>
            <SystemMetricsChart
              :metrics="currentSystemMetrics"
              type="network"
              :real-time="autoRefresh"
              :max-data-points="maxDataPoints"
              data-testid="network-chart"
            />
          </div>
          
          <div class="metric-card">
            <h3>Disk Usage</h3>
            <SystemMetricsChart
              :metrics="currentSystemMetrics"
              type="disk"
              :real-time="autoRefresh"
              :max-data-points="maxDataPoints"
              data-testid="disk-chart"
            />
          </div>
        </div>
      </section>

      <!-- Bot Metrics Section -->
      <section class="metrics-section">
        <h2>Bot Metrics</h2>
        <div class="metrics-grid bot-metrics">
          <div class="metric-card">
            <h3>Guild Count</h3>
            <BotMetricsChart
              :metrics="currentBotMetrics"
              type="guilds"
              chart-type="line"
              :show-connection-status="true"
              data-testid="guilds-chart"
            />
          </div>
          
          <div class="metric-card">
            <h3>Events Processed</h3>
            <BotMetricsChart
              :metrics="currentBotMetrics"
              type="events"
              chart-type="bar"
              data-testid="events-chart"
            />
          </div>
          
          <div class="metric-card">
            <h3>Commands Success Rate</h3>
            <BotMetricsChart
              :metrics="currentBotMetrics"
              type="commands"
              chart-type="doughnut"
              data-testid="commands-chart"
            />
          </div>
          
          <div class="metric-card">
            <h3>Response Time</h3>
            <BotMetricsChart
              :metrics="currentBotMetrics"
              type="response-time"
              chart-type="line"
              data-testid="response-time-chart"
            />
          </div>
        </div>
      </section>

      <!-- Interactive Charts Section -->
      <section class="metrics-section">
        <h2>Historical Analysis</h2>
        <div class="interactive-charts">
          <div class="chart-card full-width">
            <h3>System Performance Over Time</h3>
            <InteractiveChart
              :metrics-history="metricsHistory"
              :metric-type="selectedMetricType"
              :time-range="selectedTimeRange"
              :loading="loading"
              data-testid="interactive-chart"
              @time-range-change="handleTimeRangeChange"
            />
            
            <div class="metric-type-selector">
              <label>Metric Type:</label>
              <select v-model="selectedMetricType" data-testid="metric-type-select">
                <option value="system.cpu.percentage">CPU Usage (%)</option>
                <option value="system.memory.percentage">Memory Usage (%)</option>
                <option value="system.disk.percentage">Disk Usage (%)</option>
                <option value="system.network.bytesIn">Network Bytes In</option>
                <option value="bot.guilds">Guild Count</option>
                <option value="bot.events">Events Processed</option>
                <option value="bot.commands.averageResponseTime">Response Time (ms)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- Alerts Section -->
      <section class="metrics-section">
        <h2>Active Alerts</h2>
        <div class="alerts-container">
          <AlertDisplay
            :alerts="alerts"
            :max-alerts="10"
            :show-dismiss="true"
            :show-source="true"
            data-testid="alerts-display"
            @acknowledge="handleAlertAcknowledge"
            @dismiss="handleAlertDismiss"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import SystemMetricsChart from '@/components/SystemMetricsChart.vue';
import BotMetricsChart from '@/components/BotMetricsChart.vue';
import InteractiveChart from '@/components/InteractiveChart.vue';
import AlertDisplay from '@/components/AlertDisplay.vue';
import type { SystemMetrics, BotMetrics, MonitoringMetrics, Alert } from '@/types';

// Reactive state
const loading = ref(false);
const autoRefresh = ref(true);
const selectedTimeRange = ref<'1h' | '6h' | '24h' | '7d'>('1h');
const selectedMetricType = ref('system.cpu.percentage');
const maxDataPoints = ref(50);

// Data storage
const currentSystemMetrics = ref<SystemMetrics>({
  uptime: 0,
  cpu: { percentage: 0, cores: 4 },
  memory: { percentage: 0, used: 0, total: 8589934592 },
  disk: { percentage: 0, used: 0, total: 1000000000000 },
  network: { bytesIn: 0, bytesOut: 0 }
});

const currentBotMetrics = ref<BotMetrics>({
  connected: true,
  guilds: 0,
  users: 0,
  events: 0,
  commands: {
    total: 0,
    successful: 0,
    failed: 0,
    averageResponseTime: 0
  },
  errors: {
    critical: 0,
    warnings: 0,
    info: 0
  }
});

const metricsHistory = ref<MonitoringMetrics[]>([]);
const alerts = ref<Alert[]>([]);

// Auto-refresh timer
let refreshInterval: NodeJS.Timeout | null = null;

// Computed properties
const hasData = computed(() => {
  return metricsHistory.value.length > 0 || 
         currentSystemMetrics.value.cpu.percentage > 0 ||
         currentBotMetrics.value.guilds > 0;
});

// Methods
function generateMockSystemMetrics(): SystemMetrics {
  return {
    uptime: Date.now() - Math.random() * 86400000, // Random uptime up to 24 hours
    cpu: {
      percentage: Math.random() * 100,
      cores: 4
    },
    memory: {
      percentage: Math.random() * 80 + 10, // 10-90%
      used: Math.random() * 6000000000 + 1000000000, // 1-7GB
      total: 8589934592 // 8GB
    },
    disk: {
      percentage: Math.random() * 60 + 20, // 20-80%
      used: Math.random() * 500000000000 + 200000000000, // 200-700GB
      total: 1000000000000 // 1TB
    },
    network: {
      bytesIn: Math.random() * 1000000 + 100000, // 100KB-1MB
      bytesOut: Math.random() * 500000 + 50000   // 50KB-500KB
    }
  };
}

function generateMockBotMetrics(): BotMetrics {
  return {
    connected: Math.random() > 0.1, // 90% chance of being connected
    guilds: Math.floor(Math.random() * 50) + 10, // 10-60 guilds
    users: Math.floor(Math.random() * 10000) + 1000, // 1000-11000 users
    events: Math.floor(Math.random() * 1000) + 100, // 100-1100 events
    commands: {
      total: Math.floor(Math.random() * 500) + 50,
      successful: Math.floor(Math.random() * 450) + 40,
      failed: Math.floor(Math.random() * 50) + 5,
      averageResponseTime: Math.random() * 200 + 50 // 50-250ms
    },
    errors: {
      critical: Math.floor(Math.random() * 3),
      warnings: Math.floor(Math.random() * 10) + 2,
      info: Math.floor(Math.random() * 20) + 5
    }
  };
}

function generateMockAlert(): Alert {
  const types: Alert['type'][] = ['critical', 'error', 'warning', 'info'];
  const sources = ['System', 'Bot', 'Database', 'Network'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  const alertMessages = {
    critical: ['System CPU usage above 95%', 'Bot disconnected from Discord', 'Database connection lost'],
    error: ['Failed to process command', 'Memory usage high', 'Network timeout'],
    warning: ['High response time detected', 'Disk space running low', 'Rate limit approaching'],
    info: ['New guild joined', 'Scheduled maintenance reminder', 'Backup completed successfully']
  };
  
  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Alert`,
    message: alertMessages[type][Math.floor(Math.random() * alertMessages[type].length)],
    source: sources[Math.floor(Math.random() * sources.length)],
    timestamp: new Date().toISOString(),
    acknowledged: Math.random() > 0.7 // 30% chance of being acknowledged
  };
}

function generateHistoricalData() {
  const now = Date.now();
  const points = selectedTimeRange.value === '1h' ? 60 : 
                selectedTimeRange.value === '6h' ? 72 : 
                selectedTimeRange.value === '24h' ? 96 : 168;
  
  const interval = selectedTimeRange.value === '1h' ? 60000 : // 1 minute
                  selectedTimeRange.value === '6h' ? 300000 : // 5 minutes
                  selectedTimeRange.value === '24h' ? 900000 : // 15 minutes
                  3600000; // 1 hour
  
  const history: MonitoringMetrics[] = [];
  
  for (let i = points; i >= 0; i--) {
    const timestamp = new Date(now - (i * interval)).toISOString();
    const systemMetrics = generateMockSystemMetrics();
    const botMetrics = generateMockBotMetrics();
    
    history.push({
      timestamp,
      system: systemMetrics,
      bot: botMetrics,
      performance: {
        responseTime: botMetrics.commands.averageResponseTime,
        throughput: botMetrics.events,
        errorRate: (botMetrics.commands.failed / botMetrics.commands.total) * 100,
        availability: botMetrics.connected ? 100 : 0
      }
    });
  }
  
  return history;
}

async function refreshMetrics() {
  loading.value = true;
  
  try {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update current metrics
    currentSystemMetrics.value = generateMockSystemMetrics();
    currentBotMetrics.value = generateMockBotMetrics();
    
    // Update historical data
    metricsHistory.value = generateHistoricalData();
    
    // Occasionally add new alerts
    if (Math.random() > 0.8) {
      alerts.value.unshift(generateMockAlert());
      // Keep only last 20 alerts
      if (alerts.value.length > 20) {
        alerts.value = alerts.value.slice(0, 20);
      }
    }
    
  } catch (error) {
    console.error('Failed to refresh metrics:', error);
  } finally {
    loading.value = false;
  }
}

function handleTimeRangeChange(range?: '1h' | '6h' | '24h' | '7d') {
  if (range) {
    selectedTimeRange.value = range;
  }
  
  // Update max data points based on time range
  maxDataPoints.value = selectedTimeRange.value === '1h' ? 60 : 
                       selectedTimeRange.value === '6h' ? 72 : 
                       selectedTimeRange.value === '24h' ? 96 : 168;
  
  refreshMetrics();
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value;
  
  if (autoRefresh.value) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  refreshInterval = setInterval(() => {
    refreshMetrics();
  }, 5000); // Refresh every 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function handleAlertAcknowledge(alertId: string) {
  const alert = alerts.value.find(a => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
  }
}

function handleAlertDismiss(alertId: string) {
  alerts.value = alerts.value.filter(a => a.id !== alertId);
}

// Lifecycle
onMounted(async () => {
  // Initial data load
  await refreshMetrics();
  
  // Generate some initial alerts
  for (let i = 0; i < 5; i++) {
    alerts.value.push(generateMockAlert());
  }
  
  // Start auto-refresh if enabled
  if (autoRefresh.value) {
    startAutoRefresh();
  }
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<style scoped>
.metrics-view {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.metrics-header {
  margin-bottom: 2rem;
}

.metrics-header h1 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 2rem;
  font-weight: 700;
}

.metrics-header p {
  margin: 0 0 1.5rem 0;
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.metrics-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.time-range-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.time-range-selector label {
  font-weight: 600;
  color: var(--text-primary);
}

.time-range-selector select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.refresh-controls {
  display: flex;
  gap: 0.5rem;
}

.refresh-btn,
.manual-refresh-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.refresh-btn:hover,
.manual-refresh-btn:hover {
  background: var(--bg-tertiary);
}

.refresh-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.refresh-btn:disabled,
.manual-refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.metrics-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.metrics-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid var(--border-color);
}

.metrics-section h2 {
  margin: 0 0 1.5rem 0;
  color: var(--text-primary);
  font-size: 1.5rem;
  font-weight: 600;
}

.metrics-grid {
  display: grid;
  gap: 1.5rem;
}

.system-metrics {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.bot-metrics {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.metric-card {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid var(--border-color);
}

.metric-card h3 {
  margin: 0 0 1rem 0;
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 600;
  text-align: center;
}

.interactive-charts {
  display: grid;
  gap: 1.5rem;
}

.chart-card {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 1.5rem;
  border: 1px solid var(--border-color);
}

.chart-card.full-width {
  grid-column: 1 / -1;
}

.chart-card h3 {
  margin: 0 0 1rem 0;
  color: var(--text-primary);
  font-size: 1.2rem;
  font-weight: 600;
}

.metric-type-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.metric-type-selector label {
  font-weight: 600;
  color: var(--text-primary);
}

.metric-type-selector select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.alerts-container {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid var(--border-color);
}

/* Responsive design */
@media (max-width: 768px) {
  .metrics-view {
    padding: 1rem;
  }
  
  .metrics-controls {
    flex-direction: column;
    align-items: stretch;
  }
  
  .refresh-controls {
    justify-content: center;
  }
  
  .system-metrics,
  .bot-metrics {
    grid-template-columns: 1fr;
  }
  
  .metric-type-selector {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 480px) {
  .metrics-header h1 {
    font-size: 1.5rem;
  }
  
  .metrics-header p {
    font-size: 1rem;
  }
  
  .refresh-controls {
    flex-direction: column;
  }
}
</style>