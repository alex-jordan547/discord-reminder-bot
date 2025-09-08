<template>
  <div id="app" class="dashboard-app">
    <header class="dashboard-header">
      <h1>Discord Bot Monitoring Dashboard</h1>
      <div class="connection-status" :class="connectionStatus">
        {{ connectionStatus === 'connected' ? '🟢' : connectionStatus === 'reconnecting' ? '🟡' : '🔴' }}
        {{ connectionStatus }}
      </div>
    </header>
    
    <main class="dashboard-main">
      <div class="dashboard-grid">
        <div class="metrics-card">
          <h2>System Metrics</h2>
          <p>Dashboard components will be implemented in subsequent tasks</p>
        </div>
        
        <div class="alerts-card">
          <h2>Alerts</h2>
          <p>Alert system will be implemented in subsequent tasks</p>
        </div>
        
        <div class="activity-card">
          <h2>Recent Activity</h2>
          <p>Activity tracking will be implemented in subsequent tasks</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

// Connection status for WebSocket (will be implemented in later tasks)
const connectionStatus = ref<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

onMounted(() => {
  // WebSocket connection will be implemented in later tasks
  console.log('Dashboard mounted - WebSocket connection will be implemented in task 5.1');
});

onUnmounted(() => {
  // Cleanup will be implemented in later tasks
  console.log('Dashboard unmounted - cleanup will be implemented in task 5.1');
});
</script>

<style scoped>
.dashboard-app {
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.dashboard-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.connection-status.connected {
  background-color: var(--success-bg);
  color: var(--success-text);
}

.connection-status.reconnecting {
  background-color: var(--warning-bg);
  color: var(--warning-text);
}

.connection-status.disconnected {
  background-color: var(--error-bg);
  color: var(--error-text);
}

.dashboard-main {
  padding: 2rem;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.metrics-card,
.alerts-card,
.activity-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.metrics-card h2,
.alerts-card h2,
.activity-card h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  font-weight: 600;
}
</style>