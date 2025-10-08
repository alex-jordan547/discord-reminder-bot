import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BotMetricsChart from '@/components/BotMetricsChart.vue';
import type { BotMetrics } from '@/types';

// Mock Chart.js
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
  },
  CategoryScale: vi.fn(),
  LinearScale: vi.fn(),
  PointElement: vi.fn(),
  LineElement: vi.fn(),
  BarElement: vi.fn(),
  ArcElement: vi.fn(),
  Title: vi.fn(),
  Tooltip: vi.fn(),
  Legend: vi.fn(),
}));

vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    template: '<div data-testid="line-chart">Line Chart</div>',
  },
  Bar: {
    name: 'Bar',
    props: ['data', 'options'],
    template: '<div data-testid="bar-chart">Bar Chart</div>',
  },
  Doughnut: {
    name: 'Doughnut',
    props: ['data', 'options'],
    template: '<div data-testid="doughnut-chart">Doughnut Chart</div>',
  },
}));

describe('BotMetricsChart', () => {
  const mockBotMetrics: BotMetrics = {
    connected: true,
    guilds: 150,
    users: 25000,
    events: 1250,
    commands: {
      total: 500,
      successful: 485,
      failed: 15,
      averageResponseTime: 120,
    },
    errors: {
      total: 25,
      critical: 2,
      warnings: 18,
      info: 5,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render guilds count chart with correct data', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'guilds',
        chartType: 'line',
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('Guild Count');
    expect(wrapper.vm.chartData.datasets[0].data).toContain(150);
  });

  it('should render events count chart with correct data', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'events',
        chartType: 'bar',
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="bar-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('Events Processed');
    expect(wrapper.vm.chartData.datasets[0].data).toContain(1250);
  });

  it('should render command statistics as doughnut chart', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'commands',
        chartType: 'doughnut',
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="doughnut-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets[0].data).toEqual([485, 15]);
    expect(wrapper.vm.chartData.labels).toEqual(['Successful', 'Failed']);
  });

  it('should render error statistics as doughnut chart', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'errors',
        chartType: 'doughnut',
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="doughnut-chart"]').exists()).toBe(true);
    expect(wrapper.vm.chartData.datasets[0].data).toEqual([2, 18, 5]);
    expect(wrapper.vm.chartData.labels).toEqual(['Critical', 'Warnings', 'Info']);
  });

  it('should update chart when bot metrics change', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'guilds',
        chartType: 'line',
      },
    });

    const newMetrics = {
      ...mockBotMetrics,
      guilds: 175,
    };

    await wrapper.setProps({ metrics: newMetrics });
    await nextTick();

    expect(wrapper.vm.chartData.datasets[0].data).toContain(175);
  });

  it('should show connection status indicator', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'status',
        showConnectionStatus: true,
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="connection-status"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="connection-status"]').classes()).toContain('connected');
  });

  it('should show disconnected status when bot is offline', async () => {
    const disconnectedMetrics = {
      ...mockBotMetrics,
      connected: false,
    };

    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: disconnectedMetrics,
        type: 'status',
        showConnectionStatus: true,
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="connection-status"]').classes()).toContain('disconnected');
  });

  it('should format response time correctly', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'response-time',
        chartType: 'line',
      },
    });

    await nextTick();

    expect(wrapper.vm.chartData.datasets[0].label).toBe('Response Time (ms)');
    expect(wrapper.vm.chartData.datasets[0].data).toContain(120);
  });

  it('should apply correct colors for different chart types', async () => {
    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: mockBotMetrics,
        type: 'commands',
        chartType: 'doughnut',
      },
    });

    await nextTick();

    expect(wrapper.vm.chartData.datasets[0].backgroundColor).toEqual([
      'rgba(34, 197, 94, 0.8)', // Success - green
      'rgba(239, 68, 68, 0.8)', // Failed - red
    ]);
  });

  it('should handle empty or zero metrics gracefully', async () => {
    const emptyMetrics = {
      ...mockBotMetrics,
      guilds: 0,
      users: 0,
      events: 0,
    };

    const wrapper = mount(BotMetricsChart, {
      props: {
        metrics: emptyMetrics,
        type: 'guilds',
        chartType: 'line',
      },
    });

    await nextTick();

    expect(wrapper.vm.chartData.datasets[0].data).toContain(0);
    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true);
  });
});
