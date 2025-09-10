import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useWebSocket } from '@/composables/useWebSocket';
import type { WebSocketMessage } from '@/types';

// Integration tests for WebSocket communication using Vite test environment
describe('WebSocket Integration Tests', () => {
  let mockWebSocket: any;
  let mockInstances: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockInstances.length = 0;

    // Mock WebSocket for integration testing
    global.WebSocket = vi.fn().mockImplementation((url: string) => {
      const instance = {
        url,
        readyState: 0, // CONNECTING
        onopen: null as ((event: Event) => void) | null,
        onclose: null as ((event: CloseEvent) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onmessage: null as ((event: MessageEvent) => void) | null,

        send: vi.fn(),
        close: vi.fn(),

        // Test helpers
        simulateOpen() {
          this.readyState = 1; // OPEN
          this.onopen?.(new Event('open'));
        },

        simulateMessage(data: any) {
          this.onmessage?.(
            new MessageEvent('message', {
              data: JSON.stringify(data),
            }),
          );
        },

        simulateClose(code = 1000, reason = '') {
          this.readyState = 3; // CLOSED
          this.onclose?.(new CloseEvent('close', { code, reason }));
        },

        simulateError() {
          this.readyState = 3; // CLOSED
          this.onerror?.(new Event('error'));
        },
      };

      mockInstances.push(instance);

      // Simulate async connection
      setTimeout(() => {
        instance.simulateOpen();
      }, 10);

      return instance;
    }) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('End-to-End WebSocket Communication', () => {
    it('should establish connection and handle complete message flow', async () => {
      const { connect, disconnect, send, connectionStatus, lastMessage, isConnected, onMessage } =
        useWebSocket('ws://localhost:3000/ws');

      // Track message handlers
      const metricsReceived: any[] = [];
      const alertsReceived: any[] = [];

      onMessage('metrics', data => metricsReceived.push(data));
      onMessage('alert', data => alertsReceived.push(data));

      // Initial state
      expect(isConnected.value).toBe(false);
      expect(connectionStatus.value.status).toBe('disconnected');

      // Connect
      connect();
      expect(connectionStatus.value.status).toBe('connecting');

      // Wait for connection
      vi.advanceTimersByTime(100);
      await nextTick();

      expect(isConnected.value).toBe(true);
      expect(connectionStatus.value.status).toBe('connected');
      expect(connectionStatus.value.lastConnected).toBeDefined();

      // Send message
      const outgoingMessage: WebSocketMessage = {
        type: 'metrics',
        data: { request: 'system-metrics' },
        timestamp: new Date().toISOString(),
      };

      send(outgoingMessage);
      expect(mockInstances[0].send).toHaveBeenCalledWith(JSON.stringify(outgoingMessage));

      // Receive metrics response
      const metricsResponse = {
        type: 'metrics',
        data: { cpu: 45, memory: 60, disk: 30 },
        timestamp: new Date().toISOString(),
      };

      mockInstances[0].simulateMessage(metricsResponse);
      await nextTick();

      expect(lastMessage.value).toEqual(metricsResponse);
      expect(metricsReceived).toHaveLength(1);
      expect(metricsReceived[0]).toEqual(metricsResponse.data);

      // Receive alert
      const alertMessage = {
        type: 'alert',
        data: {
          level: 'warning',
          message: 'High CPU usage detected',
          threshold: 80,
          current: 85,
        },
        timestamp: new Date().toISOString(),
      };

      mockInstances[0].simulateMessage(alertMessage);
      await nextTick();

      expect(alertsReceived).toHaveLength(1);
      expect(alertsReceived[0]).toEqual(alertMessage.data);

      // Disconnect
      disconnect();
      expect(connectionStatus.value.status).toBe('disconnected');
      expect(isConnected.value).toBe(false);
    });

    it('should handle connection failures and automatic reconnection', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');

      connect();
      vi.advanceTimersByTime(100);
      await nextTick();

      expect(connectionStatus.value.status).toBe('connected');
      expect(connectionStatus.value.reconnectAttempts).toBe(0);

      // Simulate unexpected disconnection
      mockInstances[0].simulateClose(1006, 'Connection lost');
      vi.advanceTimersByTime(100);
      await nextTick();

      expect(connectionStatus.value.status).toBe('reconnecting');
      expect(connectionStatus.value.reconnectAttempts).toBe(1);

      // Simulate reconnection success
      vi.advanceTimersByTime(1100); // Wait for reconnect delay
      await nextTick();

      expect(connectionStatus.value.status).toBe('connected');
      expect(connectionStatus.value.reconnectAttempts).toBe(0); // Reset on successful connection
    });

    it('should handle multiple message types in sequence', async () => {
      const { connect, onMessage } = useWebSocket('ws://localhost:3000/ws');

      const receivedMessages: { type: string; data: any }[] = [];

      onMessage('metrics', data => receivedMessages.push({ type: 'metrics', data }));
      onMessage('alert', data => receivedMessages.push({ type: 'alert', data }));
      onMessage('activity', data => receivedMessages.push({ type: 'activity', data }));
      onMessage('config', data => receivedMessages.push({ type: 'config', data }));

      connect();
      vi.advanceTimersByTime(100);
      await nextTick();

      // Send sequence of different message types
      const messages = [
        { type: 'metrics', data: { cpu: 30 }, timestamp: new Date().toISOString() },
        {
          type: 'alert',
          data: { level: 'info', message: 'System healthy' },
          timestamp: new Date().toISOString(),
        },
        {
          type: 'activity',
          data: { user: 'admin', action: 'login' },
          timestamp: new Date().toISOString(),
        },
        {
          type: 'config',
          data: { theme: 'dark', refreshInterval: 5000 },
          timestamp: new Date().toISOString(),
        },
      ];

      for (const message of messages) {
        mockInstances[0].simulateMessage(message);
        await nextTick();
      }

      expect(receivedMessages).toHaveLength(4);
      expect(receivedMessages[0]).toEqual({ type: 'metrics', data: { cpu: 30 } });
      expect(receivedMessages[1]).toEqual({
        type: 'alert',
        data: { level: 'info', message: 'System healthy' },
      });
      expect(receivedMessages[2]).toEqual({
        type: 'activity',
        data: { user: 'admin', action: 'login' },
      });
      expect(receivedMessages[3]).toEqual({
        type: 'config',
        data: { theme: 'dark', refreshInterval: 5000 },
      });
    });

    it('should handle error scenarios gracefully', async () => {
      const { connect, connectionStatus } = useWebSocket('ws://localhost:3000/ws');

      connect();
      vi.advanceTimersByTime(100);
      await nextTick();

      expect(connectionStatus.value.status).toBe('connected');

      // Simulate WebSocket error
      mockInstances[0].simulateError();
      await nextTick();

      // After error, should immediately start reconnecting
      expect(connectionStatus.value.status).toBe('reconnecting');
      expect(connectionStatus.value.reconnectAttempts).toBeGreaterThan(0);

      // Should attempt reconnection after error
      vi.advanceTimersByTime(1100);
      await nextTick();

      expect(connectionStatus.value.status).toBe('connected');
    });

    it('should handle malformed messages gracefully', async () => {
      const { connect, lastMessage } = useWebSocket('ws://localhost:3000/ws');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      connect();
      vi.advanceTimersByTime(100);
      await nextTick();

      // Send malformed JSON
      mockInstances[0].onmessage?.(
        new MessageEvent('message', {
          data: 'invalid json{',
        }),
      );
      await nextTick();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        expect.any(Error),
      );
      expect(lastMessage.value).toBeNull(); // Should not update lastMessage on parse error

      consoleSpy.mockRestore();
    });

    it('should support message handler registration and removal', async () => {
      const { connect, onMessage, offMessage } = useWebSocket('ws://localhost:3000/ws');

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      onMessage('metrics', handler1);
      onMessage('metrics', handler2); // This will replace handler1

      connect();
      vi.advanceTimersByTime(100);
      await nextTick();

      // Send metrics message
      mockInstances[0].simulateMessage({
        type: 'metrics',
        data: { cpu: 50 },
        timestamp: new Date().toISOString(),
      });
      await nextTick();

      expect(handler1).not.toHaveBeenCalled(); // Replaced by handler2
      expect(handler2).toHaveBeenCalledWith({ cpu: 50 });

      // Remove handler
      offMessage('metrics');
      handler2.mockClear();

      // Send another message
      mockInstances[0].simulateMessage({
        type: 'metrics',
        data: { cpu: 60 },
        timestamp: new Date().toISOString(),
      });
      await nextTick();

      expect(handler2).not.toHaveBeenCalled(); // Handler removed
    });
  });
});
