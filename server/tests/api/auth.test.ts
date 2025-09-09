/**
 * Authentication System Tests (TDD)
 * =================================
 * Tests for API token authentication, session management, and rate limiting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { AuthService } from '../../src/services/authService';
import { SessionManager } from '../../src/services/sessionManager';
import { authMiddleware, requireAuth } from '../../src/middleware/auth';

describe('Authentication System', () => {
  let server: FastifyInstance;
  let authService: AuthService;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    server = Fastify();
    authService = new AuthService();
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('API Token Authentication', () => {
    it('should fail when no token is provided', async () => {
      // Arrange
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/protected'
      });

      // Assert
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'API token required'
      });
    });

    it('should fail with invalid token format', async () => {
      // Arrange
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'InvalidTokenFormat'
        }
      });

      // Assert
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Invalid token format'
      });
    });

    it('should fail with invalid token', async () => {
      // Arrange
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer invalid-token-123'
        }
      });

      // Assert
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    });

    it('should succeed with valid token', async () => {
      // Arrange
      const validToken = await authService.generateApiToken('admin', { permissions: ['read', 'write'] });
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'success'
      });
    });

    it('should validate token permissions', async () => {
      // Arrange
      const readOnlyToken = await authService.generateApiToken('user', { permissions: ['read'] });
      server.post('/admin-action', { 
        preHandler: [requireAuth, authService.requirePermission('admin')] 
      }, async () => {
        return { message: 'admin action completed' };
      });

      // Act
      const response = await server.inject({
        method: 'POST',
        url: '/admin-action',
        headers: {
          authorization: `Bearer ${readOnlyToken}`
        }
      });

      // Assert
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    });

    it('should handle token expiration', async () => {
      // Arrange
      vi.useFakeTimers();
      const shortLivedToken = await authService.generateApiToken('user', { 
        permissions: ['read'],
        expiresIn: '1ms'
      });
      
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act - wait for token to expire
      await vi.advanceTimersByTimeAsync(10);
      
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${shortLivedToken}`
        }
      });

      // Assert
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });

      vi.useRealTimers();
    });
  });

  describe('Session Management', () => {
    it('should create session for dashboard user', async () => {
      // Arrange
      const userId = 'user123';
      const sessionData = {
        username: 'testuser',
        permissions: ['read', 'write'],
        loginTime: new Date()
      };

      // Act
      const sessionId = await sessionManager.createSession(userId, sessionData);

      // Assert
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(16);
    });

    it('should retrieve session data', async () => {
      // Arrange
      const userId = 'user123';
      const sessionData = {
        username: 'testuser',
        permissions: ['read', 'write'],
        loginTime: new Date()
      };
      const sessionId = await sessionManager.createSession(userId, sessionData);

      // Act
      const retrievedSession = await sessionManager.getSession(sessionId);

      // Assert
      expect(retrievedSession).toBeTruthy();
      expect(retrievedSession?.userId).toBe(userId);
      expect(retrievedSession?.data.username).toBe('testuser');
    });

    it('should handle session expiration', async () => {
      // Arrange
      vi.useFakeTimers();
      const userId = 'user123';
      const sessionData = { username: 'testuser' };
      const sessionId = await sessionManager.createSession(userId, sessionData, 1000); // 1 second

      // Act - advance time past expiration
      await vi.advanceTimersByTimeAsync(2000);
      const retrievedSession = await sessionManager.getSession(sessionId);

      // Assert
      expect(retrievedSession).toBeNull();

      vi.useRealTimers();
    });

    it('should destroy session', async () => {
      // Arrange
      const userId = 'user123';
      const sessionData = { username: 'testuser' };
      const sessionId = await sessionManager.createSession(userId, sessionData);

      // Act
      await sessionManager.destroySession(sessionId);
      const retrievedSession = await sessionManager.getSession(sessionId);

      // Assert
      expect(retrievedSession).toBeNull();
    });

    it('should update session activity', async () => {
      // Arrange
      const userId = 'user123';
      const sessionData = { username: 'testuser' };
      const sessionId = await sessionManager.createSession(userId, sessionData);

      const originalSession = await sessionManager.getSession(sessionId);
      const originalActivity = originalSession?.lastActivity;

      // Act - wait a bit and update activity
      await new Promise(resolve => setTimeout(resolve, 10));
      await sessionManager.updateActivity(sessionId);
      const updatedSession = await sessionManager.getSession(sessionId);

      // Assert
      expect(updatedSession?.lastActivity).not.toEqual(originalActivity);
      expect(updatedSession?.lastActivity.getTime()).toBeGreaterThan(originalActivity?.getTime() || 0);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      // Arrange
      server.register(require('@fastify/rate-limit'), {
        max: 5,
        timeWindow: 60000 // 1 minute
      });
      server.get('/api/test', async () => ({ message: 'ok' }));

      // Act - make 5 requests (within limit)
      const promises = Array.from({ length: 5 }, () =>
        server.inject({ method: 'GET', url: '/api/test' })
      );
      const responses = await Promise.all(promises);

      // Assert
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should block requests exceeding rate limit', async () => {
      // Arrange
      server.register(require('@fastify/rate-limit'), {
        max: 3,
        timeWindow: 60000 // 1 minute
      });
      server.get('/api/test', async () => ({ message: 'ok' }));

      // Act - make 4 requests (exceeding limit of 3)
      const responses = [];
      for (let i = 0; i < 4; i++) {
        const response = await server.inject({ method: 'GET', url: '/api/test' });
        responses.push(response);
      }

      // Assert
      expect(responses[0].statusCode).toBe(200);
      expect(responses[1].statusCode).toBe(200);
      expect(responses[2].statusCode).toBe(200);
      expect(responses[3].statusCode).toBe(429); // Rate limited
    });

    it('should have different rate limits for different endpoints', async () => {
      // Arrange
      server.register(require('@fastify/rate-limit'), {
        global: false
      });

      server.get('/api/public', {
        config: {
          rateLimit: { max: 10, timeWindow: 60000 }
        }
      }, async () => ({ message: 'public' }));

      server.get('/api/admin', {
        config: {
          rateLimit: { max: 2, timeWindow: 60000 }
        }
      }, async () => ({ message: 'admin' }));

      // Act
      const publicResponses = await Promise.all(
        Array.from({ length: 10 }, () =>
          server.inject({ method: 'GET', url: '/api/public' })
        )
      );

      const adminResponses = await Promise.all(
        Array.from({ length: 3 }, () =>
          server.inject({ method: 'GET', url: '/api/admin' })
        )
      );

      // Assert
      // All public requests should succeed
      publicResponses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // First 2 admin requests should succeed, 3rd should be rate limited
      expect(adminResponses[0].statusCode).toBe(200);
      expect(adminResponses[1].statusCode).toBe(200);
      expect(adminResponses[2].statusCode).toBe(429);
    });

    it('should reset rate limit after time window', async () => {
      // Arrange
      vi.useFakeTimers();
      server.register(require('@fastify/rate-limit'), {
        max: 1,
        timeWindow: 1000 // 1 second
      });
      server.get('/api/test', async () => ({ message: 'ok' }));

      // Act
      const firstResponse = await server.inject({ method: 'GET', url: '/api/test' });
      const secondResponse = await server.inject({ method: 'GET', url: '/api/test' });

      // Advance time past the window
      await vi.advanceTimersByTimeAsync(1100);

      const thirdResponse = await server.inject({ method: 'GET', url: '/api/test' });

      // Assert
      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(429); // Rate limited
      expect(thirdResponse.statusCode).toBe(200);  // Reset after window

      vi.useRealTimers();
    });
  });

  describe('Authentication Middleware Error Handling', () => {
    it('should handle malformed authorization header', async () => {
      // Arrange
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Malformed Header Without Bearer'
        }
      });

      // Assert
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Invalid token format'
      });
    });

    it('should handle database connection errors gracefully', async () => {
      // Arrange
      const mockAuthService = {
        ...authService,
        validateToken: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      };
      
      server.decorateRequest('authService', mockAuthService);
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer valid-looking-token'
        }
      });

      // Assert
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Internal Server Error',
        message: 'Authentication service unavailable'
      });
    });

    it('should log authentication failures for security monitoring', async () => {
      // Arrange
      const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      server.get('/protected', { preHandler: requireAuth }, async () => {
        return { message: 'success' };
      });

      // Act
      await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer invalid-token'
        }
      });

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed'),
        expect.objectContaining({
          reason: 'Invalid or expired token',
          ip: expect.any(String),
          userAgent: expect.any(String)
        })
      );

      logSpy.mockRestore();
    });
  });
});