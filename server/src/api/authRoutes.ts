/**
 * Authentication Routes
 * ====================
 * API routes for authentication, session management, and file uploads
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  requireAuth,
  requirePermission,
  handleLogin,
  handleLogout,
  AuthenticatedRequest,
} from '../middleware/auth';
import { fileUploadMiddleware } from '../middleware/fileUpload';
import { authService } from '../services/authService';
import { sessionManager } from '../services/sessionManager';
import { fileUploadService } from '../services/fileUploadService';
import { auditLogger } from '../services/auditLogger';
import { createLogger } from '#/utils/loggingConfig';

const logger = createLogger('auth-routes');

export async function registerAuthRoutes(fastify: FastifyInstance) {
  // Authentication endpoints
  fastify.post('/api/auth/login', handleLogin);
  fastify.post('/api/auth/logout', { preHandler: requireAuth }, handleLogout);

  // Token management
  fastify.post(
    '/api/auth/tokens',
    {
      preHandler: [requireAuth, requirePermission('admin')],
    },
    async (
      request: FastifyRequest<{
        Body: {
          permissions: string[];
          expiresIn?: string;
          description?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { permissions, expiresIn, description } = request.body;
        const user = (request as AuthenticatedRequest).user!;

        const token = await authService.generateApiToken(user.userId, {
          permissions,
          expiresIn,
          metadata: { description, createdBy: user.userId },
        });

        await auditLogger.logAuthenticationEvent(
          user.userId,
          'token_refresh',
          'success',
          { permissions, description },
          { ipAddress: request.ip, userAgent: request.headers['user-agent'] },
        );

        return reply.send({
          success: true,
          token,
          expiresIn: expiresIn || '30d',
        });
      } catch (error) {
        logger.error('Token generation error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Token generation failed',
        });
      }
    },
  );

  fastify.get(
    '/api/auth/tokens',
    {
      preHandler: [requireAuth, requirePermission('admin')],
    },
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const tokens = await authService.getUserTokens(user.userId);

        return reply.send({
          success: true,
          tokens: tokens.map(token => ({
            id: token.id,
            permissions: token.permissions,
            expiresAt: token.expiresAt,
            lastUsed: token.lastUsed,
            metadata: token.metadata,
          })),
        });
      } catch (error) {
        logger.error('Token list error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve tokens',
        });
      }
    },
  );

  fastify.delete(
    '/api/auth/tokens/:tokenId',
    {
      preHandler: [requireAuth, requirePermission('admin')],
    },
    async (
      request: FastifyRequest<{
        Params: { tokenId: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { tokenId } = request.params;
        const user = (request as AuthenticatedRequest).user!;

        const revoked = await authService.revokeToken(tokenId);

        if (revoked) {
          await auditLogger.logSecurityEvent({
            event: 'token_revoked',
            severity: 'info',
            userId: user.userId,
            details: { tokenId, revokedBy: user.userId },
          });

          return reply.send({ success: true, message: 'Token revoked' });
        } else {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Token not found',
          });
        }
      } catch (error) {
        logger.error('Token revocation error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Token revocation failed',
        });
      }
    },
  );

  // Session management
  fastify.get(
    '/api/auth/sessions',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const sessions = await sessionManager.getUserSessions(user.userId);

        return reply.send({
          success: true,
          sessions: sessions.map(session => ({
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            expiresAt: session.expiresAt,
            userAgent: session.userAgent,
            ipAddress: session.ipAddress,
          })),
        });
      } catch (error) {
        logger.error('Session list error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve sessions',
        });
      }
    },
  );

  fastify.delete(
    '/api/auth/sessions',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const destroyedCount = await sessionManager.destroyUserSessions(user.userId);

        await auditLogger.logAuthenticationEvent(user.userId, 'logout', 'success', {
          destroyedSessions: destroyedCount,
          logoutAll: true,
        });

        return reply.send({
          success: true,
          message: `${destroyedCount} sessions destroyed`,
        });
      } catch (error) {
        logger.error('Session destruction error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Session destruction failed',
        });
      }
    },
  );

  // File upload endpoints
  fastify.post(
    '/api/files/upload',
    {
      preHandler: [requireAuth, requirePermission('write'), fileUploadMiddleware],
    },
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const filename = request.headers['x-filename'] as string;
        const fileBuffer = request.body as Buffer;

        const result = await fileUploadService.processUpload(fileBuffer, filename, user.userId, {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
          sessionId: user.sessionId,
        });

        if (result.success) {
          return reply.send({
            success: true,
            fileId: result.fileId,
            filename: result.filename,
            checksum: result.checksum,
          });
        } else {
          return reply.status(400).send({
            error: 'Bad Request',
            message: result.error,
            quarantined: result.quarantined,
          });
        }
      } catch (error) {
        logger.error('File upload error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'File upload failed',
        });
      }
    },
  );

  fastify.get(
    '/api/files/:filename',
    {
      preHandler: [requireAuth, requirePermission('read')],
    },
    async (
      request: FastifyRequest<{
        Params: { filename: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { filename } = request.params;
        const user = (request as AuthenticatedRequest).user!;

        // Log file access
        await fileUploadService.logFileAccess(filename, user.userId, 'download', {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        });

        // In a real implementation, you'd serve the file from secure storage
        return reply.send({
          success: true,
          message: 'File access logged',
          filename,
        });
      } catch (error) {
        logger.error('File access error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'File access failed',
        });
      }
    },
  );

  // Authentication statistics (admin only)
  fastify.get(
    '/api/auth/stats',
    {
      preHandler: [requireAuth, requirePermission('admin')],
    },
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const authStats = authService.getStats();
        const sessionStats = await sessionManager.getStats();
        const auditStats = await auditLogger.getAuditStats();

        return reply.send({
          success: true,
          authentication: authStats,
          sessions: sessionStats,
          audit: auditStats,
        });
      } catch (error) {
        logger.error('Stats retrieval error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Statistics unavailable',
        });
      }
    },
  );

  // Audit logs export (admin only)
  fastify.get(
    '/api/audit/export',
    {
      preHandler: [requireAuth, requirePermission('admin')],
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          format?: 'json' | 'csv';
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { format = 'json', startDate, endDate } = request.query;
        const user = (request as AuthenticatedRequest).user!;

        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;

        const exportData = await auditLogger.exportAuditLogs(format, start, end);

        await auditLogger.logSecurityEvent({
          event: 'audit_export',
          severity: 'info',
          userId: user.userId,
          details: { format, startDate, endDate, recordCount: exportData.split('\n').length },
        });

        const contentType = format === 'csv' ? 'text/csv' : 'application/json';
        const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;

        return reply
          .header('Content-Type', contentType)
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(exportData);
      } catch (error) {
        logger.error('Audit export error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Audit export failed',
        });
      }
    },
  );

  logger.info('Authentication routes registered');
}
