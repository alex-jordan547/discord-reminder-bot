<template>
  <div class="database-progress-indicator">
    <div class="progress-header">
      <h3 class="operation-title">
        {{ operationTitle }}
      </h3>
      <div class="progress-controls">
        <button
          v-if="pausable"
          data-testid="pause-button"
          class="btn btn-sm btn-secondary"
          @click="togglePause"
        >
          {{ isPaused ? 'Resume' : 'Pause' }}
        </button>
        <button
          v-if="cancellable"
          data-testid="cancel-button"
          class="btn btn-sm btn-danger"
          @click="handleCancel"
        >
          Cancel
        </button>
      </div>
    </div>

    <div class="progress-section">
      <div
        data-testid="progress-bar"
        class="progress-bar"
        :class="{
          'indeterminate': isIndeterminate,
          'error-state': hasError,
          'success-state': isComplete,
          'paused-state': isPaused,
        }"
      >
        <div
          data-testid="progress-fill"
          class="progress-fill progress-transition"
          :class="{
            'export-color': operation === 'export',
            'import-color': operation === 'import',
            'migration-color': operation === 'migration',
          }"
          :style="{ width: progressWidth }"
        ></div>
      </div>

      <div class="progress-info">
        <span data-testid="progress-text" class="progress-text">
          {{ progressText }}
        </span>
        <span
          v-if="estimatedTimeRemaining !== undefined"
          data-testid="time-remaining"
          class="time-remaining"
        >
          {{ formatTimeRemaining(estimatedTimeRemaining) }} remaining
        </span>
      </div>
    </div>

    <div v-if="statusMessage" class="status-section">
      <div data-testid="status-message" class="status-message">
        {{ statusMessage }}
      </div>
    </div>

    <div class="details-section">
      <div class="detail-row">
        <span
          v-if="recordsProcessed !== undefined && totalRecords !== undefined"
          data-testid="records-count"
          class="records-count"
        >
          {{ formatNumber(recordsProcessed) }} / {{ formatNumber(totalRecords) }} records
        </span>
        <span
          v-if="processingSpeed"
          data-testid="processing-speed"
          class="processing-speed"
        >
          {{ processingSpeed }}
        </span>
      </div>
    </div>

    <Transition name="message-fade">
      <div
        v-if="hasError && errorMessage"
        data-testid="error-message"
        class="error-message"
      >
        ❌ {{ errorMessage }}
      </div>
    </Transition>

    <Transition name="message-fade">
      <div
        v-if="isComplete && successMessage"
        data-testid="success-message"
        class="success-message"
      >
        ✅ {{ successMessage }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  progress?: number;
  operation: 'export' | 'import' | 'migration';
  statusMessage?: string;
  estimatedTimeRemaining?: number; // in seconds
  processingSpeed?: string;
  recordsProcessed?: number;
  totalRecords?: number;
  isIndeterminate?: boolean;
  cancellable?: boolean;
  pausable?: boolean;
  isPaused?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  isComplete?: boolean;
  successMessage?: string;
}

interface Emits {
  (e: 'cancel'): void;
  (e: 'pause'): void;
  (e: 'resume'): void;
}

const props = withDefaults(defineProps<Props>(), {
  progress: undefined,
  statusMessage: '',
  estimatedTimeRemaining: undefined,
  processingSpeed: '',
  recordsProcessed: undefined,
  totalRecords: undefined,
  isIndeterminate: false,
  cancellable: false,
  pausable: false,
  isPaused: false,
  hasError: false,
  errorMessage: '',
  isComplete: false,
  successMessage: '',
});

const emit = defineEmits<Emits>();

const operationTitle = computed(() => {
  const titles = {
    export: 'Exporting Database',
    import: 'Importing Database',
    migration: 'Migrating Database',
  };
  return titles[props.operation];
});

const progressWidth = computed(() => {
  if (props.isIndeterminate) return '100%';
  if (props.progress === undefined) return '0%';
  return `${Math.min(100, Math.max(0, props.progress))}%`;
});

const progressText = computed(() => {
  if (props.hasError) return 'Error';
  if (props.isComplete) return 'Complete';
  if (props.isPaused) return 'Paused';
  if (props.isIndeterminate) return 'Processing...';
  if (props.progress === undefined) return '0%';
  return `${Math.round(props.progress)}%`;
});

const handleCancel = () => {
  emit('cancel');
};

const togglePause = () => {
  if (props.isPaused) {
    emit('resume');
  } else {
    emit('pause');
  }
};

const formatTimeRemaining = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};
</script>

<style scoped>
.database-progress-indicator {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-color);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.operation-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 600;
}

.progress-controls {
  display: flex;
  gap: 0.5rem;
}

.progress-section {
  margin-bottom: 1rem;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  margin-bottom: 0.5rem;
}

.progress-bar.indeterminate .progress-fill {
  animation: indeterminate 2s infinite linear;
}

.progress-bar.error-state {
  background: var(--error-bg);
}

.progress-bar.success-state {
  background: var(--success-bg);
}

.progress-bar.paused-state .progress-fill {
  animation-play-state: paused;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-transition {
  transition: width 0.3s ease-out;
}

.export-color {
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
}

.import-color {
  background: linear-gradient(90deg, #10b981, #047857);
}

.migration-color {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.progress-text {
  font-weight: 600;
  color: var(--text-primary);
}

.time-remaining {
  color: var(--text-secondary);
}

.status-section {
  margin-bottom: 1rem;
}

.status-message {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-style: italic;
}

.details-section {
  margin-bottom: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.records-count,
.processing-speed {
  display: flex;
  align-items: center;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.75rem;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--bg-quaternary);
  color: var(--text-primary);
}

.btn-danger {
  background: var(--error-color);
  color: white;
}

.btn-danger:hover {
  background: var(--error-color-hover);
}

.error-message {
  color: var(--error-color);
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: 4px;
  padding: 0.75rem;
  font-size: 0.9rem;
  margin-top: 1rem;
}

.success-message {
  color: var(--success-color);
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  border-radius: 4px;
  padding: 0.75rem;
  font-size: 0.9rem;
  margin-top: 1rem;
}

/* Animations */
@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

/* Vue Transitions */
.message-fade-enter-active,
.message-fade-leave-active {
  transition: all 0.3s ease;
}

.message-fade-enter-from,
.message-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Responsive design */
@media (max-width: 768px) {
  .database-progress-indicator {
    padding: 1rem;
  }
  
  .progress-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .progress-controls {
    width: 100%;
    justify-content: flex-end;
  }
  
  .progress-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  
  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
}
</style>