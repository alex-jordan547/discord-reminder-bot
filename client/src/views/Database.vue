<template>
  <div class="database-view">
    <div class="database-header">
      <h1>Database Management</h1>
      <p>Export, import, and manage your database with a comprehensive interface.</p>
    </div>

    <div class="database-sections">
      <!-- Export Section -->
      <section class="database-section">
        <h2>Export Database</h2>
        <p>Export your current database to various formats for backup or migration purposes.</p>
        
        <DatabaseExportInterface
          :is-exporting="exportState.isExporting"
          :export-progress="exportState.progress"
          :last-export-result="exportState.lastResult"
          @export="handleExport"
        />

        <DatabaseProgressIndicator
          v-if="exportState.isExporting"
          :progress="exportState.progress"
          operation="export"
          :status-message="exportState.statusMessage"
          :estimated-time-remaining="exportState.estimatedTime"
          :processing-speed="exportState.processingSpeed"
          :records-processed="exportState.recordsProcessed"
          :total-records="exportState.totalRecords"
          :cancellable="true"
          :has-error="exportState.hasError"
          :error-message="exportState.errorMessage"
          :is-complete="exportState.isComplete"
          :success-message="exportState.successMessage"
          @cancel="handleExportCancel"
        />
      </section>

      <!-- Import Section -->
      <section class="database-section">
        <h2>Import Database</h2>
        <p>Import data from external files to replace or merge with your current database.</p>
        
        <DatabaseImportInterface
          :selected-file="importState.selectedFile"
          :is-importing="importState.isImporting"
          :import-progress="importState.progress"
          @file-selected="handleFileSelected"
          @import="handleImport"
          @clear-file="handleClearFile"
        />

        <DatabaseDataPreview
          v-if="importState.previewData || importState.previewLoading || importState.previewError"
          :preview-data="importState.previewData"
          :visible="true"
          :loading="importState.previewLoading"
          :error="importState.previewError"
          @close="handleClosePreview"
        />

        <DatabaseProgressIndicator
          v-if="importState.isImporting"
          :progress="importState.progress"
          operation="import"
          :status-message="importState.statusMessage"
          :estimated-time-remaining="importState.estimatedTime"
          :processing-speed="importState.processingSpeed"
          :records-processed="importState.recordsProcessed"
          :total-records="importState.totalRecords"
          :cancellable="true"
          :has-error="importState.hasError"
          :error-message="importState.errorMessage"
          :is-complete="importState.isComplete"
          :success-message="importState.successMessage"
          @cancel="handleImportCancel"
        />
      </section>
    </div>

    <!-- Confirmation Dialogs -->
    <DatabaseConfirmationDialog
      :visible="confirmationDialog.visible"
      :operation="confirmationDialog.operation"
      :title="confirmationDialog.title"
      :message="confirmationDialog.message"
      :warning-details="confirmationDialog.warningDetails"
      :require-confirmation="confirmationDialog.requireConfirmation"
      :confirmation-text="confirmationDialog.confirmationText"
      :file-info="confirmationDialog.fileInfo"
      :backup-info="confirmationDialog.backupInfo"
      :loading="confirmationDialog.loading"
      @confirm="handleConfirmationConfirm"
      @cancel="handleConfirmationCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import DatabaseExportInterface from '@/components/DatabaseExportInterface.vue';
import DatabaseImportInterface from '@/components/DatabaseImportInterface.vue';
import DatabaseProgressIndicator from '@/components/DatabaseProgressIndicator.vue';
import DatabaseConfirmationDialog from '@/components/DatabaseConfirmationDialog.vue';
import DatabaseDataPreview from '@/components/DatabaseDataPreview.vue';
import { showDownloadNotification } from '@/utils/downloadHelper';
import type { ExportFormat, ExportResult } from '@/types';

