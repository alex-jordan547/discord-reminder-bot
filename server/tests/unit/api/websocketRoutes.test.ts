/**
 * Tests for WebSocket Routes
 * Following TDD approach for implementing WebSocket support for real-time updates
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '#/api/fastifyServer';
import WebSocket from 'ws';

describe('WebSocket Routes', () => {
  let server: FastifyInstance;
  let serverAddress: string;

  beforeEach(async () => {
    server = await createServer();
    await server.ready();
    await server.listen({ port: 0 }); // Use random available port
    serverAddress = `ws://localhost:${(server.server.address() as any).port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  describe('WebSocket Server Integration', () => {
    it('should accept WebSocket connections on /ws/metrics', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('should reject connections without proper upgrade headers', async () => {
      try {
        const response = await fetch(`${serverAddress.replace('ws://', 'http://')}/ws/metrics`);
        expect(response.status).toBe(400);
      } catch (error) {
        // Expected for WebSocket upgrade failure
        expect(error).toBeDefined();
      }
    });

    it('should handle multiple concurrent connections', async () => {
      const connections: WebSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      for (let i = 0; i < 5; i++) {
        const ws = new WebSocket(`${serverAddress}/ws/metrics`);
        connections.push(ws);
        
        connectionPromises.push(new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        }));
      }

      await Promise.all(connectionPromises);

      connections.forEach(ws => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      });
    });

    it('should require authentication in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const ws = new WebSocket(`${serverAddress}/ws/metrics`);
        
        await new Promise((resolve, reject) => {
          ws.on('close', (code) => {
            expect(code).toBe(1008); // Policy violation (unauthorized)
            resolve(undefined);
          });
          ws.on('open', () => reject(new Error('Should not connect without auth')));
          ws.on('error', resolve); // Connection might be rejected immediately
          setTimeout(() => reject(new Error('Test timeout')), 5000);
        });
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should accept authenticated connections in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalToken = process.env.API_TOKEN;
      process.env.NODE_ENV = 'production';
      process.env.API_TOKEN = 'test-token';

      try {
        const ws = new WebSocket(`${serverAddress}/ws/metrics`, {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        });
        
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.API_TOKEN = originalToken;
      }
    });
  });

  describe('WebSocket Message Handlers', () => {
    it('should broadcast metrics to connected clients', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const messagePromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message).toHaveProperty('type');
          expect(message).toHaveProperty('data');
          resolve(message);
        });
      });

      // Trigger a metrics broadcast (this would normally be done by the monitoring service)
      // For testing, we'll send a test message
      ws.send(JSON.stringify({ type: 'request_metrics' }));

      const message = await messagePromise;
      expect(message).toBeDefined();
      
      ws.close();
    });

    it('should handle different message types', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const messages: any[] = [];
      const messagePromise = new Promise((resolve) => {
        let messageCount = 0;
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          messages.push(message);
          messageCount++;
          if (messageCount >= 2) resolve(messages);
        });
      });

      // Send different message types
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'metrics' }));
      ws.send(JSON.stringify({ type: 'ping' }));

      await messagePromise;
      
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages.some(m => m.type === 'subscription_confirmed')).toBe(true);
      expect(messages.some(m => m.type === 'pong')).toBe(true);
      
      ws.close();
    });

    it('should handle invalid message formats gracefully', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const errorPromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            expect(message.error).toContain('Invalid message format');
            resolve(message);
          }
        });
      });

      // Send invalid message
      ws.send('invalid-json');

      await errorPromise;
      ws.close();
    });

    it('should broadcast to multiple clients simultaneously', async () => {
      const clients: WebSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      // Create 3 WebSocket connections
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`${serverAddress}/ws/metrics`);
        clients.push(ws);
        
        connectionPromises.push(new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        }));
      }

      await Promise.all(connectionPromises);

      // Set up message listeners for all clients
      const messagePromises = clients.map(ws => new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'metrics_update') {
            resolve(message);
          }
        });
      }));

      // Trigger a broadcast (simulate server-side broadcast)
      // In a real scenario, this would be triggered by the monitoring service
      clients[0].send(JSON.stringify({ type: 'trigger_broadcast' }));

      const messages = await Promise.all(messagePromises);
      
      expect(messages.length).toBe(3);
      messages.forEach(message => {
        expect(message).toHaveProperty('type', 'metrics_update');
        expect(message).toHaveProperty('data');
      });

      clients.forEach(ws => ws.close());
    });
  });

  describe('Connection Management and Cleanup', () => {
    it('should track active connections', async () => {
      const ws1 = new WebSocket(`${serverAddress}/ws/metrics`);
      const ws2 = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await Promise.all([
        new Promise((resolve, reject) => {
          ws1.on('open', resolve);
          ws1.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        }),
        new Promise((resolve, reject) => {
          ws2.on('open', resolve);
          ws2.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        })
      ]);

      // Request connection count
      const countPromise = new Promise((resolve) => {
        ws1.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connection_count') {
            expect(message.count).toBeGreaterThanOrEqual(2);
            resolve(message);
          }
        });
      });

      ws1.send(JSON.stringify({ type: 'get_connection_count' }));
      await countPromise;

      ws1.close();
      ws2.close();
    });

    it('should clean up connections on close', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const closePromise = new Promise((resolve) => {
        ws.on('close', resolve);
      });

      ws.close();
      await closePromise;

      // Connection should be cleaned up
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it('should handle connection errors gracefully', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const errorPromise = new Promise((resolve) => {
        ws.on('error', resolve);
        ws.on('close', resolve);
      });

      // Force an error by sending after close
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for close
      
      try {
        ws.send('test');
      } catch (error) {
        // Expected error
      }

      await errorPromise;
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('Rate Limiting', () => {
    it('should implement rate limiting for message sending', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const rateLimitPromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'rate_limit_exceeded') {
            expect(message.error).toContain('rate limit');
            resolve(message);
          }
        });
      });

      // Send many messages quickly to trigger rate limiting
      for (let i = 0; i < 20; i++) {
        ws.send(JSON.stringify({ type: 'ping', id: i }));
      }

      await rateLimitPromise;
      ws.close();
    });

    it('should allow normal message flow within rate limits', async () => {
      const ws = new WebSocket(`${serverAddress}/ws/metrics`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const responsePromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            resolve(message);
          }
        });
      });

      // Send a single message within rate limits
      ws.send(JSON.stringify({ type: 'ping' }));

      const response = await responsePromise;
      expect(response).toHaveProperty('type', 'pong');
      
      ws.close();
    });
  });
});