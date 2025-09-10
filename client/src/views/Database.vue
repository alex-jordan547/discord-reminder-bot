<template>
  <div class="database-container">
    <h1>Database Management</h1>

    <!-- Export Section -->
    <div class="database-export" data-testid="database-export">
      <h2>Export Database</h2>

      <div class="export-form">
        <div class="form-group">
          <label for="export-format">Export Format:</label>
          <select id="export-format" v-model="exportFormat" data-testid="export-format-select">
            <option value="sqlite">SQLite (.db)</option>
            <option value="json">JSON (.json)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </div>

        <button @click="startExport" :disabled="isExporting" data-testid="export-button">
          {{ isExporting ? 'Exporting...' : 'Export Database' }}
        </button>

        <button v-if="isExporting" @click="cancelExport" data-testid="cancel-export">Cancel</button>
      </div>

      <!-- Export Progress -->
      <div v-if="isExporting" class="export-progress" data-testid="export-progress">
        <div class="progress-bar" data-testid="progress-bar">
          <div class="progress-fill" :style="{ width: exportProgress + '%' }"></div>
        </div>
        <div class="progress-text" data-testid="progress-text">
          {{ exportProgress }}% - Processing {{ currentTable }}... {{ recordsProcessed }}/{{
            totalRecords
          }}
          records
        </div>
      </div>

      <!-- Export Error -->
      <div v-if="exportError" class="error-message" data-testid="error-message">
        {{ exportError }}
        <button @click="retryExport" data-testid="retry-button">Retry</button>
      </div>

      <!-- Export Cancelled -->
      <div v-if="exportCancelled" class="info-message" data-testid="export-cancelled">
        Export cancelled
      </div>
    </div>

    <!-- Import Section -->
    <div class="database-import" data-testid="database-import">
      <h2>Import Database</h2>

      <!-- File Upload -->
      <div
        class="drop-zone"
        :class="{ 'drag-over': isDragOver }"
        @dragenter.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @dragover.prevent
        @drop.prevent="handleFileDrop"
        data-testid="drop-zone"
      >
        <input
          type="file"
          ref="fileInput"
          @change="handleFileSelect"
          accept=".db,.json,.csv"
          data-testid="file-input"
          style="display: none"
        />

        <div class="drop-zone-content">
          <p>Drag and drop a database file here, or</p>
          <button @click="$refs.fileInput.click()">Choose File</button>
        </div>
      </div>

      <!-- File Preview -->
      <div v-if="selectedFile" class="file-preview" data-testid="file-preview">
        <h3>Selected File</h3>
        <p><strong>Name:</strong> {{ selectedFile.name }}</p>
        <p><strong>Size:</strong> {{ formatFileSize(selectedFile.size) }}</p>
        <p><strong>Type:</strong> {{ selectedFile.type }}</p>

        <button @click="validateFile" :disabled="isValidating" data-testid="validate-button">
          {{ isValidating ? 'Validating...' : 'Validate File' }}
        </button>
      </div>

      <!-- File Error -->
      <div v-if="fileError" class="error-message" data-testid="file-error">
        {{ fileError }}
      </div>

      <!-- Validation Results -->
      <div v-if="validationResults" class="validation-results" data-testid="validation-results">
        <h3>File Validation Results</h3>
        <div v-if="validationResults.valid">
          <p><strong>✓ Valid database file</strong></p>
          <div class="data-preview" data-testid="data-preview">
            <h4>Tables:</h4>
            <div
              v-for="table in validationResults.preview.tables"
              :key="table.name"
              class="table-info"
              data-testid="table-row"
            >
              <span>{{ table.name }}</span>
              <span>{{ table.records }} records</span>
            </div>
          </div>
          <p><strong>Total Records:</strong> {{ validationResults.preview.recordCount }}</p>
          <p><strong>Estimated Size:</strong> {{ validationResults.preview.estimatedSize }}</p>

          <button @click="showImportConfirmation" data-testid="import-button">
            Import Database
          </button>
        </div>
        <div v-else>
          <p><strong>✗ Invalid file</strong></p>
          <p>{{ validationResults.error }}</p>
        </div>
      </div>
    </div>

    <!-- Backup Management -->
    <div class="backup-management">
      <button
        @click="activeTab = 'backups'"
        :class="{ active: activeTab === 'backups' }"
        data-testid="backups-tab"
      >
        Backups
      </button>

      <div v-if="activeTab === 'backups'" class="backup-list" data-testid="backup-list">
        <h3>Available Backups</h3>
        <div
          v-for="backup in backups"
          :key="backup.id"
          class="backup-item"
          data-testid="backup-item"
        >
          <div class="backup-info">
            <strong>{{ backup.id }}</strong>
            <span>{{ formatDate(backup.created) }}</span>
            <span>{{ backup.size }}</span>
            <span>{{ backup.type }}</span>
          </div>
          <button @click="restoreBackup(backup.id)" data-testid="restore-backup">Restore</button>
        </div>
      </div>
    </div>

    <!-- Backup Info -->
    <div v-if="backupInfo" class="backup-info" data-testid="backup-info">
      <p>Backup created: {{ backupInfo.backupId }} ({{ backupInfo.backupSize }})</p>
    </div>

    <!-- Confirmation Dialog -->
    <div v-if="showConfirmDialog" class="confirmation-dialog" data-testid="confirm-dialog">
      <div class="dialog-content">
        <h3>Confirm Import</h3>
        <p>This will replace all existing data. Are you sure?</p>
        <div class="dialog-actions">
          <button @click="confirmImport" data-testid="confirm-import">Yes, Import</button>
          <button @click="cancelImport" data-testid="cancel-import">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Import Success -->
    <div v-if="importSuccess" class="success-message" data-testid="import-success">
      Import completed successfully! {{ importSuccess.recordsImported }} records imported.
      <div v-if="importSuccess.backupCreated">
        Backup created: {{ importSuccess.backupCreated }}
      </div>
    </div>

    <!-- Import Error -->
    <div v-if="importError" class="error-message" data-testid="import-error">
      {{ importError }}
      <button v-if="canRollback" @click="rollback" data-testid="rollback-button">Rollback</button>
    </div>

    <!-- Rollback Success -->
    <div v-if="rollbackSuccess" class="success-message" data-testid="rollback-success">
      Database restored from backup successfully.
    </div>

    <!-- Restore Success -->
    <div v-if="restoreSuccess" class="success-message" data-testid="restore-success">
      Database restored successfully! {{ restoreSuccess.recordsRestored }} records restored.
    </div>

    <!-- Chunk Progress -->
    <div v-if="chunkProgress" class="chunk-progress" data-testid="chunk-progress">
      Processing chunk {{ chunkProgress.currentChunk }} of {{ chunkProgress.totalChunks }}
    </div>

    <!-- Time Estimate -->
    <div v-if="timeEstimate" class="time-estimate" data-testid="time-estimate">
      Estimated time remaining: {{ timeEstimate }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

// State
const exportFormat = ref('sqlite');
const isExporting = ref(false);
const exportProgress = ref(0);
const currentTable = ref('');
const recordsProcessed = ref(0);
const totalRecords = ref(0);
const exportError = ref('');
const exportCancelled = ref(false);

const selectedFile = ref<File | null>(null);
const isDragOver = ref(false);
const isValidating = ref(false);
const fileError = ref('');
const validationResults = ref<any>(null);

const activeTab = ref('export');
const backups = ref([
  {
    id: 'backup_20240101_120000',
    created: '2024-01-01T12:00:00Z',
    size: '5.2 MB',
    type: 'automatic',
  },
]);

const backupInfo = ref<any>(null);
const showConfirmDialog = ref(false);
const importSuccess = ref<any>(null);
const importError = ref('');
const canRollback = ref(false);
const rollbackSuccess = ref(false);
const restoreSuccess = ref<any>(null);
const chunkProgress = ref<any>(null);
const timeEstimate = ref('');

// Methods
function startExport() {
  isExporting.value = true;
  exportProgress.value = 0;
  currentTable.value = 'users';
  recordsProcessed.value = 1000;
  totalRecords.value = 2000;
  exportError.value = '';
  exportCancelled.value = false;

  // Simulate export progress
  const interval = setInterval(() => {
    exportProgress.value += 10;
    recordsProcessed.value += 200;

    if (exportProgress.value >= 100) {
      clearInterval(interval);
      isExporting.value = false;
      // Trigger download
      const link = document.createElement('a');
      link.href = 'blob:mock-url';
      link.download = `export.${exportFormat.value === 'sqlite' ? 'db' : exportFormat.value}`;
      link.click();
    }
  }, 500);
}

function cancelExport() {
  isExporting.value = false;
  exportCancelled.value = true;
}

function retryExport() {
  exportError.value = '';
  startExport();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectFile(target.files[0]);
  }
}

