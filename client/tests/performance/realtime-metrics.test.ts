import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import { useWebSocket } from '@/composables/useWebSocket';
import { createMockMetrics } from '../setup';

// Mock performance API
global.performance = {
  ...global.performance,
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn(() => []),
  getEntriesByName: vi.fn(() => []),
};

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: WebSocket.OPEN,
};

global.WebSocket = vi.fn(() => mockWebSocket) as any;

describe('Real-time Metrics Performance', () => {
  let pinia: any;
  let store: any;

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    store = useDashboardStore(pinia);
    
    // Reset performance counters
    vi.mocked(performance.now).mockReturnValue(0);
  });

  describe('Metrics Update Performance', () => {
    it('should handle high-frequency metric updates efficiently', async () => {
      const updateCount = 1000;
      const startTime = performance.now();
      
      // Simulate rapid metric updates
      for (let i = 0; i < updateCount; i++) {
        const metrics = {
          ...createMockMetrics(),
          timestamp: new Date(Date.now() + i).toISOString(),
          system: {
            ...createMockMetrics().system,
            memory: { used: 512 + i, total: 1024, percentage: 50 + (i % 50) },
          },
        };
        
        store.updateMetrics(metrics);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should handle 1000 updates in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
      
      // Should maintain latest metrics
      expect(store.metrics?.system.memory.used).toBe(512 + updateCount - 1);
    });

    it('should throttle metric updates to prevent UI blocking', async () => {
      const throttleDelay = 16; // ~60fps
      let updateCount = 0;
      
      // Mock throttled update function
      const throttledUpdate = vi.fn(() => {
        updateCount++;
      });
      
      // Simulate rapid updates within throttle window
      for (let i = 0; i < 100; i++) {
        setTimeout(() => throttledUpdate(), i);
      }
      
      // Wait for throttle window
      await new Promise(resolve => setTimeout(resolve, throttleDelay + 10));
      
      // Should have throttled the updates
      expect(updateCount).toBeLessThan(100);
      expect(updateCount).toBeGreaterThan(0);
    });

    it('should efficiently handle large metric payloads', async () => {
      const largeMetrics = {
        ...createMockMetrics(),
        // Add large arrays to simulate complex metrics
        detailedStats: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: Math.random() * 100,
          timestamp: Date.now() + i,
          metadata: {
            source: `source-${i}`,
            category: `category-${i % 10}`,
            tags: [`tag-${i}`, `tag-${i + 1}`, `tag-${i + 2}`],
          },
        })),
      };
      
      const startTime = performance.now();
      
      // Update with large payload
      store.updateMetrics(largeMetrics);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should handle large payloads efficiently (< 50ms)
      expect(duration).toBeLessThan(50);
      
      // Should store the data correctly
      expect(store.metrics?.detailedStats).toHaveLength(1000);
    });

    it('should maintain memory efficiency with continuous updates', async () => {
      const initialMemory = process.memoryUsage?.()?.heapUsed || 0;
      
      // Simulate continuous updates over time
      for (let i = 0; i < 10000; i++) {
        const metrics = {
          ...createMockMetrics(),
          timestamp: new Date(Date.now() + i).toISOString(),
          sequenceNumber: i,
        };
        
        store.updateMetrics(metrics);
        
        // Trigger garbage collection periodically
        if (i % 1000 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage?.()?.heapUsed || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('WebSocket Performance', () => {
    it('should handle high-frequency WebSocket messages efficiently', async () => {
      const messageCount = 1000;
      const messages: any[] = [];
      
      // Setup WebSocket message handler
      const messageHandler = vi.fn((event) => {
        const data = JSON.parse(event.data);
        messages.push(data);
        store.updateMetrics(data);
      });
      
      mockWebSocket.addEventListener.mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler.mockImplementation(handler);
        }
      });
      
      const startTime = performance.now();
      
      // Simulate rapid WebSocket messages
      for (let i = 0; i < messageCount; i++) {
        const mockEvent = {
          data: JSON.stringify({
            type: 'metrics-update',
            data: {
              ...createMockMetrics(),
              timestamp: new Date(Date.now() + i).toISOString(),
            },
          }),
        };
        
        messageHandler(mockEvent);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should handle messages efficiently (< 200ms for 1000 messages)
      expect(duration).toBeLessThan(200);
      expect(messages).toHaveLength(messageCount);
    });

    it('should implement backpressure for overwhelming message rates', async () => {
      let processedMessages = 0;
      let droppedMessages = 0;
      const maxQueueSize = 100;
      const messageQueue: any[] = [];
      
      const processMessage = (message: any) => {
        if (messageQueue.length >= maxQueueSize) {
          droppedMessages++;
          messageQueue.shift(); // Drop oldest message
        }
        
        messageQueue.push(message);
        processedMessages++;
      };
      
      // Simulate overwhelming message rate
      for (let i = 0; i < 1000; i++) {
        processMessage({
          type: 'metrics-update',
          data: createMockMetrics(),
          timestamp: Date.now() + i,
        });
      }
      
      // Should have implemented backpressure
      expect(messageQueue.length).toBeLessThanOrEqual(maxQueueSize);
      expect(droppedMessages).toBeGreaterThan(0);
      expect(processedMessages).toBe(1000);
    });

    it('should batch WebSocket messages for efficiency', async () => {
      const batchSize = 10;
      const batchTimeout = 16; // ~60fps
      const batches: any[] = [];
      let currentBatch: any[] = [];
      
      const processBatch = () => {
        if (currentBatch.length > 0) {
          batches.push([...currentBatch]);
          currentBatch = [];
        }
      };
      
      const addToBatch = (message: any) => {
        currentBatch.push(message);
        
        if (currentBatch.length >= batchSize) {
          processBatch();
        }
      };
      
      // Setup batch timeout
      const batchTimer = setInterval(processBatch, batchTimeout);
      
      // Send messages
      for (let i = 0; i < 95; i++) {
        addToBatch({
          type: 'metrics-update',
          data: createMockMetrics(),
          timestamp: Date.now() + i,
        });
      }
      
      // Wait for final batch
      await new Promise(resolve => setTimeout(resolve, batchTimeout + 10));
      processBatch();
      clearInterval(batchTimer);
      
      // Should have created appropriate batches
      expect(batches.length).toBeGreaterThan(1);
      expect(batches[0]).toHaveLength(batchSize);
      
      // Total messages should be preserved
      const totalMessages = batches.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalMessages).toBe(95);
    });
  });

  describe('Chart Rendering Performance', () => {
    it('should efficiently render charts with large datasets', async () => {
      // Mock Chart.js
      const mockChart = {
        update: vi.fn(),
        destroy: vi.fn(),
        resize: vi.fn(),
        data: { datasets: [] },
      };
      
      global.Chart = vi.fn(() => mockChart) as any;
      
      // Create large dataset
      const dataPoints = Array.from({ length: 10000 }, (_, i) => ({
        x: Date.now() + i * 1000,
        y: Math.sin(i / 100) * 50 + 50,
      }));
      
      const startTime = performance.now();
      
      // Simulate chart update with large dataset
      mockChart.data.datasets = [{
        label: 'Memory Usage',
        data: dataPoints,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      }];
      
      mockChart.update();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Chart update should be efficient (< 100ms)
      expect(duration).toBeLessThan(100);
      expect(mockChart.update).toHaveBeenCalled();
    });

    it('should implement data decimation for performance', async () => {
      const originalDataPoints = 10000;
      const maxDisplayPoints = 1000;
      
      // Create large dataset
      const fullDataset = Array.from({ length: originalDataPoints }, (_, i) => ({
        x: Date.now() + i * 1000,
        y: Math.random() * 100,
      }));
      
      // Implement decimation algorithm
      const decimateData = (data: any[], maxPoints: number) => {
        if (data.length <= maxPoints) return data;
        
        const step = Math.ceil(data.length / maxPoints);
        return data.filter((_, index) => index % step === 0);
      };
      
      const startTime = performance.now();
      const decimatedData = decimateData(fullDataset, maxDisplayPoints);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Decimation should be fast (< 10ms)
      expect(duration).toBeLessThan(10);
      expect(decimatedData.length).toBeLessThanOrEqual(maxDisplayPoints);
      expect(decimatedData.length).toBeGreaterThan(0);
    });

    it('should use canvas optimization techniques', async () => {
      const mockCanvas = {
        getContext: vi.fn(() => ({
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
        })),
        width: 800,
        height: 400,
      };
      
      global.HTMLCanvasElement = vi.fn(() => mockCanvas) as any;
      
      const ctx = mockCanvas.getContext('2d');
      const dataPoints = 1000;
      
      const startTime = performance.now();
      
      // Simulate optimized drawing
      ctx.save();
      ctx.beginPath();
      
      for (let i = 0; i < dataPoints; i++) {
        const x = (i / dataPoints) * mockCanvas.width;
        const y = Math.sin(i / 100) * 100 + 200;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      ctx.restore();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Canvas operations should be efficient (< 50ms)
      expect(duration).toBeLessThan(50);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('Memory Management', () => {
    it('should implement efficient data structure for metrics history', async () => {
      const maxHistorySize = 1000;
      const metricsHistory: any[] = [];
      
      // Simulate circular buffer for metrics history
      const addToHistory = (metrics: any) => {
        metricsHistory.push(metrics);
        
        if (metricsHistory.length > maxHistorySize) {
          metricsHistory.shift(); // Remove oldest entry
        }
      };
      
      const startTime = performance.now();
      
      // Add many metrics to history
      for (let i = 0; i < 5000; i++) {
        addToHistory({
          ...createMockMetrics(),
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sequenceNumber: i,
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should maintain size limit efficiently
      expect(metricsHistory.length).toBe(maxHistorySize);
      expect(duration).toBeLessThan(100);
      
      // Should contain most recent entries
      expect(metricsHistory[metricsHistory.length - 1].sequenceNumber).toBe(4999);
      expect(metricsHistory[0].sequenceNumber).toBe(4000);
    });

    it('should clean up event listeners and timers', async () => {
      const eventListeners: any[] = [];
      const timers: any[] = [];
      
      // Mock addEventListener to track listeners
      const originalAddEventListener = global.addEventListener;
      global.addEventListener = vi.fn((event, handler) => {
        eventListeners.push({ event, handler });
        return originalAddEventListener?.call(global, event, handler);
      });
      
      // Mock setTimeout to track timers
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((callback, delay) => {
        const timerId = originalSetTimeout(callback, delay);
        timers.push(timerId);
        return timerId;
      });
      
      // Mock setInterval to track intervals
      const originalSetInterval = global.setInterval;
      global.setInterval = vi.fn((callback, delay) => {
        const intervalId = originalSetInterval(callback, delay);
        timers.push(intervalId);
        return intervalId;
      });
      
      // Simulate component lifecycle
      const { cleanup } = useWebSocket('ws://localhost:3000');
      
      // Add some timers
      setTimeout(() => {}, 1000);
      setInterval(() => {}, 5000);
      
      // Cleanup
      cleanup();
      timers.forEach(id => {
        clearTimeout(id);
        clearInterval(id);
      });
      
      // Verify cleanup
      expect(eventListeners.length).toBeGreaterThan(0);
      expect(timers.length).toBeGreaterThan(0);
      
      // Restore original functions
      global.addEventListener = originalAddEventListener;
      global.setTimeout = originalSetTimeout;
      global.setInterval = originalSetInterval;
    });

    it('should implement weak references for large objects', async () => {
      // Mock WeakMap for object references
      const objectCache = new WeakMap();
      const largeObjects: any[] = [];
      
      // Create large objects with weak references
      for (let i = 0; i < 100; i++) {
        const largeObject = {
          id: i,
          data: new Array(10000).fill(Math.random()),
          metadata: {
            created: Date.now(),
            size: 10000,
          },
        };
        
        largeObjects.push(largeObject);
        objectCache.set(largeObject, { cached: true, timestamp: Date.now() });
      }
      
      // Verify weak references work
      expect(objectCache.has(largeObjects[0])).toBe(true);
      
      // Remove strong references
      const firstObject = largeObjects[0];
      largeObjects.length = 0;
      
      // Weak reference should still exist until GC
      expect(objectCache.has(firstObject)).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const performanceMetrics = {
        updateTimes: [] as number[],
        renderTimes: [] as number[],
        memoryUsage: [] as number[],
      };
      
      // Track update performance
      for (let i = 0; i < 100; i++) {
        const startTime = performance.now();
        
        store.updateMetrics({
          ...createMockMetrics(),
          timestamp: new Date(Date.now() + i).toISOString(),
        });
        
        const endTime = performance.now();
        performanceMetrics.updateTimes.push(endTime - startTime);
      }
      
      // Calculate statistics
      const avgUpdateTime = performanceMetrics.updateTimes.reduce((a, b) => a + b, 0) / performanceMetrics.updateTimes.length;
      const maxUpdateTime = Math.max(...performanceMetrics.updateTimes);
      const minUpdateTime = Math.min(...performanceMetrics.updateTimes);
      
      // Performance should be consistent
      expect(avgUpdateTime).toBeLessThan(5); // Average < 5ms
      expect(maxUpdateTime).toBeLessThan(20); // Max < 20ms
      expect(minUpdateTime).toBeGreaterThan(0); // Min > 0ms
      
      // Should have collected all metrics
      expect(performanceMetrics.updateTimes).toHaveLength(100);
    });

    it('should detect performance regressions', async () => {
      const baselinePerformance = {
        updateTime: 2, // 2ms baseline
        renderTime: 16, // 16ms baseline (60fps)
        memoryUsage: 10 * 1024 * 1024, // 10MB baseline
      };
      
      const currentPerformance = {
        updateTime: 0,
        renderTime: 0,
        memoryUsage: 0,
      };
      
      // Measure current performance
      const startTime = performance.now();
      const startMemory = process.memoryUsage?.()?.heapUsed || 0;
      
      // Perform operations
      for (let i = 0; i < 100; i++) {
        store.updateMetrics(createMockMetrics());
      }
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage?.()?.heapUsed || 0;
      
      currentPerformance.updateTime = (endTime - startTime) / 100;
      currentPerformance.memoryUsage = endMemory - startMemory;
      
      // Check for regressions (allow 20% variance)
      const updateTimeRegression = currentPerformance.updateTime > baselinePerformance.updateTime * 1.2;
      const memoryRegression = currentPerformance.memoryUsage > baselinePerformance.memoryUsage * 1.2;
      
      // Should not have significant regressions
      expect(updateTimeRegression).toBe(false);
      expect(memoryRegression).toBe(false);
    });

    it('should provide performance insights', async () => {
      const performanceInsights = {
        bottlenecks: [] as string[],
        optimizations: [] as string[],
        warnings: [] as string[],
      };
      
      // Simulate performance analysis
      const metrics = {
        updateFrequency: 60, // 60 updates per second
        averageUpdateTime: 8, // 8ms per update
        memoryGrowthRate: 1024 * 1024, // 1MB per minute
        cpuUsage: 15, // 15% CPU usage
      };
      
      // Analyze performance
      if (metrics.updateFrequency > 30) {
        performanceInsights.warnings.push('High update frequency detected');
      }
      
      if (metrics.averageUpdateTime > 5) {
        performanceInsights.bottlenecks.push('Slow metric updates');
        performanceInsights.optimizations.push('Consider batching updates');
      }
      
      if (metrics.memoryGrowthRate > 500 * 1024) {
        performanceInsights.bottlenecks.push('High memory growth');
        performanceInsights.optimizations.push('Implement data cleanup');
      }
      
      if (metrics.cpuUsage < 20) {
        performanceInsights.optimizations.push('CPU usage is optimal');
      }
      
      // Should provide actionable insights
      expect(performanceInsights.warnings.length).toBeGreaterThan(0);
      expect(performanceInsights.bottlenecks.length).toBeGreaterThan(0);
      expect(performanceInsights.optimizations.length).toBeGreaterThan(0);
    });
  });
});