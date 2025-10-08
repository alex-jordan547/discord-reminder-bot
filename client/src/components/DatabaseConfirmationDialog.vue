<template>
  <Teleport to="body" :disabled="disableTeleport || false">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        data-testid="modal-overlay"
        class="modal-overlay"
        @click="handleOverlayClick"
        @keydown.escape="handleCancel"
        tabindex="0"
      >
        <div
          data-testid="confirmation-modal"
          class="confirmation-modal"
          :class="{
            'dangerous-operation': isDangerousOperation,
            'loading-state': loading,
          }"
          @click.stop
        >
          <div class="modal-header">
            <div class="header-content">
              <div data-testid="operation-icon" class="operation-icon">
                {{ operationIcon }}
              </div>
              <h2 data-testid="modal-title" class="modal-title">
                {{ title }}
              </h2>
            </div>
            <button v-if="!loading" class="close-button" @click="handleCancel" aria-label="Close">
              ✕
            </button>
          </div>

          <div class="modal-body">
            <p data-testid="modal-message" class="modal-message">
              {{ message }}
            </p>

            <div v-if="fileInfo" data-testid="file-info" class="file-info-section">
              <h4>File Information:</h4>
              <div class="file-details">
                <div class="file-name">{{ fileInfo.name }}</div>
                <div class="file-meta">
                  <span class="file-type">{{ fileInfo.type }}</span>
                  <span class="file-size">{{ formatFileSize(fileInfo.size) }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="backupInfo?.willCreateBackup"
              data-testid="backup-info"
              class="backup-info-section"
            >
              <h4>Backup Information:</h4>
              <div class="backup-details">
                <p>✅ A backup will be created before this operation</p>
                <div class="backup-meta">
                  <div>Location: {{ backupInfo.backupLocation }}</div>
                  <div v-if="backupInfo.estimatedBackupSize">
                    Size: {{ backupInfo.estimatedBackupSize }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="warningDetails && warningDetails.length > 0"
              data-testid="warning-details"
              class="warning-section"
            >
              <h4>⚠️ Important Notes:</h4>
              <ul class="warning-list">
                <li v-for="warning in warningDetails" :key="warning">
                  {{ warning }}
                </li>
              </ul>
            </div>

            <div v-if="requireConfirmation" class="confirmation-input-section">
              <label for="confirmation-input" class="confirmation-label">
                {{ confirmationLabel }}
              </label>
              <input
                id="confirmation-input"
                data-testid="confirmation-input"
                v-model="confirmationInputValue"
                type="text"
                class="confirmation-input"
                :placeholder="confirmationPlaceholder"
                :disabled="loading"
                @keydown.enter="handleConfirm"
              />
            </div>
          </div>

          <div class="modal-footer">
            <button
              data-testid="cancel-button"
              class="btn btn-secondary"
              :disabled="loading"
              @click="handleCancel"
            >
              Cancel
            </button>
            <button
              data-testid="confirm-button"
              class="btn"
              :class="confirmButtonClass"
              :disabled="isConfirmDisabled"
              @click="handleConfirm"
            >
              <span v-if="loading" data-testid="loading-spinner" class="spinner"></span>
              {{ confirmButtonText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';

interface FileInfo {
  name: string;
  size: number;
  type: string;
}

interface BackupInfo {
  willCreateBackup: boolean;
  backupLocation?: string;
  estimatedBackupSize?: string;
}

interface Props {
  visible: boolean;
  operation: 'import' | 'export' | 'delete' | 'migration' | 'clear';
  title: string;
  message: string;
  warningDetails?: string[];
  requireConfirmation?: boolean;
  confirmationText?: string;
  fileInfo?: FileInfo;
  backupInfo?: BackupInfo;
  closeOnOverlayClick?: boolean;
  loading?: boolean;
  disableTeleport?: boolean; // For testing
}

interface Emits {
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}

const props = withDefaults(defineProps<Props>(), {
  warningDetails: () => [],
  requireConfirmation: false,
  confirmationText: '',
  closeOnOverlayClick: true,
  loading: false,
  disableTeleport: false,
});

const emit = defineEmits<Emits>();

const confirmationInputValue = ref('');

const operationIcon = computed(() => {
  const icons = {
    import: '📥',
    export: '📤',
    delete: '🗑️',
    migration: '🔄',
    clear: '🧹',
  };
  return icons[props.operation];
});

const isDangerousOperation = computed(() => {
  return ['delete', 'clear'].includes(props.operation);
});

const confirmButtonClass = computed(() => {
  if (isDangerousOperation.value) {
    return 'btn-danger';
  }
  return 'btn-primary';
});

const confirmButtonText = computed(() => {
  if (props.loading) {
    return 'Processing...';
  }

  const labels = {
    import: 'Import',
    export: 'Export',
    delete: 'Delete',
    migration: 'Migrate',
    clear: 'Clear',
  };
  return labels[props.operation];
});

const confirmationLabel = computed(() => {
  return `Type "${props.confirmationText}" to confirm:`;
});

const confirmationPlaceholder = computed(() => {
  return `Type "${props.confirmationText}" to confirm`;
});

const isConfirmDisabled = computed(() => {
  if (props.loading) return true;

  if (props.requireConfirmation) {
    return confirmationInputValue.value !== props.confirmationText;
  }

  return false;
});

const handleConfirm = () => {
  if (!isConfirmDisabled.value) {
    emit('confirm');
  }
};

const handleCancel = () => {
  emit('cancel');
};

const handleOverlayClick = () => {
  if (props.closeOnOverlayClick && !props.loading) {
    handleCancel();
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Reset confirmation input when dialog becomes visible
watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      confirmationInputValue.value = '';
      // Focus the confirmation input if required
      if (props.requireConfirmation) {
        nextTick(() => {
          const input = document.getElementById('confirmation-input') as HTMLInputElement;
          input?.focus();
        });
      }
    }
  },
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.confirmation-modal {
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}

.dangerous-operation {
  border-color: var(--error-border);
  box-shadow: 0 20px 60px rgba(239, 68, 68, 0.2);
}

.loading-state {
  pointer-events: none;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.operation-icon {
  font-size: 2rem;
  line-height: 1;
}

.modal-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.25rem;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.modal-message {
  margin: 0 0 1.5rem 0;
  color: var(--text-primary);
  font-size: 1rem;
  line-height: 1.5;
}

.file-info-section,
.backup-info-section,
.warning-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.file-info-section {
  background: var(--bg-secondary);
}

.backup-info-section {
  background: var(--success-bg);
  border-color: var(--success-border);
}

.warning-section {
  background: var(--warning-bg);
  border-color: var(--warning-border);
}

.file-info-section h4,
.backup-info-section h4,
.warning-section h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.file-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.file-name {
  font-weight: 600;
  color: var(--text-primary);
}

.file-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.backup-details p {
  margin: 0 0 0.5rem 0;
  color: var(--success-color);
  font-weight: 500;
}

.backup-meta {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.backup-meta div {
  margin-bottom: 0.25rem;
}

.warning-list {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--warning-color);
}

.warning-list li {
  margin-bottom: 0.5rem;
}

.confirmation-input-section {
  margin-top: 1.5rem;
}

.confirmation-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.confirmation-input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.confirmation-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-color-alpha);
}

.confirmation-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 100px;
  justify-content: center;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-quaternary);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--accent-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-color-hover);
  transform: translateY(-1px);
}

.btn-danger {
  background: var(--error-color);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: var(--error-color-hover);
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

/* Vue Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .confirmation-modal,
.modal-fade-leave-to .confirmation-modal {
  transform: scale(0.9) translateY(-20px);
}

/* Responsive design */
@media (max-width: 768px) {
  .modal-overlay {
    padding: 0.5rem;
  }

  .confirmation-modal {
    max-height: 95vh;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .btn {
    width: 100%;
  }

  .file-meta {
    flex-direction: column;
    gap: 0.25rem;
  }
}
</style>
