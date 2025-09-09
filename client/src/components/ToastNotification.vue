<template>
  <Teleport to="body">
    <Transition
      name="toast"
      appear
      @enter="onEnter"
      @leave="onLeave"
    >
      <div
        v-if="visible"
        :class="toastClasses"
        class="toast"
        role="alert"
        aria-live="polite"
      >
        <div class="toast-content">
          <div class="toast-icon">
            <component :is="iconComponent" class="w-5 h-5" />
          </div>
          
          <div class="toast-body">
            <h4 class="toast-title">{{ notification.title }}</h4>
            <p class="toast-message">{{ notification.message }}</p>
            
            <div v-if="notification.actions" class="toast-actions">
              <button
                v-for="action in notification.actions"
                :key="action.id"
                :data-testid="`action-${action.label.toLowerCase()}`"
                :class="getActionClasses(action.style)"
                class="toast-action-btn"
                @click="handleAction(action)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>
          
          <button
            data-testid="close-button"
            class="toast-close"
            @click="handleClose"
            aria-label="Close notification"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div v-if="showProgress" class="toast-progress">
          <div 
            class="toast-progress-bar"
            :style="{ width: `${progressWidth}%` }"
          ></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { Notification, NotificationAction } from '@/types';
import InfoIcon from '@/components/icons/InfoIcon.vue';
import CheckIcon from '@/components/icons/CheckIcon.vue';
import ExclamationIcon from '@/components/icons/ExclamationIcon.vue';
import XCircleIcon from '@/components/icons/XCircleIcon.vue';

// Props
interface Props {
  notification: Notification;
  onHide?: (id: string) => void;
}

const props = defineProps<Props>();

// State
const visible = ref(true);
const progressWidth = ref(100);
let hideTimer: number | null = null;
let progressTimer: number | null = null;

// Computed
const toastClasses = computed(() => [
  'toast-enter',
  `toast-${props.notification.type}`,
  `toast-${props.notification.priority}`,
  {
    'toast-persistent': props.notification.persistent,
    'toast-with-actions': props.notification.actions?.length
  }
]);

const iconComponent = computed(() => {
  const icons = {
    info: InfoIcon,
    success: CheckIcon, 
    warning: ExclamationIcon,
    error: XCircleIcon
  };
  return icons[props.notification.type] || InfoIcon;
});

const showProgress = computed(() => {
  return props.notification.autoHide && !props.notification.persistent;
});

// Methods
const handleClose = () => {
  visible.value = false;
  clearTimers();
  props.onHide?.(props.notification.id);
};

const handleAction = (action: NotificationAction) => {
  action.action();
  if (!props.notification.persistent) {
    handleClose();
  }
};

const getActionClasses = (style?: string) => {
  const baseClasses = 'px-3 py-1 text-sm rounded transition-colors';
  const styleClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  };
  
  return [baseClasses, styleClasses[style as keyof typeof styleClasses] || styleClasses.secondary];
};

const clearTimers = () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
};

const startAutoHide = () => {
  if (!props.notification.autoHide || props.notification.persistent) {
    return;
  }

  const delay = props.notification.hideDelay || 5000;
  const progressInterval = 50; // Update progress every 50ms
  const totalSteps = delay / progressInterval;
  let currentStep = 0;

  // Start progress animation
  progressTimer = window.setInterval(() => {
    currentStep++;
    progressWidth.value = Math.max(0, 100 - (currentStep / totalSteps) * 100);
    
    if (currentStep >= totalSteps) {
      clearInterval(progressTimer!);
      progressTimer = null;
    }
  }, progressInterval);

  // Set hide timer
  hideTimer = window.setTimeout(() => {
    handleClose();
  }, delay);
};

// Transition handlers
const onEnter = (el: Element) => {
  (el as HTMLElement).classList.add('toast-enter-active');
};

const onLeave = (el: Element) => {
  (el as HTMLElement).classList.add('toast-leave-active');
};

// Lifecycle
onMounted(() => {
  startAutoHide();
});

onUnmounted(() => {
  clearTimers();
});
</script>

<style scoped>
.toast {
  @apply fixed top-4 right-4 z-50 max-w-sm w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden;
}

.toast-content {
  @apply flex items-start p-4 gap-3;
}

.toast-icon {
  @apply flex-shrink-0 mt-0.5;
}

.toast-body {
  @apply flex-1 min-w-0;
}

.toast-title {
  @apply font-medium text-gray-900 dark:text-white text-sm mb-1;
}

.toast-message {
  @apply text-gray-600 dark:text-gray-300 text-sm leading-relaxed;
}

.toast-actions {
  @apply flex gap-2 mt-3;
}

.toast-action-btn {
  @apply inline-flex items-center justify-center font-medium focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.toast-close {
  @apply flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500;
}

.toast-progress {
  @apply h-1 bg-gray-200 dark:bg-gray-700;
}

.toast-progress-bar {
  @apply h-full transition-all duration-75 ease-linear;
}

/* Type-specific styles */
.toast-info .toast-icon {
  @apply text-blue-500;
}

.toast-info .toast-progress-bar {
  @apply bg-blue-500;
}

.toast-success .toast-icon {
  @apply text-green-500;
}

.toast-success .toast-progress-bar {
  @apply bg-green-500;
}

.toast-warning .toast-icon {
  @apply text-yellow-500;
}

.toast-warning .toast-progress-bar {
  @apply bg-yellow-500;
}

.toast-error .toast-icon {
  @apply text-red-500;
}

.toast-error .toast-progress-bar {
  @apply bg-red-500;
}

/* Priority-specific styles */
.toast-critical {
  @apply ring-2 ring-red-500 ring-opacity-50;
}

.toast-high {
  @apply ring-1 ring-orange-300 ring-opacity-50;
}

/* Transition styles */
.toast-enter-active {
  @apply transition-all duration-300 ease-out;
}

.toast-leave-active {
  @apply transition-all duration-200 ease-in;
}

.toast-enter-from {
  @apply transform translate-x-full opacity-0;
}

.toast-leave-to {
  @apply transform translate-x-full opacity-0;
}

/* Responsive */
@media (max-width: 640px) {
  .toast {
    @apply left-4 right-4 max-w-none;
  }
}
</style>