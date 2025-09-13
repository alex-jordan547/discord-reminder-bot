import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOfflineQueue } from '@/composables/useOfflineQueue';

describe('useOfflineQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Setup Pinia
    setActivePinia(createPinia());

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
  });

  describe('Online/Offline Detection', () => {
    it('should detect initial online status', () => {
      const { isOnline } = useOfflineQueue();
      expect(isOnline.value).toBe(true);
    });

    it('should detect offline status', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { isOnline } = useOfflineQueue();
      expect(isOnline.value).toBe(false);
    });

    it('should listen for online/offline events', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      useOfflineQueue();

      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('should update status when going offline', () => {
      const { isOnline } = useOfflineQueue();

      expect(isOnline.value).toBe(true);

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      window.dispatchEvent(new Event('offline'));

      expect(isOnline.value).toBe(false);
    });

    it('should update status when going online', () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { isOnline } = useOfflineQueue();
      expect(isOnline.value).toBe(false);

      // Go online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      window.dispatchEvent(new Event('online'));

      expect(isOnline.value).toBe(true);
    });
  });

  describe('Queue Management', () => {
    it('should add operations to queue when offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, queueSize } = useOfflineQueue();

      const operation = {
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test', method: 'POST', body: { test: true } },
        timestamp: Date.now(),
      };

      queueOperation(operation);

      expect(queueSize.value).toBe(1);
    });

    it('should not queue operations when online', async () => {
      const { queueOperation, queueSize } = useOfflineQueue();

      const operation = {
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test', method: 'POST', body: { test: true } },
        timestamp: Date.now(),
      };

      await queueOperation(operation);

      expect(queueSize.value).toBe(0);
    });

    it('should execute operation immediately when online', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({ success: true });
      const { queueOperation, setExecutor } = useOfflineQueue();

      setExecutor(mockExecutor);

      const operation = {
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test', method: 'POST', body: { test: true } },
        timestamp: Date.now(),
      };

      await queueOperation(operation);

      expect(mockExecutor).toHaveBeenCalledWith(operation);
    });

    it('should persist queue to localStorage', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation } = useOfflineQueue();
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      const operation = {
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test' },
        timestamp: Date.now(),
      };

      queueOperation(operation);

      expect(setItemSpy).toHaveBeenCalledWith('offline-queue', expect.stringContaining('test-1'));
    });

    it('should load queue from localStorage on initialization', () => {
      const savedQueue = [
        {
          id: 'saved-1',
          type: 'api-call',
          data: { endpoint: '/api/saved' },
          timestamp: Date.now(),
        },
      ];

      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(savedQueue));

      const { queueSize, getQueue } = useOfflineQueue();

      expect(queueSize.value).toBe(1);
      expect(getQueue()).toEqual(savedQueue);
    });
  });

  describe('Queue Processing', () => {
    it('should process queue when going online', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({ success: true });

      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, setExecutor } = useOfflineQueue();
      setExecutor(mockExecutor);

      // Queue some operations
      await queueOperation({
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test1' },
        timestamp: Date.now(),
      });

      await queueOperation({
        id: 'test-2',
        type: 'api-call',
        data: { endpoint: '/api/test2' },
        timestamp: Date.now(),
      });

      // Go online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      window.dispatchEvent(new Event('online'));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });

    it('should process queue in chronological order', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({ success: true });
      const executionOrder: string[] = [];

      mockExecutor.mockImplementation(operation => {
        executionOrder.push(operation.id);
        return Promise.resolve({ success: true });
      });

      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, setExecutor } = useOfflineQueue();
      setExecutor(mockExecutor);

      // Queue operations with different timestamps
      await queueOperation({
        id: 'first',
        type: 'api-call',
        data: { endpoint: '/api/first' },
        timestamp: Date.now() - 1000,
      });

      await queueOperation({
        id: 'second',
        type: 'api-call',
        data: { endpoint: '/api/second' },
        timestamp: Date.now(),
      });

      // Go online and process
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      window.dispatchEvent(new Event('online'));
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(executionOrder).toEqual(['first', 'second']);
    });

    it('should handle failed operations', async () => {
      const mockExecutor = vi
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, setExecutor, getFailedOperations } = useOfflineQueue();
      setExecutor(mockExecutor);

      // Queue operations
      await queueOperation({
        id: 'success-1',
        type: 'api-call',
        data: { endpoint: '/api/success1' },
        timestamp: Date.now() - 2000,
      });

      await queueOperation({
        id: 'fail-1',
        type: 'api-call',
        data: { endpoint: '/api/fail' },
        timestamp: Date.now() - 1000,
      });

      await queueOperation({
        id: 'success-2',
        type: 'api-call',
        data: { endpoint: '/api/success2' },
        timestamp: Date.now(),
      });

      // Go online and process
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      window.dispatchEvent(new Event('online'));
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockExecutor).toHaveBeenCalledTimes(3);
      expect(getFailedOperations()).toHaveLength(1);
      expect(getFailedOperations()[0].id).toBe('fail-1');
    });

    it('should retry failed operations', async () => {
      const mockExecutor = vi
        .fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({ success: true });

      const { retryFailedOperations, setExecutor } = useOfflineQueue();
      setExecutor(mockExecutor);

      // Manually add a failed operation
      const failedOp = {
        id: 'retry-test',
        type: 'api-call',
        data: { endpoint: '/api/retry' },
        timestamp: Date.now(),
        retryCount: 1,
        lastError: 'First attempt failed',
      };

      await retryFailedOperations([failedOp]);

      expect(mockExecutor).toHaveBeenCalledWith(expect.objectContaining({ id: 'retry-test' }));
    });

    it('should limit retry attempts', async () => {
      const mockExecutor = vi.fn().mockRejectedValue(new Error('Always fails'));

      const { retryFailedOperations, setExecutor } = useOfflineQueue();
      setExecutor(mockExecutor);

      const failedOp = {
        id: 'max-retry-test',
        type: 'api-call',
        data: { endpoint: '/api/fail' },
        timestamp: Date.now(),
        retryCount: 3, // Already at max retries
        lastError: 'Previous error',
      };

      await retryFailedOperations([failedOp]);

      // Should not retry when at max attempts
      expect(mockExecutor).not.toHaveBeenCalled();
    });
  });

  describe('Queue Operations', () => {
    it('should clear queue', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, clearQueue, queueSize } = useOfflineQueue();

      queueOperation({
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test' },
        timestamp: Date.now(),
      });

      expect(queueSize.value).toBe(1);

      clearQueue();

      expect(queueSize.value).toBe(0);
    });

    it('should remove specific operation from queue', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, removeFromQueue, queueSize } = useOfflineQueue();

      queueOperation({
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test1' },
        timestamp: Date.now(),
      });

      queueOperation({
        id: 'test-2',
        type: 'api-call',
        data: { endpoint: '/api/test2' },
        timestamp: Date.now(),
      });

      expect(queueSize.value).toBe(2);

      removeFromQueue('test-1');

      expect(queueSize.value).toBe(1);
    });

    it('should get queue statistics', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, getQueueStats } = useOfflineQueue();

      queueOperation({
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test1' },
        timestamp: Date.now() - 5000,
      });

      queueOperation({
        id: 'test-2',
        type: 'database-sync',
        data: { table: 'users' },
        timestamp: Date.now(),
      });

      const stats = getQueueStats();

      expect(stats.total).toBe(2);
      expect(stats.byType['api-call']).toBe(1);
      expect(stats.byType['database-sync']).toBe(1);
      expect(stats.oldestTimestamp).toBeLessThan(Date.now());
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage full');
      });

      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation } = useOfflineQueue();

      expect(() => {
        queueOperation({
          id: 'test-1',
          type: 'api-call',
          data: { endpoint: '/api/test' },
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });

    it('should handle corrupted localStorage data', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('invalid-json');

      const { queueSize } = useOfflineQueue();

      expect(queueSize.value).toBe(0);
    });

    it('should handle missing executor gracefully', async () => {
      const { queueOperation } = useOfflineQueue();

      const operation = {
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test' },
        timestamp: Date.now(),
      };

      // Should not throw when no executor is set
      expect(async () => {
        await queueOperation(operation);
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should remove event listeners on cleanup', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { cleanup } = useOfflineQueue();
      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('should clear intervals on cleanup', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const { cleanup } = useOfflineQueue();
      cleanup();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const config = {
        maxRetries: 5,
        retryDelay: 2000,
        maxQueueSize: 50,
        persistQueue: false,
      };

      const { getConfig } = useOfflineQueue(config);

      expect(getConfig().maxRetries).toBe(5);
      expect(getConfig().retryDelay).toBe(2000);
      expect(getConfig().maxQueueSize).toBe(50);
      expect(getConfig().persistQueue).toBe(false);
    });

    it('should use default configuration when not provided', () => {
      const { getConfig } = useOfflineQueue();

      expect(getConfig().maxRetries).toBe(3);
      expect(getConfig().retryDelay).toBe(1000);
      expect(getConfig().maxQueueSize).toBe(100);
      expect(getConfig().persistQueue).toBe(true);
    });

    it('should respect maxQueueSize limit', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const { queueOperation, queueSize } = useOfflineQueue({ maxQueueSize: 2 });

      queueOperation({
        id: 'test-1',
        type: 'api-call',
        data: { endpoint: '/api/test1' },
        timestamp: Date.now(),
      });

      queueOperation({
        id: 'test-2',
        type: 'api-call',
        data: { endpoint: '/api/test2' },
        timestamp: Date.now(),
      });

      queueOperation({
        id: 'test-3',
        type: 'api-call',
        data: { endpoint: '/api/test3' },
        timestamp: Date.now(),
      });

      expect(queueSize.value).toBe(2); // Should not exceed maxQueueSize
    });
  });
});
