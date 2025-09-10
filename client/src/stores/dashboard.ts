import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  MonitoringMetrics,
  Alert,
  Activity,
  DashboardConfig,
  ConnectionStatus,
} from '@dashboard/types';

export const useDashboardStore = defineStore('dashboard', () => {
  // State
  const metrics = ref<MonitoringMetrics | null>(null);
  const alerts = ref<Alert[]>([]);
  const activities = ref<Activity[]>([]);
  const config = ref<DashboardConfig>({
    refreshInterval: 30000, // 30 seconds
    theme: 'auto',
    notifications: {
      enabled: true,
      types: ['warning', 'error', 'critical'],
      maxVisible: 5,
      autoHide: true,
      hideDelay: 5000,
    },
    charts: {
      animationDuration: 300,
      showLegend: true,
      showTooltips: true,
      timeRange: '24h',
    },
  });

  const connectionStatus = ref<ConnectionStatus>({
    status: 'disconnected',
    reconnectAttempts: 0,
  });

  // Getters
  const isConnected = computed(() => connectionStatus.value.status === 'connected');
  const criticalAlerts = computed(() =>
    alerts.value.filter(alert => alert.type === 'critical' && !alert.acknowledged),
  );
  const unacknowledgedAlerts = computed(() => alerts.value.filter(alert => !alert.acknowledged));
  const recentActivities = computed(() =>
    activities.value
      .slice(0, 50)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
  );

  // Actions - Placeholder implementations for task 1
  const updateMetrics = (newMetrics: MonitoringMetrics) => {
    console.log('updateMetrics() - basic implementation for task 1');
    metrics.value = newMetrics;
  };

  const addAlert = (alert: Alert) => {
    console.log('addAlert() - basic implementation for task 1');
    alerts.value.unshift(alert);

    // Keep only the last 100 alerts
    if (alerts.value.length > 100) {
      alerts.value = alerts.value.slice(0, 100);
    }
  };

  const acknowledgeAlert = (alertId: string) => {
    console.log('acknowledgeAlert() - basic implementation for task 1');
    const alert = alerts.value.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  };

  const removeAlert = (alertId: string) => {
    console.log('removeAlert() - basic implementation for task 1');
    const index = alerts.value.findIndex(a => a.id === alertId);
    if (index !== -1) {
      alerts.value.splice(index, 1);
    }
  };

  const addActivity = (activity: Activity) => {
    console.log('addActivity() - basic implementation for task 1');
    activities.value.unshift(activity);

    // Keep only the last 200 activities
    if (activities.value.length > 200) {
      activities.value = activities.value.slice(0, 200);
    }
  };

  const updateConfig = (newConfig: Partial<DashboardConfig>) => {
    console.log('updateConfig() - basic implementation for task 1');
    config.value = { ...config.value, ...newConfig };
  };

  const updateConnectionStatus = (status: ConnectionStatus) => {
    console.log('updateConnectionStatus() - basic implementation for task 1');
    connectionStatus.value = status;
  };

  const clearAlerts = () => {
    console.log('clearAlerts() - basic implementation for task 1');
    alerts.value = [];
  };

  const clearActivities = () => {
    console.log('clearActivities() - basic implementation for task 1');
    activities.value = [];
  };

  return {
    // State
    metrics,
    alerts,
    activities,
    config,
    connectionStatus,

    // Getters
    isConnected,
    criticalAlerts,
    unacknowledgedAlerts,
    recentActivities,

    // Actions
    updateMetrics,
    addAlert,
    acknowledgeAlert,
    removeAlert,
    addActivity,
    updateConfig,
    updateConnectionStatus,
    clearAlerts,
    clearActivities,
  };
});
