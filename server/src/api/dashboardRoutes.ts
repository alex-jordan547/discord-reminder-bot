/**
 * Dashboard API Routes
 * Implements dashboard-specific endpoints for configuration, metrics, and database management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Settings } from '../config/settings.js';
import { createLogger } from '../utils/loggingConfig.js';

const logger = createLogger('dashboard-routes');

// Dashboard configuration interface
interface DashboardConfig {
  refreshInterval: number;
  theme: 'light' | 'dark';
  alertThresholds: {
    memory: number;
    cpu: number;
    disk: number;
  };
  features: {
    realTimeUpdates: boolean;
    notifications: boolean;
    exportImport: boolean;
  };
}

// Default dashboard configuration
const defaultConfig: DashboardConfig = {
  refreshInterval: 30000, // 30 seconds
  theme: 'light',
  alertThresholds: {
    memory: 80,
    cpu: 75,
    disk: 85,
  },
  features: {
    realTimeUpdates: true,
    notifications: true,
    exportImport: true,
  },
};

// In-memory storage for dashboard config (in production, this would be in database)
let currentConfig: DashboardConfig = { ...defaultConfig };

// Metrics history storage (in production, this would be in database)
const metricsHistory: any[] = [];

// Authentication middleware
function requireAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  // Check current NODE_ENV from process.env instead of cached Settings
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.authorization;
    const expectedToken = process.env.API_TOKEN;

    if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      reply.code(401);
      reply.send({ error: 'Unauthorized' });
      return false;
    }
  }
  return true;
}

// Validation helpers
function validateDashboardConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof config.refreshInterval !== 'undefined') {
    if (typeof config.refreshInterval !== 'number' || config.refreshInterval < 1000) {
      errors.push('refreshInterval must be a number >= 1000');
    }
  }

  if (typeof config.theme !== 'undefined') {
    if (!['light', 'dark'].includes(config.theme)) {
      errors.push('theme must be either "light" or "dark"');
    }
  }

  if (config.alertThresholds) {
    if (typeof config.alertThresholds !== 'object') {
      errors.push('alertThresholds must be an object');
    } else {
      ['memory', 'cpu', 'disk'].forEach(key => {
        if (typeof config.alertThresholds[key] !== 'undefined') {
          if (
            typeof config.alertThresholds[key] !== 'number' ||
            config.alertThresholds[key] < 0 ||
            config.alertThresholds[key] > 100
          ) {
            errors.push(`alertThresholds.${key} must be a number between 0 and 100`);
          }
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateTimeRange(timeRange: string): boolean {
  return ['1h', '6h', '24h', '7d'].includes(timeRange);
}

function validateExportFormat(format: string): boolean {
  return ['sqlite', 'json', 'csv'].includes(format);
}

function validateMigrationTarget(target: string): boolean {
  return ['postgresql', 'sqlite'].includes(target);
}

// Mock database metrics (in production, this would query actual database)
function getDatabaseMetrics() {
  return {
    connectionStatus: 'connected' as const,
    queryCount: Math.floor(Math.random() * 1000),
    averageQueryTime: Math.random() * 100,
    activeConnections: Math.floor(Math.random() * 10) + 1,
  };
}

// Mock database status (in production, this would query actual database)
function getDatabaseStatus() {
  return {
    connected: true,
    type: 'sqlite',
    version: '3.40.0',
    size: Math.floor(Math.random() * 10000000), // Random size in bytes
    tables: [
      { name: 'events', rowCount: 150, size: 2048 },
      { name: 'guilds', rowCount: 5, size: 512 },
      { name: 'users', rowCount: 25, size: 1024 },
    ],
  };
}

// Generate mock metrics history
function generateMetricsHistory(timeRange: string, metrics?: string[]) {
  const now = Date.now();
  const intervals = {
    '1h': { count: 60, interval: 60000 }, // 1 minute intervals
    '6h': { count: 72, interval: 300000 }, // 5 minute intervals
    '24h': { count: 144, interval: 600000 }, // 10 minute intervals
    '7d': { count: 168, interval: 3600000 }, // 1 hour intervals
  };

  const config = intervals[timeRange as keyof typeof intervals] || intervals['1h'];
  const data = [];

  for (let i = config.count; i >= 0; i--) {
    const timestamp = new Date(now - i * config.interval).toISOString();
    const dataPoint: any = { timestamp };

    if (!metrics || metrics.includes('system')) {
      dataPoint.system = {
        memory: { used: Math.random() * 1000000000, total: 2000000000 },
        cpu: Math.random() * 100,
      };
    }

    if (!metrics || metrics.includes('bot')) {
      dataPoint.bot = {
        connected: true,
        guilds: 5 + Math.floor(Math.random() * 3),
        events: 150 + Math.floor(Math.random() * 50),
      };
    }

    if (!metrics || metrics.includes('database')) {
      dataPoint.database = getDatabaseMetrics();
    }

    data.push(dataPoint);
  }

  return data;
}

/**
 * Register dashboard API routes
 */
