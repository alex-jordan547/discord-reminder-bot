/**
 * Discord Reminder Bot - Enhanced Fastify Server with Advanced Monitoring
 *
 * Comprehensive server for:
 * - Health check endpoints with detailed metrics
 * - Bot status monitoring with error recovery info
 * - Security monitoring and reporting
 * - Performance metrics and dashboards
 * - Admin API endpoints with authentication
 * - Real-time monitoring and alerting
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Settings } from '@/config/settings';
import { createLogger } from '@/utils/loggingConfig';
import {
  getErrorStats,
  getCircuitBreakerStatuses,
  getErrorRecoveryHealth,
  generateErrorReport,
} from '@/utils/errorRecovery';
import { getSecurityStats, generateSecurityReport, cleanupRateLimits } from '@/utils/permissions';

const logger = createLogger('server');

/**
 * Health check response interface
 */
interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  version: string;
  nodeVersion: string;
}

/**
 * Enhanced bot status response interface
 */
interface BotStatusResponse {
  status: string;
  connected: boolean;
  guilds: number;
  events: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  scheduler: {
    status: string;
    nextCheck: string | null;
  };
  errorRecovery?: {
    healthy: boolean;
    stats: any;
    circuitBreakers: any[];
  };
  security?: {
    rateLimitEntries: number;
    blockedUsers: number;
    suspiciousActivities: number;
  };
}

/**
 * Advanced monitoring metrics interface
 */
interface MonitoringMetrics {
  system: {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    nodeVersion: string;
    platform: string;
  };
  bot: {
    connected: boolean;
    guilds: number;
    users: number;
    events: number;
    uptime: number;
  };
  errorRecovery: {
    healthy: boolean;
    totalCalls: number;
    successRate: number;
    failureRate: number;
    retryRate: number;
    circuitBreakersOpen: number;
  };
  security: {
    rateLimitEntries: number;
    blockedUsers: number;
    suspiciousActivities: number;
    topThreats: Array<{ userId: string; activityCount: number }>;
  };
  performance: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errorsPerMinute: number;
  };
}

/**
 * Dashboard data interface
 */
interface DashboardData {
  overview: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: string;
    guilds: number;
    events: number;
    issues: string[];
  };
  metrics: MonitoringMetrics;
  alerts: Array<{
    level: 'info' | 'warning' | 'error';
    message: string;
    timestamp: string;
    component: string;
  }>;
  recentActivity: Array<{
    timestamp: string;
    type: string;
    message: string;
    guildId?: string;
  }>;
}

// Performance tracking
let requestCount = 0;
let errorCount = 0;
let totalResponseTime = 0;
const performanceWindow = 60000; // 1 minute
const recentActivity: Array<{
  timestamp: string;
  type: string;
  message: string;
  guildId?: string;
}> = [];

// Reset performance metrics every minute
setInterval(() => {
  requestCount = 0;
  errorCount = 0;
  totalResponseTime = 0;
}, performanceWindow);

/**
 * Create and configure enhanced Fastify server instance
 */
