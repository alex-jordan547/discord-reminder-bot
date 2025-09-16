/**
 * File Upload Middleware
 * =====================
 * Security middleware for file upload endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { fileUploadService } from '../services/fileUploadService.js';
import { createLogger } from '../utils/loggingConfig.js';

const logger = createLogger('file-upload-middleware');

export interface FileUploadRequest extends FastifyRequest {
  user?: {
    userId: string;
    role: string;
    permissions: string[];
  };
}

/**
 * File upload middleware with security validation
 */
export async function fileUploadMiddleware(request: FileUploadRequest, reply: FastifyReply) {
  try {
    // Get file from request
    const filename = request.headers['x-filename'] as string;

    if (!filename) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Filename header required',
      });
    }

    // Get file buffer from request body
    const fileBuffer = request.body as Buffer;

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'File content required',
      });
    }

    // Basic file type validation
    const extension = filename.split('.').pop()?.toLowerCase();
    const allowedTypes = ['csv', 'json', 'db', 'sqlite', 'sql', 'xlsx'];

    if (!extension || !allowedTypes.includes(extension)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `File type not allowed: .${extension}`,
      });
    }

    // File size validation
    const maxSizes: Record<string, number> = {
      csv: 50 * 1024 * 1024, // 50MB
      json: 10 * 1024 * 1024, // 10MB
      db: 100 * 1024 * 1024, // 100MB
      sqlite: 100 * 1024 * 1024, // 100MB
      sql: 25 * 1024 * 1024, // 25MB
      xlsx: 25 * 1024 * 1024, // 25MB
    };

    const maxSize = maxSizes[extension];
    if (fileBuffer.length > maxSize) {
      return reply.status(413).send({
        error: 'Payload Too Large',
        message: `File size exceeds maximum limit of ${Math.round(maxSize / (1024 * 1024))}MB`,
      });
    }

    // Content type validation
    const contentValidation = await fileUploadService.validateFileContent(fileBuffer, extension);
    if (!contentValidation) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'File content does not match extension',
      });
    }

    logger.info('File upload middleware passed', {
      filename,
      size: fileBuffer.length,
      type: extension,
      userId: request.user?.userId,
    });

    // Continue to route handler
  } catch (error) {
    logger.error('File upload middleware error', {
      error: error.message,
      filename: request.headers['x-filename'],
      userId: request.user?.userId,
    });

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'File processing failed',
    });
  }
}