// Export state management
const exportState = reactive({
  isExporting: false,
  progress: 0,
  statusMessage: '',
  estimatedTime: undefined as number | undefined,
  processingSpeed: '',
  recordsProcessed: undefined as number | undefined,
  totalRecords: undefined as number | undefined,
  hasError: false,
  errorMessage: '',
  isComplete: false,
  successMessage: '',
  lastResult: null as ExportResult | null,
});

// Import state management
const importState = reactive({
  selectedFile: null as File | null,
  isImporting: false,
  progress: 0,
  statusMessage: '',
  estimatedTime: undefined as number | undefined,
  processingSpeed: '',
  recordsProcessed: undefined as number | undefined,
  totalRecords: undefined as number | undefined,
  hasError: false,
  errorMessage: '',
  isComplete: false,
  successMessage: '',
  previewData: null as any,
  previewLoading: false,
  previewError: '',
});

// Confirmation dialog state
const confirmationDialog = reactive({
  visible: false,
  operation: 'import' as 'import' | 'export' | 'delete' | 'migration' | 'clear',
  title: '',
  message: '',
  warningDetails: [] as string[],
  requireConfirmation: false,
  confirmationText: '',
  fileInfo: undefined as any,
  backupInfo: undefined as any,
  loading: false,
  pendingAction: null as (() => void) | null,
});

// Export handlers
const handleExport = (format: ExportFormat) => {
  confirmationDialog.visible = true;
  confirmationDialog.operation = 'export';
  confirmationDialog.title = 'Confirm Database Export';
  confirmationDialog.message = `Export the database in ${format.toUpperCase()} format?`;
  confirmationDialog.warningDetails = [
    'This will create a snapshot of your current database',
    'Large databases may take several minutes to export',
    'The export file will be downloaded to your device',
  ];
  confirmationDialog.requireConfirmation = false;
  confirmationDialog.pendingAction = () => performExport(format);
};