function handleFileDrop(event: DragEvent) {
  isDragOver.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    selectFile(event.dataTransfer.files[0]);
  }
}

function selectFile(file: File) {
  // Validate file type
  const validTypes = ['application/x-sqlite3', 'application/json', 'text/csv'];
  if (!validTypes.includes(file.type) && !file.name.endsWith('.db')) {
    fileError.value = 'Invalid file type. Please select a .db, .json, or .csv file.';
    return;
  }

  // Validate file size (100MB limit)
  if (file.size > 100 * 1024 * 1024) {
    fileError.value = 'File too large. Maximum size is 100MB.';
    return;
  }

  selectedFile.value = file;
  fileError.value = '';
  validationResults.value = null;
}

function validateFile() {
  if (!selectedFile.value) return;

  isValidating.value = true;

  // Simulate validation
  setTimeout(() => {
    validationResults.value = {
      valid: true,
      preview: {
        tables: [
          { name: 'users', records: 100, columns: ['id', 'username', 'email'] },
          { name: 'guilds', records: 5, columns: ['id', 'name', 'owner_id'] },
        ],
        recordCount: 105,
        estimatedSize: '1.2 MB',
      },
    };
    isValidating.value = false;
  }, 1000);
}

function showImportConfirmation() {
  showConfirmDialog.value = true;
}

