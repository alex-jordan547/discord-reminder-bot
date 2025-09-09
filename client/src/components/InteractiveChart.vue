<template>
  <div class="interactive-chart">
    <div class="chart-controls">
      <div class="time-range-selector" data-testid="time-range-selector">
        <button
          v-for="range in timeRanges"
          :key="range"
          :class="['time-range-option', { active: timeRange === range }]"
          data-testid="time-range-option"
          @click="handleTimeRangeChange(range)"
        >
          {{ range }}
        </button>
      </div>
      
      <div class="zoom-controls" data-testid="zoom-controls">
        <button
          class="reset-zoom-btn"
          data-testid="reset-zoom"
          @click="resetZoom"
        >
          Reset Zoom
        </button>
      </div>
    </div>

    <div v-if="loading" class="chart-loading" data-testid="chart-loading">
      <div class="loading-spinner"></div>
      <p>Loading chart data...</p>
    </div>

    <Line
      v-else
      ref="chartRef"
      :data="chartData"
      :options="chartOptions"
      data-testid="interactive-chart"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import type { MonitoringMetrics } from '@/types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

interface Props {
  metricsHistory: MonitoringMetrics[];
  metricType: string;
  timeRange: '1h' | '6h' | '24h' | '7d';
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  timeRangeChange: [range: '1h' | '6h' | '24h' | '7d'];
}>();

const chartRef = ref();
const timeRanges = ['1h', '6h', '24h', '7d'] as const;

function handleTimeRangeChange(range: '1h' | '6h' | '24h' | '7d') {
  emit('timeRangeChange', range);
}

function resetZoom() {
  if (chartRef.value?.resetZoom) {
    chartRef.value.resetZoom();
  }
}

function extractMetricValue(metrics: MonitoringMetrics, path: string): number {
  const keys = path.split('.');
  let value: any = metrics;
  
  for (const key of keys) {
    value = value?.[key];
  }
  
  return typeof value === 'number' ? value : 0;
}

function getMetricLabel(metricType: string): string {
  const labelMap: Record<string, string> = {
    'system.cpu.percentage': 'CPU Usage (%)',
    'system.memory.percentage': 'Memory Usage (%)',
    'system.disk.percentage': 'Disk Usage (%)',
    'system.network.bytesIn': 'Network Bytes In',
    'system.network.bytesOut': 'Network Bytes Out',
    'bot.guilds': 'Guild Count',
    'bot.users': 'User Count',
    'bot.events': 'Events Processed',
    'bot.commands.total': 'Total Commands',
    'bot.commands.successful': 'Successful Commands',
    'bot.commands.failed': 'Failed Commands',
    'bot.commands.averageResponseTime': 'Response Time (ms)',
    'performance.responseTime': 'Response Time (ms)',
    'performance.throughput': 'Throughput',
    'performance.errorRate': 'Error Rate',
    'performance.availability': 'Availability (%)',
  };
  
  return labelMap[metricType] || metricType;
}

function getMetricColor(metricType: string): { border: string; background: string } {
  const colorMap: Record<string, { border: string; background: string }> = {
    'system.cpu.percentage': { border: 'rgba(59, 130, 246, 1)', background: 'rgba(59, 130, 246, 0.1)' },
    'system.memory.percentage': { border: 'rgba(16, 185, 129, 1)', background: 'rgba(16, 185, 129, 0.1)' },
    'system.disk.percentage': { border: 'rgba(245, 158, 11, 1)', background: 'rgba(245, 158, 11, 0.1)' },
    'bot.guilds': { border: 'rgba(168, 85, 247, 1)', background: 'rgba(168, 85, 247, 0.1)' },
    'performance.responseTime': { border: 'rgba(239, 68, 68, 1)', background: 'rgba(239, 68, 68, 0.1)' },
  };
  
  return colorMap[metricType] || { border: 'rgba(59, 130, 246, 1)', background: 'rgba(59, 130, 246, 0.1)' };
}

const chartData = computed(() => {
  if (!props.metricsHistory.length) {
    return {
      labels: [],
      datasets: [
        {
          label: getMetricLabel(props.metricType),
          data: [],
          borderColor: getMetricColor(props.metricType).border,
          backgroundColor: getMetricColor(props.metricType).background,
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  const labels = props.metricsHistory.map(metrics => {
    const date = new Date(metrics.timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  });

  const data = props.metricsHistory.map(metrics => 
    extractMetricValue(metrics, props.metricType)
  );

  const colors = getMetricColor(props.metricType);

  return {
    labels,
    datasets: [
      {
        label: getMetricLabel(props.metricType),
        data,
        borderColor: colors.border,
        backgroundColor: colors.background,
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index' as const,
  },
  plugins: {
    legend: {
      display: true,
    },
    tooltip: {
      enabled: true,
    },
    zoom: {
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true,
        },
        mode: 'x' as const,
      },
      pan: {
        enabled: true,
        mode: 'x' as const,
      },
    },
  },
  scales: {
    x: {
      display: true,
      title: {
        display: true,
        text: 'Time',
      },
    },
    y: {
      display: true,
      title: {
        display: true,
        text: getMetricLabel(props.metricType),
      },
      beginAtZero: true,
    },
  },
}));
</script>

<style scoped>
.interactive-chart {
  width: 100%;
  height: 400px;
  position: relative;
}

.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 0 8px;
}

.time-range-selector {
  display: flex;
  gap: 8px;
}

.time-range-option {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.time-range-option:hover {
  background: #f3f4f6;
}

.time-range-option.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.zoom-controls {
  display: flex;
  gap: 8px;
}

.reset-zoom-btn {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.reset-zoom-btn:hover {
  background: #f3f4f6;
}

.chart-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f4f6;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .time-range-option,
  .reset-zoom-btn {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }
  
  .time-range-option:hover,
  .reset-zoom-btn:hover {
    background: #4b5563;
  }
}
</style>