/**
 * Authentication Service
 * =====================
 * Handles API token generation, validation, and permission management
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createLogger } from '#/utils/loggingConfig';

const logger = createLogger('auth');

export interface TokenPayload {
  userId: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export interface ApiTokenOptions {
  permissions: string[];
  expiresIn?: string;
  metadata?: Record<string, any>;
}

export interface ApiToken {
  id: string;
  userId: string;
  role: string;
  token: string;
  permissions: string[];
  expiresAt: Date;
  createdAt: Date;
  lastUsed?: Date;
  metadata?: Record<string, any>;
}

export interface AuthConfig {
  jwtSecret: string;
  tokenExpiry: string;
  bcryptRounds: number;
}

export class AuthService {
  private tokens: Map<string, ApiToken> = new Map();
  private sessions: Map<string, any> = new Map();
  private authAttempts: Map<string, any> = new Map();
  private jwtSecret: string;
  private tokenExpiry: string;
  private readonly saltRounds: number;

  constructor(config?: AuthConfig) {
    if (config) {
      if (!config.jwtSecret) {
        throw new Error('JWT secret cannot be empty');
      }
      if (!this.isValidExpiry(config.tokenExpiry)) {
        throw new Error('Invalid token expiry format');
      }
      if (config.bcryptRounds < 1 || config.bcryptRounds > 20) {
        throw new Error('Invalid bcrypt rounds');
      }
      
      this.jwtSecret = config.jwtSecret;
      this.tokenExpiry = config.tokenExpiry;
      this.saltRounds = config.bcryptRounds;
    } else {
      this.jwtSecret = process.env.JWT_SECRET || this.generateSecureSecret();
      this.tokenExpiry = '1h';
      this.saltRounds = 12;
      
      if (!process.env.JWT_SECRET) {
        logger.warn('JWT_SECRET not set in environment, using generated secret. This should be set in production!');
      }
    }
  }

  private isValidExpiry(expiry: string): boolean {
    return /^\d+[smhdw]$/.test(expiry);
  }

  /**
   * Generate a cryptographically secure secret
   */
  private generateSecureSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate a JWT token with payload
   */
  async generateToken(payload: any, expiresIn?: string): Promise<string> {
    try {
      const expiry = expiresIn || this.tokenExpiry;
      const tokenPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000)
      };
      
      return jwt.sign(tokenPayload, this.jwtSecret, { expiresIn: expiry });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate an API token for a user
   */
  async generateApiToken(userId: string, options: ApiTokenOptions): Promise<string> {
    try {
      const tokenId = crypto.randomUUID();
      const role = this.determineRole(options.permissions);
      
      // Calculate expiration
      const expiresIn = options.expiresIn || '30d';
      const expirationMs = this.parseExpiration(expiresIn);
      const expiresAt = new Date(Date.now() + expirationMs);

      // Create JWT payload
      const payload: TokenPayload = {
        userId,
        role,
        permissions: options.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000)
      };

      // Sign the token
      const token = jwt.sign(payload, this.jwtSecret, {
        algorithm: 'HS256',
        jwtid: tokenId,
        issuer: 'discord-reminder-bot',
        audience: 'dashboard-api'
      });

      // Store token metadata
      const apiToken: ApiToken = {
        id: tokenId,
        userId,
        role,
        token: await this.hashToken(token),
        permissions: options.permissions,
        expiresAt,
        createdAt: new Date(),
        metadata: options.metadata
      };

      this.tokens.set(tokenId, apiToken);

      logger.info('API token generated', {
        tokenId,
        userId,
        role,
        permissions: options.permissions,
        expiresAt: expiresAt.toISOString()
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate API token', { userId, error: error.message });
      throw new Error('Token generation failed');
    }
  }

  /**
   * Verify a JWT token
   */
  async verifyToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate an API token
   */
  async validateToken(token: string): Promise<TokenPayload | null> {
    try {
      // Verify JWT signature and expiration
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'discord-reminder-bot',
        audience: 'dashboard-api'
      }) as TokenPayload;

      // Check if token exists in our store
      const tokenId = (jwt.decode(token) as any)?.jti;
      if (!tokenId || !this.tokens.has(tokenId)) {
        logger.warn('Token validation failed: token not found in store', { tokenId });
        return null;
      }

      const storedToken = this.tokens.get(tokenId)!;
      
      // Verify token hash matches
      const isValidHash = await bcrypt.compare(token, storedToken.token);
      if (!isValidHash) {
        logger.warn('Token validation failed: hash mismatch', { tokenId });
        return null;
      }

      // Check expiration
      if (storedToken.expiresAt < new Date()) {
        logger.warn('Token validation failed: token expired', { tokenId, expiresAt: storedToken.expiresAt });
        this.tokens.delete(tokenId);
        return null;
      }

      // Update last used timestamp
      storedToken.lastUsed = new Date();

      logger.debug('Token validated successfully', {
        tokenId,
        userId: payload.userId,
        role: payload.role
      });

      return payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Token validation failed: expired', { error: error.message });
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Token validation failed: invalid format', { error: error.message });
      } else {
        logger.error('Token validation error', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Revoke an API token
   */
  async revokeToken(tokenId: string): Promise<boolean> {
    try {
      const deleted = this.tokens.delete(tokenId);
      
      if (deleted) {
        logger.info('Token revoked', { tokenId });
      } else {
        logger.warn('Token revocation failed: token not found', { tokenId });
      }
      
      return deleted;
    } catch (error) {
      logger.error('Token revocation error', { tokenId, error: error.message });
      return false;
    }
  }

  /**
   * Create a permission validation middleware
   */
  requirePermission(requiredPermission: string) {
    return async (request: any, reply: any) => {
      const user = request.user;
      
      if (!user) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      if (!user.permissions.includes(requiredPermission) && !user.permissions.includes('admin')) {
        logger.warn('Permission denied', {
          userId: user.userId,
          required: requiredPermission,
          userPermissions: user.permissions
        });

        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Insufficient permissions'
        });
      }
    };
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(userId: string): Promise<ApiToken[]> {
    const userTokens = Array.from(this.tokens.values())
      .filter(token => token.userId === userId && token.expiresAt > new Date())
      .map(token => ({
        ...token,
        token: '[HIDDEN]' // Don't expose actual token
      }));

    return userTokens as ApiToken[];
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [tokenId, token] of this.tokens.entries()) {
      if (token.expiresAt < now) {
        this.tokens.delete(tokenId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up expired tokens', { count: cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * Get authentication statistics
   */
  getStats() {
    const now = new Date();
    const activeTokens = Array.from(this.tokens.values()).filter(t => t.expiresAt > now);
    
    return {
      totalTokens: this.tokens.size,
      activeTokens: activeTokens.length,
      expiredTokens: this.tokens.size - activeTokens.length,
      tokensByRole: this.groupBy(activeTokens, 'role'),
      recentActivity: activeTokens
        .filter(t => t.lastUsed && t.lastUsed > new Date(Date.now() - 24 * 60 * 60 * 1000))
        .length
    };
  }

  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    if (!password || password.trim() === '') {
      throw new Error('Password cannot be empty');
    }
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || password.trim() === '' || !hash || hash.trim() === '') {
      throw new Error('Invalid input');
    }
    return bcrypt.compare(password, hash);
  }

  /**
   * Hash a token for secure storage
   */
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.saltRounds);
  }

  /**
   * Determine user role based on permissions
   */
  private determineRole(permissions: string[]): string {
    if (permissions.includes('admin')) return 'admin';
    if (permissions.includes('write')) return 'editor';
    return 'viewer';
  }

  /**
   * Parse expiration string to milliseconds
   */
  private parseExpiration(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${expiresIn}`);
    }

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
      ms: 1
    };

    return num * (multipliers[unit] || multipliers.d);
  }

  /**
   * Generate an API key
   */
  async generateApiKey(): Promise<string> {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Validate API key format
   */
  async validateApiKeyFormat(key: any): Promise<boolean> {
    if (!key || typeof key !== 'string') return false;
    return key.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(key);
  }

  /**
   * Hash an API key
   */
  async hashApiKey(key: string): Promise<string> {
    return bcrypt.hash(key, this.saltRounds);
  }

  /**
   * Verify an API key against its hash
   */
  async verifyApiKey(key: string, hash: string): Promise<boolean> {
    return bcrypt.compare(key, hash);
  }

  /**
   * Create a session
   */
  async createSession(data: any, expiryMs?: number): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (expiryMs || 24 * 60 * 60 * 1000)); // 24h default
    
    this.sessions.set(sessionId, {
      ...data,
      createdAt: now,
      lastAccessed: now,
      expiresAt
    });
    
    return sessionId;
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    if (session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    return session;
  }

  /**
   * Update session access time
   */
  async updateSessionAccess(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = new Date();
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    let count = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Record authentication attempt
   */
  async recordAuthAttempt(identifier: string, successful: boolean): Promise<void> {
    const attempt = this.authAttempts.get(identifier) || { count: 0, lastAttempt: null, successful: false };
    
    if (successful) {
      this.authAttempts.delete(identifier);
    } else {
      attempt.count++;
      attempt.lastAttempt = new Date();
      attempt.successful = false;
      this.authAttempts.set(identifier, attempt);
    }
  }

  /**
   * Get authentication attempts
   */
  async getAuthAttempts(identifier: string): Promise<any> {
    return this.authAttempts.get(identifier) || { count: 0, lastAttempt: null, successful: false };
  }

  /**
   * Check if user is rate limited
   */
  async isRateLimited(identifier: string, maxAttempts: number, windowMs?: number): Promise<boolean> {
    const attempts = await this.getAuthAttempts(identifier);
    
    if (windowMs && attempts.lastAttempt) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();
      if (timeSinceLastAttempt > windowMs) {
        this.authAttempts.delete(identifier);
        return false;
      }
    }
    
    return attempts.count >= maxAttempts;
  }

  /**
   * Check if user has permission
   */
  hasPermission(userPermissions: string[], permission: string): boolean {
    return userPermissions.includes(permission);
  }

  /**
   * Check if user has all permissions
   */
  hasAllPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every(p => userPermissions.includes(p));
  }

  /**
   * Check if user has any of the permissions
   */
  hasAnyPermission(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.some(p => userPermissions.includes(p));
  }

  /**
   * Get role permissions
   */
  getRolePermissions(role: string, hierarchy: Record<string, string[]>): string[] {
    return hierarchy[role] || [];
  }

  /**
   * Generate secure token
   */
  async generateSecureToken(bytes: number): Promise<string> {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Check if token is secure
   */
  isTokenSecure(token: string): boolean {
    return token.length >= 32 && /^[a-f0-9]+$/.test(token);
  }

  /**
   * Constant time comparison
   */
  constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input: string): string {
    return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/<[^>]*>/g, '')
                .replace(/javascript:/gi, '');
  }

  /**
   * Validate input length
   */
  validateInputLength(input: string, maxLength: number): boolean {
    return input.length <= maxLength;
  }

  /**
   * Group array by property
   */
  private groupBy<T>(array: T[], property: keyof T): Record<string, number> {
    return array.reduce((groups, item) => {
      const key = String(item[property]);
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }
}

// Singleton instance
export const authService = new AuthService();

// Cleanup expired tokens every hour
setInterval(() => {
  authService.cleanupExpiredTokens();
}, 60 * 60 * 1000);