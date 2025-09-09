<template>
  <div class="bot-metrics-chart">
    <div v-if="showConnectionStatus" class="connection-status-container">
      <div 
        :class="['connection-status', metrics.connected ? 'connected' : 'disconnected']"
        data-testid="connection-status"
      >
        <span class="status-indicator"></span>
        {{ metrics.connected ? 'Connected' : 'Disconnected' }}
      </div>
    </div>

    <Line
      v-if="chartType === 'line'"
      :data="chartData"
      :options="chartOptions"
      data-testid="line-chart"
    />
    
    <Bar
      v-else-if="chartType === 'bar'"
      :data="chartData"
      :options="chartOptions"
      data-testid="bar-chart"
    />
    
    <Doughnut
      v-else-if="chartType === 'doughnut'"
      :data="chartData"
      :options="chartOptions"
      data-testid="doughnut-chart"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Line, Bar, Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { BotMetrics } from '@/types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Props {
  metrics: BotMetrics;
  type: 'guilds' | 'events' | 'commands' | 'errors' | 'status' | 'response-time';
  chartType?: 'line' | 'bar' | 'doughnut';
  showConnectionStatus?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  chartType: 'line',
  showConnectionStatus: false,
});

const chartData = computed(() => {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

  switch (props.type) {
    case 'guilds':
      return {
        labels: [timestamp],
        datasets: [
          {
            label: 'Guild Count',
            data: [props.metrics.guilds],
            borderColor: 'rgba(59, 130, 246, 1)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      };

    case 'events':
      return {
        labels: [timestamp],
        datasets: [
          {
            label: 'Events Processed',
            data: [props.metrics.events],
            borderColor: 'rgba(16, 185, 129, 1)',
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
          },
        ],
      };

    case 'commands':
      return {
        labels: ['Successful', 'Failed'],
        datasets: [
          {
            data: [props.metrics.commands.successful, props.metrics.commands.failed],
            backgroundColor: [
              'rgba(34, 197, 94, 0.8)',  // Success - green
              'rgba(239, 68, 68, 0.8)',  // Failed - red
            ],
            borderColor: [
              'rgba(34, 197, 94, 1)',
              'rgba(239, 68, 68, 1)',
            ],
            borderWidth: 2,
          },
        ],
      };

    case 'errors':
      return {
        labels: ['Critical', 'Warnings', 'Info'],
        datasets: [
          {
            data: [
              props.metrics.errors.critical,
              props.metrics.errors.warnings,
              props.metrics.errors.info,
            ],
            backgroundColor: [
              'rgba(239, 68, 68, 0.8)',   // Critical - red
              'rgba(245, 158, 11, 0.8)',  // Warning - yellow
              'rgba(59, 130, 246, 0.8)',  // Info - blue
            ],
            borderColor: [
              'rgba(239, 68, 68, 1)',
              'rgba(245, 158, 11, 1)',
              'rgba(59, 130, 246, 1)',
            ],
            borderWidth: 2,
          },
        ],
      };

    case 'response-time':
      return {
        labels: [timestamp],
        datasets: [
          {
            label: 'Response Time (ms)',
            data: [props.metrics.commands.averageResponseTime],
            borderColor: 'rgba(168, 85, 247, 1)',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      };

    default:
      return {
        labels: [],
        datasets: [],
      };
  }
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: props.chartType === 'doughnut',
      position: 'bottom' as const,
    },
    tooltip: {
      enabled: true,
    },
  },
  scales: props.chartType === 'doughnut' ? undefined : {
    y: {
      beginAtZero: true,
    },
  },
}));
</script>

<style scoped>
.bot-metrics-chart {
  width: 100%;
  height: 300px;
  position: relative;
}

.connection-status-container {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.connection-status.connected {
  background-color: rgba(34, 197, 94, 0.1);
  color: rgba(34, 197, 94, 1);
}

.connection-status.disconnected {
  background-color: rgba(239, 68, 68, 0.1);
  color: rgba(239, 68, 68, 1);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
}
</style>