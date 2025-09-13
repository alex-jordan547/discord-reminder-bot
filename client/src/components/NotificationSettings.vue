<template>
  <div class="notification-settings">
    <div class="settings-header">
      <h3 class="settings-title">Notification Settings</h3>
      <p class="settings-description">Configure how and when you receive notifications</p>
    </div>

    <form @submit.prevent="saveSettings" class="settings-form">
      <!-- General Settings -->
      <div class="settings-section">
        <h4 class="section-title">General</h4>

        <div class="form-group">
          <label class="form-label">
            <input v-model="localSettings.enabled" type="checkbox" class="form-checkbox" />
            Enable notifications
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            Auto-hide notifications
            <input v-model="localSettings.autoHide" type="checkbox" class="form-checkbox" />
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            Hide delay (seconds)
            <input
              v-model.number="localSettings.hideDelay"
              type="number"
              min="1"
              max="30"
              class="form-input"
              :disabled="!localSettings.autoHide"
            />
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            Maximum visible notifications
            <input
              v-model.number="localSettings.maxVisible"
              type="number"
              min="1"
              max="10"
              class="form-input"
            />
          </label>
        </div>
      </div>

      <!-- Notification Types -->
      <div class="settings-section">
        <h4 class="section-title">Notification Types</h4>

        <div class="form-group">
          <label class="form-label">
            <input v-model="showInfo" type="checkbox" class="form-checkbox" />
            Information notifications
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input v-model="showSuccess" type="checkbox" class="form-checkbox" />
            Success notifications
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input v-model="showWarning" type="checkbox" class="form-checkbox" />
            Warning notifications
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input v-model="showError" type="checkbox" class="form-checkbox" />
            Error notifications
          </label>
        </div>
      </div>

      <!-- Priority Levels -->
      <div class="settings-section">
        <h4 class="section-title">Priority Levels</h4>

        <div class="form-group">
          <label class="form-label">
            <input v-model="localSettings.priority.low" type="checkbox" class="form-checkbox" />
            Low priority
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input v-model="localSettings.priority.medium" type="checkbox" class="form-checkbox" />
            Medium priority
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input v-model="localSettings.priority.high" type="checkbox" class="form-checkbox" />
            High priority
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input
              v-model="localSettings.priority.critical"
              type="checkbox"
              class="form-checkbox"
            />
            Critical priority
          </label>
        </div>
      </div>

      <!-- Additional Options -->
      <div class="settings-section">
        <h4 class="section-title">Additional Options</h4>

        <div class="form-group">
          <label class="form-label">
            <input v-model="localSettings.sound" type="checkbox" class="form-checkbox" />
            Play sound for notifications
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input v-model="localSettings.desktop" type="checkbox" class="form-checkbox" />
            Show desktop notifications
          </label>
        </div>
      </div>

      <!-- Actions -->
      <div class="settings-actions">
        <button type="submit" class="btn btn-primary" :disabled="!hasChanges">Save Settings</button>

        <button type="button" class="btn btn-secondary" @click="resetSettings">
          Reset to Defaults
        </button>

        <button type="button" class="btn btn-danger" @click="clearAllNotifications">
          Clear All Notifications
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useNotifications } from '@/composables/useNotifications';
import type { NotificationSettings } from '@/types';

const { settings, updateSettings, clearAll } = useNotifications();

// Local settings for form binding
const localSettings = ref<NotificationSettings>({ ...settings.value });

// Computed properties for notification types
const showInfo = computed({
  get: () => localSettings.value.types.includes('info'),
  set: (value: boolean) => {
    if (value) {
      if (!localSettings.value.types.includes('info')) {
        localSettings.value.types.push('info');
      }
    } else {
      localSettings.value.types = localSettings.value.types.filter(type => type !== 'info');
    }
  },
});

const showSuccess = computed({
  get: () => localSettings.value.types.includes('success'),
  set: (value: boolean) => {
    if (value) {
      if (!localSettings.value.types.includes('success')) {
        localSettings.value.types.push('success');
      }
    } else {
      localSettings.value.types = localSettings.value.types.filter(type => type !== 'success');
    }
  },
});

const showWarning = computed({
  get: () => localSettings.value.types.includes('warning'),
  set: (value: boolean) => {
    if (value) {
      if (!localSettings.value.types.includes('warning')) {
        localSettings.value.types.push('warning');
      }
    } else {
      localSettings.value.types = localSettings.value.types.filter(type => type !== 'warning');
    }
  },
});

const showError = computed({
  get: () => localSettings.value.types.includes('error'),
  set: (value: boolean) => {
    if (value) {
      if (!localSettings.value.types.includes('error')) {
        localSettings.value.types.push('error');
      }
    } else {
      localSettings.value.types = localSettings.value.types.filter(type => type !== 'error');
    }
  },
});

// Check if there are unsaved changes
const hasChanges = computed(() => {
  return JSON.stringify(localSettings.value) !== JSON.stringify(settings.value);
});

// Methods
const saveSettings = () => {
  updateSettings(localSettings.value);
};

const resetSettings = () => {
  localSettings.value = { ...settings.value };
};

const clearAllNotifications = () => {
  clearAll();
};

// Watch for external settings changes
watch(
  settings,
  newSettings => {
    localSettings.value = { ...newSettings };
  },
  { deep: true },
);

// Initialize local settings
onMounted(() => {
  localSettings.value = { ...settings.value };
});
</script>

<style scoped>
.notification-settings {
  @apply max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg;
}

.settings-header {
  @apply mb-6;
}

.settings-title {
  @apply text-2xl font-bold text-gray-900 dark:text-white mb-2;
}

.settings-description {
  @apply text-gray-600 dark:text-gray-300;
}

.settings-form {
  @apply space-y-6;
}

.settings-section {
  @apply border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0;
}

.section-title {
  @apply text-lg font-semibold text-gray-900 dark:text-white mb-4;
}

.form-group {
  @apply mb-4;
}

.form-label {
  @apply flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer;
}

.form-checkbox {
  @apply w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600;
}

.form-input {
  @apply mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white;
}

.form-input:disabled {
  @apply bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed;
}

.settings-actions {
  @apply flex gap-3 pt-6 border-t border-gray-200 dark:border-gray-700;
}

.btn {
  @apply px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-primary:disabled {
  @apply bg-gray-400 cursor-not-allowed hover:bg-gray-400;
}

.btn-secondary {
  @apply bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700;
}

.btn-danger {
  @apply bg-red-600 text-white hover:bg-red-700 focus:ring-red-500;
}
</style>
