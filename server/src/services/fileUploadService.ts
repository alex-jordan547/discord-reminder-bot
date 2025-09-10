/**
 * File Upload Security Service
 * ===========================
 * Handles secure file uploads with validation, virus scanning, and audit logging
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '#/utils/loggingConfig';
import { auditLogger } from './auditLogger';

const logger = createLogger('file-upload');

export interface FileValidationResult {
  isValid: boolean;
  reason?: string;
  details?: Record<string, any>;
}

export interface FileSizeResult {
  isValid: boolean;
  size: number;
  limit: number;
}

export interface MalwareScanResult {
  isSafe: boolean;
  threats: string[];
  quarantined?: boolean;
  quarantinePath?: string;
}

export interface SecureStorageResult {
  success: boolean;
  filename: string;
  path: string;
  fullPath: string;
  checksum: string;
  error?: string;
}

export interface FileUploadResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  path?: string;
  checksum?: string;
  error?: string;
  quarantined?: boolean;
}

export interface UploadMetadata {
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
}

export class FileUploadService {
  private readonly uploadDir = process.env.UPLOAD_DIR || './uploads';
  private readonly quarantineDir = process.env.QUARANTINE_DIR || './quarantine';
  private readonly maxFileAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  // Allowed file types for database import/export
  private readonly allowedTypes = new Set(['csv', 'json', 'db', 'sqlite', 'sql', 'xlsx']);

  // File type size limits (in bytes)
  private readonly sizeLimits: Record<string, number> = {
    csv: 50 * 1024 * 1024, // 50MB
    json: 10 * 1024 * 1024, // 10MB
    db: 100 * 1024 * 1024, // 100MB
    sqlite: 100 * 1024 * 1024, // 100MB
    sql: 25 * 1024 * 1024, // 25MB
    xlsx: 25 * 1024 * 1024, // 25MB
  };

  // Known malicious signatures (simplified for demo)
  private readonly maliciousPatterns = [
    Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'), // EICAR test
    Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}'), // EICAR variant
    Buffer.from('MZ'), // PE executable header
    Buffer.from('\x7fELF'), // ELF executable header
    Buffer.from('#!/bin/sh'), // Shell script
    Buffer.from('#!/bin/bash'), // Bash script
    Buffer.from('<script'), // HTML script tags (case insensitive check needed)
  ];

  constructor() {
    this.ensureDirectoriesExist();
  }

  /**
   * Process a complete file upload with all security checks
   */
  async processUpload(
    fileBuffer: Buffer,
    filename: string,
    userId: string,
    metadata?: UploadMetadata,
  ): Promise<FileUploadResult> {
    const startTime = Date.now();

    try {
      logger.info('Processing file upload', {
        filename,
        userId,
        size: fileBuffer.length,
        userAgent: metadata?.userAgent,
        ip: metadata?.ipAddress,
      });

      // Step 1: Validate file type
      const typeValidation = await this.validateFileType(filename);
      if (!typeValidation.isValid) {
        await auditLogger.logSecurityEvent({
          event: 'file_validation_failed',
          severity: 'warning',
          userId,
          details: {
            filename,
            reason: typeValidation.reason,
            fileType: this.getFileExtension(filename),
          },
        });

        return {
          success: false,
          error: typeValidation.reason,
        };
      }

      // Step 2: Validate file size
      const extension = this.getFileExtension(filename);
      const sizeValidation = this.validateFileSize(fileBuffer, this.sizeLimits[extension]);
      if (!sizeValidation.isValid) {
        await auditLogger.logSecurityEvent({
          event: 'file_size_exceeded',
          severity: 'warning',
          userId,
          details: {
            filename,
            size: sizeValidation.size,
            limit: sizeValidation.limit,
          },
        });

        return {
          success: false,
          error: `File size exceeds maximum limit of ${this.formatFileSize(sizeValidation.limit)}`,
        };
      }

      // Step 3: Validate file content matches extension
      const contentValidation = await this.validateFileContent(fileBuffer, extension);
      if (!contentValidation) {
        await auditLogger.logSecurityEvent({
          event: 'file_content_mismatch',
          severity: 'warning',
          userId,
          details: {
            filename,
            expectedType: extension,
            reason: 'Content does not match file extension',
          },
        });

        return {
          success: false,
          error: 'File content does not match extension',
        };
      }

      // Step 4: Scan for malware
      const scanResult = await this.scanForMalware(fileBuffer, filename);
      if (!scanResult.isSafe) {
        await auditLogger.logSecurityEvent({
          event: 'malware_detected',
          severity: 'critical',
          userId,
          details: {
            filename,
            threats: scanResult.threats,
            quarantined: scanResult.quarantined,
          },
        });

        return {
          success: false,
          error: `Malware detected: ${scanResult.threats.join(', ')}`,
          quarantined: scanResult.quarantined,
        };
      }

      // Step 5: Securely store file
      const storageResult = await this.securelyStoreFile(fileBuffer, filename, userId);
      if (!storageResult.success) {
        await auditLogger.logFileOperation({
          operation: 'upload',
          filename,
          userId,
          fileSize: fileBuffer.length,
          fileType: extension,
          success: false,
          error: storageResult.error,
          timestamp: new Date(),
          metadata,
        });

        return {
          success: false,
          error: storageResult.error,
        };
      }

      // Step 6: Generate unique file ID for tracking
      const fileId = crypto.randomUUID();

      // Step 7: Log successful upload
      await auditLogger.logFileOperation({
        operation: 'upload',
        filename: storageResult.filename,
        userId,
        fileSize: fileBuffer.length,
        fileType: extension,
        success: true,
        timestamp: new Date(),
        processingTime: Date.now() - startTime,
        metadata: {
          ...metadata,
          originalFilename: filename,
          storedPath: storageResult.path,
          checksum: storageResult.checksum,
        },
      });

      logger.info('File upload completed successfully', {
        fileId,
        originalFilename: filename,
        storedFilename: storageResult.filename,
        userId,
        processingTime: Date.now() - startTime,
      });

      return {
        success: true,
        fileId,
        filename: storageResult.filename,
        path: storageResult.path,
        checksum: storageResult.checksum,
      };
    } catch (error) {
      logger.error('File upload processing error', {
        filename,
        userId,
        error: error.message,
        stack: error.stack,
      });

      await auditLogger.logFileOperation({
        operation: 'upload',
        filename,
        userId,
        fileSize: fileBuffer.length,
        fileType: this.getFileExtension(filename),
        success: false,
        error: error.message,
        timestamp: new Date(),
        metadata,
      });

      return {
        success: false,
        error: 'Upload processing failed',
      };
    }
  }

  /**
   * Validate file type against allowed types
   */
  async validateFileType(filename: string): Promise<FileValidationResult> {
    const extension = this.getFileExtension(filename);

    if (!this.allowedTypes.has(extension)) {
      return {
        isValid: false,
        reason: `File type not allowed: .${extension}`,
        details: { allowedTypes: Array.from(this.allowedTypes) },
      };
    }

    return { isValid: true };
  }

  /**
   * Validate file size against limits
   */
  validateFileSize(fileBuffer: Buffer, maxSize: number): FileSizeResult {
    const size = fileBuffer.length;
    return {
      isValid: size <= maxSize,
      size,
      limit: maxSize,
    };
  }

  /**
   * Validate file content matches its extension
   */
  async validateFileContent(fileBuffer: Buffer, extension: string): Promise<boolean> {
    const content = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 1024));

    try {
      switch (extension) {
        case 'json':
          JSON.parse(content);
          return true;

        case 'csv':
          // Basic CSV validation - check for consistent delimiters
          const lines = content.split('\n').filter(line => line.trim());
          if (lines.length === 0) return false;

          const firstLineCommas = (lines[0].match(/,/g) || []).length;
          return lines
            .slice(1)
            .every(line => Math.abs((line.match(/,/g) || []).length - firstLineCommas) <= 1);

        case 'db':
        case 'sqlite':
          // Check SQLite file signature
          const sqliteSignature = fileBuffer.subarray(0, 16).toString('ascii');
          return sqliteSignature === 'SQLite format 3\x00';

        case 'sql':
          // Basic SQL validation - check for SQL keywords
          const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];
          const upperContent = content.toUpperCase();
          return sqlKeywords.some(keyword => upperContent.includes(keyword));

        case 'xlsx':
          // Check for Excel file signature (ZIP-based)
          const excelSignature = fileBuffer.subarray(0, 4);
          return excelSignature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP signature

        default:
          return false;
      }
    } catch (error) {
      logger.warn('File content validation error', {
        extension,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Scan file for malware signatures
   */
  async scanForMalware(fileBuffer: Buffer, filename: string): Promise<MalwareScanResult> {
    const threats: string[] = [];

    try {
      // Check for known malicious patterns
      for (const pattern of this.maliciousPatterns) {
        if (fileBuffer.includes(pattern)) {
          if (pattern.toString().includes('EICAR')) {
            threats.push('EICAR-Test-File');
          } else if (pattern.equals(Buffer.from('MZ'))) {
            threats.push('Possible-Executable');
          } else if (pattern.toString().includes('script')) {
            threats.push('Script-Content');
          } else {
            threats.push('Suspicious-Pattern');
          }
        }
      }

      // Check for suspicious file names
      const suspiciousNames = [/\.(exe|bat|cmd|scr|pif|com)$/i, /autorun\.inf/i, /desktop\.ini/i];

      for (const pattern of suspiciousNames) {
        if (pattern.test(filename)) {
          threats.push('Suspicious-Filename');
          break;
        }
      }

      if (threats.length > 0) {
        // Quarantine the file
        const quarantinePath = await this.quarantineFile(fileBuffer, filename);

        logger.warn('Malware detected in file', {
          filename,
          threats,
          quarantinePath,
        });

        return {
          isSafe: false,
          threats,
          quarantined: true,
          quarantinePath,
        };
      }

      return {
        isSafe: true,
        threats: [],
      };
    } catch (error) {
      logger.error('Malware scanning error', {
        filename,
        error: error.message,
      });

      // Fail securely - reject file if scanning fails
      throw new Error('Virus scanning failed - file rejected for security');
    }
  }

  /**
   * Securely store uploaded file
   */
  async securelyStoreFile(
    fileBuffer: Buffer,
    originalFilename: string,
    userId: string,
  ): Promise<SecureStorageResult> {
    try {
      const extension = this.getFileExtension(originalFilename);
      const secureFilename = this.generateSecureFilename(extension);
      const datePath = this.generateDatePath();
      const relativePath = path.join(datePath, secureFilename);
      const fullPath = path.join(this.uploadDir, relativePath);

      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

      // Write file with restrictive permissions
      await fs.promises.writeFile(fullPath, fileBuffer, { mode: 0o600 });

      // Calculate checksum for integrity verification
      const checksum = this.calculateFileHash(fileBuffer);

      logger.info('File stored securely', {
        originalFilename,
        secureFilename,
        path: relativePath,
        checksum,
        userId,
      });

      return {
        success: true,
        filename: secureFilename,
        path: relativePath,
        fullPath,
        checksum,
      };
    } catch (error) {
      logger.error('Secure file storage error', {
        originalFilename,
        userId,
        error: error.message,
      });

      return {
        success: false,
        filename: '',
        path: '',
        fullPath: '',
        checksum: '',
        error: 'File storage failed',
      };
    }
  }

  /**
   * Quarantine suspicious file
   */
  private async quarantineFile(fileBuffer: Buffer, filename: string): Promise<string> {
    const quarantineFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${filename}`;
    const quarantinePath = path.join(this.quarantineDir, quarantineFilename);

    await fs.promises.mkdir(this.quarantineDir, { recursive: true });
    await fs.promises.writeFile(quarantinePath, fileBuffer, { mode: 0o600 });

    return quarantinePath;
  }

  /**
   * Calculate file hash for integrity verification
   */
  calculateFileHash(fileBuffer: Buffer): string {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Generate secure random filename
   */
  private generateSecureFilename(extension: string): string {
    const randomName = crypto.randomBytes(16).toString('hex');
    return `${randomName}.${extension}`;
  }

  /**
   * Generate date-based directory path
   */
  private generateDatePath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return path.join(String(year), month, day);
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    return path.extname(filename).substring(1).toLowerCase();
  }

  /**
   * Format file size for human reading
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i))} ${sizes[i]}`;
  }

  /**
   * Get file size limit for specific type
   */
  getFileSizeLimit(extension: string): number {
    return this.sizeLimits[extension] || 10 * 1024 * 1024; // Default 10MB
  }

  /**
   * Clean up old uploaded files
   */
  async cleanupOldFiles(maxAgeInDays: number = 30): Promise<number> {
    try {
      const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let cleanedCount = 0;

      const cleanDirectory = async (dirPath: string): Promise<void> => {
        if (!fs.existsSync(dirPath)) return;

        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            await cleanDirectory(fullPath);
            // Remove empty directories
            const remainingFiles = await fs.promises.readdir(fullPath);
            if (remainingFiles.length === 0) {
              await fs.promises.rmdir(fullPath);
            }
          } else {
            const stats = await fs.promises.stat(fullPath);
            if (now - stats.mtime.getTime() > maxAge) {
              await fs.promises.unlink(fullPath);
              cleanedCount++;
              logger.debug('Cleaned up old file', {
                file: fullPath,
                age: now - stats.mtime.getTime(),
              });
            }
          }
        }
      };

      await cleanDirectory(this.uploadDir);

      if (cleanedCount > 0) {
        logger.info('File cleanup completed', { cleanedCount, maxAgeInDays });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('File cleanup error', { error: error.message });
      return 0;
    }
  }

  /**
   * Log file access for audit trail
   */
  async logFileAccess(
    filename: string,
    userId: string,
    operation: 'download' | 'view' | 'delete',
    metadata?: UploadMetadata,
  ): Promise<void> {
    await auditLogger.logFileOperation({
      operation,
      filename,
      userId,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectoriesExist(): void {
    const dirs = [this.uploadDir, this.quarantineDir];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
        logger.info('Created directory', { directory: dir });
      }
    }
  }
}

// Export singleton instance
export const fileUploadService = new FileUploadService();

// Schedule cleanup every 24 hours
setInterval(
  () => {
    fileUploadService.cleanupOldFiles();
  },
  24 * 60 * 60 * 1000,
);
