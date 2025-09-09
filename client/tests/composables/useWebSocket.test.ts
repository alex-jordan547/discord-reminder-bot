import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useWebSocket } from '@/composables/useWebSocket';
import type { WebSocketMessage } from '@/types';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
  }

  // Helper methods for testing
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    this.readyState = MockWebSocket.CLOSED;
    this.onerror?.(new Event('error'));
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

// Mock global WebSocket
const mockInstances: MockWebSocket[] = [];
const OriginalWebSocket = global.WebSocket;

global.WebSocket = class extends MockWebSocket {
  constructor(url: string) {
    super(url);
    mockInstances.push(this);
  }
} as any;

describe('useWebSocket', () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockInstances.length = 0; // Clear mock instances
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('WebSocket client with automatic reconnection', () => {
    it('should establish WebSocket connection', async () => {
      const { connect, connectionStatus, isConnected } = useWebSocket('ws://localhost:3000/ws');
      
      expect(connectionStatus.value.status).toBe('disconnected');
      expect(isConnected.value).toBe(false);
      
      connect();
      expect(connectionStatus.value.status).toBe('connecting');
      
      // Advance timers to trigger connection
      vi.advanceTimersByTime(100);
      await nextTick();
      
      expect(connectionStatus.value.status).toBe('connected');
      expect(isConnected.value).toBe(true);
    });

    it('should implement automatic reconnection on connection failure', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');
      
      connect();
      vi.advanceTimersByTime(100);
      await nextTick();
      
      // Simulate connection failure (not manual close)
      const ws = mockInstances[0];
      if (ws) {
        ws.simulateClose(1006, 'Connection lost'); // Abnormal closure
      }
      
      vi.advanceTimersByTime(100);
      await nextTick();
      
      expect(connectionStatus.value.status).toBe('reconnecting');
      expect(connectionStatus.value.reconnectAttempts).toBeGreaterThan(0);
    });

    it('should update connection status correctly', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');
      
      connect();
      expect(connectionStatus.value.status).toBe('connecting');
      
      vi.advanceTimersByTime(100);
      await nextTick();
      
      expect(connectionStatus.value.status).toBe('connected');
      expect(connectionStatus.value.lastConnected).toBeDefined();
    });
  });

  describe('Message handling system for different metric types', () => {
    it('should handle incoming messages correctly', async () => {
      const { connect, lastMessage } = useWebSocket('ws://localhost:3000/ws');
      
      connect();
      vi.advanceTimersByTime(100);
      await nextTick();
      
      const testMessage: WebSocketMessage = {
        type: 'metrics',
        data: { cpu: 50, memory: 75 },
        timestamp: new Date().toISOString()
      };
      
      // Simulate receiving a message
      const ws = mockInstances[0];
      if (ws) {
        ws.simulateMessage(testMessage);
      }
      
      await nextTick();
      expect(lastMessage.value).toEqual(testMessage);
    });

    it('should handle different message types with handlers', async () => {
      const { connect, onMessage } = useWebSocket('ws://localhost:3000/ws');
      const metricsHandler = vi.fn();
      const alertHandler = vi.fn();
      const activityHandler = vi.fn();
      
      onMessage('metrics', metricsHandler);
      onMessage('alert', alertHandler);
      onMessage('activity', activityHandler);
      
      connect();
      vi.advanceTimersByTime(100);
      await nextTick();
      
      const ws = mockInstances[0];
      if (ws) {
        ws.simulateMessage({ type: 'metrics', data: { cpu: 50 }, timestamp: new Date().toISOString() });
        ws.simulateMessage({ type: 'alert', data: { level: 'warning' }, timestamp: new Date().toISOString() });
        ws.simulateMessage({ type: 'activity', data: { action: 'login' }, timestamp: new Date().toISOString() });
      }
      
      await nextTick();
      
      expect(metricsHandler).toHaveBeenCalledWith({ cpu: 50 });
      expect(alertHandler).toHaveBeenCalledWith({ level: 'warning' });
      expect(activityHandler).toHaveBeenCalledWith({ action: 'login' });
    });
  });

  describe('Connection status indicators and error handling', () => {
    it('should show correct connection status indicators', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');
      
      connect();
      expect(connectionStatus.value.status).toBe('connecting');
      
      vi.advanceTimersByTime(100);
      await nextTick();
      
      expect(connectionStatus.value.status).toBe('connected');
    });

    it('should handle errors correctly', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');
      
      connect();
      vi.advanceTimersByTime(100);
      await nextTick();
      
      expect(connectionStatus.value.status).toBe('connected');
      
      // Simulate error
      const ws = mockInstances[0];
      if (ws) {
        ws.simulateError();
      }
      
      await nextTick();
      // After error, should immediately start reconnecting
      expect(connectionStatus.value.status).toBe('reconnecting');
      expect(connectionStatus.value.reconnectAttempts).toBeGreaterThan(0);
    });

    it('should track reconnection attempts', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');
      
      connect();
      vi.advanceTimersByTime(100);
      await nextTick();
      
      // Simulate connection failure
      const ws = mockInstances[0];
      if (ws) {
        ws.simulateClose(1006, 'Connection lost');
      }
      
      vi.advanceTimersByTime(100);
      await nextTick();
      
      expect(connectionStatus.value.reconnectAttempts).toBeGreaterThan(0);
    });
  });
});