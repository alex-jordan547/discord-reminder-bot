/**
 * Offline Queue Composable
 * =========================
 * Vue 3 composable for offline detection and queue management for pending operations.
 * Automatically queues API calls when offline and processes them when connection returns.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';

// Optional notifications - will be undefined if Pinia is not available
let useNotifications: (() => any) | undefined;
try {
  useNotifications = require('./useNotifications').useNotifications;
} catch {
  // Notifications not available
}

export interface QueuedOperation {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  headers?: Record<string, string>;
  timestamp: Date;
  retries: number;
  maxRetries: number;
  priority: 'low' | 'normal' | 'high';
}

export interface OfflineQueueOptions {
  maxQueueSize: number;
  storageKey: string;
  syncInterval: number;
  maxRetries: number;
}

const DEFAULT_OPTIONS: OfflineQueueOptions = {
  maxQueueSize: 100,
  storageKey: 'offline-queue',
  syncInterval: 5000,
  maxRetries: 3,
};

export function useOfflineQueue(options: Partial<OfflineQueueOptions> = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Optional notifications support
  let addNotification: ((notification: any) => void) | undefined;
  try {
    if (useNotifications) {
      const notifications = useNotifications();
      addNotification = notifications.addNotification;
    }
  } catch {
    // Notifications not available, will use console.log instead
  }

  // State
  const isOnline = ref(navigator.onLine);
  const queue = ref<QueuedOperation[]>([]);
  const isProcessing = ref(false);
  const processingProgress = ref(0);

  let syncInterval: NodeJS.Timeout | null = null;
  let connectivityCheckInterval: NodeJS.Timeout | null = null;

  // Computed
  const queueSize = computed(() => queue.value.length);
  const hasQueuedOperations = computed(() => queue.value.length > 0);
  const highPriorityCount = computed(() => queue.value.filter(op => op.priority === 'high').length);

  /**
   * Generate unique ID for queued operations
   */
  function generateId(): string {
    return `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load queue from localStorage
   */
  function loadQueue() {
    try {
      const stored = localStorage.getItem(config.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        queue.value = parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      }
    } catch (error) {
      console.warn('Failed to load offline queue:', error);
      queue.value = [];
    }
  }

  /**
   * Save queue to localStorage
   */
  function saveQueue() {
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(queue.value));
    } catch (error) {
      console.warn('Failed to save offline queue:', error);
    }
  }

  /**
   * Add operation to queue
   */
  function queueOperation(
    operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>,
  ): QueuedOperation {
    const queuedOp: QueuedOperation = {
      id: generateId(),
      timestamp: new Date(),
      retries: 0,
      maxRetries: config.maxRetries,
      ...operation,
    };

    // Check queue size limit
    if (queue.value.length >= config.maxQueueSize) {
      // Remove oldest low-priority operation
      const lowPriorityIndex = queue.value.findIndex(op => op.priority === 'low');
      if (lowPriorityIndex > -1) {
        queue.value.splice(lowPriorityIndex, 1);
      } else {
        // Remove oldest operation
        queue.value.shift();
      }
    }

    // Add to queue with priority sorting
    queue.value.push(queuedOp);
    sortQueueByPriority();
    saveQueue();

    // Notify user about queued operation
    if (addNotification) {
      addNotification({
        type: 'info',
        title: 'Operation Queued',
        message: `${operation.method} ${operation.url} queued for when connection returns`,
        duration: 3000,
      });
    } else {
      console.log(`Operation queued: ${operation.method} ${operation.url}`);
    }

    return queuedOp;
  }

  /**
   * Sort queue by priority (high > normal > low) and timestamp
   */
  function sortQueueByPriority() {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    queue.value.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }

  /**
   * Remove operation from queue
   */
  function removeFromQueue(operationId: string) {
    const index = queue.value.findIndex(op => op.id === operationId);
    if (index > -1) {
      queue.value.splice(index, 1);
      saveQueue();
    }
  }

  /**
   * Process a single queued operation
   */
  async function processOperation(operation: QueuedOperation): Promise<boolean> {
    try {
      const response = await fetch(operation.url, {
        method: operation.method,
        headers: {
          'Content-Type': 'application/json',
          ...operation.headers,
        },
        body: operation.data ? JSON.stringify(operation.data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Operation successful
      removeFromQueue(operation.id);
      return true;
    } catch (error) {
      console.warn(`Failed to process operation ${operation.id}:`, error);

      operation.retries++;
      if (operation.retries >= operation.maxRetries) {
        // Remove failed operation after max retries
        removeFromQueue(operation.id);

        if (addNotification) {
          addNotification({
            type: 'error',
            title: 'Operation Failed',
            message: `${operation.method} ${operation.url} failed after ${operation.maxRetries} attempts`,
            persistent: true,
          });
        } else {
          console.error(`Operation failed: ${operation.method} ${operation.url}`);
        }

        return false;
      }

      // Will retry in next processing cycle
      saveQueue();
      return false;
    }
  }

  /**
   * Process all queued operations
   */
  async function processQueue() {
    if (!isOnline.value || isProcessing.value || queue.value.length === 0) {
      return;
    }

    isProcessing.value = true;
    processingProgress.value = 0;

    const totalOperations = queue.value.length;
    let processedCount = 0;

    if (addNotification) {
      addNotification({
        type: 'info',
        title: 'Syncing Operations',
        message: `Processing ${totalOperations} queued operations...`,
        duration: 3000,
      });
    } else {
      console.log(`Processing ${totalOperations} queued operations...`);
    }

    // Process operations in batches to avoid overwhelming the server
    const batchSize = 3;
    const operations = [...queue.value]; // Copy to avoid mutation during processing

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);

      // Process batch in parallel
      await Promise.all(
        batch.map(async operation => {
          const success = await processOperation(operation);
          if (success) {
            processedCount++;
          }
          processingProgress.value = (processedCount / totalOperations) * 100;
        }),
      );

      // Small delay between batches
      if (i + batchSize < operations.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const successCount = processedCount;
    const failedCount = totalOperations - successCount;

    if (successCount > 0) {
      if (addNotification) {
        addNotification({
          type: 'success',
          title: 'Sync Complete',
          message: `${successCount} operations completed successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
          duration: 5000,
        });
      } else {
        console.log(
          `Sync complete: ${successCount} operations completed successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        );
      }
    }

    isProcessing.value = false;
    processingProgress.value = 0;
  }

  /**
   * Enhanced connectivity check that tests actual API reachability
   */
  async function checkConnectivity(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      // Test with a lightweight endpoint
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Handle online status change
   */
  function handleOnlineStatusChange(online: boolean) {
    const wasOnline = isOnline.value;
    isOnline.value = online;

    if (online && !wasOnline) {
      if (addNotification) {
        addNotification({
          type: 'success',
          title: 'Connection Restored',
          message: hasQueuedOperations.value
            ? `${queueSize.value} operations will be processed automatically`
            : 'All systems online',
          duration: 3000,
        });
      } else {
        console.log('Connection restored');
      }

      // Process queue when coming back online
      setTimeout(() => processQueue(), 1000);
    } else if (!online && wasOnline) {
      if (addNotification) {
        addNotification({
          type: 'warning',
          title: 'Connection Lost',
          message: 'Operations will be queued until connection returns',
          duration: 5000,
        });
      } else {
        console.log('Connection lost');
      }
    }
  }

  /**
   * Periodic connectivity and queue processing
   */
  function startSyncInterval() {
    if (syncInterval) return;

    syncInterval = setInterval(async () => {
      // Check actual connectivity
      const actuallyOnline = await checkConnectivity();

      if (actuallyOnline !== isOnline.value) {
        handleOnlineStatusChange(actuallyOnline);
      }

      // Process queue if online
      if (actuallyOnline && hasQueuedOperations.value) {
        await processQueue();
      }
    }, config.syncInterval);
  }

  /**
   * Stop sync interval
   */
  function stopSyncInterval() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }

  /**
   * Enhanced fetch wrapper that automatically handles offline queuing
   */
  async function queuedFetch(
    url: string,
    options: RequestInit & { priority?: QueuedOperation['priority'] } = {},
  ): Promise<Response> {
    const { priority = 'normal', ...fetchOptions } = options;

    // If offline, queue the operation
    if (!isOnline.value) {
      const operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'> = {
        url,
        method: (fetchOptions.method as any) || 'GET',
        data: fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined,
        headers: fetchOptions.headers as Record<string, string>,
        maxRetries: config.maxRetries,
        priority,
      };

      queueOperation(operation);

      // Return a rejected promise to indicate the request was queued
      return Promise.reject(new Error('Request queued - device is offline'));
    }

    // If online, make the request normally
    return fetch(url, fetchOptions);
  }

  /**
   * Clear all queued operations
   */
  function clearQueue() {
    queue.value = [];
    saveQueue();

    if (addNotification) {
      addNotification({
        type: 'info',
        title: 'Queue Cleared',
        message: 'All queued operations have been cleared',
        duration: 3000,
      });
    } else {
      console.log('Queue cleared');
    }
  }

  /**
   * Get queue statistics
   */
  function getQueueStats() {
    const stats = {
      total: queue.value.length,
      byPriority: {
        high: queue.value.filter(op => op.priority === 'high').length,
        normal: queue.value.filter(op => op.priority === 'normal').length,
        low: queue.value.filter(op => op.priority === 'low').length,
      },
      byMethod: queue.value.reduce(
        (acc, op) => {
          acc[op.method] = (acc[op.method] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      oldestOperation:
        queue.value.length > 0 ? Math.min(...queue.value.map(op => op.timestamp.getTime())) : null,
    };

    return stats;
  }

  // Lifecycle
  onMounted(() => {
    loadQueue();

    // Add event listeners
    window.addEventListener('online', () => handleOnlineStatusChange(true));
    window.addEventListener('offline', () => handleOnlineStatusChange(false));

    // Start sync interval
    startSyncInterval();

    // Initial connectivity check
    checkConnectivity().then(online => {
      if (online !== isOnline.value) {
        handleOnlineStatusChange(online);
      }
    });
  });

  onUnmounted(() => {
    // Remove event listeners
    window.removeEventListener('online', () => handleOnlineStatusChange(true));
    window.removeEventListener('offline', () => handleOnlineStatusChange(false));

    // Stop intervals
    stopSyncInterval();

    // Save queue
    saveQueue();
  });

  return {
    // State
    isOnline: readonly(isOnline),
    queue: readonly(queue),
    isProcessing: readonly(isProcessing),
    processingProgress: readonly(processingProgress),

    // Computed
    queueSize,
    hasQueuedOperations,
    highPriorityCount,

    // Methods
    queueOperation,
    processQueue,
    queuedFetch,
    clearQueue,
    checkConnectivity,
    getQueueStats,
    removeFromQueue,
  };
}