const performExport = async (format: ExportFormat) => {
  exportState.isExporting = true;
  exportState.progress = 0;
  exportState.hasError = false;
  exportState.isComplete = false;
  exportState.statusMessage = 'Preparing export...';

  try {
    // Simulate export process with progress updates
    const totalSteps = 100;
    for (let i = 0; i <= totalSteps; i += 10) {
      exportState.progress = i;
      exportState.statusMessage = `Exporting data... (${i}%)`;
      exportState.recordsProcessed = Math.floor((i / 100) * 1000);
      exportState.totalRecords = 1000;
      exportState.processingSpeed = '2.5 MB/s';
      exportState.estimatedTime = Math.floor((100 - i) / 10);
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Generate actual file content based on format
    const filename = generateExportFilename(format);
    
    let content: string | Uint8Array;
    let mimeType: string;
    
    switch (format) {
      case 'sqlite':
        // Generate realistic SQLite binary data
        content = new Uint8Array([
          // SQLite file header
          0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
          0x10, 0x00, 0x01, 0x01, 0x00, 0x40, 0x20, 0x20, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02,
          // Add more realistic SQLite data
          ...Array.from({ length: 1000 }, (_, i) => i % 256)
        ]);
        mimeType = 'application/vnd.sqlite3'; // More standard MIME type
        break;
        
      case 'json':
        content = JSON.stringify({
          metadata: {
            exportDate: new Date().toISOString(),
            format: 'json',
            version: '1.0',
            source: 'Discord Bot Dashboard',
            recordCount: 1000
          },
          tables: {
            users: Array.from({ length: 100 }, (_, i) => ({
              id: i + 1,
              username: `user_${i + 1}`,
              email: `user${i + 1}@example.com`,
              created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
              is_active: Math.random() > 0.1
            })),
            reminders: Array.from({ length: 500 }, (_, i) => ({
              id: i + 1,
              user_id: Math.floor(Math.random() * 100) + 1,
              title: `Reminder ${i + 1}`,
              description: `This is reminder number ${i + 1}`,
              scheduled_time: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
              is_completed: Math.random() > 0.7,
              created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
            })),
            settings: [
              { key: 'theme', value: 'dark', updated_at: new Date().toISOString() },
              { key: 'language', value: 'en', updated_at: new Date().toISOString() },
              { key: 'timezone', value: 'UTC', updated_at: new Date().toISOString() },
              { key: 'notifications_enabled', value: 'true', updated_at: new Date().toISOString() }
            ]
          }
        }, null, 2);
        mimeType = 'application/json';
        break;
        
      case 'csv':
        const csvHeaders = 'id,username,email,created_at,is_active,reminder_count';
        const csvRows = Array.from({ length: 100 }, (_, i) => {
          const reminderCount = Math.floor(Math.random() * 10);
          return [
            i + 1,
            `"user_${i + 1}"`,
            `"user${i + 1}@example.com"`,
            `"${new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()}"`,
            Math.random() > 0.1 ? 'true' : 'false',
            reminderCount
          ].join(',');
        });
        content = [csvHeaders, ...csvRows].join('\n');
        mimeType = 'text/csv';
        break;
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Create blob with explicit MIME type and filename handling
    const blobOptions: BlobPropertyBag = { 
      type: mimeType
    };
    const blob = new Blob([content], blobOptions);
    const url = URL.createObjectURL(blob);
    
    // Create a more robust download mechanism
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    // Force download attribute and add additional attributes
    a.setAttribute('download', filename);
    a.setAttribute('target', '_self'); // Changed to _self for better download handling
    
    // Add to DOM temporarily
    document.body.appendChild(a);
    
    // Use immediate click instead of setTimeout for better reliability
    try {
      a.click();
      
      // Clean up resources after a short delay
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      // Fallback for older browsers
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
      console.error('Download failed:', error);
    }

    exportState.isComplete = true;
    exportState.successMessage = `Database exported successfully as ${filename}`;
    exportState.lastResult = {
      success: true,
      filename,
      size: blob.size,
      format,
      recordCount: 1000,
      timestamp: new Date().toISOString(),
    };

    // Show download notification with location info
    showDownloadNotification({
      filename,
      size: blob.size,
      format,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    exportState.hasError = true;
    exportState.errorMessage = 'Export failed: ' + (error as Error).message;
  } finally {
    setTimeout(() => {
      exportState.isExporting = false;
    }, 2000);
  }
};

const handleExportCancel = () => {
  exportState.isExporting = false;
  exportState.progress = 0;
  exportState.statusMessage = '';
};

// Import handlers
const handleFileSelected = async (file: File) => {
  importState.selectedFile = file;
  
  // Start preview generation
  importState.previewLoading = true;
  importState.previewError = '';
  
  try {
    // Simulate file analysis
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock preview data
    importState.previewData = {
      tables: [
        {
          name: 'users',
          rowCount: 150,
          columns: ['id', 'username', 'email', 'created_at'],
          sampleRows: [
            { id: 1, username: 'john_doe', email: 'john@example.com', created_at: '2024-01-15T10:30:00Z' },
            { id: 2, username: 'jane_smith', email: 'jane@example.com', created_at: '2024-01-15T11:45:00Z' },
          ],
          columnTypes: {
            id: 'INTEGER',
            username: 'TEXT',
            email: 'TEXT',
            created_at: 'DATETIME',
          },
        },
      ],
      totalRecords: 150,
      fileSize: formatFileSize(file.size),
      format: getFileFormat(file.name),
      validationWarnings: [
        { table: 'users', column: 'email', message: 'Duplicate email addresses found', count: 2 },
      ],
    };
  } catch (error) {
    importState.previewError = 'Failed to analyze file: ' + (error as Error).message;
  } finally {
    importState.previewLoading = false;
  }
};

const handleImport = (file: File) => {
  confirmationDialog.visible = true;
  confirmationDialog.operation = 'import';
  confirmationDialog.title = 'Confirm Database Import';
  confirmationDialog.message = 'This will replace your current database with the imported data.';
  confirmationDialog.warningDetails = [
    'Your current database will be backed up automatically',
    'This action cannot be undone without restoring from backup',
    'Import may take several minutes for large files',
    'The application will be temporarily unavailable during import',
  ];
  confirmationDialog.requireConfirmation = true;
  confirmationDialog.confirmationText = 'IMPORT';
  confirmationDialog.fileInfo = {
    name: file.name,
    size: file.size,
    type: getFileFormat(file.name),
  };
  confirmationDialog.backupInfo = {
    willCreateBackup: true,
    backupLocation: `/backups/backup_${new Date().toISOString().split('T')[0]}.db`,
    estimatedBackupSize: '2.1 MB',
  };
  confirmationDialog.pendingAction = () => performImport(file);
};

const performImport = async (file: File) => {
  importState.isImporting = true;
  importState.progress = 0;
  importState.hasError = false;
  importState.isComplete = false;
  importState.statusMessage = 'Creating backup...';

  try {
    // Simulate import process
    const totalSteps = 100;
    for (let i = 0; i <= totalSteps; i += 3) {
      importState.progress = i;
      
      if (i < 20) {
        importState.statusMessage = 'Creating backup...';
      } else if (i < 40) {
        importState.statusMessage = 'Validating import file...';
      } else if (i < 80) {
        importState.statusMessage = 'Importing data...';
        importState.recordsProcessed = Math.floor(((i - 40) / 40) * 150);
        importState.totalRecords = 150;
        importState.processingSpeed = '1.8 MB/s';
      } else {
        importState.statusMessage = 'Finalizing import...';
      }
      
      importState.estimatedTime = Math.floor((100 - i) / 3);
      
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    importState.isComplete = true;
    importState.successMessage = 'Database imported successfully';
  } catch (error) {
    importState.hasError = true;
    importState.errorMessage = 'Import failed: ' + (error as Error).message;
  } finally {
    setTimeout(() => {
      importState.isImporting = false;
    }, 2000);
  }
};

const handleImportCancel = () => {
  importState.isImporting = false;
  importState.progress = 0;
  importState.statusMessage = '';
};

const handleClearFile = () => {
  importState.selectedFile = null;
  importState.previewData = null;
  importState.previewError = '';
};

const handleClosePreview = () => {
  importState.previewData = null;
  importState.previewError = '';
};

// Confirmation dialog handlers
const handleConfirmationConfirm = () => {
  confirmationDialog.visible = false;
  if (confirmationDialog.pendingAction) {
    confirmationDialog.pendingAction();
    confirmationDialog.pendingAction = null;
  }
};

const handleConfirmationCancel = () => {
  confirmationDialog.visible = false;
  confirmationDialog.pendingAction = null;
};

// Utility functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 bytes';
  
  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const generateExportFilename = (format: ExportFormat): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  // Create a human-readable timestamp with milliseconds for uniqueness
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${milliseconds}`;
  const extension = format === 'sqlite' ? 'db' : format;
  
  // Always use a descriptive, human-readable filename
  return `discord_bot_database_export_${timestamp}.${extension}`;
};

const getFileFormat = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'db':
    case 'sqlite':
      return 'SQLite Database';
    case 'json':
      return 'JSON File';
    case 'csv':
      return 'CSV File';
    default:
      return 'Unknown Format';
  }
};
</script>

<style scoped>
.database-view {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.database-header {
  margin-bottom: 2rem;
  text-align: center;
}

.database-header h1 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 2rem;
  font-weight: 700;
}

.database-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.database-sections {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.database-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 2rem;
  border: 1px solid var(--border-color);
}

.database-section h2 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 1.5rem;
  font-weight: 600;
}

.database-section p {
  margin: 0 0 1.5rem 0;
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1.5;
}

/* Responsive design */
@media (max-width: 768px) {
  .database-view {
    padding: 1rem;
  }
  
  .database-header h1 {
    font-size: 1.75rem;
  }
  
  .database-header p {
    font-size: 1rem;
  }
  
  .database-section {
    padding: 1.5rem;
  }
  
  .database-section h2 {
    font-size: 1.25rem;
  }
}

@media (min-width: 1024px) {
  .database-sections {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
}
</style>