export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: Settings.LOG_LEVEL.toLowerCase(),
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: Settings.LOG_COLORS,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register CORS for API access
  await fastify.register(require('@fastify/cors'), {
    origin: Settings.NODE_ENV === 'development' ? true : false,
  });

  // Register rate limiting
  await fastify.register(require('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute',
  });

  // Performance tracking middleware
  fastify.addHook('onRequest', async (request, reply) => {
    (request as any).startTime = Date.now();
    requestCount++;
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - (request as any).startTime;
    totalResponseTime += responseTime;

    // Log to recent activity
    if (recentActivity.length >= 100) {
      recentActivity.shift();
    }
    recentActivity.push({
      timestamp: new Date().toISOString(),
      type: reply.statusCode >= 400 ? 'error' : 'request',
      message: `${request.method} ${request.url} - ${reply.statusCode} (${responseTime}ms)`,
    });

    if (reply.statusCode >= 400) {
      errorCount++;
    }
  });

  /**
   * Basic health check endpoint
   */
  fastify.get(
    '/health',
    async (request: FastifyRequest, reply: FastifyReply): Promise<HealthResponse> => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '2.0.0',
        nodeVersion: process.version,
      };
    },
  );

  /**
   * Detailed bot status endpoint with enhanced monitoring
   */
  fastify.get(
    '/health/bot',
    async (request: FastifyRequest, reply: FastifyReply): Promise<BotStatusResponse> => {
      try {
        // Access bot client from global context (set by main application)
        const client = (global as any).discordClient;

        if (!client) {
          reply.code(503);
          return {
            status: 'error',
            connected: false,
            guilds: 0,
            events: 0,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            scheduler: {
              status: 'disconnected',
              nextCheck: null,
            },
            errorRecovery: {
              healthy: false,
              stats: {},
              circuitBreakers: [],
            },
            security: {
              rateLimitEntries: 0,
              blockedUsers: 0,
              suspiciousActivities: 0,
            },
          };
        }

        // Get event manager and scheduler status
        const eventManager = (client as any).eventManager;
        const reminderScheduler = (client as any).reminderScheduler;

        const totalEvents = eventManager ? await eventManager.getTotalEventCount() : 0;
        const schedulerStatus = reminderScheduler
          ? reminderScheduler.getStatus()
          : { status: 'unknown', nextCheck: null };

        // Get error recovery and security stats
        const errorRecoveryHealth = getErrorRecoveryHealth();
        const securityStats = getSecurityStats();

        return {
          status: 'ok',
          connected: client.isReady(),
          guilds: client.guilds.cache.size,
          events: totalEvents,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          scheduler: {
            status: schedulerStatus.status,
            nextCheck: schedulerStatus.nextCheck ? schedulerStatus.nextCheck.toISOString() : null,
          },
          errorRecovery: {
            healthy: errorRecoveryHealth.healthy,
            stats: errorRecoveryHealth.stats,
            circuitBreakers: errorRecoveryHealth.circuitBreakers,
          },
          security: {
            rateLimitEntries: securityStats.rateLimitEntries,
            blockedUsers: securityStats.blockedUsers,
            suspiciousActivities: securityStats.suspiciousActivities,
          },
        };
      } catch (error) {
        logger.error(`Error in bot health check: ${error}`);
        reply.code(500);
        return {
          status: 'error',
          connected: false,
          guilds: 0,
          events: 0,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          scheduler: {
            status: 'error',
            nextCheck: null,
          },
        };
      }
    },
  );

  /**
   * Bot statistics endpoint (requires auth in production)
   */
  fastify.get('/api/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple auth check for production
      if (Settings.NODE_ENV === 'production') {
        const authHeader = request.headers.authorization;
        const expectedToken = Settings.API_TOKEN;

        if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          reply.code(401);
          return { error: 'Unauthorized' };
        }
      }

      const client = (global as any).discordClient;
      if (!client) {
        reply.code(503);
        return { error: 'Bot not connected' };
      }

      const eventManager = (client as any).eventManager;
      const totalEvents = eventManager ? await eventManager.getTotalEventCount() : 0;

      // Gather guild statistics
      const guilds = Array.from(client.guilds.cache.values()).map(guild => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
      }));

      return {
        bot: {
          username: client.user.username,
          id: client.user.id,
          guilds: client.guilds.cache.size,
          uptime: process.uptime(),
        },
        events: {
          total: totalEvents,
        },
        guilds,
        system: {
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    } catch (error) {
      logger.error(`Error in stats endpoint: ${error}`);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Comprehensive monitoring metrics endpoint
   */
  fastify.get('/api/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple auth check for production
      if (Settings.NODE_ENV === 'production') {
        const authHeader = request.headers.authorization;
        const expectedToken = Settings.API_TOKEN;

        if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          reply.code(401);
          return { error: 'Unauthorized' };
        }
      }

      const client = (global as any).discordClient;
      const eventManager = client?.eventManager;
      const totalEvents = eventManager ? await eventManager.getTotalEventCount() : 0;

      // Calculate performance metrics
      const avgResponseTime = requestCount > 0 ? totalResponseTime / requestCount : 0;
      const requestsPerMinute = requestCount;
      const errorsPerMinute = errorCount;

      // Get system metrics
      const cpuUsage = process.cpuUsage();
      const errorRecoveryHealth = getErrorRecoveryHealth();
      const securityStats = getSecurityStats();

      const metrics: MonitoringMetrics = {
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpuUsage,
          nodeVersion: process.version,
          platform: process.platform,
        },
        bot: {
          connected: client?.isReady() ?? false,
          guilds: client?.guilds.cache.size ?? 0,
          users: client?.users.cache.size ?? 0,
          events: totalEvents,
          uptime: process.uptime(),
        },
        errorRecovery: {
          healthy: errorRecoveryHealth.healthy,
          totalCalls: errorRecoveryHealth.stats.totalCalls,
          successRate:
            errorRecoveryHealth.stats.totalCalls > 0
              ? (errorRecoveryHealth.stats.successfulCalls / errorRecoveryHealth.stats.totalCalls) *
                100
              : 100,
          failureRate:
            errorRecoveryHealth.stats.totalCalls > 0
              ? (errorRecoveryHealth.stats.failedCalls / errorRecoveryHealth.stats.totalCalls) * 100
              : 0,
          retryRate:
            errorRecoveryHealth.stats.totalCalls > 0
              ? (errorRecoveryHealth.stats.retriedCalls / errorRecoveryHealth.stats.totalCalls) *
                100
              : 0,
          circuitBreakersOpen: errorRecoveryHealth.circuitBreakers.filter(cb => cb.state === 'open')
            .length,
        },
        security: {
          rateLimitEntries: securityStats.rateLimitEntries,
          blockedUsers: securityStats.blockedUsers,
          suspiciousActivities: securityStats.suspiciousActivities,
          topThreats: securityStats.topSuspiciousUsers.slice(0, 3),
        },
        performance: {
          averageResponseTime: avgResponseTime,
          requestsPerMinute,
          errorsPerMinute,
        },
      };

      return metrics;
    } catch (error) {
      logger.error(`Error in metrics endpoint: ${error}`);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Dashboard data endpoint for monitoring UI
   */
  fastify.get('/api/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple auth check for production
      if (Settings.NODE_ENV === 'production') {
        const authHeader = request.headers.authorization;
        const expectedToken = Settings.API_TOKEN;

        if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          reply.code(401);
          return { error: 'Unauthorized' };
        }
      }

      const client = (global as any).discordClient;
      const eventManager = client?.eventManager;
      const totalEvents = eventManager ? await eventManager.getTotalEventCount() : 0;

      const errorRecoveryHealth = getErrorRecoveryHealth();
      const securityStats = getSecurityStats();

      // Determine overall system status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      const issues: string[] = [];

      if (!client?.isReady()) {
        status = 'critical';
        issues.push('Discord bot is not connected');
      }

      if (!errorRecoveryHealth.healthy) {
        status = status === 'critical' ? 'critical' : 'warning';
        issues.push(...errorRecoveryHealth.issues);
      }

      if (securityStats.blockedUsers > 5) {
        status = status === 'critical' ? 'critical' : 'warning';
        issues.push(`High number of blocked users: ${securityStats.blockedUsers}`);
      }

      // Get metrics
      const avgResponseTime = requestCount > 0 ? totalResponseTime / requestCount : 0;
      const cpuUsage = process.cpuUsage();

      const metrics: MonitoringMetrics = {
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpuUsage,
          nodeVersion: process.version,
          platform: process.platform,
        },
        bot: {
          connected: client?.isReady() ?? false,
          guilds: client?.guilds.cache.size ?? 0,
          users: client?.users.cache.size ?? 0,
          events: totalEvents,
          uptime: process.uptime(),
        },
        errorRecovery: {
          healthy: errorRecoveryHealth.healthy,
          totalCalls: errorRecoveryHealth.stats.totalCalls,
          successRate:
            errorRecoveryHealth.stats.totalCalls > 0
              ? (errorRecoveryHealth.stats.successfulCalls / errorRecoveryHealth.stats.totalCalls) *
                100
              : 100,
          failureRate:
            errorRecoveryHealth.stats.totalCalls > 0
              ? (errorRecoveryHealth.stats.failedCalls / errorRecoveryHealth.stats.totalCalls) * 100
              : 0,
          retryRate:
            errorRecoveryHealth.stats.totalCalls > 0
              ? (errorRecoveryHealth.stats.retriedCalls / errorRecoveryHealth.stats.totalCalls) *
                100
              : 0,
          circuitBreakersOpen: errorRecoveryHealth.circuitBreakers.filter(cb => cb.state === 'open')
            .length,
        },
        security: {
          rateLimitEntries: securityStats.rateLimitEntries,
          blockedUsers: securityStats.blockedUsers,
          suspiciousActivities: securityStats.suspiciousActivities,
          topThreats: securityStats.topSuspiciousUsers.slice(0, 3),
        },
        performance: {
          averageResponseTime: avgResponseTime,
          requestsPerMinute: requestCount,
          errorsPerMinute: errorCount,
        },
      };

      // Generate alerts
      const alerts = [];

      if (errorRecoveryHealth.circuitBreakers.some(cb => cb.state === 'open')) {
        alerts.push({
          level: 'error' as const,
          message: 'Circuit breakers are open - API failures detected',
          timestamp: new Date().toISOString(),
          component: 'error-recovery',
        });
      }

      if (securityStats.suspiciousActivities > 20) {
        alerts.push({
          level: 'warning' as const,
          message: `High suspicious activity: ${securityStats.suspiciousActivities} activities in 24h`,
          timestamp: new Date().toISOString(),
          component: 'security',
        });
      }

      if (process.memoryUsage().heapUsed > 500 * 1024 * 1024) {
        // 500MB
        alerts.push({
          level: 'warning' as const,
          message: 'High memory usage detected',
          timestamp: new Date().toISOString(),
          component: 'system',
        });
      }

      const dashboardData: DashboardData = {
        overview: {
          status,
          uptime: formatUptime(process.uptime()),
          guilds: client?.guilds.cache.size ?? 0,
          events: totalEvents,
          issues,
        },
        metrics,
        alerts,
        recentActivity: recentActivity.slice(-20), // Last 20 activities
      };

      return dashboardData;
    } catch (error) {
      logger.error(`Error in dashboard endpoint: ${error}`);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Error recovery report endpoint
   */
  fastify.get('/api/reports/errors', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple auth check for production
      if (Settings.NODE_ENV === 'production') {
        const authHeader = request.headers.authorization;
        const expectedToken = Settings.API_TOKEN;

        if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          reply.code(401);
          return { error: 'Unauthorized' };
        }
      }

      const report = generateErrorReport();
      return {
        report,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error in error report endpoint: ${error}`);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Security report endpoint
   */
  fastify.get('/api/reports/security', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple auth check for production
      if (Settings.NODE_ENV === 'production') {
        const authHeader = request.headers.authorization;
        const expectedToken = Settings.API_TOKEN;

        if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          reply.code(401);
          return { error: 'Unauthorized' };
        }
      }

      const report = generateSecurityReport();
      return {
        report,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error in security report endpoint: ${error}`);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * System maintenance endpoint
   */
  fastify.post('/api/maintenance/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple auth check for production
      if (Settings.NODE_ENV === 'production') {
        const authHeader = request.headers.authorization;
        const expectedToken = Settings.API_TOKEN;

        if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          reply.code(401);
          return { error: 'Unauthorized' };
        }
      }

      // Trigger cleanup operations
      cleanupRateLimits();

      return {
        success: true,
        message: 'Cleanup operations completed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error in cleanup endpoint: ${error}`);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Simple API info endpoint
   */
  fastify.get('/api', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      name: 'Discord Reminder Bot API',
      version: '2.0.0',
      description: 'TypeScript Discord bot for event reminders with advanced monitoring',
      endpoints: {
        health: '/health',
        botHealth: '/health/bot',
        stats: '/api/stats',
        metrics: '/api/metrics',
        dashboard: '/api/dashboard',
        reports: {
          errors: '/api/reports/errors',
          security: '/api/reports/security',
        },
        maintenance: {
          cleanup: '/api/maintenance/cleanup',
        },
      },
      documentation: 'https://github.com/alex-jordan547/discord-reminder-bot',
    };
  });

  /**
   * Catch-all 404 handler
   */
  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404);
    return {
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      availableEndpoints: [
        '/health',
        '/health/bot',
        '/api',
        '/api/stats',
        '/api/metrics',
        '/api/dashboard',
        '/api/reports/errors',
        '/api/reports/security',
        '/api/maintenance/cleanup',
      ],
    };
  });

  /**
   * Global error handler
   */
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error(`Server error on ${request.method} ${request.url}: ${error.message}`);

    reply.code(error.statusCode || 500);
    return {
      error: error.name || 'Internal Server Error',
      message: Settings.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    };
  });

  // Schedule periodic cleanup
  setInterval(() => {
    try {
      cleanupRateLimits();
      logger.debug('Periodic maintenance cleanup completed');
    } catch (error) {
      logger.error(`Error during periodic cleanup: ${error}`);
    }
  }, 300000); // Every 5 minutes

  logger.info('Fastify server configured successfully with advanced monitoring');
  return fastify;
}

/**
 * Helper function to set the Discord client reference for health checks
 */
export function setDiscordClientReference(client: any): void {
  (global as any).discordClient = client;
  logger.info('Discord client reference set for server health checks');
}

/**
 * Format uptime for human-readable display
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
