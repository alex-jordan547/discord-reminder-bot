import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DatabaseProgressIndicator from '@/components/DatabaseProgressIndicator.vue';

describe('DatabaseProgressIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render progress bar with correct percentage', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 45,
        operation: 'export',
      },
    });

    const progressBar = wrapper.find('[data-testid="progress-bar"]');
    expect(progressBar.exists()).toBe(true);

    const progressFill = wrapper.find('[data-testid="progress-fill"]');
    expect(progressFill.exists()).toBe(true);
    expect(progressFill.attributes('style')).toContain('width: 45%');
  });

  it('should display progress percentage text', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 67,
        operation: 'import',
      },
    });

    const progressText = wrapper.find('[data-testid="progress-text"]');
    expect(progressText.exists()).toBe(true);
    expect(progressText.text()).toBe('67%');
  });

  it('should show operation status message', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 30,
        operation: 'export',
        statusMessage: 'Exporting table: users',
      },
    });

    const statusMessage = wrapper.find('[data-testid="status-message"]');
    expect(statusMessage.exists()).toBe(true);
    expect(statusMessage.text()).toBe('Exporting table: users');
  });

  it('should display estimated time remaining', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 25,
        operation: 'import',
        estimatedTimeRemaining: 120, // 2 minutes
      },
    });

    const timeRemaining = wrapper.find('[data-testid="time-remaining"]');
    expect(timeRemaining.exists()).toBe(true);
    expect(timeRemaining.text()).toContain('2m 0s remaining');
  });

  it('should show processing speed when provided', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 40,
        operation: 'export',
        processingSpeed: '1.2 MB/s',
      },
    });

    const speed = wrapper.find('[data-testid="processing-speed"]');
    expect(speed.exists()).toBe(true);
    expect(speed.text()).toContain('1.2 MB/s');
  });

  it('should display records processed count', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 60,
        operation: 'import',
        recordsProcessed: 1500,
        totalRecords: 2500,
      },
    });

    const recordsCount = wrapper.find('[data-testid="records-count"]');
    expect(recordsCount.exists()).toBe(true);
    expect(recordsCount.text()).toContain('1,500 / 2,500 records');
  });

  it('should show indeterminate progress when progress is undefined', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        operation: 'export',
        isIndeterminate: true,
      },
    });

    const progressBar = wrapper.find('[data-testid="progress-bar"]');
    expect(progressBar.classes()).toContain('indeterminate');

    const progressText = wrapper.find('[data-testid="progress-text"]');
    expect(progressText.text()).toBe('Processing...');
  });

  it('should apply correct color scheme based on operation type', () => {
    const exportWrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 50,
        operation: 'export',
      },
    });

    const exportProgressFill = exportWrapper.find('[data-testid="progress-fill"]');
    expect(exportProgressFill.classes()).toContain('export-color');

    const importWrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 50,
        operation: 'import',
      },
    });

    const importProgressFill = importWrapper.find('[data-testid="progress-fill"]');
    expect(importProgressFill.classes()).toContain('import-color');
  });

  it('should show cancel button when cancellable', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 30,
        operation: 'export',
        cancellable: true,
      },
    });

    const cancelButton = wrapper.find('[data-testid="cancel-button"]');
    expect(cancelButton.exists()).toBe(true);
    expect(cancelButton.text()).toBe('Cancel');
  });

  it('should emit cancel event when cancel button is clicked', async () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 30,
        operation: 'export',
        cancellable: true,
      },
    });

    const cancelButton = wrapper.find('[data-testid="cancel-button"]');
    await cancelButton.trigger('click');

    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('should show error state when operation fails', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 75,
        operation: 'import',
        hasError: true,
        errorMessage: 'Import failed: Invalid data format',
      },
    });

    const progressBar = wrapper.find('[data-testid="progress-bar"]');
    expect(progressBar.classes()).toContain('error-state');

    const errorMessage = wrapper.find('[data-testid="error-message"]');
    expect(errorMessage.exists()).toBe(true);
    expect(errorMessage.text()).toBe('❌ Import failed: Invalid data format');
  });

  it('should show success state when operation completes', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 100,
        operation: 'export',
        isComplete: true,
        successMessage: 'Export completed successfully',
      },
    });

    const progressBar = wrapper.find('[data-testid="progress-bar"]');
    expect(progressBar.classes()).toContain('success-state');

    const successMessage = wrapper.find('[data-testid="success-message"]');
    expect(successMessage.exists()).toBe(true);
    expect(successMessage.text()).toBe('✅ Export completed successfully');
  });

  it('should animate progress changes with Vue transitions', async () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 25,
        operation: 'export',
      },
    });

    const progressFill = wrapper.find('[data-testid="progress-fill"]');
    expect(progressFill.attributes('style')).toContain('width: 25%');

    // Update progress
    await wrapper.setProps({ progress: 75 });

    // Should have transition class
    expect(progressFill.classes()).toContain('progress-transition');
    expect(progressFill.attributes('style')).toContain('width: 75%');
  });

  it('should format time remaining correctly', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 50,
        operation: 'import',
        estimatedTimeRemaining: 3665, // 1 hour, 1 minute, 5 seconds
      },
    });

    const timeRemaining = wrapper.find('[data-testid="time-remaining"]');
    expect(timeRemaining.text()).toContain('1h 1m 5s remaining');
  });

  it('should handle very small time remaining values', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 95,
        operation: 'export',
        estimatedTimeRemaining: 5, // 5 seconds
      },
    });

    const timeRemaining = wrapper.find('[data-testid="time-remaining"]');
    expect(timeRemaining.text()).toContain('5s remaining');
  });

  it('should show pause/resume functionality when supported', () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 40,
        operation: 'import',
        pausable: true,
        isPaused: false,
      },
    });

    const pauseButton = wrapper.find('[data-testid="pause-button"]');
    expect(pauseButton.exists()).toBe(true);
    expect(pauseButton.text()).toBe('Pause');
  });

  it('should emit pause/resume events', async () => {
    const wrapper = mount(DatabaseProgressIndicator, {
      props: {
        progress: 40,
        operation: 'import',
        pausable: true,
        isPaused: false,
      },
    });

    const pauseButton = wrapper.find('[data-testid="pause-button"]');
    await pauseButton.trigger('click');

    expect(wrapper.emitted('pause')).toBeTruthy();

    // Test resume
    await wrapper.setProps({ isPaused: true });
    const resumeButton = wrapper.find('[data-testid="pause-button"]');
    expect(resumeButton.text()).toBe('Resume');

    await resumeButton.trigger('click');
    expect(wrapper.emitted('resume')).toBeTruthy();
  });
});
