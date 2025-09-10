import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SystemMetricsChart from '@/components/SystemMetricsChart.vue';
import type { SystemMetrics } from '@/types';

// Mock Chart.js
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
  },
  CategoryScale: vi.fn(),
  LinearScale: vi.fn(),
  PointElement: vi.fn(),
  LineElement: vi.fn(),
  Title: vi.fn(),
  Tooltip: vi.fn(),
  Legend: vi.fn(),
}));

vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    template: '<div data-testid="line-chart">Chart</div>',
  },
}));

describe('SystemMetricsChart', () => {
  const mockSystemMetrics: SystemMetrics = {
    uptime: 86400,
    memory: {
      used: 512,
      total: 1024,
      percentage: 50,
    },
    cpu: {
      percentage: 25.5,
      loadAverage: [1.2, 1.5, 1.8],
    },
    disk: {
      used: 100,
      total: 500,
      percentage: 20,
    },
    network: {
      bytesIn: 1024000,
      bytesOut: 512000,
      packetsIn: 1000,
      packetsOut: 800,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render CPU usage chart with correct data', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'cpu',
        realTime: true,
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('CPU Usage (%)');
    expect(wrapper.vm.chartData.datasets[0].data).toContain(25.5);
  });

  it('should render memory usage chart with correct data', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'memory',
        realTime: true,
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('Memory Usage (%)');
    expect(wrapper.vm.chartData.datasets[0].data).toContain(50);
  });

  it('should render network usage chart with correct data', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'network',
        realTime: true,
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets).toHaveLength(2);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('Bytes In');
    expect(wrapper.vm.chartData.datasets[1].label).toBe('Bytes Out');
  });

  it('should update chart data when metrics change', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'cpu',
        realTime: true,
      },
    });

    const newMetrics = {
      ...mockSystemMetrics,
      cpu: { percentage: 75.2, loadAverage: [2.1, 2.3, 2.5] },
    };

    await wrapper.setProps({ metrics: newMetrics });
    await nextTick();

    expect(wrapper.vm.chartData.datasets[0].data).toContain(75.2);
  });

  it('should maintain chart history for real-time updates', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'cpu',
        realTime: true,
        maxDataPoints: 10,
      },
    });

    // Simulate multiple metric updates
    for (let i = 0; i < 5; i++) {
      const newMetrics = {
        ...mockSystemMetrics,
        cpu: { percentage: 20 + i * 10, loadAverage: [1.0, 1.0, 1.0] },
      };
      await wrapper.setProps({ metrics: newMetrics });
      await nextTick();
    }

    expect(wrapper.vm.chartData.datasets[0].data).toHaveLength(5);
    expect(wrapper.vm.chartData.labels).toHaveLength(5);
  });

  it('should limit data points to maxDataPoints', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'cpu',
        realTime: true,
        maxDataPoints: 3,
      },
    });

    // Add more data points than the limit
    for (let i = 0; i < 5; i++) {
      const newMetrics = {
        ...mockSystemMetrics,
        cpu: { percentage: 20 + i * 10, loadAverage: [1.0, 1.0, 1.0] },
      };
      await wrapper.setProps({ metrics: newMetrics });
      await nextTick();
    }

    expect(wrapper.vm.chartData.datasets[0].data).toHaveLength(3);
    expect(wrapper.vm.chartData.labels).toHaveLength(3);
  });

  it('should apply correct chart options for real-time mode', () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'cpu',
        realTime: true,
      },
    });

    expect(wrapper.vm.chartOptions.animation).toBe(false);
    expect(wrapper.vm.chartOptions.responsive).toBe(true);
    expect(wrapper.vm.chartOptions.maintainAspectRatio).toBe(false);
  });

  it('should format timestamps correctly for chart labels', async () => {
    const wrapper = mount(SystemMetricsChart, {
      props: {
        metrics: mockSystemMetrics,
        type: 'cpu',
        realTime: true,
      },
    });

    await nextTick();

    expect(wrapper.vm.chartData.labels).toHaveLength(1);
    expect(typeof wrapper.vm.chartData.labels[0]).toBe('string');
    // Should be in HH:MM:SS format
    expect(wrapper.vm.chartData.labels[0]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
