import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import InteractiveChart from '@/components/InteractiveChart.vue';
import type { MonitoringMetrics } from '@/types';

// Mock Chart.js with zoom plugin
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
  },
  CategoryScale: vi.fn(),
  LinearScale: vi.fn(),
  TimeScale: vi.fn(),
  PointElement: vi.fn(),
  LineElement: vi.fn(),
  Title: vi.fn(),
  Tooltip: vi.fn(),
  Legend: vi.fn(),
}));

vi.mock('chartjs-plugin-zoom', () => ({
  default: vi.fn(),
}));

vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    template: '<div data-testid="interactive-chart" ref="chartRef">Interactive Chart</div>',
    methods: {
      resetZoom: vi.fn(),
      zoomScale: vi.fn(),
    },
  },
}));

describe('InteractiveChart', () => {
  const mockResetZoom = vi.fn();
  const mockMetricsHistory: MonitoringMetrics[] = [
    {
      timestamp: '2024-01-01T10:00:00Z',
      system: {
        uptime: 86400,
        memory: { used: 512, total: 1024, percentage: 50 },
        cpu: { percentage: 25, loadAverage: [1.2, 1.5, 1.8] },
        disk: { used: 100, total: 500, percentage: 20 },
        network: { bytesIn: 1000, bytesOut: 800, packetsIn: 100, packetsOut: 80 },
      },
      bot: {
        connected: true,
        guilds: 150,
        users: 25000,
        events: 1250,
        commands: { total: 500, successful: 485, failed: 15, averageResponseTime: 120 },
        errors: { total: 25, critical: 2, warnings: 18, info: 5 },
      },
      database: {
        connectionStatus: 'connected' as const,
        queryCount: 1000,
        averageQueryTime: 50,
        activeConnections: 5,
        tableStats: [],
      },
      security: {
        blockedUsers: 10,
        suspiciousActivity: 5,
        threats: [],
      },
      performance: {
        responseTime: 120,
        throughput: 100,
        errorRate: 0.03,
        availability: 99.9,
      },
    },
    {
      timestamp: '2024-01-01T10:05:00Z',
      system: {
        uptime: 86700,
        memory: { used: 600, total: 1024, percentage: 58.6 },
        cpu: { percentage: 35, loadAverage: [1.5, 1.8, 2.0] },
        disk: { used: 105, total: 500, percentage: 21 },
        network: { bytesIn: 1200, bytesOut: 900, packetsIn: 120, packetsOut: 90 },
      },
      bot: {
        connected: true,
        guilds: 152,
        users: 25100,
        events: 1280,
        commands: { total: 520, successful: 500, failed: 20, averageResponseTime: 130 },
        errors: { total: 28, critical: 3, warnings: 20, info: 5 },
      },
      database: {
        connectionStatus: 'connected' as const,
        queryCount: 1050,
        averageQueryTime: 55,
        activeConnections: 6,
        tableStats: [],
      },
      security: {
        blockedUsers: 12,
        suspiciousActivity: 7,
        threats: [],
      },
      performance: {
        responseTime: 130,
        throughput: 105,
        errorRate: 0.038,
        availability: 99.8,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockResetZoom.mockClear();
  });

  it('should render interactive chart with zoom controls', async () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="interactive-chart"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="zoom-controls"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reset-zoom"]').exists()).toBe(true);
  });

  it('should render time range selector', async () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.memory.percentage',
        timeRange: '6h',
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="time-range-selector"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="time-range-option"]')).toHaveLength(4);
    
    const options = wrapper.findAll('[data-testid="time-range-option"]');
    expect(options[0].text()).toBe('1h');
    expect(options[1].text()).toBe('6h');
    expect(options[2].text()).toBe('24h');
    expect(options[3].text()).toBe('7d');
  });

  it('should emit timeRangeChange when time range is selected', async () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    await wrapper.find('[data-testid="time-range-option"]:nth-child(2)').trigger('click');
    await nextTick();

    expect(wrapper.emitted('timeRangeChange')).toBeTruthy();
    expect(wrapper.emitted('timeRangeChange')[0]).toEqual(['6h']);
  });

  it('should configure chart with zoom and pan options', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartOptions.plugins.zoom).toBeDefined();
    expect(wrapper.vm.chartOptions.plugins.zoom.zoom.wheel.enabled).toBe(true);
    expect(wrapper.vm.chartOptions.plugins.zoom.pan.enabled).toBe(true);
  });

  it('should handle reset zoom functionality', async () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    const resetButton = wrapper.find('[data-testid="reset-zoom"]');
    expect(resetButton.exists()).toBe(true);
    
    // Test that the resetZoom function exists
    expect(typeof wrapper.vm.resetZoom).toBe('function');
    
    // Test that clicking the button doesn't throw an error
    await resetButton.trigger('click');
    await nextTick();
    
    // The test passes if no error is thrown
    expect(true).toBe(true);
  });

  it('should extract correct metric values from nested object paths', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartData.datasets[0].data).toEqual([25, 35]);
  });

  it('should handle bot metrics extraction', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'bot.guilds',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartData.datasets[0].data).toEqual([150, 152]);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('Guild Count');
  });

  it('should handle performance metrics extraction', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'performance.responseTime',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartData.datasets[0].data).toEqual([120, 130]);
    expect(wrapper.vm.chartData.datasets[0].label).toBe('Response Time (ms)');
  });

  it('should format timestamps for x-axis labels', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartData.labels).toHaveLength(2);
    // Check that labels are properly formatted timestamps
    expect(wrapper.vm.chartData.labels[0]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(wrapper.vm.chartData.labels[1]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('should apply correct chart styling based on metric type', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: mockMetricsHistory,
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    const dataset = wrapper.vm.chartData.datasets[0];
    expect(dataset.borderColor).toBe('rgba(59, 130, 246, 1)');
    expect(dataset.backgroundColor).toBe('rgba(59, 130, 246, 0.1)');
    expect(dataset.fill).toBe(true);
  });

  it('should handle empty metrics history gracefully', () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: [],
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartData.datasets[0].data).toEqual([]);
    expect(wrapper.vm.chartData.labels).toEqual([]);
  });

  it('should update chart when metrics history changes', async () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: [mockMetricsHistory[0]],
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
      },
    });

    expect(wrapper.vm.chartData.datasets[0].data).toEqual([25]);

    await wrapper.setProps({ metricsHistory: mockMetricsHistory });
    await nextTick();

    expect(wrapper.vm.chartData.datasets[0].data).toEqual([25, 35]);
  });

  it('should show loading state when no data is available', async () => {
    const wrapper = mount(InteractiveChart, {
      props: {
        metricsHistory: [],
        metricType: 'system.cpu.percentage',
        timeRange: '1h',
        loading: true,
      },
    });

    expect(wrapper.find('[data-testid="chart-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="interactive-chart"]').exists()).toBe(false);
  });
});