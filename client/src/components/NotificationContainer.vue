<template>
  <div class="notification-container">
    <TransitionGroup
      name="notification"
      tag="div"
      class="notification-list"
    >
      <ToastNotification
        v-for="notification in visibleNotifications"
        :key="notification.id"
        :notification="notification"
        :on-hide="handleHideNotification"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNotificationStore } from '@/stores/notifications';
import ToastNotification from '@/components/ToastNotification.vue';

const notificationStore = useNotificationStore();

const visibleNotifications = computed(() => notificationStore.visibleNotifications);

const handleHideNotification = (id: string) => {
  notificationStore.removeNotification(id);
};
</script>

<style scoped>
.notification-container {
  @apply fixed top-4 right-4 z-50 pointer-events-none;
}

.notification-list {
  @apply flex flex-col gap-3;
}

/* Transition animations */
.notification-enter-active {
  @apply transition-all duration-300 ease-out;
}

.notification-leave-active {
  @apply transition-all duration-200 ease-in;
}

.notification-enter-from {
  @apply transform translate-x-full opacity-0;
}

.notification-leave-to {
  @apply transform translate-x-full opacity-0;
}

.notification-move {
  @apply transition-transform duration-300 ease-out;
}

/* Responsive */
@media (max-width: 640px) {
  .notification-container {
    @apply left-4 right-4;
  }
}
</style>