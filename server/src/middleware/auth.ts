/**
 * Authentication Middleware
 * ========================
 * Provides authentication and authorization middleware for Fastify routes
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/authService';
import { sessionManager } from '../services/sessionManager';
import { createLogger } from '#/utils/loggingConfig';

const logger = createLogger('auth-middleware');

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId: string;
    role: string;
    permissions: string[];
    sessionId?: string;
  };
}

/**
 * Main authentication middleware
 * Supports both API tokens (Bearer) and session-based authentication
 */
export async function authMiddleware(
  request: AuthenticatedRequest, 
  reply: FastifyReply
) {
  try {
    const authorization = request.headers.authorization;
    const sessionCookie = request.cookies?.session;

    // Try API token authentication first
    if (authorization) {
      return await authenticateWithToken(request, reply, authorization);
    }

    // Fallback to session authentication
    if (sessionCookie) {
      return await authenticateWithSession(request, reply, sessionCookie);
    }

    // No authentication provided
    logAuthFailure(request, 'No authentication provided');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required'
    });

  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error.message,
      stack: error.stack,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication service unavailable'
    });
  }
}

/**
 * Require authentication middleware
 * Ensures request has a valid user
 */
export async function requireAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  await authMiddleware(request, reply);

  if (!request.user) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Valid authentication required'
    });
  }
}

/**
 * Require specific role middleware
 */
export function requireRole(role: string) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);

    if (!request.user || request.user.role !== role) {
      logAuthFailure(request, `Insufficient role: required ${role}, has ${request.user?.role}`);
      
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
  };
}

/**
 * Require specific permission middleware
 */
export function requirePermission(permission: string) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);

    const user = request.user;
    if (!user || (!user.permissions.includes(permission) && !user.permissions.includes('admin'))) {
      logAuthFailure(request, `Insufficient permissions: required ${permission}`);
      
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
  };
}

/**
 * Optional authentication middleware
 * Populates user if authenticated, but doesn't require it
 */
export async function optionalAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    await authMiddleware(request, reply);
  } catch (error) {
    // Ignore authentication errors for optional auth
    logger.debug('Optional authentication failed', { error: error.message });
  }
}

/**
 * API token authentication
 */
async function authenticateWithToken(
  request: AuthenticatedRequest,
  reply: FastifyReply,
  authorization: string
) {
  // Check Bearer format
  if (!authorization.startsWith('Bearer ')) {
    logAuthFailure(request, 'Invalid token format - missing Bearer prefix');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid token format'
    });
  }

  const token = authorization.substring(7); // Remove 'Bearer '
  
  if (!token || token.trim().length === 0) {
    logAuthFailure(request, 'Empty token');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'API token required'
    });
  }

  try {
    const payload = await authService.validateToken(token);
    
    if (!payload) {
      logAuthFailure(request, 'Invalid or expired token');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    // Set user context
    request.user = {
      userId: payload.userId,
      role: payload.role,
      permissions: payload.permissions
    };

    logger.debug('API token authentication successful', {
      userId: payload.userId,
      role: payload.role,
      permissions: payload.permissions
    });

  } catch (error) {
    logger.error('Token validation error', { 
      error: error.message,
      tokenPreview: token.substring(0, 10) + '...'
    });

    if (error.message.includes('Database connection failed')) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Authentication service unavailable'
      });
    }

    logAuthFailure(request, 'Token validation failed');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Session-based authentication
 */
async function authenticateWithSession(
  request: AuthenticatedRequest,
  reply: FastifyReply,
  sessionId: string
) {
  try {
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      logAuthFailure(request, 'Invalid or expired session');
      
      // Clear the invalid session cookie
      reply.setCookie('session', '', { 
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Session expired'
      });
    }

    // Update session activity
    await sessionManager.updateActivity(sessionId);

    // Set user context
    request.user = {
      userId: session.userId,
      role: session.data.role || 'user',
      permissions: session.data.permissions || ['read'],
      sessionId
    };

    logger.debug('Session authentication successful', {
      userId: session.userId,
      sessionId,
      role: request.user.role
    });

  } catch (error) {
    logger.error('Session validation error', { 
      error: error.message,
      sessionId: sessionId.substring(0, 8) + '...'
    });

    logAuthFailure(request, 'Session validation failed');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Session validation failed'
    });
  }
}

/**
 * Log authentication failures for security monitoring
 */
function logAuthFailure(request: AuthenticatedRequest, reason: string) {
  logger.warn('Authentication failed', {
    reason,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    path: request.url,
    method: request.method,
    timestamp: new Date().toISOString()
  });
}

/**
 * Create login route handler
 */
export async function handleLogin(
  request: FastifyRequest<{
    Body: {
      username: string;
      password: string;
      remember?: boolean;
    }
  }>,
  reply: FastifyReply
) {
  try {
    const { username, password, remember = false } = request.body;

    // Validate credentials (implement your authentication logic)
    const user = await validateUserCredentials(username, password);
    
    if (!user) {
      logAuthFailure(request as AuthenticatedRequest, 'Invalid credentials');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid username or password'
      });
    }

    // Create session
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days vs 1 day
    const sessionId = await sessionManager.createSession(
      user.id,
      {
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        loginTime: new Date()
      },
      maxAge,
      {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip
      }
    );

    // Set session cookie
    reply.setCookie('session', sessionId, {
      maxAge: Math.floor(maxAge / 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    logger.info('User login successful', {
      userId: user.id,
      username: user.username,
      sessionId,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.send({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      }
    });

  } catch (error) {
    logger.error('Login error', { error: error.message });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Login service unavailable'
    });
  }
}

/**
 * Create logout route handler
 */
export async function handleLogout(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const sessionId = request.user?.sessionId || request.cookies?.session;
    
    if (sessionId) {
      await sessionManager.destroySession(sessionId);
      
      // Clear session cookie
      reply.setCookie('session', '', {
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });

      logger.info('User logout successful', {
        userId: request.user?.userId,
        sessionId
      });
    }

    return reply.send({ success: true, message: 'Logged out successfully' });

  } catch (error) {
    logger.error('Logout error', { error: error.message });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Logout service unavailable'
    });
  }
}

/**
 * Placeholder for user credential validation
 * Replace with your actual authentication logic
 */
async function validateUserCredentials(username: string, password: string) {
  // This is a placeholder - implement your actual user authentication logic
  // For example, check against database, LDAP, etc.
  
  if (username === 'admin' && password === 'admin') {
    return {
      id: 'admin-user',
      username: 'admin',
      role: 'admin',
      permissions: ['admin', 'read', 'write']
    };
  }
  
  return null;
}