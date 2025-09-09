<template>
  <div class="system-metrics-chart">
    <Line
      :data="chartData"
      :options="chartOptions"
      data-testid="line-chart"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { SystemMetrics } from '@/types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Props {
  metrics: SystemMetrics;
  type: 'cpu' | 'memory' | 'network' | 'disk';
  realTime?: boolean;
  maxDataPoints?: number;
}

const props = withDefaults(defineProps<Props>(), {
  realTime: false,
  maxDataPoints: 50,
});

// Data storage for real-time updates
const dataHistory = ref<number[]>([]);
const labelHistory = ref<string[]>([]);

// Watch for metrics changes and update history
watch(
  () => props.metrics,
  (newMetrics, oldMetrics) => {
    if (props.realTime && oldMetrics) {
      updateDataHistory(newMetrics);
    }
  }
);

function updateDataHistory(metrics: SystemMetrics) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  let value: number;

  switch (props.type) {
    case 'cpu':
      value = metrics.cpu.percentage;
      break;
    case 'memory':
      value = metrics.memory.percentage;
      break;
    case 'disk':
      value = metrics.disk.percentage;
      break;
    case 'network':
      // For network, we'll use bytesIn as the primary metric
      value = metrics.network.bytesIn;
      break;
    default:
      value = 0;
  }

  dataHistory.value.push(value);
  labelHistory.value.push(timestamp);

  // Limit data points
  if (dataHistory.value.length > props.maxDataPoints) {
    dataHistory.value.shift();
    labelHistory.value.shift();
  }
}

const chartData = computed(() => {
  if (props.type === 'network') {
    const labels = props.realTime && labelHistory.value.length > 0 
      ? labelHistory.value 
      : [new Date().toLocaleTimeString('en-US', { hour12: false })];
    
    const bytesInData = props.realTime && dataHistory.value.length > 0 
      ? dataHistory.value 
      : [props.metrics.network.bytesIn];
    
    const bytesOutData = props.realTime && dataHistory.value.length > 0 
      ? dataHistory.value.map(() => props.metrics.network.bytesOut) 
      : [props.metrics.network.bytesOut];

    return {
      labels,
      datasets: [
        {
          label: 'Bytes In',
          data: bytesInData,
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Bytes Out',
          data: bytesOutData,
          borderColor: 'rgba(16, 185, 129, 1)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  let label: string;
  let currentValue: number;

  switch (props.type) {
    case 'cpu':
      label = 'CPU Usage (%)';
      currentValue = props.metrics.cpu.percentage;
      break;
    case 'memory':
      label = 'Memory Usage (%)';
      currentValue = props.metrics.memory.percentage;
      break;
    case 'disk':
      label = 'Disk Usage (%)';
      currentValue = props.metrics.disk.percentage;
      break;
    default:
      label = 'Unknown';
      currentValue = 0;
  }

  const labels = props.realTime && labelHistory.value.length > 0 
    ? labelHistory.value 
    : [new Date().toLocaleTimeString('en-US', { hour12: false })];
  
  const data = props.realTime && dataHistory.value.length > 0 
    ? dataHistory.value 
    : [currentValue];

  return {
    labels,
    datasets: [
      {
        label,
        data,
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: props.realTime ? false : true,
  scales: {
    y: {
      beginAtZero: true,
      max: props.type === 'network' ? undefined : 100,
    },
  },
  plugins: {
    legend: {
      display: true,
    },
    tooltip: {
      enabled: true,
    },
  },
}));
</script>

<style scoped>
.system-metrics-chart {
  width: 100%;
  height: 300px;
}
</style>