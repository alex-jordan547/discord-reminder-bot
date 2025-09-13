<template>
  <div v-if="visible" data-testid="data-preview-container" class="database-data-preview">
    <div class="preview-header">
      <h3 class="preview-title">Data Preview</h3>
      <button
        data-testid="close-preview-button"
        class="close-button"
        @click="handleClose"
        aria-label="Close preview"
      >
        ✕
      </button>
    </div>

    <div v-if="loading" data-testid="preview-loading" class="loading-state">
      <div class="spinner"></div>
      <p>Analyzing file structure and content...</p>
    </div>

    <div v-else-if="error" data-testid="preview-error" class="error-state">
      <div class="error-icon">⚠️</div>
      <p>{{ error }}</p>
    </div>

    <div v-else-if="previewData" class="preview-content">
      <!-- File Summary -->
      <div data-testid="file-summary" class="file-summary">
        <div class="summary-item">
          <span class="label">Format:</span>
          <span class="value">{{ previewData.format }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Size:</span>
          <span class="value">{{ previewData.fileSize }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Tables:</span>
          <span class="value">{{ previewData.tables.length }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Total Records:</span>
          <span class="value">{{ formatNumber(previewData.totalRecords) }}</span>
        </div>
      </div>

      <!-- Validation Warnings -->
      <div
        v-if="previewData.validationWarnings && previewData.validationWarnings.length > 0"
        data-testid="validation-warnings"
        class="validation-warnings"
      >
        <h4>⚠️ Validation Warnings</h4>
        <div class="warning-list">
          <div
            v-for="(warning, index) in previewData.validationWarnings"
            :key="index"
            :data-testid="`warning-item-${index}`"
            class="warning-item"
          >
            <span class="warning-location">{{ warning.table }}.{{ warning.column }}</span>
            <span class="warning-message">{{ warning.message }}</span>
            <span class="warning-count">({{ warning.count }} issues)</span>
          </div>
        </div>
      </div>

      <!-- Table Navigation -->
      <div v-if="previewData.tables.length > 0" class="table-navigation">
        <div data-testid="table-tabs" class="table-tabs">
          <button
            v-for="table in previewData.tables"
            :key="table.name"
            :data-testid="`table-tab-${table.name}`"
            class="table-tab"
            :class="{ active: activeTable === table.name }"
            @click="setActiveTable(table.name)"
          >
            <span class="tab-name">{{ table.name }}</span>
            <span class="tab-count">{{ formatNumber(table.rowCount) }} rows</span>
          </button>
        </div>
      </div>

      <!-- Table Content -->
      <div v-if="currentTable" data-testid="table-content" class="table-content">
        <div class="table-header">
          <h4 data-testid="active-table-name" class="table-name">
            {{ currentTable.name }}
          </h4>
          <div data-testid="pagination-info" class="pagination-info">
            Showing {{ currentTable.sampleRows.length }} of
            {{ formatNumber(currentTable.rowCount) }} rows
          </div>
        </div>

        <div
          v-if="currentTable.sampleRows.length === 0"
          data-testid="empty-table-message"
          class="empty-table"
        >
          <div class="empty-icon">📭</div>
          <p>No data to preview in this table</p>
        </div>

        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th
                  v-for="column in currentTable.columns"
                  :key="column"
                  :data-testid="`column-header-${column}`"
                  class="column-header"
                >
                  <div class="header-content">
                    <span class="column-name">{{ column }}</span>
                    <span
                      v-if="currentTable.columnTypes && currentTable.columnTypes[column]"
                      class="column-type"
                    >
                      {{ currentTable.columnTypes[column] }}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, rowIndex) in currentTable.sampleRows"
                :key="rowIndex"
                :data-testid="`data-row-${rowIndex}`"
                class="data-row"
              >
                <td
                  v-for="column in currentTable.columns"
                  :key="column"
                  :data-testid="`cell-${column}-${rowIndex}`"
                  class="data-cell"
                  :class="{ 'null-value': isNullValue(row[column]) }"
                  :title="getCellTooltip(row[column])"
                >
                  {{ formatCellValue(row[column]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface ValidationWarning {
  table: string;
  column: string;
  message: string;
  count: number;
}

interface TableData {
  name: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, any>[];
  columnTypes?: Record<string, string>;
}

interface PreviewData {
  tables: TableData[];
  totalRecords: number;
  fileSize: string;
  format: string;
  validationWarnings?: ValidationWarning[];
}

interface Props {
  previewData: PreviewData | null;
  visible: boolean;
  loading?: boolean;
  error?: string;
}

interface Emits {
  (e: 'close'): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: '',
});

const emit = defineEmits<Emits>();

const activeTable = ref<string>('');

const currentTable = computed(() => {
  if (!props.previewData || !activeTable.value) return null;
  return props.previewData.tables.find(table => table.name === activeTable.value) || null;
});

const setActiveTable = (tableName: string) => {
  activeTable.value = tableName;
};

const handleClose = () => {
  emit('close');
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const isNullValue = (value: any): boolean => {
  return value === null || value === undefined;
};

const formatCellValue = (value: any): string => {
  if (isNullValue(value)) {
    return 'NULL';
  }

  const stringValue = String(value);
  const maxLength = 50;

  if (stringValue.length > maxLength) {
    return stringValue.substring(0, maxLength) + '...';
  }

  return stringValue;
};

const getCellTooltip = (value: any): string => {
  if (isNullValue(value)) {
    return 'NULL value';
  }

  return String(value);
};

// Set first table as active when preview data changes
watch(
  () => props.previewData,
  newData => {
    if (newData && newData.tables.length > 0) {
      activeTable.value = newData.tables[0].name;
    } else {
      activeTable.value = '';
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.database-data-preview {
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  max-height: 80vh;
  overflow-y: auto;
  margin-top: 1rem;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  border-radius: 8px 8px 0 0;
}

.preview-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.25rem;
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

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
}

.loading-state .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--bg-tertiary);
  border-top: 3px solid var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-state p,
.error-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.error-state .error-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.preview-content {
  padding: 1.5rem;
}

.file-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-item .label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.summary-item .value {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 600;
}

.validation-warnings {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: 6px;
}

.validation-warnings h4 {
  margin: 0 0 1rem 0;
  color: var(--warning-color);
  font-size: 0.9rem;
  font-weight: 600;
}

.warning-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.warning-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.warning-location {
  font-weight: 600;
  color: var(--warning-color);
  font-family: monospace;
}

.warning-message {
  color: var(--text-primary);
  flex: 1;
}

.warning-count {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.table-navigation {
  margin-bottom: 1.5rem;
}

.table-tabs {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.table-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
  white-space: nowrap;
}

.table-tab:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-color);
}

.table-tab.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.tab-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.tab-count {
  font-size: 0.75rem;
  opacity: 0.8;
}

.table-content {
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.table-name {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  font-family: monospace;
}

.pagination-info {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.empty-table {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
  opacity: 0.6;
}

.empty-table p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.table-wrapper {
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.column-header {
  background: var(--bg-tertiary);
  border-bottom: 2px solid var(--border-color);
  padding: 0.75rem;
  text-align: left;
  position: sticky;
  top: 0;
  z-index: 1;
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.column-name {
  font-weight: 600;
  color: var(--text-primary);
  font-family: monospace;
}

.column-type {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: normal;
  text-transform: uppercase;
}

.data-row {
  border-bottom: 1px solid var(--border-color);
}

.data-row:hover {
  background: var(--bg-secondary);
}

.data-cell {
  padding: 0.75rem;
  border-right: 1px solid var(--border-color);
  color: var(--text-primary);
  vertical-align: top;
  max-width: 200px;
  word-wrap: break-word;
}

.data-cell:last-child {
  border-right: none;
}

.data-cell.null-value {
  color: var(--text-secondary);
  font-style: italic;
  opacity: 0.7;
}

/* Responsive design */
@media (max-width: 768px) {
  .database-data-preview {
    max-height: 90vh;
  }

  .preview-header {
    padding: 1rem;
  }

  .preview-content {
    padding: 1rem;
  }

  .file-summary {
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .table-tabs {
    gap: 0.25rem;
  }

  .table-tab {
    min-width: 100px;
    padding: 0.5rem 0.75rem;
  }

  .table-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 1rem;
  }

  .data-table {
    font-size: 0.8rem;
  }

  .data-cell {
    padding: 0.5rem;
    max-width: 150px;
  }
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .table-tab.active {
    color: var(--bg-primary);
  }
}
</style>
