import { beforeEach, vi } from 'vitest';

// Mock WebSocket for testing
global.WebSocket = vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1,
})) as any;

// Mock Chart.js for testing
vi.mock('chart.js', () => ({
  Chart: vi.fn(() => ({
    destroy: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
  })),
  registerables: [],
}));

// Mock vue-chartjs
vi.mock('vue-chartjs', () => ({
  Line: vi.fn(),
  Bar: vi.fn(),
  Pie: vi.fn(),
  Doughnut: vi.fn(),
}));

// Setup DOM environment
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();

  // Reset DOM
  document.body.innerHTML = '';

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  vi.stubGlobal('localStorage', localStorageMock);

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  vi.stubGlobal('sessionStorage', sessionStorageMock);
});

// Global test utilities
export const createMockMetrics = () => ({
  timestamp: new Date().toISOString(),
  system: {
    uptime: 3600,
    memory: { used: 512, total: 1024, percentage: 50 },
    cpu: { percentage: 25, loadAverage: [0.5, 0.3, 0.2] },
    disk: { used: 10, total: 100, percentage: 10 },
    network: { bytesIn: 1000, bytesOut: 500, packetsIn: 100, packetsOut: 50 },
  },
  bot: {
    connected: true,
    guilds: 5,
    users: 100,
    events: 50,
    commands: { total: 25, successful: 24, failed: 1, averageResponseTime: 150 },
    errors: { total: 1, critical: 0, warnings: 1, info: 0 },
  },
  database: {
    connectionStatus: 'connected' as const,
    queryCount: 100,
    averageQueryTime: 50,
    activeConnections: 2,
    tableStats: [
      { name: 'users', rowCount: 100, size: 1024 },
      { name: 'guilds', rowCount: 5, size: 256 },
    ],
  },
  security: {
    blockedUsers: 0,
    suspiciousActivity: 0,
    threats: [],
  },
  performance: {
    responseTime: 150,
    throughput: 100,
    errorRate: 0.01,
    availability: 99.9,
  },
});

export const createMockAlert = () => ({
  id: 'test-alert-1',
  type: 'warning' as const,
  title: 'Test Alert',
  message: 'This is a test alert',
  timestamp: new Date().toISOString(),
  acknowledged: false,
  source: 'test',
});

export const createMockActivity = () => ({
  id: 'test-activity-1',
  type: 'command',
  description: 'User executed test command',
  timestamp: new Date().toISOString(),
  severity: 'info' as const,
  metadata: { userId: '123', command: 'test' },
});
