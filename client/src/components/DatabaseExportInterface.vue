<template>
  <div class="database-export-interface">
    <form @submit.prevent="handleExport" class="export-form">
      <div class="form-group">
        <label for="export-format" class="form-label">Export Format:</label>
        <select
          id="export-format"
          v-model="selectedFormat"
          data-testid="export-format-select"
          class="form-select"
          :disabled="isExporting"
        >
          <option value="">Select format...</option>
          <option value="sqlite">SQLite</option>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
        <div
          v-if="formatError"
          data-testid="format-error"
          class="error-message"
        >
          {{ formatError }}
        </div>
      </div>

      <div class="form-actions">
        <button
          type="submit"
          data-testid="export-button"
          class="btn btn-primary"
          :disabled="isExporting"
        >
          <span
            v-if="isExporting"
            data-testid="export-spinner"
            class="spinner"
          ></span>
          {{ isExporting ? 'Exporting...' : 'Export Database' }}
        </button>
      </div>

      <div
        v-if="isExporting && exportProgress !== undefined"
        data-testid="export-progress"
        class="progress-info"
      >
        Export Progress: {{ exportProgress }}%
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ExportFormat, ExportResult } from '@/types';

interface Props {
  isExporting?: boolean;
  exportProgress?: number;
  lastExportResult?: ExportResult | null;
}

interface Emits {
  (e: 'export', format: ExportFormat): void;
}

const props = withDefaults(defineProps<Props>(), {
  isExporting: false,
  exportProgress: undefined,
  lastExportResult: null,
});

const emit = defineEmits<Emits>();

const selectedFormat = ref<ExportFormat | ''>('');
const formatError = ref<string>('');

const handleExport = () => {
  // Reset error
  formatError.value = '';

  // Validate format selection
  if (!selectedFormat.value) {
    formatError.value = 'Please select an export format';
    return;
  }

  // Emit export event
  emit('export', selectedFormat.value as ExportFormat);
};

// Reset form after successful export
watch(
  () => props.lastExportResult,
  (result) => {
    if (result?.success) {
      // Keep the selected format for convenience
      formatError.value = '';
    }
  }
);
</script>

<style scoped>
.database-export-interface {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.export-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.form-select {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.form-select:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-color-alpha);
}

.form-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: var(--accent-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-color-hover);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-message {
  color: var(--error-color);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.progress-info {
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem;
  background: var(--bg-primary);
  border-radius: 4px;
}

/* Responsive design */
@media (max-width: 768px) {
  .database-export-interface {
    padding: 1rem;
  }
  
  .form-actions {
    justify-content: stretch;
  }
  
  .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>