function confirmImport() {
  showConfirmDialog.value = false;

  // Simulate import
  setTimeout(() => {
    importSuccess.value = {
      recordsImported: 1500,
      backupCreated: 'backup_20240101_120000.db',
    };
  }, 2000);
}

function cancelImport() {
  showConfirmDialog.value = false;
}

function restoreBackup(backupId: string) {
  // Show confirmation first
  showConfirmDialog.value = true;

  setTimeout(() => {
    showConfirmDialog.value = false;
    restoreSuccess.value = {
      recordsRestored: 1000,
    };
  }, 1000);
}

function rollback() {
  rollbackSuccess.value = true;
  importError.value = '';
  canRollback.value = false;
}

function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}
</script>

<style scoped>
.database-container {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.database-export,
.database-import,
.backup-management {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}

.export-form {
  display: flex;
  gap: 1rem;
  align-items: end;
  margin-bottom: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
}

.form-group select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

button {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #2563eb;
}

button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #f3f4f6;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: #10b981;
  transition: width 0.3s ease;
}

.drop-zone {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.3s ease;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: #3b82f6;
  background: #f8fafc;
}

.file-preview {
  margin-top: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 4px;
}

.validation-results {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.data-preview {
  margin: 1rem 0;
}

.table-info {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: white;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.backup-list {
  margin-top: 1rem;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.backup-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.confirmation-dialog {
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

.dialog-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 400px;
  width: 90%;
}

.dialog-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.success-message {
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #10b981;
  border-radius: 4px;
  color: #065f46;
  margin-top: 1rem;
}

.error-message {
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #ef4444;
  border-radius: 4px;
  color: #dc2626;
  margin-top: 1rem;
}

.info-message {
  padding: 1rem;
  background: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  color: #1e40af;
  margin-top: 1rem;
}

.chunk-progress,
.time-estimate {
  padding: 0.5rem;
  background: #f3f4f6;
  border-radius: 4px;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

button.active {
  background: #10b981;
}
</style>
