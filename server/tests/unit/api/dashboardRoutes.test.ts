/**
 * Tests for Dashboard API Routes
 * Following TDD approach for implementing dashboard-specific endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '#/api/fastifyServer';

describe('Dashboard API Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer();
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /api/dashboard/config', () => {
    it('should return dashboard configuration', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/config',
      });

      expect(response.statusCode).toBe(200);
      const config = JSON.parse(response.payload);
      expect(config).toHaveProperty('refreshInterval');
      expect(config).toHaveProperty('theme');
      expect(config).toHaveProperty('alertThresholds');
      expect(config).toHaveProperty('features');
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/config',
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });

    it('should accept valid API token in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalToken = process.env.API_TOKEN;
      process.env.NODE_ENV = 'production';
      process.env.API_TOKEN = 'test-token';

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/config',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      process.env.NODE_ENV = originalEnv;
      process.env.API_TOKEN = originalToken;
    });
  });

  describe('POST /api/dashboard/config', () => {
    it('should update dashboard configuration', async () => {
      const newConfig = {
        refreshInterval: 60000,
        theme: 'dark',
        alertThresholds: {
          memory: 85,
          cpu: 80,
        },
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/dashboard/config',
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
      const invalidConfig = {
        refreshInterval: 'invalid',
        theme: 'invalid-theme',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        payload: invalidConfig,
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('validation');
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'POST',
        url: '/api/dashboard/config',
        payload: { theme: 'dark' },
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('GET /api/metrics/realtime', () => {
    it('should return current metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
      });

      expect(response.statusCode).toBe(200);
      const metrics = JSON.parse(response.payload);
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('system');
      expect(metrics).toHaveProperty('bot');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('performance');
      expect(metrics.system).toHaveProperty('memory');
      expect(metrics.system).toHaveProperty('cpu');
      expect(metrics.bot).toHaveProperty('connected');
      expect(metrics.bot).toHaveProperty('guilds');
    });

    it('should include database metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
      });

      expect(response.statusCode).toBe(200);
      const metrics = JSON.parse(response.payload);
      expect(metrics.database).toHaveProperty('connectionStatus');
      expect(metrics.database).toHaveProperty('queryCount');
      expect(metrics.database).toHaveProperty('averageQueryTime');
      expect(metrics.database).toHaveProperty('activeConnections');
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/realtime',
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('GET /api/metrics/history', () => {
    it('should return historical metrics with default time range', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/history',
      });

      expect(response.statusCode).toBe(200);
      const history = JSON.parse(response.payload);
      expect(history).toHaveProperty('timeRange');
      expect(history).toHaveProperty('data');
      expect(history).toHaveProperty('summary');
      expect(Array.isArray(history.data)).toBe(true);
      expect(history.timeRange).toBe('1h'); // default
    });

    it('should accept time range parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=24h',
      });

      expect(response.statusCode).toBe(200);
      const history = JSON.parse(response.payload);
      expect(history.timeRange).toBe('24h');
    });

    it('should validate time range parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/history?timeRange=invalid',
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid time range');
    });

    it('should support filtering by metric type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/history?metrics=system,bot',
      });

      expect(response.statusCode).toBe(200);
      const history = JSON.parse(response.payload);
      expect(history.data.length).toBeGreaterThanOrEqual(0);
      // Each data point should only contain system and bot metrics
      if (history.data.length > 0) {
        expect(history.data[0]).toHaveProperty('system');
        expect(history.data[0]).toHaveProperty('bot');
        expect(history.data[0]).not.toHaveProperty('database');
      }
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/history',
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('GET /api/database/status', () => {
    it('should return database status information', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/database/status',
      });

      expect(response.statusCode).toBe(200);
      const status = JSON.parse(response.payload);
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('type');
      expect(status).toHaveProperty('version');
      expect(status).toHaveProperty('size');
      expect(status).toHaveProperty('tables');
      expect(Array.isArray(status.tables)).toBe(true);
    });

    it('should include table statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/database/status',
      });

      expect(response.statusCode).toBe(200);
      const status = JSON.parse(response.payload);
      if (status.tables.length > 0) {
        expect(status.tables[0]).toHaveProperty('name');
        expect(status.tables[0]).toHaveProperty('rowCount');
        expect(status.tables[0]).toHaveProperty('size');
      }
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'GET',
        url: '/api/database/status',
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('POST /api/database/export', () => {
    it('should export database in SQLite format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/export',
        payload: { format: 'sqlite' },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('format', 'sqlite');
      expect(result).toHaveProperty('recordCount');
    });

    it('should export database in JSON format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/export',
        payload: { format: 'json' },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result.format).toBe('json');
    });

    it('should export database in CSV format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/export',
        payload: { format: 'csv' },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result.format).toBe('csv');
    });

    it('should validate export format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/export',
        payload: { format: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid format');
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'POST',
        url: '/api/database/export',
        payload: { format: 'sqlite' },
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('POST /api/database/import', () => {
    it('should validate import file format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/import',
        payload: {
          file: 'invalid-file-data',
          format: 'sqlite',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid file');
    });

    it('should require backup creation before import', async () => {
      // Mock a valid file for testing
      const mockFileData = Buffer.from('mock-sqlite-data').toString('base64');
      
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/import',
        payload: {
          file: mockFileData,
          format: 'sqlite',
          createBackup: false,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('backup required');
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'POST',
        url: '/api/database/import',
        payload: {
          file: 'mock-data',
          format: 'sqlite',
        },
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('POST /api/database/migrate', () => {
    it('should validate migration target', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/database/migrate',
        payload: { target: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid migration target');
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await server.inject({
        method: 'POST',
        url: '/api/database/migrate',
        payload: { target: 'postgresql' },
      });

      expect(response.statusCode).toBe(401);
      process.env.NODE_ENV = originalEnv;
    });
  });
});