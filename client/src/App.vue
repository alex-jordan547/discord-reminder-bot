<template>
  <div id="app" class="dashboard-app">
    <DashboardLayout />
  </div>
</template>

<script setup lang="ts">
import DashboardLayout from '@/components/DashboardLayout.vue';
</script>

<style scoped>
.dashboard-app {
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}
</style>