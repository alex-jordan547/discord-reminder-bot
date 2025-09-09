/**
 * Tests for Enhanced Monitoring Service
 * Following TDD approach for implementing enhanced monitoring capabilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedMonitoringService } from '#/services/enhancedMonitoringService';

describe('Enhanced Monitoring Service', () => {
  let monitoringService: EnhancedMonitoringService;

  beforeEach(() => {
    monitoringService = new EnhancedMonitoringService();
  });

  afterEach(() => {
    monitoringService.stop();
  });

  describe('System Metrics Collection', () => {
    it('should collect extended system metrics', async () => {
      const metrics = await monitoringService.getSystemMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('disk');
      expect(metrics).toHaveProperty('network');
      expect(metrics).toHaveProperty('process');

      // Memory metrics
      expect(metrics.memory).toHaveProperty('used');
      expect(metrics.memory).toHaveProperty('total');
      expect(metrics.memory).toHaveProperty('percentage');
      expect(metrics.memory).toHaveProperty('heap');

      // CPU metrics
      expect(metrics.cpu).toHaveProperty('usage');
      expect(metrics.cpu).toHaveProperty('loadAverage');
      expect(metrics.cpu).toHaveProperty('cores');

      // Disk metrics
      expect(metrics.disk).toHaveProperty('used');
      expect(metrics.disk).toHaveProperty('total');
      expect(metrics.disk).toHaveProperty('percentage');

      // Network metrics
      expect(metrics.network).toHaveProperty('bytesReceived');
      expect(metrics.network).toHaveProperty('bytesSent');
      expect(metrics.network).toHaveProperty('packetsReceived');
      expect(metrics.network).toHaveProperty('packetsSent');

      // Process metrics
      expect(metrics.process).toHaveProperty('uptime');
      expect(metrics.process).toHaveProperty('pid');
      expect(metrics.process).toHaveProperty('ppid');
    });

    it('should calculate memory usage percentage correctly', async () => {
      const metrics = await monitoringService.getSystemMetrics();
      
      expect(metrics.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(metrics.memory.percentage).toBeLessThanOrEqual(100);
      expect(typeof metrics.memory.percentage).toBe('number');
    });

    it('should provide CPU load average', async () => {
      const metrics = await monitoringService.getSystemMetrics();
      
      expect(Array.isArray(metrics.cpu.loadAverage)).toBe(true);
      expect(metrics.cpu.loadAverage).toHaveLength(3); // 1min, 5min, 15min
      expect(metrics.cpu.cores).toBeGreaterThan(0);
    });

    it('should collect disk usage information', async () => {
      const metrics = await monitoringService.getSystemMetrics();
      
      expect(metrics.disk.used).toBeGreaterThanOrEqual(0);
      expect(metrics.disk.total).toBeGreaterThan(0);
      expect(metrics.disk.percentage).toBeGreaterThanOrEqual(0);
      expect(metrics.disk.percentage).toBeLessThanOrEqual(100);
    });

    it('should track network statistics', async () => {
      const metrics = await monitoringService.getSystemMetrics();
      
      expect(metrics.network.bytesReceived).toBeGreaterThanOrEqual(0);
      expect(metrics.network.bytesSent).toBeGreaterThanOrEqual(0);
      expect(metrics.network.packetsReceived).toBeGreaterThanOrEqual(0);
      expect(metrics.network.packetsSent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Database Performance Metrics', () => {
    it('should collect database performance metrics', async () => {
      const metrics = await monitoringService.getDatabaseMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('connectionStatus');
      expect(metrics).toHaveProperty('queryPerformance');
      expect(metrics).toHaveProperty('connectionPool');
      expect(metrics).toHaveProperty('tableStats');
      expect(metrics).toHaveProperty('indexStats');

      // Query performance
      expect(metrics.queryPerformance).toHaveProperty('averageQueryTime');
      expect(metrics.queryPerformance).toHaveProperty('slowQueries');
      expect(metrics.queryPerformance).toHaveProperty('totalQueries');
      expect(metrics.queryPerformance).toHaveProperty('queriesPerSecond');

      // Connection pool
      expect(metrics.connectionPool).toHaveProperty('active');
      expect(metrics.connectionPool).toHaveProperty('idle');
      expect(metrics.connectionPool).toHaveProperty('total');
      expect(metrics.connectionPool).toHaveProperty('waiting');

      // Table stats
      expect(Array.isArray(metrics.tableStats)).toBe(true);
      if (metrics.tableStats.length > 0) {
        expect(metrics.tableStats[0]).toHaveProperty('name');
        expect(metrics.tableStats[0]).toHaveProperty('rowCount');
        expect(metrics.tableStats[0]).toHaveProperty('size');
        expect(metrics.tableStats[0]).toHaveProperty('lastUpdated');
      }
    });

    it('should track slow queries', async () => {
      const metrics = await monitoringService.getDatabaseMetrics();
      
      expect(Array.isArray(metrics.queryPerformance.slowQueries)).toBe(true);
      expect(metrics.queryPerformance.averageQueryTime).toBeGreaterThanOrEqual(0);
      expect(metrics.queryPerformance.totalQueries).toBeGreaterThanOrEqual(0);
    });

    it('should monitor connection pool status', async () => {
      const metrics = await monitoringService.getDatabaseMetrics();
      
      expect(metrics.connectionPool.active).toBeGreaterThanOrEqual(0);
      expect(metrics.connectionPool.idle).toBeGreaterThanOrEqual(0);
      expect(metrics.connectionPool.total).toBeGreaterThanOrEqual(0);
      expect(metrics.connectionPool.waiting).toBeGreaterThanOrEqual(0);
    });

    it('should provide index usage statistics', async () => {
      const metrics = await monitoringService.getDatabaseMetrics();
      
      expect(Array.isArray(metrics.indexStats)).toBe(true);
      if (metrics.indexStats.length > 0) {
        expect(metrics.indexStats[0]).toHaveProperty('name');
        expect(metrics.indexStats[0]).toHaveProperty('table');
        expect(metrics.indexStats[0]).toHaveProperty('usage');
        expect(metrics.indexStats[0]).toHaveProperty('efficiency');
      }
    });
  });

  describe('Alert Generation System', () => {
    it('should generate alerts based on configurable thresholds', async () => {
      const thresholds = {
        memory: 80,
        cpu: 75,
        disk: 85,
        responseTime: 1000
      };

      monitoringService.setAlertThresholds(thresholds);
      
      // Mock high memory usage
      const mockMetrics = {
        memory: { percentage: 85 },
        cpu: { usage: 70 },
        disk: { percentage: 90 },
        responseTime: 1200
      };

      const alerts = await monitoringService.checkAlerts(mockMetrics);
      
      expect(Array.isArray(alerts)).toBe(true);
      
      // Should generate alerts for memory, disk, and response time
      const memoryAlert = alerts.find(alert => alert.type === 'memory');
      const diskAlert = alerts.find(alert => alert.type === 'disk');
      const responseTimeAlert = alerts.find(alert => alert.type === 'response_time');
      
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert?.severity).toBe('warning');
      expect(memoryAlert?.message).toContain('85%');
      
      expect(diskAlert).toBeDefined();
      expect(diskAlert?.severity).toBe('warning');
      
      expect(responseTimeAlert).toBeDefined();
      expect(responseTimeAlert?.severity).toBe('warning');
    });

    it('should support different alert severity levels', async () => {
      const thresholds = {
        memory: { warning: 70, critical: 90 },
        cpu: { warning: 75, critical: 95 },
        disk: { warning: 80, critical: 95 }
      };

      monitoringService.setAlertThresholds(thresholds);
      
      const criticalMetrics = {
        memory: { percentage: 95 },
        cpu: { usage: 98 },
        disk: { percentage: 85 }
      };

      const alerts = await monitoringService.checkAlerts(criticalMetrics);
      
      const memoryAlert = alerts.find(alert => alert.type === 'memory');
      const cpuAlert = alerts.find(alert => alert.type === 'cpu');
      const diskAlert = alerts.find(alert => alert.type === 'disk');
      
      expect(memoryAlert?.severity).toBe('critical');
      expect(cpuAlert?.severity).toBe('critical');
      expect(diskAlert?.severity).toBe('warning');
    });

    it('should include alert metadata and timestamps', async () => {
      const thresholds = { memory: 50 };
      monitoringService.setAlertThresholds(thresholds);
      
      const metrics = { memory: { percentage: 60 } };
      const alerts = await monitoringService.checkAlerts(metrics);
      
      if (alerts.length > 0) {
        const alert = alerts[0];
        expect(alert).toHaveProperty('id');
        expect(alert).toHaveProperty('timestamp');
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('value');
        expect(alert).toHaveProperty('threshold');
        expect(alert).toHaveProperty('acknowledged', false);
      }
    });

    it('should allow alert acknowledgment', async () => {
      const alertId = 'test-alert-123';
      
      await monitoringService.acknowledgeAlert(alertId);
      const acknowledgedAlert = await monitoringService.getAlert(alertId);
      
      expect(acknowledgedAlert?.acknowledged).toBe(true);
      expect(acknowledgedAlert?.acknowledgedAt).toBeDefined();
    });

    it('should support alert suppression', async () => {
      const thresholds = { memory: 50 };
      monitoringService.setAlertThresholds(thresholds);
      
      // Suppress memory alerts for 5 minutes
      monitoringService.suppressAlerts('memory', 5 * 60 * 1000);
      
      const metrics = { memory: { percentage: 80 } };
      const alerts = await monitoringService.checkAlerts(metrics);
      
      const memoryAlerts = alerts.filter(alert => alert.type === 'memory');
      expect(memoryAlerts).toHaveLength(0);
    });
  });

  describe('Metrics History Storage and Retrieval', () => {
    it('should store metrics history', async () => {
      const metrics = {
        timestamp: new Date().toISOString(),
        memory: { percentage: 75 },
        cpu: { usage: 60 }
      };

      await monitoringService.storeMetrics(metrics);
      
      const history = await monitoringService.getMetricsHistory('1h');
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should retrieve metrics history by time range', async () => {
      // Store some test metrics
      const now = new Date();
      const metrics1 = {
        timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
        memory: { percentage: 70 }
      };
      const metrics2 = {
        timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 min ago
        memory: { percentage: 80 }
      };

      await monitoringService.storeMetrics(metrics1);
      await monitoringService.storeMetrics(metrics2);

      const history1h = await monitoringService.getMetricsHistory('1h');
      const history6h = await monitoringService.getMetricsHistory('6h');
      
      expect(history1h.length).toBeGreaterThanOrEqual(2);
      expect(history6h.length).toBeGreaterThanOrEqual(history1h.length);
    });

    it('should support metrics aggregation', async () => {
      const aggregated = await monitoringService.getAggregatedMetrics('1h', 'average');
      
      expect(aggregated).toHaveProperty('memory');
      expect(aggregated).toHaveProperty('cpu');
      expect(aggregated).toHaveProperty('disk');
      expect(aggregated.memory).toHaveProperty('percentage');
      expect(typeof aggregated.memory.percentage).toBe('number');
    });

    it('should clean up old metrics data', async () => {
      const initialCount = (await monitoringService.getMetricsHistory('30d')).length;
      
      await monitoringService.cleanupOldMetrics(7); // Keep only 7 days
      
      const afterCleanupCount = (await monitoringService.getMetricsHistory('30d')).length;
      expect(afterCleanupCount).toBeLessThanOrEqual(initialCount);
    });

    it('should export metrics data', async () => {
      const exportData = await monitoringService.exportMetrics('1h', 'json');
      
      expect(exportData).toHaveProperty('format', 'json');
      expect(exportData).toHaveProperty('data');
      expect(exportData).toHaveProperty('metadata');
      expect(Array.isArray(exportData.data)).toBe(true);
      expect(exportData.metadata).toHaveProperty('timeRange');
      expect(exportData.metadata).toHaveProperty('recordCount');
    });
  });

  describe('Service Lifecycle', () => {
    it('should start monitoring service', async () => {
      await monitoringService.start();
      
      expect(monitoringService.isRunning()).toBe(true);
      expect(monitoringService.getStatus()).toHaveProperty('running', true);
      expect(monitoringService.getStatus()).toHaveProperty('startedAt');
    });

    it('should stop monitoring service', async () => {
      await monitoringService.start();
      await monitoringService.stop();
      
      expect(monitoringService.isRunning()).toBe(false);
      expect(monitoringService.getStatus()).toHaveProperty('running', false);
      expect(monitoringService.getStatus()).toHaveProperty('stoppedAt');
    });

    it('should collect metrics automatically when running', async () => {
      await monitoringService.start();
      
      // Wait for automatic collection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const history = await monitoringService.getMetricsHistory('1m');
      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle service errors gracefully', async () => {
      // Mock an error in metrics collection
      const originalGetSystemMetrics = monitoringService.getSystemMetrics;
      monitoringService.getSystemMetrics = vi.fn().mockRejectedValue(new Error('Test error'));
      
      await monitoringService.start();
      
      // Service should still be running despite errors
      expect(monitoringService.isRunning()).toBe(true);
      
      // Restore original method
      monitoringService.getSystemMetrics = originalGetSystemMetrics;
    });

    it('should provide service statistics', async () => {
      await monitoringService.start();
      
      const stats = monitoringService.getServiceStats();
      
      expect(stats).toHaveProperty('metricsCollected');
      expect(stats).toHaveProperty('alertsGenerated');
      expect(stats).toHaveProperty('errorsEncountered');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('lastCollection');
      
      expect(typeof stats.metricsCollected).toBe('number');
      expect(typeof stats.alertsGenerated).toBe('number');
      expect(typeof stats.errorsEncountered).toBe('number');
    });
  });
});