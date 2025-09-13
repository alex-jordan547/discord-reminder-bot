import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import NotificationSettings from '@/components/NotificationSettings.vue';
import { useNotificationsStore } from '@/stores/notifications';

describe('NotificationSettings', () => {
  let wrapper: VueWrapper;
  let pinia: any;

  beforeEach(() => {
    pinia = createPinia();
    wrapper = mount(NotificationSettings, {
      global: {
        plugins: [pinia],
      },
    });
  });

  describe('Rendering', () => {
    it('should render settings form', () => {
      expect(wrapper.find('.notification-settings').exists()).toBe(true);
      expect(wrapper.find('form').exists()).toBe(true);
    });

    it('should render all notification type toggles', () => {
      const toggles = wrapper.findAll('.notification-toggle');
      expect(toggles.length).toBeGreaterThan(0);

      // Check for specific notification types
      expect(wrapper.find('[data-testid="toggle-system"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="toggle-alerts"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="toggle-database"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="toggle-security"]').exists()).toBe(true);
    });

    it('should render sound settings', () => {
      expect(wrapper.find('[data-testid="sound-enabled"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="sound-volume"]').exists()).toBe(true);
    });

    it('should render display settings', () => {
      expect(wrapper.find('[data-testid="display-duration"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="max-notifications"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="position-setting"]').exists()).toBe(true);
    });
  });

  describe('Settings Management', () => {
    it('should load current settings from store', () => {
      const store = useNotificationsStore();

      // Update store settings
      store.updateSettings({
        enabled: {
          system: false,
          alerts: true,
          database: false,
          security: true,
        },
        sound: {
          enabled: true,
          volume: 0.7,
        },
        display: {
          duration: 3000,
          maxVisible: 3,
          position: 'top-right',
        },
      });

      // Remount to get updated settings
      wrapper = mount(NotificationSettings, {
        global: {
          plugins: [pinia],
        },
      });

      const systemToggle = wrapper.find('[data-testid="toggle-system"]');
      const alertsToggle = wrapper.find('[data-testid="toggle-alerts"]');
      const soundToggle = wrapper.find('[data-testid="sound-enabled"]');
      const volumeSlider = wrapper.find('[data-testid="sound-volume"]');

      expect((systemToggle.element as HTMLInputElement).checked).toBe(false);
      expect((alertsToggle.element as HTMLInputElement).checked).toBe(true);
      expect((soundToggle.element as HTMLInputElement).checked).toBe(true);
      expect((volumeSlider.element as HTMLInputElement).value).toBe('0.7');
    });

    it('should update settings when form changes', async () => {
      const store = useNotificationsStore();
      const updateSpy = vi.spyOn(store, 'updateSettings');

      const systemToggle = wrapper.find('[data-testid="toggle-system"]');
      await systemToggle.setValue(false);

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: expect.objectContaining({
            system: false,
          }),
        }),
      );
    });

    it('should update sound settings', async () => {
      const store = useNotificationsStore();
      const updateSpy = vi.spyOn(store, 'updateSettings');

      const soundToggle = wrapper.find('[data-testid="sound-enabled"]');
      const volumeSlider = wrapper.find('[data-testid="sound-volume"]');

      await soundToggle.setValue(true);
      await volumeSlider.setValue(0.8);

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sound: expect.objectContaining({
            enabled: true,
            volume: 0.8,
          }),
        }),
      );
    });

    it('should update display settings', async () => {
      const store = useNotificationsStore();
      const updateSpy = vi.spyOn(store, 'updateSettings');

      const durationInput = wrapper.find('[data-testid="display-duration"]');
      const maxNotificationsInput = wrapper.find('[data-testid="max-notifications"]');
      const positionSelect = wrapper.find('[data-testid="position-setting"]');

      await durationInput.setValue(5000);
      await maxNotificationsInput.setValue(8);
      await positionSelect.setValue('bottom-left');

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          display: expect.objectContaining({
            duration: 5000,
            maxVisible: 8,
            position: 'bottom-left',
          }),
        }),
      );
    });
  });

  describe('Form Validation', () => {
    it('should validate duration input', async () => {
      const durationInput = wrapper.find('[data-testid="display-duration"]');

      // Test invalid values
      await durationInput.setValue(-1000);
      expect(wrapper.find('.validation-error').exists()).toBe(true);

      await durationInput.setValue(0);
      expect(wrapper.find('.validation-error').exists()).toBe(true);

      // Test valid value
      await durationInput.setValue(3000);
      expect(wrapper.find('.validation-error').exists()).toBe(false);
    });

    it('should validate max notifications input', async () => {
      const maxInput = wrapper.find('[data-testid="max-notifications"]');

      // Test invalid values
      await maxInput.setValue(0);
      expect(wrapper.find('.validation-error').exists()).toBe(true);

      await maxInput.setValue(11); // Assuming max is 10
      expect(wrapper.find('.validation-error').exists()).toBe(true);

      // Test valid value
      await maxInput.setValue(5);
      expect(wrapper.find('.validation-error').exists()).toBe(false);
    });

    it('should validate volume range', async () => {
      const volumeSlider = wrapper.find('[data-testid="sound-volume"]');

      // Test boundary values
      await volumeSlider.setValue(0);
      expect(wrapper.find('.validation-error').exists()).toBe(false);

      await volumeSlider.setValue(1);
      expect(wrapper.find('.validation-error').exists()).toBe(false);

      // Test out of range (should be clamped by input)
      await volumeSlider.setValue(1.5);
      expect((volumeSlider.element as HTMLInputElement).value).toBe('1');
    });
  });

  describe('Sound Testing', () => {
    it('should have test sound button', () => {
      expect(wrapper.find('[data-testid="test-sound"]').exists()).toBe(true);
    });

    it('should play test sound when button clicked', async () => {
      const mockPlay = vi.fn();
      global.Audio = vi.fn().mockImplementation(() => ({
        play: mockPlay,
        volume: 0.5,
      }));

      const testButton = wrapper.find('[data-testid="test-sound"]');
      await testButton.trigger('click');

      expect(mockPlay).toHaveBeenCalled();
    });

    it('should disable test sound when sound is disabled', async () => {
      const soundToggle = wrapper.find('[data-testid="sound-enabled"]');
      await soundToggle.setValue(false);

      const testButton = wrapper.find('[data-testid="test-sound"]');
      expect(testButton.attributes('disabled')).toBeDefined();
    });
  });

  describe('Reset Functionality', () => {
    it('should have reset to defaults button', () => {
      expect(wrapper.find('[data-testid="reset-defaults"]').exists()).toBe(true);
    });

    it('should reset settings to defaults when clicked', async () => {
      const store = useNotificationsStore();
      const resetSpy = vi.spyOn(store, 'resetToDefaults');

      const resetButton = wrapper.find('[data-testid="reset-defaults"]');
      await resetButton.trigger('click');

      expect(resetSpy).toHaveBeenCalled();
    });

    it('should show confirmation dialog before reset', async () => {
      const resetButton = wrapper.find('[data-testid="reset-defaults"]');
      await resetButton.trigger('click');

      expect(wrapper.find('.confirmation-dialog').exists()).toBe(true);
      expect(wrapper.text()).toContain('reset all notification settings');
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      const toggles = wrapper.findAll('.notification-toggle');

      toggles.forEach(toggle => {
        const input = toggle.find('input');
        const label = toggle.find('label');

        expect(input.exists()).toBe(true);
        expect(label.exists()).toBe(true);
        expect(label.attributes('for')).toBe(input.attributes('id'));
      });
    });

    it('should have proper ARIA attributes', () => {
      const form = wrapper.find('form');
      expect(form.attributes('role')).toBe('form');
      expect(form.attributes('aria-label')).toBe('Notification Settings');

      const fieldsets = wrapper.findAll('fieldset');
      fieldsets.forEach(fieldset => {
        expect(fieldset.find('legend').exists()).toBe(true);
      });
    });

    it('should support keyboard navigation', async () => {
      const firstToggle = wrapper.find('[data-testid="toggle-system"]');
      const secondToggle = wrapper.find('[data-testid="toggle-alerts"]');

      await firstToggle.trigger('focus');
      expect(document.activeElement).toBe(firstToggle.element);

      await firstToggle.trigger('keydown.tab');
      // Tab navigation should work naturally with browser behavior
    });

    it('should have descriptive help text', () => {
      const helpTexts = wrapper.findAll('.help-text');
      expect(helpTexts.length).toBeGreaterThan(0);

      helpTexts.forEach(helpText => {
        expect(helpText.text().length).toBeGreaterThan(0);
      });
    });
  });

  describe('Persistence', () => {
    it('should save settings to localStorage', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      const systemToggle = wrapper.find('[data-testid="toggle-system"]');
      await systemToggle.setValue(false);

      expect(setItemSpy).toHaveBeenCalledWith('notification-settings', expect.any(String));
    });

    it('should load settings from localStorage on mount', () => {
      const mockSettings = {
        enabled: { system: false, alerts: true, database: true, security: false },
        sound: { enabled: false, volume: 0.3 },
        display: { duration: 4000, maxVisible: 6, position: 'bottom-right' },
      };

      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(mockSettings));

      const newWrapper = mount(NotificationSettings, {
        global: {
          plugins: [pinia],
        },
      });

      const systemToggle = newWrapper.find('[data-testid="toggle-system"]');
      const soundToggle = newWrapper.find('[data-testid="sound-enabled"]');

      expect((systemToggle.element as HTMLInputElement).checked).toBe(false);
      expect((soundToggle.element as HTMLInputElement).checked).toBe(false);
    });
  });
});
