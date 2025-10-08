/**
 * Tests for Authentication Service
 * Following TDD approach for implementing authentication functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '#/services/authService';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock dependencies
vi.mock('bcrypt');
vi.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService: AuthService;
  let mockBcrypt: any;
  let mockJwt: any;

  beforeEach(() => {
    mockBcrypt = vi.mocked(bcrypt);
    mockJwt = vi.mocked(jwt);

    authService = new AuthService({
      jwtSecret: 'test-secret',
      tokenExpiry: '1h',
      bcryptRounds: 10,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Generation', () => {
    it('should generate JWT token with correct payload', async () => {
      const mockToken = 'mock-jwt-token';
      mockJwt.sign.mockReturnValue(mockToken);

      const payload = { userId: 'user123', role: 'admin' };
      const token = await authService.generateToken(payload);

      expect(mockJwt.sign).toHaveBeenCalledWith(payload, 'test-secret', { expiresIn: '1h' });
      expect(token).toBe(mockToken);
    });

    it('should generate token with custom expiry', async () => {
      const mockToken = 'mock-jwt-token';
      mockJwt.sign.mockReturnValue(mockToken);

      const payload = { userId: 'user123' };
      const token = await authService.generateToken(payload, '2h');

      expect(mockJwt.sign).toHaveBeenCalledWith(payload, 'test-secret', { expiresIn: '2h' });
      expect(token).toBe(mockToken);
    });

    it('should include timestamp in token payload', async () => {
      const mockToken = 'mock-jwt-token';
      mockJwt.sign.mockReturnValue(mockToken);

      const payload = { userId: 'user123' };
      await authService.generateToken(payload);

      const signCall = mockJwt.sign.mock.calls[0];
      const tokenPayload = signCall[0];

      expect(tokenPayload).toHaveProperty('iat');
      expect(tokenPayload.userId).toBe('user123');
    });

    it('should handle token generation errors', async () => {
      mockJwt.sign.mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      const payload = { userId: 'user123' };

      await expect(authService.generateToken(payload)).rejects.toThrow('JWT signing failed');
    });
  });

  describe('Token Verification', () => {
    it('should verify valid JWT token', async () => {
      const mockPayload = { userId: 'user123', role: 'admin', iat: Date.now() };
      mockJwt.verify.mockReturnValue(mockPayload);

      const token = 'valid-jwt-token';
      const result = await authService.verifyToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(token, 'test-secret');
      expect(result).toEqual(mockPayload);
    });

    it('should reject invalid JWT token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const token = 'invalid-jwt-token';

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });

    it('should reject expired JWT token', async () => {
      mockJwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      const token = 'expired-jwt-token';

      await expect(authService.verifyToken(token)).rejects.toThrow('Token expired');
    });

    it('should handle malformed tokens', async () => {
      mockJwt.verify.mockImplementation(() => {
        const error = new Error('Malformed token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      const token = 'malformed-token';

      await expect(authService.verifyToken(token)).rejects.toThrow('Malformed token');
    });
  });

  describe('Password Hashing', () => {
    it('should hash password with bcrypt', async () => {
      const mockHash = 'hashed-password';
      mockBcrypt.hash.mockResolvedValue(mockHash);

      const password = 'plain-password';
      const hashedPassword = await authService.hashPassword(password);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 10);
      expect(hashedPassword).toBe(mockHash);
    });

    it('should use custom salt rounds', async () => {
      const customAuthService = new AuthService({
        jwtSecret: 'test-secret',
        tokenExpiry: '1h',
        bcryptRounds: 12,
      });

      const mockHash = 'hashed-password';
      mockBcrypt.hash.mockResolvedValue(mockHash);

      const password = 'plain-password';
      await customAuthService.hashPassword(password);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 12);
    });

    it('should handle hashing errors', async () => {
      mockBcrypt.hash.mockRejectedValue(new Error('Hashing failed'));

      const password = 'plain-password';

      await expect(authService.hashPassword(password)).rejects.toThrow('Hashing failed');
    });

    it('should reject empty passwords', async () => {
      await expect(authService.hashPassword('')).rejects.toThrow('Password cannot be empty');
      await expect(authService.hashPassword(null as any)).rejects.toThrow(
        'Password cannot be empty',
      );
      await expect(authService.hashPassword(undefined as any)).rejects.toThrow(
        'Password cannot be empty',
      );
    });
  });

  describe('Password Verification', () => {
    it('should verify correct password', async () => {
      mockBcrypt.compare.mockResolvedValue(true);

      const password = 'plain-password';
      const hashedPassword = 'hashed-password';

      const isValid = await authService.verifyPassword(password, hashedPassword);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      mockBcrypt.compare.mockResolvedValue(false);

      const password = 'wrong-password';
      const hashedPassword = 'hashed-password';

      const isValid = await authService.verifyPassword(password, hashedPassword);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(isValid).toBe(false);
    });

    it('should handle verification errors', async () => {
      mockBcrypt.compare.mockRejectedValue(new Error('Comparison failed'));

      const password = 'plain-password';
      const hashedPassword = 'hashed-password';

      await expect(authService.verifyPassword(password, hashedPassword)).rejects.toThrow(
        'Comparison failed',
      );
    });

    it('should reject empty inputs', async () => {
      const hashedPassword = 'hashed-password';

      await expect(authService.verifyPassword('', hashedPassword)).rejects.toThrow('Invalid input');
      await expect(authService.verifyPassword('password', '')).rejects.toThrow('Invalid input');
    });
  });

  describe('API Key Management', () => {
    it('should generate API key', async () => {
      const apiKey = await authService.generateApiKey();

      expect(typeof apiKey).toBe('string');
      expect(apiKey.length).toBeGreaterThan(20);
      expect(apiKey).toMatch(/^[a-zA-Z0-9]+$/); // Alphanumeric
    });

    it('should generate unique API keys', async () => {
      const key1 = await authService.generateApiKey();
      const key2 = await authService.generateApiKey();

      expect(key1).not.toBe(key2);
    });

    it('should validate API key format', async () => {
      const validKey = await authService.generateApiKey();
      const isValid = await authService.validateApiKeyFormat(validKey);

      expect(isValid).toBe(true);
    });

    it('should reject invalid API key formats', async () => {
      const invalidKeys = ['too-short', 'contains-invalid-chars!@#', '', null, undefined];

      for (const key of invalidKeys) {
        const isValid = await authService.validateApiKeyFormat(key as any);
        expect(isValid).toBe(false);
      }
    });

    it('should hash API keys for storage', async () => {
      const mockHash = 'hashed-api-key';
      mockBcrypt.hash.mockResolvedValue(mockHash);

      const apiKey = 'plain-api-key';
      const hashedKey = await authService.hashApiKey(apiKey);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(apiKey, 10);
      expect(hashedKey).toBe(mockHash);
    });

    it('should verify API keys against hash', async () => {
      mockBcrypt.compare.mockResolvedValue(true);

      const apiKey = 'plain-api-key';
      const hashedKey = 'hashed-api-key';

      const isValid = await authService.verifyApiKey(apiKey, hashedKey);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(apiKey, hashedKey);
      expect(isValid).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should create session', async () => {
      const sessionData = {
        userId: 'user123',
        role: 'admin',
        permissions: ['read', 'write'],
      };

      const sessionId = await authService.createSession(sessionData);

      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(10);
    });

    it('should retrieve session data', async () => {
      const sessionData = {
        userId: 'user123',
        role: 'admin',
        permissions: ['read', 'write'],
      };

      const sessionId = await authService.createSession(sessionData);
      const retrievedData = await authService.getSession(sessionId);

      expect(retrievedData).toEqual(expect.objectContaining(sessionData));
      expect(retrievedData).toHaveProperty('createdAt');
      expect(retrievedData).toHaveProperty('lastAccessed');
    });

    it('should update session last accessed time', async () => {
      const sessionData = { userId: 'user123' };
      const sessionId = await authService.createSession(sessionData);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const initialData = await authService.getSession(sessionId);
      await authService.updateSessionAccess(sessionId);
      const updatedData = await authService.getSession(sessionId);

      expect(updatedData.lastAccessed).not.toBe(initialData.lastAccessed);
    });

    it('should destroy session', async () => {
      const sessionData = { userId: 'user123' };
      const sessionId = await authService.createSession(sessionData);

      await authService.destroySession(sessionId);
      const retrievedData = await authService.getSession(sessionId);

      expect(retrievedData).toBeNull();
    });

    it('should handle non-existent session', async () => {
      const nonExistentId = 'non-existent-session';
      const sessionData = await authService.getSession(nonExistentId);

      expect(sessionData).toBeNull();
    });

    it('should expire old sessions', async () => {
      vi.useFakeTimers();

      const sessionData = { userId: 'user123' };
      const sessionId = await authService.createSession(sessionData, 1000); // 1 second expiry

      // Fast-forward past expiry
      vi.advanceTimersByTime(2000);

      const retrievedData = await authService.getSession(sessionId);
      expect(retrievedData).toBeNull();

      vi.useRealTimers();
    });

    it('should clean up expired sessions', async () => {
      vi.useFakeTimers();

      // Create multiple sessions with short expiry
      const sessionIds = [];
      for (let i = 0; i < 5; i++) {
        const sessionId = await authService.createSession(
          { userId: `user${i}` },
          1000, // 1 second expiry
        );
        sessionIds.push(sessionId);
      }

      // Fast-forward past expiry
      vi.advanceTimersByTime(2000);

      const cleanedCount = await authService.cleanupExpiredSessions();
      expect(cleanedCount).toBe(5);

      // Verify sessions are gone
      for (const sessionId of sessionIds) {
        const data = await authService.getSession(sessionId);
        expect(data).toBeNull();
      }

      vi.useRealTimers();
    });
  });

  describe('Rate Limiting', () => {
    it('should track authentication attempts', async () => {
      const identifier = 'user123';

      await authService.recordAuthAttempt(identifier, false);
      const attempts = await authService.getAuthAttempts(identifier);

      expect(attempts.count).toBe(1);
      expect(attempts.lastAttempt).toBeDefined();
      expect(attempts.successful).toBe(false);
    });

    it('should increment failed attempts', async () => {
      const identifier = 'user123';

      await authService.recordAuthAttempt(identifier, false);
      await authService.recordAuthAttempt(identifier, false);
      await authService.recordAuthAttempt(identifier, false);

      const attempts = await authService.getAuthAttempts(identifier);
      expect(attempts.count).toBe(3);
    });

    it('should reset attempts on successful authentication', async () => {
      const identifier = 'user123';

      // Record failed attempts
      await authService.recordAuthAttempt(identifier, false);
      await authService.recordAuthAttempt(identifier, false);

      let attempts = await authService.getAuthAttempts(identifier);
      expect(attempts.count).toBe(2);

      // Record successful attempt
      await authService.recordAuthAttempt(identifier, true);

      attempts = await authService.getAuthAttempts(identifier);
      expect(attempts.count).toBe(0);
      expect(attempts.successful).toBe(true);
    });

    it('should check if user is rate limited', async () => {
      const identifier = 'user123';
      const maxAttempts = 5;

      // Record failed attempts up to limit
      for (let i = 0; i < maxAttempts; i++) {
        await authService.recordAuthAttempt(identifier, false);
      }

      const isLimited = await authService.isRateLimited(identifier, maxAttempts);
      expect(isLimited).toBe(true);
    });

    it('should not rate limit below threshold', async () => {
      const identifier = 'user123';
      const maxAttempts = 5;

      // Record failed attempts below limit
      for (let i = 0; i < maxAttempts - 1; i++) {
        await authService.recordAuthAttempt(identifier, false);
      }

      const isLimited = await authService.isRateLimited(identifier, maxAttempts);
      expect(isLimited).toBe(false);
    });

    it('should implement time-based rate limiting', async () => {
      vi.useFakeTimers();

      const identifier = 'user123';
      const maxAttempts = 3;
      const windowMs = 60000; // 1 minute

      // Record failed attempts
      for (let i = 0; i < maxAttempts; i++) {
        await authService.recordAuthAttempt(identifier, false);
      }

      let isLimited = await authService.isRateLimited(identifier, maxAttempts, windowMs);
      expect(isLimited).toBe(true);

      // Fast-forward past window
      vi.advanceTimersByTime(windowMs + 1000);

      isLimited = await authService.isRateLimited(identifier, maxAttempts, windowMs);
      expect(isLimited).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('Permission Management', () => {
    it('should check user permissions', async () => {
      const userPermissions = ['read', 'write', 'admin'];

      expect(authService.hasPermission(userPermissions, 'read')).toBe(true);
      expect(authService.hasPermission(userPermissions, 'write')).toBe(true);
      expect(authService.hasPermission(userPermissions, 'admin')).toBe(true);
      expect(authService.hasPermission(userPermissions, 'delete')).toBe(false);
    });

    it('should check multiple permissions', async () => {
      const userPermissions = ['read', 'write'];

      expect(authService.hasAllPermissions(userPermissions, ['read'])).toBe(true);
      expect(authService.hasAllPermissions(userPermissions, ['read', 'write'])).toBe(true);
      expect(authService.hasAllPermissions(userPermissions, ['read', 'admin'])).toBe(false);
    });

    it('should check any of multiple permissions', async () => {
      const userPermissions = ['read', 'write'];

      expect(authService.hasAnyPermission(userPermissions, ['read'])).toBe(true);
      expect(authService.hasAnyPermission(userPermissions, ['admin'])).toBe(false);
      expect(authService.hasAnyPermission(userPermissions, ['admin', 'read'])).toBe(true);
    });

    it('should validate role hierarchy', async () => {
      const roleHierarchy = {
        admin: ['read', 'write', 'delete', 'admin'],
        moderator: ['read', 'write', 'moderate'],
        user: ['read'],
      };

      expect(authService.getRolePermissions('admin', roleHierarchy)).toEqual([
        'read',
        'write',
        'delete',
        'admin',
      ]);
      expect(authService.getRolePermissions('user', roleHierarchy)).toEqual(['read']);
      expect(authService.getRolePermissions('invalid', roleHierarchy)).toEqual([]);
    });
  });

  describe('Security Features', () => {
    it('should generate secure random tokens', async () => {
      const token1 = await authService.generateSecureToken(32);
      const token2 = await authService.generateSecureToken(32);

      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
      expect(token2.length).toBe(64);
      expect(token1).toMatch(/^[a-f0-9]+$/);
    });

    it('should validate token strength', async () => {
      const strongToken = await authService.generateSecureToken(32);
      const weakToken = 'weak123';

      expect(authService.isTokenSecure(strongToken)).toBe(true);
      expect(authService.isTokenSecure(weakToken)).toBe(false);
    });

    it('should implement constant-time comparison', async () => {
      const token1 = 'secret-token-123';
      const token2 = 'secret-token-123';
      const token3 = 'different-token';

      expect(authService.constantTimeCompare(token1, token2)).toBe(true);
      expect(authService.constantTimeCompare(token1, token3)).toBe(false);
    });

    it('should sanitize user input', async () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const sanitized = authService.sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should validate input length', async () => {
      const longInput = 'a'.repeat(1000);
      const normalInput = 'normal input';

      expect(authService.validateInputLength(normalInput, 100)).toBe(true);
      expect(authService.validateInputLength(longInput, 100)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle configuration errors', () => {
      expect(() => {
        new AuthService({
          jwtSecret: '',
          tokenExpiry: '1h',
          bcryptRounds: 10,
        });
      }).toThrow('JWT secret cannot be empty');
    });

    it('should handle invalid token expiry', () => {
      expect(() => {
        new AuthService({
          jwtSecret: 'secret',
          tokenExpiry: 'invalid',
          bcryptRounds: 10,
        });
      }).toThrow('Invalid token expiry format');
    });

    it('should handle invalid bcrypt rounds', () => {
      expect(() => {
        new AuthService({
          jwtSecret: 'secret',
          tokenExpiry: '1h',
          bcryptRounds: -1,
        });
      }).toThrow('Invalid bcrypt rounds');
    });

    it('should provide meaningful error messages', async () => {
      mockJwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      try {
        await authService.verifyToken('expired-token');
      } catch (error) {
        expect(error.message).toContain('expired');
      }
    });
  });
});