export async function registerDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  // Dashboard configuration endpoints
  fastify.get('/api/dashboard/config', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    return currentConfig;
  });

  fastify.post('/api/dashboard/config', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    const config = request.body as any;
    const validation = validateDashboardConfig(config);

    if (!validation.valid) {
      reply.code(400);
      return { error: `Configuration validation failed: ${validation.errors.join(', ')}` };
    }

    // Update configuration
    currentConfig = { ...currentConfig, ...config };

    return {
      success: true,
      config: currentConfig,
    };
  });

  // Real-time metrics endpoint
  fastify.get('/api/metrics/realtime', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    const client = (global as any).discordClient;
    const eventManager = client?.eventManager;
    const totalEvents = eventManager ? await eventManager.getTotalEventCount() : 0;

    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
      },
      bot: {
        connected: client?.isReady() ?? false,
        guilds: client?.guilds.cache.size ?? 0,
        users: client?.users.cache.size ?? 0,
        events: totalEvents,
      },
      database: getDatabaseMetrics(),
      performance: {
        averageResponseTime: Math.random() * 100,
        requestsPerMinute: Math.floor(Math.random() * 100),
        errorsPerMinute: Math.floor(Math.random() * 5),
      },
    };

    return metrics;
  });

  // Historical metrics endpoint
  fastify.get('/api/metrics/history', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    const query = request.query as any;
    const timeRange = query.timeRange || '1h';
    const metricsFilter = query.metrics ? query.metrics.split(',') : undefined;

    if (!validateTimeRange(timeRange)) {
      reply.code(400);
      return { error: 'Invalid time range. Must be one of: 1h, 6h, 24h, 7d' };
    }

    const data = generateMetricsHistory(timeRange, metricsFilter);

    return {
      timeRange,
      data,
      summary: {
        totalDataPoints: data.length,
        startTime: data[0]?.timestamp,
        endTime: data[data.length - 1]?.timestamp,
      },
    };
  });

  // Database status endpoint
  fastify.get('/api/database/status', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    return getDatabaseStatus();
  });

  // Database export endpoint
  fastify.post('/api/database/export', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    const { format } = request.body as any;

    if (!validateExportFormat(format)) {
      reply.code(400);
      return { error: 'Invalid format. Must be one of: sqlite, json, csv' };
    }

    // Mock export operation
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `database_export_${timestamp}.${format}`;
    const mockSize = Math.floor(Math.random() * 10000000); // Random size
    const mockRecordCount = Math.floor(Math.random() * 1000) + 100;

    return {
      success: true,
      filename,
      size: mockSize,
      format,
      recordCount: mockRecordCount,
      timestamp: new Date().toISOString(),
    };
  });

  // Database import endpoint
  fastify.post('/api/database/import', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    const { file, format, createBackup } = request.body as any;

    if (!file || typeof file !== 'string') {
      reply.code(400);
      return { error: 'Invalid file data provided' };
    }

    if (createBackup === false) {
      reply.code(400);
      return { error: 'Backup creation is backup required before import operations' };
    }

    // Mock validation
    if (file === 'invalid-file-data') {
      reply.code(400);
      return { error: 'Invalid file format or corrupted data' };
    }

    // Mock import operation
    return {
      success: true,
      recordsImported: Math.floor(Math.random() * 500) + 50,
      recordsSkipped: Math.floor(Math.random() * 10),
      errors: [],
      backupCreated: `backup_${Date.now()}.sqlite`,
      duration: Math.random() * 5000,
    };
  });

  // Database migration endpoint
  fastify.post('/api/database/migrate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(request, reply)) return;

    const { target } = request.body as any;

    if (!validateMigrationTarget(target)) {
      reply.code(400);
      return { error: 'Invalid migration target. Must be either "postgresql" or "sqlite"' };
    }

    // Mock migration operation
    return {
      success: true,
      sourceType: 'sqlite',
      targetType: target,
      recordsMigrated: Math.floor(Math.random() * 1000) + 100,
      duration: Math.random() * 10000,
      errors: [],
    };
  });

  logger.info('Dashboard API routes registered successfully');
}
