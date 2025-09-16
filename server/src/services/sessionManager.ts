/**
 * Session Manager Service
 * ======================
 * Handles dashboard user sessions with Redis backend support
 */

import crypto from 'crypto';
import { createLogger } from '../utils/loggingConfig.js';

const logger = createLogger('session');

export interface SessionData {
  userId: string;
  data: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionOptions {
  maxAge?: number; // milliseconds
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private redisClient?: any; // Redis client if available
  private defaultMaxAge = 24 * 60 * 60 * 1000; // 24 hours

  constructor(redisClient?: any) {
    this.redisClient = redisClient;

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    data: Record<string, any>,
    maxAge: number = this.defaultMaxAge,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + maxAge);

      const sessionData: SessionData = {
        userId,
        data: { ...data },
        createdAt: now,
        lastActivity: now,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      };

      // Store in Redis if available, otherwise in memory
      if (this.redisClient) {
        await this.redisClient.setEx(
          `session:${sessionId}`,
          Math.ceil(maxAge / 1000),
          JSON.stringify(this.serializeSession(sessionData)),
        );
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      logger.info('Session created', {
        sessionId,
        userId,
        expiresAt: expiresAt.toISOString(),
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      });

      return sessionId;
    } catch (error) {
      logger.error('Failed to create session', { userId, error: error.message });
      throw new Error('Session creation failed');
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      let sessionData: SessionData | null = null;

      if (this.redisClient) {
        const data = await this.redisClient.get(`session:${sessionId}`);
        if (data) {
          sessionData = this.deserializeSession(JSON.parse(data));
        }
      } else {
        sessionData = this.sessions.get(sessionId) || null;
      }

      // Check if session is expired
      if (sessionData && sessionData.expiresAt < new Date()) {
        await this.destroySession(sessionId);
        logger.debug('Session expired and removed', { sessionId });
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session', { sessionId, error: error.message });
      return null;
    }
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      sessionData.lastActivity = new Date();

      if (this.redisClient) {
        const ttl = await this.redisClient.ttl(`session:${sessionId}`);
        if (ttl > 0) {
          await this.redisClient.setEx(
            `session:${sessionId}`,
            ttl,
            JSON.stringify(this.serializeSession(sessionData)),
          );
        }
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      logger.debug('Session activity updated', { sessionId });
      return true;
    } catch (error) {
      logger.error('Failed to update session activity', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, newData: Record<string, any>): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      sessionData.data = { ...sessionData.data, ...newData };
      sessionData.lastActivity = new Date();

      if (this.redisClient) {
        const ttl = await this.redisClient.ttl(`session:${sessionId}`);
        if (ttl > 0) {
          await this.redisClient.setEx(
            `session:${sessionId}`,
            ttl,
            JSON.stringify(this.serializeSession(sessionData)),
          );
        }
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      logger.debug('Session data updated', { sessionId });
      return true;
    } catch (error) {
      logger.error('Failed to update session', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      if (this.redisClient) {
        await this.redisClient.del(`session:${sessionId}`);
      } else {
        this.sessions.delete(sessionId);
      }

      logger.info('Session destroyed', { sessionId });
      return true;
    } catch (error) {
      logger.error('Failed to destroy session', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Destroy all sessions for a user
   */
  async destroyUserSessions(userId: string): Promise<number> {
    try {
      let destroyedCount = 0;

      if (this.redisClient) {
        // In a real Redis implementation, you'd use a pattern scan
        // For now, we'll track user sessions separately
        const userSessionsKey = `user_sessions:${userId}`;
        const sessionIds = (await this.redisClient.sMembers(userSessionsKey)) || [];

        for (const sessionId of sessionIds) {
          await this.redisClient.del(`session:${sessionId}`);
          destroyedCount++;
        }

        await this.redisClient.del(userSessionsKey);
      } else {
        for (const [sessionId, sessionData] of this.sessions.entries()) {
          if (sessionData.userId === userId) {
            this.sessions.delete(sessionId);
            destroyedCount++;
          }
        }
      }

      logger.info('User sessions destroyed', { userId, count: destroyedCount });
      return destroyedCount;
    } catch (error) {
      logger.error('Failed to destroy user sessions', { userId, error: error.message });
      return 0;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Partial<SessionData>[]> {
    try {
      const sessions: Partial<SessionData>[] = [];
      const now = new Date();

      if (this.redisClient) {
        // This would require a more complex implementation with Redis
        // For now, return empty array for Redis-based sessions
        return [];
      } else {
        for (const [sessionId, sessionData] of this.sessions.entries()) {
          if (sessionData.userId === userId && sessionData.expiresAt > now) {
            sessions.push({
              createdAt: sessionData.createdAt,
              lastActivity: sessionData.lastActivity,
              expiresAt: sessionData.expiresAt,
              userAgent: sessionData.userAgent,
              ipAddress: sessionData.ipAddress,
            });
          }
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', { userId, error: error.message });
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      let cleanedCount = 0;
      const now = new Date();

      if (!this.redisClient) {
        // Only cleanup memory sessions - Redis handles expiration automatically
        for (const [sessionId, sessionData] of this.sessions.entries()) {
          if (sessionData.expiresAt < now) {
            this.sessions.delete(sessionId);
            cleanedCount++;
          }
        }

        if (cleanedCount > 0) {
          logger.info('Cleaned up expired sessions', { count: cleanedCount });
        }
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Session cleanup error', { error: error.message });
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  async getStats() {
    try {
      const now = new Date();
      const stats = {
        totalSessions: 0,
        activeSessions: 0,
        expiredSessions: 0,
        sessionsByUser: {} as Record<string, number>,
        averageSessionAge: 0,
        oldestSession: null as Date | null,
        newestSession: null as Date | null,
      };

      if (!this.redisClient) {
        const sessions = Array.from(this.sessions.values());
        stats.totalSessions = sessions.length;

        let totalAge = 0;

        for (const session of sessions) {
          if (session.expiresAt > now) {
            stats.activeSessions++;
          } else {
            stats.expiredSessions++;
          }

          stats.sessionsByUser[session.userId] = (stats.sessionsByUser[session.userId] || 0) + 1;

          const age = now.getTime() - session.createdAt.getTime();
          totalAge += age;

          if (!stats.oldestSession || session.createdAt < stats.oldestSession) {
            stats.oldestSession = session.createdAt;
          }

          if (!stats.newestSession || session.createdAt > stats.newestSession) {
            stats.newestSession = session.createdAt;
          }
        }

        if (sessions.length > 0) {
          stats.averageSessionAge = totalAge / sessions.length;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get session stats', { error: error.message });
      return null;
    }
  }

  /**
   * Generate a secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Serialize session data for storage
   */
  private serializeSession(session: SessionData): any {
    return {
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Deserialize session data from storage
   */
  private deserializeSession(data: any): SessionData {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      lastActivity: new Date(data.lastActivity),
      expiresAt: new Date(data.expiresAt),
    };
  }

  /**
   * Start cleanup interval for expired sessions
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    setInterval(
      () => {
        this.cleanupExpiredSessions();
      },
      5 * 60 * 1000,
    );
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
