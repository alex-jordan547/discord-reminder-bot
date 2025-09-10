import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DatabaseImportInterface from '@/components/DatabaseImportInterface.vue';
import type { ImportResult } from '@/types';

// Mock file reader
const mockFileReader = {
  readAsArrayBuffer: vi.fn(),
  result: null,
  onload: null,
  onerror: null,
};

Object.defineProperty(window, 'FileReader', {
  writable: true,
  value: vi.fn(() => mockFileReader),
});

describe('DatabaseImportInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render file upload area with drag-and-drop zone', () => {
    const wrapper = mount(DatabaseImportInterface);

    // Should have drag-and-drop zone
    const dropZone = wrapper.find('[data-testid="drop-zone"]');
    expect(dropZone.exists()).toBe(true);
    expect(dropZone.classes()).toContain('drop-zone');

    // Should have file input
    const fileInput = wrapper.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    expect(fileInput.attributes('accept')).toBe('.db,.sqlite,.json,.csv');
  });

  it('should display upload instructions and supported formats', () => {
    const wrapper = mount(DatabaseImportInterface);

    const instructions = wrapper.find('[data-testid="upload-instructions"]');
    expect(instructions.exists()).toBe(true);
    expect(instructions.text()).toContain('Drag and drop');
    expect(instructions.text()).toContain('click to browse');

    const supportedFormats = wrapper.find('[data-testid="supported-formats"]');
    expect(supportedFormats.exists()).toBe(true);
    expect(supportedFormats.text()).toContain('SQLite');
    expect(supportedFormats.text()).toContain('JSON');
    expect(supportedFormats.text()).toContain('CSV');
  });

  it('should handle file selection via input', async () => {
    const wrapper = mount(DatabaseImportInterface);

    const file = new File(['test content'], 'test.db', { type: 'application/x-sqlite3' });
    const fileInput = wrapper.find('input[type="file"]');

    // Mock file input change
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false,
    });

    await fileInput.trigger('change');

    // Should emit file-selected event
    expect(wrapper.emitted('file-selected')).toBeTruthy();
    expect(wrapper.emitted('file-selected')?.[0]).toEqual([file]);
  });

  it('should handle drag and drop events', async () => {
    const wrapper = mount(DatabaseImportInterface);
    const dropZone = wrapper.find('[data-testid="drop-zone"]');

    // Test dragover event
    await dropZone.trigger('dragover');
    expect(dropZone.classes()).toContain('drag-over');

    // Test dragleave event
    await dropZone.trigger('dragleave');
    expect(dropZone.classes()).not.toContain('drag-over');

    // Test drop event
    const file = new File(['test content'], 'test.db', { type: 'application/x-sqlite3' });
    const dropEvent = new Event('drop');
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [file],
      },
    });

    await dropZone.element.dispatchEvent(dropEvent);

    // Should emit file-selected event
    expect(wrapper.emitted('file-selected')).toBeTruthy();
  });

  it('should validate file type and size', async () => {
    const wrapper = mount(DatabaseImportInterface);

    // Test invalid file type
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    const fileInput = wrapper.find('input[type="file"]');

    Object.defineProperty(fileInput.element, 'files', {
      value: [invalidFile],
      writable: false,
    });

    await fileInput.trigger('change');

    // Should show error message
    const errorMessage = wrapper.find('[data-testid="file-error"]');
    expect(errorMessage.exists()).toBe(true);
    expect(errorMessage.text()).toContain('Invalid file type');

    // Should not emit file-selected event
    expect(wrapper.emitted('file-selected')).toBeFalsy();
  });

  it('should validate file size limit', async () => {
    const wrapper = mount(DatabaseImportInterface, {
      props: {
        maxFileSize: 1024, // 1KB limit
      },
    });

    // Create file larger than limit
    const largeContent = 'x'.repeat(2048); // 2KB
    const largeFile = new File([largeContent], 'large.db', { type: 'application/x-sqlite3' });

    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', {
      value: [largeFile],
      writable: false,
    });

    await fileInput.trigger('change');

    // Should show size error
    const errorMessage = wrapper.find('[data-testid="file-error"]');
    expect(errorMessage.exists()).toBe(true);
    expect(errorMessage.text()).toContain('File size exceeds limit');
  });

  it('should display selected file information', async () => {
    const wrapper = mount(DatabaseImportInterface);

    const file = new File(['test content'], 'test.db', { type: 'application/x-sqlite3' });
    await wrapper.setProps({ selectedFile: file });

    const fileInfo = wrapper.find('[data-testid="selected-file-info"]');
    expect(fileInfo.exists()).toBe(true);
    expect(fileInfo.text()).toContain('test.db');
    expect(fileInfo.text()).toContain('12 bytes'); // "test content" length
  });

  it('should show import button when file is selected', async () => {
    const wrapper = mount(DatabaseImportInterface);

    const file = new File(['test content'], 'test.db', { type: 'application/x-sqlite3' });
    await wrapper.setProps({ selectedFile: file });

    const importButton = wrapper.find('[data-testid="import-button"]');
    expect(importButton.exists()).toBe(true);
    expect(importButton.text()).toBe('Import Database');
    expect(importButton.attributes('disabled')).toBeUndefined();
  });

  it('should disable import button during import operation', async () => {
    const wrapper = mount(DatabaseImportInterface, {
      props: {
        selectedFile: new File(['test'], 'test.db', { type: 'application/x-sqlite3' }),
        isImporting: true,
      },
    });

    const importButton = wrapper.find('[data-testid="import-button"]');
    expect(importButton.attributes('disabled')).toBeDefined();
    expect(importButton.text()).toBe('Importing...');
  });

  it('should emit import event when import button is clicked', async () => {
    const wrapper = mount(DatabaseImportInterface);

    const file = new File(['test content'], 'test.db', { type: 'application/x-sqlite3' });
    await wrapper.setProps({ selectedFile: file });

    const importButton = wrapper.find('[data-testid="import-button"]');
    await importButton.trigger('click');

    expect(wrapper.emitted('import')).toBeTruthy();
    expect(wrapper.emitted('import')?.[0]).toEqual([file]);
  });

  it('should allow clearing selected file', async () => {
    const wrapper = mount(DatabaseImportInterface);

    const file = new File(['test content'], 'test.db', { type: 'application/x-sqlite3' });
    await wrapper.setProps({ selectedFile: file });

    const clearButton = wrapper.find('[data-testid="clear-file-button"]');
    expect(clearButton.exists()).toBe(true);

    await clearButton.trigger('click');

    expect(wrapper.emitted('clear-file')).toBeTruthy();
  });

  it('should show import progress when provided', () => {
    const wrapper = mount(DatabaseImportInterface, {
      props: {
        selectedFile: new File(['test'], 'test.db', { type: 'application/x-sqlite3' }),
        isImporting: true,
        importProgress: 65,
      },
    });

    const progressText = wrapper.find('[data-testid="import-progress"]');
    expect(progressText.exists()).toBe(true);
    expect(progressText.text()).toContain('65%');
  });
});
