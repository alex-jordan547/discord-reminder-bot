<template>
  <div class="alert-display">
    <div v-if="!alerts.length" class="empty-alerts" data-testid="empty-alerts">
      <div class="empty-icon">🔔</div>
      <p>No alerts at this time</p>
    </div>

    <TransitionGroup v-else name="alert-list" tag="div" class="alert-list" data-testid="alert-list">
      <div
        v-for="alert in displayedAlerts"
        :key="alert.id"
        :class="['alert-item', `alert-${alert.type}`]"
        data-testid="alert-item"
      >
        <div class="alert-content">
          <div class="alert-header">
            <div :class="['alert-icon', `icon-${alert.type}`]" data-testid="alert-icon">
              {{ getAlertIcon(alert.type) }}
            </div>
            <h4 class="alert-title" data-testid="alert-title">{{ alert.title }}</h4>
            <div v-if="showSource" class="alert-source" data-testid="alert-source">
              {{ alert.source }}
            </div>
          </div>

          <p class="alert-message" data-testid="alert-message">{{ alert.message }}</p>

          <div class="alert-footer">
            <span class="alert-timestamp" data-testid="alert-timestamp">
              {{ formatTimestamp(alert.timestamp) }}
            </span>

            <div class="alert-actions">
              <div
                v-if="alert.acknowledged"
                class="acknowledged-badge"
                data-testid="acknowledged-badge"
              >
                ✓ Acknowledged
              </div>

              <button
                v-else
                class="acknowledge-btn"
                data-testid="acknowledge-btn"
                @click="handleAcknowledge(alert.id)"
              >
                Acknowledge
              </button>

              <button
                v-if="showDismiss"
                class="dismiss-btn"
                data-testid="dismiss-btn"
                @click="handleDismiss(alert.id)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>

    <div v-if="hasMoreAlerts" class="show-more-container">
      <button
        v-if="!showingAll"
        class="show-more-btn"
        data-testid="show-more-btn"
        @click="showingAll = true"
      >
        Show {{ remainingCount }} more alerts
      </button>

      <button v-else class="show-less-btn" data-testid="show-less-btn" @click="showingAll = false">
        Show less
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { Alert } from '@/types';

interface Props {
  alerts: Alert[];
  filter?: 'critical' | 'error' | 'warning' | 'info';
  maxAlerts?: number;
  showDismiss?: boolean;
  showSource?: boolean;
  autoHide?: boolean;
  autoHideDuration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxAlerts: 10,
  showDismiss: false,
  showSource: false,
  autoHide: false,
  autoHideDuration: 5000,
});

const emit = defineEmits<{
  acknowledge: [alertId: string];
  dismiss: [alertId: string];
  autoHide: [alertId: string];
}>();

const showingAll = ref(false);
const autoHideTimers = ref<Map<string, NodeJS.Timeout>>(new Map());

// Priority order for sorting alerts
const priorityOrder = { critical: 0, error: 1, warning: 2, info: 3 };

const sortedAlerts = computed(() => {
  let filtered = props.alerts;

  // Apply filter if specified
  if (props.filter) {
    filtered = filtered.filter(alert => alert.type === props.filter);
  }

  // Sort by priority (critical first) then by timestamp (newest first)
  return filtered.sort((a, b) => {
    const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type];
    if (priorityDiff !== 0) return priorityDiff;

    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
});

const displayedAlerts = computed(() => {
  if (showingAll.value || !props.maxAlerts) {
    return sortedAlerts.value;
  }
  return sortedAlerts.value.slice(0, props.maxAlerts);
});

const hasMoreAlerts = computed(() => {
  return sortedAlerts.value.length > (props.maxAlerts || 0);
});

const remainingCount = computed(() => {
  return Math.max(0, sortedAlerts.value.length - (props.maxAlerts || 0));
});

function getAlertIcon(type: Alert['type']): string {
  const icons = {
    critical: '🚨',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };
  return icons[type];
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function handleAcknowledge(alertId: string) {
  emit('acknowledge', alertId);
}

function handleDismiss(alertId: string) {
  emit('dismiss', alertId);
}

function setupAutoHide(alertId: string) {
  if (props.autoHide && props.autoHideDuration > 0) {
    const timer = setTimeout(() => {
      emit('autoHide', alertId);
      autoHideTimers.value.delete(alertId);
    }, props.autoHideDuration);

    autoHideTimers.value.set(alertId, timer);
  }
}

function clearAutoHideTimer(alertId: string) {
  const timer = autoHideTimers.value.get(alertId);
  if (timer) {
    clearTimeout(timer);
    autoHideTimers.value.delete(alertId);
  }
}

// Watch for new alerts and set up auto-hide timers
onMounted(() => {
  if (props.autoHide) {
    props.alerts.forEach(alert => {
      if (!alert.acknowledged) {
        setupAutoHide(alert.id);
      }
    });
  }
});

onUnmounted(() => {
  // Clear all timers
  autoHideTimers.value.forEach(timer => clearTimeout(timer));
  autoHideTimers.value.clear();
});
</script>

<style scoped>
.alert-display {
  width: 100%;
}

.empty-alerts {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-item {
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.alert-item:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.alert-critical {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.alert-error {
  border-left-color: #f97316;
  background: #fff7ed;
}

.alert-warning {
  border-left-color: #f59e0b;
  background: #fffbeb;
}

.alert-info {
  border-left-color: #3b82f6;
  background: #eff6ff;
}

.alert-content {
  width: 100%;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.alert-icon {
  font-size: 20px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.alert-source {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.alert-message {
  margin: 0 0 12px 36px;
  color: #4b5563;
  line-height: 1.5;
}

.alert-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-left: 36px;
}

.alert-timestamp {
  font-size: 12px;
  color: #6b7280;
  font-family: monospace;
}

.alert-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.acknowledge-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.acknowledge-btn:hover {
  background: #2563eb;
}

.acknowledged-badge {
  background: #10b981;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.dismiss-btn {
  background: #6b7280;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.dismiss-btn:hover {
  background: #4b5563;
}

.show-more-container {
  margin-top: 16px;
  text-align: center;
}

.show-more-btn,
.show-less-btn {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.show-more-btn:hover,
.show-less-btn:hover {
  background: #e5e7eb;
}

/* Vue Transitions */
.alert-list-enter-active,
.alert-list-leave-active {
  transition: all 0.3s ease;
}

.alert-list-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.alert-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.alert-list-move {
  transition: transform 0.3s ease;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .alert-item {
    background: #374151;
    color: #f9fafb;
  }

  .alert-critical {
    background: #450a0a;
  }

  .alert-error {
    background: #431407;
  }

  .alert-warning {
    background: #451a03;
  }

  .alert-info {
    background: #1e3a8a;
  }

  .alert-message {
    color: #d1d5db;
  }

  .alert-timestamp {
    color: #9ca3af;
  }
}
</style>
