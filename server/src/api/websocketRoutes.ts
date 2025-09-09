/**
 * WebSocket Routes
 * Implements WebSocket support for real-time metric updates
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { createLogger } from '#/utils/loggingConfig';

const logger = createLogger('websocket-routes');

// WebSocket connection management
interface WebSocketConnection {
  id: string;
  socket: SocketStream;
  lastActivity: Date;
  subscriptions: Set<string>;
  messageCount: number;
  rateLimitReset: Date;
}

// Active connections storage
const connections = new Map<string, WebSocketConnection>();

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 10; // 10 messages per minute

// Generate unique connection ID
function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Authentication for WebSocket connections
function authenticateWebSocket(request: FastifyRequest): boolean {
  // Check current NODE_ENV from process.env
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.authorization;
    const expectedToken = process.env.API_TOKEN;

    if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return false;
    }
  }
  return true;
}

// Rate limiting check
function checkRateLimit(connection: WebSocketConnection): boolean {
  const now = new Date();
  
  // Reset rate limit window if needed
  if (now.getTime() - connection.rateLimitReset.getTime() > RATE_LIMIT_WINDOW) {
    connection.messageCount = 0;
    connection.rateLimitReset = now;
  }

  return connection.messageCount < RATE_LIMIT_MAX_MESSAGES;
}

// Broadcast message to all connected clients
function broadcastToAll(message: any, excludeConnectionId?: string): void {
  const messageStr = JSON.stringify(message);
  
  connections.forEach((connection, connectionId) => {
    if (connectionId !== excludeConnectionId) {
      try {
        connection.socket.socket.send(messageStr);
      } catch (error) {
        logger.error(`Failed to send message to connection ${connectionId}: ${error}`);
        // Remove failed connection
        connections.delete(connectionId);
      }
    }
  });
}

// Handle WebSocket messages
function handleWebSocketMessage(connection: WebSocketConnection, message: string): void {
  try {
    const data = JSON.parse(message);
    
    // Update activity timestamp
    connection.lastActivity = new Date();
    
    // Check rate limiting
    if (!checkRateLimit(connection)) {
      connection.socket.socket.send(JSON.stringify({
        type: 'rate_limit_exceeded',
        error: 'Message rate limit exceeded. Please slow down.'
      }));
      return;
    }
    
    connection.messageCount++;

    // Handle different message types
    switch (data.type) {
      case 'ping':
        connection.socket.socket.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString(),
          id: data.id
        }));
        break;

      case 'subscribe':
        if (data.channel) {
          connection.subscriptions.add(data.channel);
          connection.socket.socket.send(JSON.stringify({
            type: 'subscription_confirmed',
            channel: data.channel,
            timestamp: new Date().toISOString()
          }));
        }
        break;

      case 'unsubscribe':
        if (data.channel) {
          connection.subscriptions.delete(data.channel);
          connection.socket.socket.send(JSON.stringify({
            type: 'subscription_cancelled',
            channel: data.channel,
            timestamp: new Date().toISOString()
          }));
        }
        break;

      case 'request_metrics':
        // Send current metrics to the requesting client
        connection.socket.socket.send(JSON.stringify({
          type: 'metrics_update',
          data: {
            timestamp: new Date().toISOString(),
            system: {
              memory: process.memoryUsage(),
              uptime: process.uptime()
            },
            connections: connections.size
          }
        }));
        break;

      case 'get_connection_count':
        connection.socket.socket.send(JSON.stringify({
          type: 'connection_count',
          count: connections.size,
          timestamp: new Date().toISOString()
        }));
        break;

      case 'trigger_broadcast':
        // Broadcast metrics to all connected clients (including sender)
        broadcastToAll({
          type: 'metrics_update',
          data: {
            timestamp: new Date().toISOString(),
            system: {
              memory: process.memoryUsage(),
              uptime: process.uptime()
            },
            connections: connections.size
          }
        }); // Don't exclude sender for this test
        break;

      default:
        connection.socket.socket.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type',
          timestamp: new Date().toISOString()
        }));
        break;
    }
  } catch (error) {
    logger.error(`Error handling WebSocket message: ${error}`);
    connection.socket.socket.send(JSON.stringify({
      type: 'error',
      error: 'Invalid message format',
      timestamp: new Date().toISOString()
    }));
  }
}

// Clean up inactive connections
function cleanupConnections(): void {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutes

  connections.forEach((connection, connectionId) => {
    if (now.getTime() - connection.lastActivity.getTime() > timeout) {
      logger.info(`Cleaning up inactive connection: ${connectionId}`);
      try {
        connection.socket.socket.close();
      } catch (error) {
        // Connection might already be closed
      }
      connections.delete(connectionId);
    }
  });
}

// Start cleanup interval
setInterval(cleanupConnections, 60000); // Run every minute

/**
 * Register WebSocket routes
 */
export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  // Register WebSocket plugin
  await fastify.register(require('@fastify/websocket'));

  // WebSocket route for metrics
  fastify.register(async function (fastify) {
    fastify.get('/ws/metrics', { 
      websocket: true,
      preHandler: async (request, reply) => {
        // Authenticate connection before upgrade
        if (!authenticateWebSocket(request)) {
          logger.warn('Unauthorized WebSocket connection attempt');
          reply.code(401).send({ error: 'Unauthorized' });
          return;
        }
      }
    }, (connection, request) => {

      const connectionId = generateConnectionId();
      const wsConnection: WebSocketConnection = {
        id: connectionId,
        socket: connection,
        lastActivity: new Date(),
        subscriptions: new Set(),
        messageCount: 0,
        rateLimitReset: new Date()
      };

      // Store connection
      connections.set(connectionId, wsConnection);
      logger.info(`WebSocket connection established: ${connectionId}`);

      // Send welcome message
      connection.socket.send(JSON.stringify({
        type: 'connected',
        connectionId,
        timestamp: new Date().toISOString()
      }));

      // Handle incoming messages
      connection.socket.on('message', (message) => {
        handleWebSocketMessage(wsConnection, message.toString());
      });

      // Handle connection close
      connection.socket.on('close', (code, reason) => {
        logger.info(`WebSocket connection closed: ${connectionId}, code: ${code}, reason: ${reason}`);
        connections.delete(connectionId);
      });

      // Handle connection errors
      connection.socket.on('error', (error) => {
        logger.error(`WebSocket connection error: ${connectionId}, error: ${error}`);
        connections.delete(connectionId);
      });
    });
  });

  logger.info('WebSocket routes registered successfully');
}

// Export utility functions for external use
export function getActiveConnectionCount(): number {
  return connections.size;
}

export function broadcastMetrics(metrics: any): void {
  broadcastToAll({
    type: 'metrics_broadcast',
    data: metrics,
    timestamp: new Date().toISOString()
  });
}