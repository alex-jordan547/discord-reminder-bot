import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DatabaseExportInterface from '@/components/DatabaseExportInterface.vue';
import type { ExportFormat } from '@/types';

// Mock the API calls
const mockExportDatabase = vi.fn();
vi.mock('@/composables/useDatabaseAPI', () => ({
  useDatabaseAPI: () => ({
    exportDatabase: mockExportDatabase,
  }),
}));

describe('DatabaseExportInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render export form with format selection', () => {
    const wrapper = mount(DatabaseExportInterface);
    
    // Should have a form element
    expect(wrapper.find('form').exists()).toBe(true);
    
    // Should have format selection dropdown
    const formatSelect = wrapper.find('select[data-testid="export-format-select"]');
    expect(formatSelect.exists()).toBe(true);
    
    // Should have all format options (including placeholder)
    const options = formatSelect.findAll('option');
    expect(options).toHaveLength(4);
    expect(options[0].text()).toBe('Select format...');
    expect(options[1].text()).toBe('SQLite');
    expect(options[2].text()).toBe('JSON');
    expect(options[3].text()).toBe('CSV');
  });

  it('should have export button initially enabled', () => {
    const wrapper = mount(DatabaseExportInterface);
    
    const exportButton = wrapper.find('button[data-testid="export-button"]');
    expect(exportButton.exists()).toBe(true);
    expect(exportButton.attributes('disabled')).toBeUndefined();
    expect(exportButton.text()).toBe('Export Database');
  });

  it('should emit export event with selected format when form is submitted', async () => {
    const wrapper = mount(DatabaseExportInterface);
    
    // Select JSON format
    const formatSelect = wrapper.find('select[data-testid="export-format-select"]');
    await formatSelect.setValue('json');
    
    // Submit form
    const form = wrapper.find('form');
    await form.trigger('submit.prevent');
    
    // Should emit export event with correct format
    expect(wrapper.emitted('export')).toBeTruthy();
    expect(wrapper.emitted('export')?.[0]).toEqual(['json']);
  });

  it('should disable export button during export operation', async () => {
    const wrapper = mount(DatabaseExportInterface, {
      props: {
        isExporting: true,
      },
    });
    
    const exportButton = wrapper.find('button[data-testid="export-button"]');
    expect(exportButton.attributes('disabled')).toBeDefined();
    expect(exportButton.text()).toBe('Exporting...');
  });

  it('should show loading spinner when exporting', () => {
    const wrapper = mount(DatabaseExportInterface, {
      props: {
        isExporting: true,
      },
    });
    
    const spinner = wrapper.find('[data-testid="export-spinner"]');
    expect(spinner.exists()).toBe(true);
  });

  it('should display export progress when provided', () => {
    const wrapper = mount(DatabaseExportInterface, {
      props: {
        isExporting: true,
        exportProgress: 45,
      },
    });
    
    const progressText = wrapper.find('[data-testid="export-progress"]');
    expect(progressText.exists()).toBe(true);
    expect(progressText.text()).toContain('45%');
  });

  it('should validate format selection before export', async () => {
    const wrapper = mount(DatabaseExportInterface);
    
    // Clear format selection
    const formatSelect = wrapper.find('select[data-testid="export-format-select"]');
    await formatSelect.setValue('');
    
    // Try to submit form
    const form = wrapper.find('form');
    await form.trigger('submit.prevent');
    
    // Should not emit export event
    expect(wrapper.emitted('export')).toBeFalsy();
    
    // Should show validation error
    const errorMessage = wrapper.find('[data-testid="format-error"]');
    expect(errorMessage.exists()).toBe(true);
    expect(errorMessage.text()).toBe('Please select an export format');
  });

  it('should reset form after successful export', async () => {
    const wrapper = mount(DatabaseExportInterface);
    
    // Select format and submit
    const formatSelect = wrapper.find('select[data-testid="export-format-select"]');
    await formatSelect.setValue('sqlite');
    
    const form = wrapper.find('form');
    await form.trigger('submit.prevent');
    
    // Simulate successful export
    await wrapper.setProps({ isExporting: false, lastExportResult: { success: true } });
    
    // Format should be reset to default
    expect(formatSelect.element.value).toBe('sqlite');
  });
});