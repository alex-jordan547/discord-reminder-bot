<template>
  <div class="database-import-interface">
    <div
      v-if="!selectedFile"
      data-testid="drop-zone"
      class="drop-zone"
      :class="{ 'drag-over': isDragOver }"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <div class="drop-zone-content">
        <div class="upload-icon">📁</div>
        <div data-testid="upload-instructions" class="upload-instructions">
          <strong>Drag and drop</strong> your database file here, or
          <strong>click to browse</strong>
        </div>
        <div data-testid="supported-formats" class="supported-formats">
          Supported formats: SQLite (.db, .sqlite), JSON (.json), CSV (.csv)
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept=".db,.sqlite,.json,.csv"
        style="display: none"
        @change="handleFileInput"
      />
    </div>

    <div v-else class="selected-file-section">
      <div data-testid="selected-file-info" class="file-info">
        <div class="file-details">
          <div class="file-name">{{ selectedFile.name }}</div>
          <div class="file-size">{{ formatFileSize(selectedFile.size) }}</div>
          <div class="file-type">{{ getFileType(selectedFile) }}</div>
        </div>
        <button
          data-testid="clear-file-button"
          class="btn btn-secondary btn-sm"
          @click="clearFile"
          :disabled="isImporting"
        >
          ✕
        </button>
      </div>

      <div class="import-actions">
        <button
          data-testid="import-button"
          class="btn btn-primary"
          :disabled="isImporting"
          @click="handleImport"
        >
          <span v-if="isImporting" class="spinner"></span>
          {{ isImporting ? 'Importing...' : 'Import Database' }}
        </button>
      </div>

      <div
        v-if="isImporting && importProgress !== undefined"
        data-testid="import-progress"
        class="progress-info"
      >
        Import Progress: {{ importProgress }}%
      </div>
    </div>

    <div v-if="fileError" data-testid="file-error" class="error-message">
      {{ fileError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ImportResult } from '@/types';

interface Props {
  selectedFile?: File | null;
  isImporting?: boolean;
  importProgress?: number;
  maxFileSize?: number; // in bytes
  lastImportResult?: ImportResult | null;
}

interface Emits {
  (e: 'file-selected', file: File): void;
  (e: 'import', file: File): void;
  (e: 'clear-file'): void;
}

const props = withDefaults(defineProps<Props>(), {
  selectedFile: null,
  isImporting: false,
  importProgress: undefined,
  maxFileSize: 100 * 1024 * 1024, // 100MB default
  lastImportResult: null,
});

const emit = defineEmits<Emits>();

const fileInputRef = ref<HTMLInputElement>();
const isDragOver = ref(false);
const fileError = ref<string>('');

const supportedTypes = [
  'application/x-sqlite3',
  'application/vnd.sqlite3',
  'application/json',
  'text/csv',
  'application/csv',
];

const supportedExtensions = ['.db', '.sqlite', '.json', '.csv'];

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;

  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFile(files[0]);
  }
};

const handleFileInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    handleFile(files[0]);
  }
};

const handleFile = (file: File) => {
  fileError.value = '';

  // Validate file type
  const isValidType =
    supportedTypes.includes(file.type) ||
    supportedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

  if (!isValidType) {
    fileError.value = 'Invalid file type. Please select a SQLite, JSON, or CSV file.';
    return;
  }

  // Validate file size
  if (file.size > props.maxFileSize) {
    fileError.value = `File size exceeds limit of ${formatFileSize(props.maxFileSize)}.`;
    return;
  }

  emit('file-selected', file);
};

const handleImport = () => {
  if (props.selectedFile) {
    emit('import', props.selectedFile);
  }
};

const clearFile = () => {
  fileError.value = '';
  emit('clear-file');
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileType = (file: File): string => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'db':
    case 'sqlite':
      return 'SQLite Database';
    case 'json':
      return 'JSON File';
    case 'csv':
      return 'CSV File';
    default:
      return 'Unknown';
  }
};
</script>

<style scoped>
.database-import-interface {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--bg-primary);
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--accent-color);
  background: var(--accent-color-alpha);
  transform: translateY(-2px);
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.upload-icon {
  font-size: 3rem;
  opacity: 0.6;
}

.upload-instructions {
  font-size: 1.1rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.supported-formats {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.selected-file-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
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

.file-size,
.file-type {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.import-actions {
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

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-quaternary);
  color: var(--text-primary);
}

.btn-sm {
  padding: 0.5rem;
  font-size: 0.8rem;
  min-width: auto;
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

.progress-info {
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem;
  background: var(--bg-primary);
  border-radius: 4px;
}

.error-message {
  color: var(--error-color);
  font-size: 0.9rem;
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--error-bg);
  border-radius: 4px;
  border: 1px solid var(--error-border);
}

/* Responsive design */
@media (max-width: 768px) {
  .database-import-interface {
    padding: 1rem;
  }

  .drop-zone {
    padding: 2rem 1rem;
  }

  .upload-icon {
    font-size: 2rem;
  }

  .file-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .import-actions {
    justify-content: stretch;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
