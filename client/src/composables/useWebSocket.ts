import { ref, onMounted, onUnmounted, computed } from 'vue';
import type { ConnectionStatus, WebSocketMessage } from '@/types';

/**
 * WebSocket composable for real-time communication with automatic reconnection
 */
export function useWebSocket(url: string = 'ws://localhost:3000/ws') {
  const connectionStatus = ref<ConnectionStatus>({
    status: 'disconnected',
    reconnectAttempts: 0,
  });

  const lastMessage = ref<WebSocketMessage | null>(null);
  const isConnected = computed(() => connectionStatus.value.status === 'connected');

  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let maxReconnectAttempts = 5;
  let reconnectDelay = 1000; // Start with 1 second
  let messageHandlers = new Map<string, (data: any) => void>();

  const updateConnectionStatus = (status: ConnectionStatus['status'], lastConnected?: string) => {
    connectionStatus.value = {
      ...connectionStatus.value,
      status,
      lastConnected: lastConnected || connectionStatus.value.lastConnected,
    };
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      lastMessage.value = message;

      // Call specific message type handlers
      const handler = messageHandlers.get(message.type);
      if (handler) {
        handler(message.data);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const handleOpen = () => {
    updateConnectionStatus('connected', new Date().toISOString());
    connectionStatus.value.reconnectAttempts = 0;
    reconnectDelay = 1000; // Reset delay on successful connection
    console.log('WebSocket connected');
  };

  const handleClose = (event: CloseEvent) => {
    updateConnectionStatus('disconnected');
    console.log('WebSocket disconnected:', event.code, event.reason);

    // Attempt reconnection if not manually closed
    if (event.code !== 1000 && connectionStatus.value.reconnectAttempts < maxReconnectAttempts) {
      scheduleReconnect();
    }
  };

  const handleError = (event: Event) => {
    console.error('WebSocket error:', event);
    updateConnectionStatus('error');

    // Attempt reconnection on error if we haven't exceeded max attempts
    if (connectionStatus.value.reconnectAttempts < maxReconnectAttempts) {
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    connectionStatus.value.reconnectAttempts++;
    updateConnectionStatus('reconnecting');

    reconnectTimer = window.setTimeout(() => {
      connect();
      reconnectDelay = Math.min(reconnectDelay * 2, 30000); // Exponential backoff, max 30s
    }, reconnectDelay);
  };

  const connect = () => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      updateConnectionStatus('connecting');
      ws = new WebSocket(url);

      ws.onopen = handleOpen;
      ws.onmessage = handleMessage;
      ws.onclose = handleClose;
      ws.onerror = handleError;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      updateConnectionStatus('error');
    }
  };

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (ws) {
      ws.close(1000, 'Manual disconnect');
      ws = null;
    }

    updateConnectionStatus('disconnected');
  };

  const send = (message: WebSocketMessage) => {
    if (ws && ws.readyState === 1) {
      // 1 = OPEN
      ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Cannot send message:', message);
    }
  };

  const reconnect = () => {
    disconnect();
    connectionStatus.value.reconnectAttempts = 0;
    connect();
  };

  // Register message type handlers
  const onMessage = (type: string, handler: (data: any) => void) => {
    messageHandlers.set(type, handler);
  };

  const offMessage = (type: string) => {
    messageHandlers.delete(type);
  };

  onMounted(() => {
    // Auto-connect when component is mounted
    connect();
  });

  onUnmounted(() => {
    // Cleanup when component is unmounted
    disconnect();
  });

  return {
    connectionStatus,
    lastMessage,
    isConnected,
    connect,
    disconnect,
    send,
    reconnect,
    onMessage,
    offMessage,
  };
}
