import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DatabaseConfirmationDialog from '@/components/DatabaseConfirmationDialog.vue';

describe('DatabaseConfirmationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createWrapper = (props: any) => {
    return mount(DatabaseConfirmationDialog, {
      props: {
        ...props,
        disableTeleport: true, // Disable teleport for testing
      },
    });
  };

  it('should not render when not visible', () => {
    const wrapper = createWrapper({
      visible: false,
      operation: 'import',
      title: 'Confirm Import',
      message: 'This will replace all existing data.',
    });
    
    const modal = wrapper.find('[data-testid="confirmation-modal"]');
    expect(modal.exists()).toBe(false);
  });

  it('should render modal when visible', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'This will replace all existing data.',
    });
    
    const modal = wrapper.find('[data-testid="confirmation-modal"]');
    expect(modal.exists()).toBe(true);
    
    const overlay = wrapper.find('[data-testid="modal-overlay"]');
    expect(overlay.exists()).toBe(true);
  });

  it('should display correct title and message', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Delete Database',
      message: 'This action cannot be undone. All data will be permanently lost.',
    });
    
    const title = wrapper.find('[data-testid="modal-title"]');
    expect(title.exists()).toBe(true);
    expect(title.text()).toBe('Delete Database');
    
    const message = wrapper.find('[data-testid="modal-message"]');
    expect(message.exists()).toBe(true);
    expect(message.text()).toBe('This action cannot be undone. All data will be permanently lost.');
  });

  it('should show appropriate icon based on operation type', () => {
    const importWrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
    });
    
    const importIcon = importWrapper.find('[data-testid="operation-icon"]');
    expect(importIcon.exists()).toBe(true);
    expect(importIcon.text()).toBe('📥');
    
    const deleteWrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Confirm Delete',
      message: 'Delete data?',
    });
    
    const deleteIcon = deleteWrapper.find('[data-testid="operation-icon"]');
    expect(deleteIcon.text()).toBe('🗑️');
  });

  it('should display warning details when provided', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
      warningDetails: [
        'Current data will be backed up',
        'Import may take several minutes',
        'Database will be temporarily unavailable',
      ],
    });
    
    const warningList = wrapper.find('[data-testid="warning-details"]');
    expect(warningList.exists()).toBe(true);
    
    const warningItems = warningList.findAll('li');
    expect(warningItems).toHaveLength(3);
    expect(warningItems[0].text()).toBe('Current data will be backed up');
    expect(warningItems[1].text()).toBe('Import may take several minutes');
    expect(warningItems[2].text()).toBe('Database will be temporarily unavailable');
  });

  it('should show confirmation input when required', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Confirm Delete',
      message: 'Type "DELETE" to confirm',
      requireConfirmation: true,
      confirmationText: 'DELETE',
    });
    
    const confirmationInput = wrapper.find('[data-testid="confirmation-input"]');
    expect(confirmationInput.exists()).toBe(true);
    expect(confirmationInput.attributes('placeholder')).toBe('Type "DELETE" to confirm');
    
    const confirmButton = wrapper.find('[data-testid="confirm-button"]');
    expect(confirmButton.attributes('disabled')).toBeDefined();
  });

  it('should enable confirm button when correct confirmation text is entered', async () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Confirm Delete',
      message: 'Type "DELETE" to confirm',
      requireConfirmation: true,
      confirmationText: 'DELETE',
    });
    
    const confirmationInput = wrapper.find('[data-testid="confirmation-input"]');
    await confirmationInput.setValue('DELETE');
    
    const confirmButton = wrapper.find('[data-testid="confirm-button"]');
    expect(confirmButton.attributes('disabled')).toBeUndefined();
  });

  it('should show file information when importing', () => {
    const mockFile = new File(['test'], 'backup.db', { type: 'application/x-sqlite3' });
    
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import this file?',
      fileInfo: {
        name: mockFile.name,
        size: mockFile.size,
        type: 'SQLite Database',
      },
    });
    
    const fileInfo = wrapper.find('[data-testid="file-info"]');
    expect(fileInfo.exists()).toBe(true);
    expect(fileInfo.text()).toContain('backup.db');
    expect(fileInfo.text()).toContain('SQLite Database');
  });

  it('should display backup information when available', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
      backupInfo: {
        willCreateBackup: true,
        backupLocation: '/backups/backup_2024-01-15.db',
        estimatedBackupSize: '2.5 MB',
      },
    });
    
    const backupInfo = wrapper.find('[data-testid="backup-info"]');
    expect(backupInfo.exists()).toBe(true);
    expect(backupInfo.text()).toContain('A backup will be created');
    expect(backupInfo.text()).toContain('backup_2024-01-15.db');
    expect(backupInfo.text()).toContain('2.5 MB');
  });

  it('should have correct button labels based on operation', () => {
    const importWrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
    });
    
    const importConfirmButton = importWrapper.find('[data-testid="confirm-button"]');
    expect(importConfirmButton.text()).toBe('Import');
    
    const deleteWrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Confirm Delete',
      message: 'Delete data?',
    });
    
    const deleteConfirmButton = deleteWrapper.find('[data-testid="confirm-button"]');
    expect(deleteConfirmButton.text()).toBe('Delete');
  });

  it('should emit confirm event when confirm button is clicked', async () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'export',
      title: 'Confirm Export',
      message: 'Export data?',
    });
    
    const confirmButton = wrapper.find('[data-testid="confirm-button"]');
    await confirmButton.trigger('click');
    
    expect(wrapper.emitted('confirm')).toBeTruthy();
  });

  it('should emit cancel event when cancel button is clicked', async () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
    });
    
    const cancelButton = wrapper.find('[data-testid="cancel-button"]');
    await cancelButton.trigger('click');
    
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('should emit cancel event when overlay is clicked', async () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
      closeOnOverlayClick: true,
    });
    
    const overlay = wrapper.find('[data-testid="modal-overlay"]');
    await overlay.trigger('click');
    
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('should not close when overlay is clicked if closeOnOverlayClick is false', async () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Confirm Delete',
      message: 'Delete data?',
      closeOnOverlayClick: false,
    });
    
    const overlay = wrapper.find('[data-testid="modal-overlay"]');
    await overlay.trigger('click');
    
    expect(wrapper.emitted('cancel')).toBeFalsy();
  });

  it('should handle escape key to cancel', async () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
    });
    
    const overlay = wrapper.find('[data-testid="modal-overlay"]');
    await overlay.trigger('keydown.escape');
    
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('should disable buttons when loading', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
      loading: true,
    });
    
    const confirmButton = wrapper.find('[data-testid="confirm-button"]');
    const cancelButton = wrapper.find('[data-testid="cancel-button"]');
    
    expect(confirmButton.attributes('disabled')).toBeDefined();
    expect(cancelButton.attributes('disabled')).toBeDefined();
  });

  it('should show loading spinner when loading', () => {
    const wrapper = createWrapper({
      visible: true,
      operation: 'import',
      title: 'Confirm Import',
      message: 'Import data?',
      loading: true,
    });
    
    const spinner = wrapper.find('[data-testid="loading-spinner"]');
    expect(spinner.exists()).toBe(true);
  });

  it('should apply correct CSS classes for different operation types', () => {
    const dangerousWrapper = createWrapper({
      visible: true,
      operation: 'delete',
      title: 'Confirm Delete',
      message: 'Delete data?',
    });
    
    const modal = dangerousWrapper.find('[data-testid="confirmation-modal"]');
    expect(modal.classes()).toContain('dangerous-operation');
    
    const confirmButton = dangerousWrapper.find('[data-testid="confirm-button"]');
    expect(confirmButton.classes()).toContain('btn-danger');
  });
});