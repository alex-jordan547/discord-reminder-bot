/**
 * Tests for Dashboard API Routes
 * Following TDD approach for implementing dashboard API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { dashboardRoutes } from '#/api/dashboardRoutes';
import { EnhancedMonitoringService } from '#/services/enhancedMonitoringService';
import { AuthService } from '#/services/authService';

// Mock services
vi.mock('#/services/enhancedMonitoringService');
vi.mock('#/services/authService');

describe('Dashboard API Routes', () => {
  let app: FastifyInstance;
  let mockMonitoringService: any;
  let mockAuthService: any;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // Create mock services
    mockMonitoringService = {
      getSystemMetrics: vi.fn(),
      getBotMetrics: vi.fn(),
      getDatabaseMetrics: vi.fn(),
      getSecurityMetrics: vi.fn(),
      getPerformanceMetrics: vi.fn(),
      getMetricsHistory: vi.fn(),
      getAggregatedMetrics: vi.fn(),
      getAlerts: vi.fn(),
      acknowledgeAlert: vi.fn(),
      removeAlert: vi.fn(),
      getServiceStats: vi.fn(),
    };

    mockAuthService = {
      verifyToken: vi.fn(),
      hasPermission: vi.fn(),
    };

    // Register services with Fastify
    app.decorate('monitoringService', mockMonitoringService);
    app.decorate('authService', mockAuthService);

    // Register routes
    await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /api/dashboard/config', () => {
    it('should return dashboard configuration', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const config = JSON.parse(response.payload);
      expect(config).toHaveProperty('refreshInterval');
      expect(config).toHaveProperty('theme');
      expect(config).toHaveProperty('features');
      expect(config).toHaveProperty('permissions');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/config',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toHaveProperty('error', 'Authentication required');
    });

    it('should reject invalid tokens', async () => {
      mockAuthService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toHaveProperty('error', 'Invalid token');
    });

    it('should check user permissions', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'user' });
      mockAuthService.hasPermission.mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload)).toHaveProperty('error', 'Insufficient permissions');
    });
  });

  describe('POST /api/dashboard/config', () => {
    it('should update dashboard configuration', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const newConfig = {
        refreshInterval: 60000,
        theme: 'dark',
        features: {
          realTimeUpdates: true,
          notifications: true,
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: newConfig,
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('config');
      expect(result.config.refreshInterval).toBe(60000);
      expect(result.config.theme).toBe('dark');
    });

    it('should validate configuration data', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const invalidConfig = {
        refreshInterval: -1000, // Invalid negative value
        theme: 'invalid-theme',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: invalidConfig,
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('validation');
    });

    it('should require admin permissions for config updates', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'user' });
      mockAuthService.hasPermission.mockReturnValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: { theme: 'dark' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/metrics/realtime', () => {
    it('should return current metrics', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockMetrics = {
        timestamp: new Date().toISOString(),
        system: { memory: { percentage: 75 }, cpu: { usage: 50 } },
        bot: { connected: true, guilds: 5 },
        database: { connectionStatus: 'connected' },
        security: { blockedUsers: 0 },
        performance: { responseTime: 150 },
      };

      mockMonitoringService.getSystemMetrics.mockResolvedValue(mockMetrics.system);
      mockMonitoringService.getBotMetrics.mockResolvedValue(mockMetrics.bot);
      mockMonitoringService.getDatabaseMetrics.mockResolvedValue(mockMetrics.database);
      mockMonitoringService.getSecurityMetrics.mockResolvedValue(mockMetrics.security);
      mockMonitoringService.getPerformanceMetrics.mockResolvedValue(mockMetrics.performance);

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const metrics = JSON.parse(response.payload);
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('system');
      expect(metrics).toHaveProperty('bot');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('security');
      expect(metrics).toHaveProperty('performance');

      expect(metrics.system.memory.percentage).toBe(75);
      expect(metrics.bot.connected).toBe(true);
    });

    it('should handle service errors gracefully', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      mockMonitoringService.getSystemMetrics.mockRejectedValue(new Error('Service unavailable'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(500);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Failed to fetch metrics');
    });

    it('should cache metrics for short periods', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockMetrics = {
        system: { memory: { percentage: 75 } },
        bot: { connected: true },
        database: { connectionStatus: 'connected' },
        security: { blockedUsers: 0 },
        performance: { responseTime: 150 },
      };

      mockMonitoringService.getSystemMetrics.mockResolvedValue(mockMetrics.system);
      mockMonitoringService.getBotMetrics.mockResolvedValue(mockMetrics.bot);
      mockMonitoringService.getDatabaseMetrics.mockResolvedValue(mockMetrics.database);
      mockMonitoringService.getSecurityMetrics.mockResolvedValue(mockMetrics.security);
      mockMonitoringService.getPerformanceMetrics.mockResolvedValue(mockMetrics.performance);

      // First request
      await app.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
        headers: { authorization: 'Bearer valid-token' },
      });

      // Second request (should use cache)
      await app.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
        headers: { authorization: 'Bearer valid-token' },
      });

      // Services should only be called once due to caching
      expect(mockMonitoringService.getSystemMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/metrics/history', () => {
    it('should return metrics history', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockHistory = [
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          system: { memory: { percentage: 70 } },
          bot: { connected: true },
        },
        {
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          system: { memory: { percentage: 75 } },
          bot: { connected: true },
        },
      ];

      mockMonitoringService.getMetricsHistory.mockResolvedValue(mockHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=1h',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const history = JSON.parse(response.payload);
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(2);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('system');

      expect(mockMonitoringService.getMetricsHistory).toHaveBeenCalledWith('1h');
    });

    it('should validate time range parameter', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=invalid',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid time range');
    });

    it('should support aggregation parameter', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockAggregated = {
        timeRange: '1h',
        aggregation: 'average',
        data: {
          system: { memory: { percentage: 72.5 } },
          bot: { connected: true },
        },
      };

      mockMonitoringService.getAggregatedMetrics.mockResolvedValue(mockAggregated);

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=1h&aggregation=average',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('aggregation', 'average');
      expect(result).toHaveProperty('data');

      expect(mockMonitoringService.getAggregatedMetrics).toHaveBeenCalledWith('1h', 'average');
    });

    it('should limit history results', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      // Create large history array
      const largeHistory = Array.from({ length: 2000 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        system: { memory: { percentage: 50 + (i % 50) } },
      }));

      mockMonitoringService.getMetricsHistory.mockResolvedValue(largeHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=24h&limit=100',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const history = JSON.parse(response.payload);
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/alerts', () => {
    it('should return current alerts', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockAlerts = [
        {
          id: 'alert-1',
          type: 'warning',
          title: 'High Memory Usage',
          message: 'Memory usage is at 85%',
          timestamp: new Date().toISOString(),
          acknowledged: false,
        },
        {
          id: 'alert-2',
          type: 'critical',
          title: 'Database Connection Lost',
          message: 'Unable to connect to database',
          timestamp: new Date().toISOString(),
          acknowledged: false,
        },
      ];

      mockMonitoringService.getAlerts.mockResolvedValue(mockAlerts);

      const response = await app.inject({
        method: 'GET',
        url: '/api/alerts',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const alerts = JSON.parse(response.payload);
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts).toHaveLength(2);
      expect(alerts[0]).toHaveProperty('id', 'alert-1');
      expect(alerts[0]).toHaveProperty('type', 'warning');
      expect(alerts[1]).toHaveProperty('type', 'critical');
    });

    it('should filter alerts by type', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockAlerts = [{ id: 'alert-1', type: 'critical', title: 'Critical Alert' }];

      mockMonitoringService.getAlerts.mockResolvedValue(mockAlerts);

      const response = await app.inject({
        method: 'GET',
        url: '/api/alerts?type=critical',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockMonitoringService.getAlerts).toHaveBeenCalledWith({ type: 'critical' });
    });

    it('should filter alerts by acknowledged status', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      mockMonitoringService.getAlerts.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/alerts?acknowledged=false',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockMonitoringService.getAlerts).toHaveBeenCalledWith({ acknowledged: false });
    });
  });

  describe('POST /api/alerts/:id/acknowledge', () => {
    it('should acknowledge alert', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      mockMonitoringService.acknowledgeAlert.mockResolvedValue({
        id: 'alert-1',
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: 'user123',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/alerts/alert-1/acknowledge',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('alert');
      expect(result.alert.acknowledged).toBe(true);

      expect(mockMonitoringService.acknowledgeAlert).toHaveBeenCalledWith('alert-1', 'user123');
    });

    it('should handle non-existent alert', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      mockMonitoringService.acknowledgeAlert.mockRejectedValue(new Error('Alert not found'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/alerts/non-existent/acknowledge',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(404);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error', 'Alert not found');
    });
  });

  describe('DELETE /api/alerts/:id', () => {
    it('should remove alert', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      mockMonitoringService.removeAlert.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/alerts/alert-1',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);

      expect(mockMonitoringService.removeAlert).toHaveBeenCalledWith('alert-1');
    });

    it('should require admin permissions for alert removal', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'user' });
      mockAuthService.hasPermission.mockReturnValue(false);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/alerts/alert-1',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/dashboard/stats', () => {
    it('should return service statistics', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const mockStats = {
        uptime: 3600000,
        metricsCollected: 1000,
        alertsGenerated: 25,
        activeConnections: 5,
        lastUpdate: new Date().toISOString(),
      };

      mockMonitoringService.getServiceStats.mockResolvedValue(mockStats);

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/stats',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      const stats = JSON.parse(response.payload);
      expect(stats).toHaveProperty('uptime', 3600000);
      expect(stats).toHaveProperty('metricsCollected', 1000);
      expect(stats).toHaveProperty('alertsGenerated', 25);
      expect(stats).toHaveProperty('activeConnections', 5);
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      mockMonitoringService.getSystemMetrics.mockRejectedValue(new Error('Internal error'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(500);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('statusCode', 500);
    });

    it('should validate request parameters', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=&limit=abc',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('validation');
    });

    it('should handle malformed JSON requests', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: 'invalid-json{',
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('Rate Limiting', () => {
    it('should implement rate limiting on endpoints', async () => {
      mockAuthService.verifyToken.mockResolvedValue({ userId: 'user123', role: 'admin' });
      mockAuthService.hasPermission.mockReturnValue(true);

      // Make multiple rapid requests
      const requests = Array.from({ length: 100 }, () =>
        app.inject({
          method: 'GET',
          url: '/api/metrics/realtime',
          headers: { authorization: 'Bearer valid-token' },
        }),
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});
