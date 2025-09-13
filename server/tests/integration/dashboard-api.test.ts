/**
 * Integration tests for Dashboard API
 * Testing complete API workflows with real database interactions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { dashboardRoutes } from '#/api/dashboardRoutes';
import { websocketRoutes } from '#/api/websocketRoutes';
import { authRoutes } from '#/api/authRoutes';
import { EnhancedMonitoringService } from '#/services/enhancedMonitoringService';
import { AuthService } from '#/services/authService';
import { DatabaseService } from '#/db/index';

describe('Dashboard API Integration', () => {
  let app: FastifyInstance;
  let authToken: string;
  let monitoringService: EnhancedMonitoringService;
  let authService: AuthService;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Create Fastify instance
    app = Fastify({ logger: false });

    // Initialize services
    authService = new AuthService({
      jwtSecret: 'test-secret-key',
      tokenExpiry: '1h',
      bcryptRounds: 10,
    });

    monitoringService = new EnhancedMonitoringService();
    databaseService = new DatabaseService();

    // Register services with Fastify
    app.decorate('authService', authService);
    app.decorate('monitoringService', monitoringService);
    app.decorate('databaseService', databaseService);

    // Register routes
    await app.register(authRoutes, { prefix: '/api/auth' });
    await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
    await app.register(websocketRoutes, { prefix: '/ws' });

    // Start monitoring service
    await monitoringService.start();

    // Generate auth token for tests
    authToken = await authService.generateToken({
      userId: 'test-user',
      role: 'admin',
      permissions: ['dashboard:read', 'dashboard:write', 'database:export', 'database:import'],
    });
  });

  afterEach(async () => {
    await monitoringService.stop();
    await app.close();
  });

  describe('Authentication Flow', () => {
    it('should authenticate user and provide access token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin',
          password: 'admin123',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user.role).toBe('admin');
    });

    it('should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
    });

    it('should validate token and return user info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('userId', 'test-user');
      expect(result).toHaveProperty('role', 'admin');
    });

    it('should refresh expired tokens', async () => {
      // Create short-lived token
      const shortToken = await authService.generateToken(
        { userId: 'test-user', role: 'admin' },
        '1ms',
      );

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          authorization: `Bearer ${shortToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('token');
      expect(result.token).not.toBe(shortToken);
    });
  });

  describe('Dashboard Configuration', () => {
    it('should get dashboard configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/config',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const config = JSON.parse(response.payload);
      expect(config).toHaveProperty('refreshInterval');
      expect(config).toHaveProperty('theme');
      expect(config).toHaveProperty('features');
      expect(config.features).toHaveProperty('realTimeUpdates');
      expect(config.features).toHaveProperty('notifications');
    });

    it('should update dashboard configuration', async () => {
      const newConfig = {
        refreshInterval: 30000,
        theme: 'dark',
        features: {
          realTimeUpdates: true,
          notifications: false,
          advancedCharts: true,
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: newConfig,
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.config.refreshInterval).toBe(30000);
      expect(result.config.theme).toBe('dark');
    });

    it('should validate configuration updates', async () => {
      const invalidConfig = {
        refreshInterval: -1000, // Invalid negative value
        theme: 'invalid-theme',
        features: 'not-an-object',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: invalidConfig,
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('validation');
    });
  });

  describe('Real-time Metrics', () => {
    it('should get current system metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/realtime',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const metrics = JSON.parse(response.payload);
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('system');
      expect(metrics).toHaveProperty('bot');
      expect(metrics).toHaveProperty('database');

      // System metrics
      expect(metrics.system).toHaveProperty('memory');
      expect(metrics.system).toHaveProperty('cpu');
      expect(metrics.system).toHaveProperty('disk');
      expect(metrics.system.memory).toHaveProperty('percentage');

      // Bot metrics
      expect(metrics.bot).toHaveProperty('connected');
      expect(metrics.bot).toHaveProperty('guilds');
      expect(metrics.bot).toHaveProperty('users');

      // Database metrics
      expect(metrics.database).toHaveProperty('connectionStatus');
      expect(metrics.database).toHaveProperty('queryCount');
    });

    it('should get metrics history with time range', async () => {
      // First, generate some historical data
      for (let i = 0; i < 10; i++) {
        await monitoringService.storeMetrics({
          timestamp: new Date(Date.now() - i * 60000).toISOString(),
          system: { memory: { percentage: 50 + i } },
          bot: { connected: true, guilds: 5 + i },
          database: { connectionStatus: 'connected' },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/history?timeRange=1h&limit=5',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const history = JSON.parse(response.payload);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeLessThanOrEqual(5);

      if (history.length > 0) {
        expect(history[0]).toHaveProperty('timestamp');
        expect(history[0]).toHaveProperty('system');
      }
    });

    it('should get aggregated metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/history?timeRange=1h&aggregation=average',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('aggregation', 'average');
      expect(result).toHaveProperty('timeRange', '1h');
      expect(result).toHaveProperty('data');
    });

    it('should handle invalid time ranges', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/history?timeRange=invalid',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid time range');
    });
  });

  describe('Alert Management', () => {
    it('should get current alerts', async () => {
      // Generate some test alerts
      await monitoringService.generateAlert({
        type: 'memory',
        severity: 'warning',
        message: 'Memory usage is high',
        value: 85,
        threshold: 80,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/alerts',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const alerts = JSON.parse(response.payload);
      expect(Array.isArray(alerts)).toBe(true);

      if (alerts.length > 0) {
        expect(alerts[0]).toHaveProperty('id');
        expect(alerts[0]).toHaveProperty('type');
        expect(alerts[0]).toHaveProperty('severity');
        expect(alerts[0]).toHaveProperty('message');
        expect(alerts[0]).toHaveProperty('timestamp');
      }
    });

    it('should filter alerts by type and status', async () => {
      // Generate alerts of different types
      await monitoringService.generateAlert({
        type: 'memory',
        severity: 'critical',
        message: 'Memory critical',
      });

      await monitoringService.generateAlert({
        type: 'cpu',
        severity: 'warning',
        message: 'CPU high',
      });

      // Filter by type
      const typeResponse = await app.inject({
        method: 'GET',
        url: '/api/dashboard/alerts?type=memory',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(typeResponse.statusCode).toBe(200);

      const typeAlerts = JSON.parse(typeResponse.payload);
      typeAlerts.forEach((alert: any) => {
        expect(alert.type).toBe('memory');
      });

      // Filter by severity
      const severityResponse = await app.inject({
        method: 'GET',
        url: '/api/dashboard/alerts?severity=critical',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(severityResponse.statusCode).toBe(200);

      const severityAlerts = JSON.parse(severityResponse.payload);
      severityAlerts.forEach((alert: any) => {
        expect(alert.severity).toBe('critical');
      });
    });

    it('should acknowledge alerts', async () => {
      // Generate test alert
      const alert = await monitoringService.generateAlert({
        type: 'test',
        severity: 'info',
        message: 'Test alert',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/dashboard/alerts/${alert.id}/acknowledge`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.alert.acknowledged).toBe(true);
      expect(result.alert.acknowledgedBy).toBe('test-user');
    });

    it('should delete alerts', async () => {
      // Generate test alert
      const alert = await monitoringService.generateAlert({
        type: 'test',
        severity: 'info',
        message: 'Test alert to delete',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/dashboard/alerts/${alert.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // Verify alert is deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/dashboard/alerts',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const alerts = JSON.parse(getResponse.payload);
      const deletedAlert = alerts.find((a: any) => a.id === alert.id);
      expect(deletedAlert).toBeUndefined();
    });
  });

  describe('Database Operations', () => {
    it('should export database', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/database/export',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          format: 'sqlite',
          includeData: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/octet-stream');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should validate import files', async () => {
      // Create mock SQLite file content
      const mockSqliteContent = Buffer.from('SQLite format 3\0');

      const response = await app.inject({
        method: 'POST',
        url: '/api/database/validate',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'multipart/form-data',
        },
        payload: {
          file: {
            filename: 'test.db',
            mimetype: 'application/x-sqlite3',
            data: mockSqliteContent,
          },
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('preview');

      if (result.valid) {
        expect(result.preview).toHaveProperty('tables');
        expect(result.preview).toHaveProperty('recordCount');
      }
    });

    it('should import database with backup', async () => {
      // First create a backup
      const backupResponse = await app.inject({
        method: 'POST',
        url: '/api/database/backup',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(backupResponse.statusCode).toBe(200);

      const backupResult = JSON.parse(backupResponse.payload);
      expect(backupResult.success).toBe(true);
      expect(backupResult).toHaveProperty('backupId');

      // Now import data
      const mockSqliteContent = Buffer.from('SQLite format 3\0');

      const importResponse = await app.inject({
        method: 'POST',
        url: '/api/database/import',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'multipart/form-data',
        },
        payload: {
          file: {
            filename: 'import.db',
            mimetype: 'application/x-sqlite3',
            data: mockSqliteContent,
          },
          createBackup: true,
        },
      });

      expect(importResponse.statusCode).toBe(200);

      const importResult = JSON.parse(importResponse.payload);
      expect(importResult.success).toBe(true);
      expect(importResult).toHaveProperty('recordsImported');
      expect(importResult).toHaveProperty('backupCreated');
    });

    it('should list and manage backups', async () => {
      // Create a backup
      await app.inject({
        method: 'POST',
        url: '/api/database/backup',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // List backups
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/database/backups',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(listResponse.statusCode).toBe(200);

      const backups = JSON.parse(listResponse.payload);
      expect(Array.isArray(backups)).toBe(true);

      if (backups.length > 0) {
        expect(backups[0]).toHaveProperty('id');
        expect(backups[0]).toHaveProperty('created');
        expect(backups[0]).toHaveProperty('size');
        expect(backups[0]).toHaveProperty('type');
      }
    });

    it('should restore from backup', async () => {
      // Create a backup first
      const backupResponse = await app.inject({
        method: 'POST',
        url: '/api/database/backup',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const backupResult = JSON.parse(backupResponse.payload);
      const backupId = backupResult.backupId;

      // Restore from backup
      const restoreResponse = await app.inject({
        method: 'POST',
        url: `/api/database/restore/${backupId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(restoreResponse.statusCode).toBe(200);

      const restoreResult = JSON.parse(restoreResponse.payload);
      expect(restoreResult.success).toBe(true);
      expect(restoreResult).toHaveProperty('recordsRestored');
    });
  });

  describe('Service Statistics', () => {
    it('should get service statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/stats',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const stats = JSON.parse(response.payload);
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('metricsCollected');
      expect(stats).toHaveProperty('alertsGenerated');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('lastUpdate');

      expect(typeof stats.uptime).toBe('number');
      expect(typeof stats.metricsCollected).toBe('number');
      expect(typeof stats.alertsGenerated).toBe('number');
    });

    it('should get health check status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/health',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const health = JSON.parse(response.payload);
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('services');
      expect(health).toHaveProperty('timestamp');

      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(health.services).toHaveProperty('database');
      expect(health.services).toHaveProperty('monitoring');
      expect(health.services).toHaveProperty('websocket');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle unauthorized requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/realtime',
      });

      expect(response.statusCode).toBe(401);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
    });

    it('should handle invalid tokens', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/realtime',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle service unavailable errors', async () => {
      // Stop monitoring service to simulate unavailability
      await monitoringService.stop();

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard/metrics/realtime',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(503);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Service unavailable');
    });

    it('should handle malformed requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: 'invalid-json{',
      });

      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
    });

    it('should handle rate limiting', async () => {
      const requests = [];

      // Make many rapid requests
      for (let i = 0; i < 100; i++) {
        requests.push(
          app.inject({
            method: 'GET',
            url: '/api/dashboard/metrics/realtime',
            headers: {
              authorization: `Bearer ${authToken}`,
            },
          }),
        );
      }

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should handle database connection failures', async () => {
      // Mock database connection failure
      vi.spyOn(databaseService, 'getConnection').mockRejectedValue(
        new Error('Database connection failed'),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/database/export',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { format: 'sqlite' },
      });

      expect(response.statusCode).toBe(500);

      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Database');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const requests = [];

      const startTime = Date.now();

      // Make concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          app.inject({
            method: 'GET',
            url: '/api/dashboard/metrics/realtime',
            headers: {
              authorization: `Bearer ${authToken}`,
            },
          }),
        );
      }

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Should handle concurrent requests efficiently (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain performance under load', async () => {
      const iterations = 100;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const response = await app.inject({
          method: 'GET',
          url: '/api/dashboard/metrics/realtime',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        responseTimes.push(responseTime);
        expect(response.statusCode).toBe(200);
      }

      // Calculate performance metrics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[
        Math.floor(responseTimes.length * 0.95)
      ];

      // Performance should be acceptable
      expect(avgResponseTime).toBeLessThan(100); // Average < 100ms
      expect(maxResponseTime).toBeLessThan(500); // Max < 500ms
      expect(p95ResponseTime).toBeLessThan(200); // 95th percentile < 200ms
    });

    it('should handle memory efficiently during long operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/dashboard/metrics/realtime',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Trigger garbage collection periodically
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
