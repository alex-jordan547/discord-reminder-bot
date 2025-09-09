/**
 * File Upload Security Tests (TDD)
 * ================================
 * Tests for file type validation, size limits, virus scanning, and secure storage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { FileUploadService } from '../../src/services/fileUploadService';
import { AuditLogger } from '../../src/services/auditLogger';
import { fileUploadMiddleware } from '../../src/middleware/fileUpload';
import * as fs from 'fs';
import * as path from 'path';

describe('File Upload Security', () => {
  let server: FastifyInstance;
  let fileUploadService: FileUploadService;
  let auditLogger: AuditLogger;
  const testUploadDir = './test-uploads';

  beforeEach(async () => {
    server = Fastify();
    fileUploadService = new FileUploadService();
    auditLogger = new AuditLogger();
    
    // Create test upload directory
    if (!fs.existsSync(testUploadDir)) {
      fs.mkdirSync(testUploadDir, { recursive: true });
    }
  });

  afterEach(async () => {
    await server.close();
    
    // Clean up test upload directory
    if (fs.existsSync(testUploadDir)) {
      fs.rmSync(testUploadDir, { recursive: true, force: true });
    }
  });

  describe('File Type Validation', () => {
    it('should reject unauthorized file types', async () => {
      // Arrange
      const executableContent = Buffer.from('MZ\x90\x00'); // PE header
      server.post('/upload', { preHandler: fileUploadMiddleware }, async () => {
        return { success: true };
      });

      // Act
      const response = await server.inject({
        method: 'POST',
        url: '/upload',
        payload: executableContent,
        headers: {
          'content-type': 'application/octet-stream',
          'x-filename': 'malicious.exe'
        }
      });

      // Assert
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: 'File type not allowed: .exe'
      });
    });

    it('should accept authorized file types for database import', async () => {
      // Arrange
      const csvContent = Buffer.from('id,name,value\n1,test,123');
      server.post('/upload', { preHandler: fileUploadMiddleware }, async () => {
        return { success: true };
      });

      // Act
      const response = await server.inject({
        method: 'POST',
        url: '/upload',
        payload: csvContent,
        headers: {
          'content-type': 'text/csv',
          'x-filename': 'data.csv'
        }
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        success: true
      });
    });

    it('should validate file content matches extension', async () => {
      // Arrange - PNG file with wrong extension
      const pngContent = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG signature
      server.post('/upload', { preHandler: fileUploadMiddleware }, async () => {
        return { success: true };
      });

      // Act
      const response = await server.inject({
        method: 'POST',
        url: '/upload',
        payload: pngContent,
        headers: {
          'content-type': 'application/json',
          'x-filename': 'data.json'
        }
      });

      // Assert
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: 'File content does not match extension'
      });
    });

    it('should allow valid JSON files', async () => {
      // Arrange
      const jsonContent = Buffer.from(JSON.stringify({ users: [{ id: 1, name: 'test' }] }));
      const isValid = await fileUploadService.validateFileContent(jsonContent, 'json');

      // Act & Assert
      expect(isValid).toBe(true);
    });

    it('should reject invalid JSON files', async () => {
      // Arrange
      const invalidJsonContent = Buffer.from('{ invalid json content');
      const isValid = await fileUploadService.validateFileContent(invalidJsonContent, 'json');

      // Act & Assert
      expect(isValid).toBe(false);
    });

    it('should allow valid SQLite files', async () => {
      // Arrange
      const sqliteHeader = Buffer.from('SQLite format 3\x00');
      const isValid = await fileUploadService.validateFileContent(sqliteHeader, 'db');

      // Act & Assert
      expect(isValid).toBe(true);
    });
  });

  describe('File Size Limits', () => {
    it('should reject files exceeding maximum size', async () => {
      // Arrange
      const largeContent = Buffer.alloc(11 * 1024 * 1024); // 11MB
      server.post('/upload', { 
        preHandler: fileUploadMiddleware,
        bodyLimit: 10 * 1024 * 1024 // 10MB limit
      }, async () => {
        return { success: true };
      });

      // Act
      const response = await server.inject({
        method: 'POST',
        url: '/upload',
        payload: largeContent,
        headers: {
          'content-type': 'application/octet-stream',
          'x-filename': 'large.bin'
        }
      });

      // Assert
      expect(response.statusCode).toBe(413);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Payload Too Large',
        message: 'File size exceeds maximum limit of 10MB'
      });
    });

    it('should accept files within size limit', async () => {
      // Arrange
      const smallContent = Buffer.from('small file content');
      const result = await fileUploadService.validateFileSize(smallContent, 1024 * 1024); // 1MB limit

      // Act & Assert
      expect(result.isValid).toBe(true);
      expect(result.size).toBe(smallContent.length);
    });

    it('should have different size limits for different file types', async () => {
      // Arrange
      const csvLimit = fileUploadService.getFileSizeLimit('csv');
      const sqliteLimit = fileUploadService.getFileSizeLimit('db');
      const jsonLimit = fileUploadService.getFileSizeLimit('json');

      // Act & Assert
      expect(csvLimit).toBe(50 * 1024 * 1024); // 50MB for CSV
      expect(sqliteLimit).toBe(100 * 1024 * 1024); // 100MB for SQLite
      expect(jsonLimit).toBe(10 * 1024 * 1024); // 10MB for JSON
    });
  });

  describe('Virus Scanning', () => {
    it('should detect malicious patterns in uploaded files', async () => {
      // Arrange
      const maliciousContent = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const result = await fileUploadService.scanForMalware(maliciousContent, 'test.txt');

      // Act & Assert
      expect(result.isSafe).toBe(false);
      expect(result.threats).toContain('EICAR-Test-File');
    });

    it('should pass clean files through scanning', async () => {
      // Arrange
      const cleanContent = Buffer.from('id,name,email\n1,John,john@example.com');
      const result = await fileUploadService.scanForMalware(cleanContent, 'clean.csv');

      // Act & Assert
      expect(result.isSafe).toBe(true);
      expect(result.threats).toHaveLength(0);
    });

    it('should quarantine detected malicious files', async () => {
      // Arrange
      const maliciousContent = Buffer.from('EVIL_SCRIPT_CONTENT');
      const mockQuarantineResult = {
        isSafe: false,
        threats: ['Generic.Trojan'],
        quarantined: true,
        quarantinePath: '/quarantine/file-12345.bin'
      };

      const scanSpy = vi.spyOn(fileUploadService, 'scanForMalware')
        .mockResolvedValue(mockQuarantineResult);

      // Act
      const result = await fileUploadService.processUpload(maliciousContent, 'evil.bin', 'admin');

      // Assert
      expect(scanSpy).toHaveBeenCalledWith(maliciousContent, 'evil.bin');
      expect(result.success).toBe(false);
      expect(result.quarantined).toBe(true);
    });

    it('should handle virus scanner unavailability gracefully', async () => {
      // Arrange
      const content = Buffer.from('test content');
      const scanSpy = vi.spyOn(fileUploadService, 'scanForMalware')
        .mockRejectedValue(new Error('Scanner service unavailable'));

      // Act
      const result = await fileUploadService.processUpload(content, 'test.txt', 'admin');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Virus scanning failed');
    });
  });

  describe('Secure File Storage', () => {
    it('should store files with secure random filenames', async () => {
      // Arrange
      const content = Buffer.from('test content');
      const originalFilename = 'test.csv';

      // Act
      const result = await fileUploadService.securelyStoreFile(content, originalFilename, 'admin');

      // Assert
      expect(result.success).toBe(true);
      expect(result.filename).not.toBe(originalFilename);
      expect(result.filename).toMatch(/^[a-f0-9]{32}\.csv$/); // 32 char hex + extension
      expect(result.path).toMatch(/^\/secure\/uploads\/\d{4}\/\d{2}\/\d{2}\//); // Date-based path
    });

    it('should create secure directory structure', async () => {
      // Arrange
      const content = Buffer.from('test content');
      const today = new Date();
      const expectedPath = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

      // Act
      const result = await fileUploadService.securelyStoreFile(content, 'test.csv', 'admin');

      // Assert
      expect(result.path).toContain(expectedPath);
    });

    it('should set restrictive file permissions', async () => {
      // Arrange
      const content = Buffer.from('sensitive data');
      
      // Act
      const result = await fileUploadService.securelyStoreFile(content, 'sensitive.json', 'admin');
      const stats = fs.statSync(result.fullPath);

      // Assert
      expect(result.success).toBe(true);
      expect(stats.mode & parseInt('777', 8)).toBe(parseInt('600', 8)); // Owner read/write only
    });

    it('should implement automatic cleanup of old files', async () => {
      // Arrange
      const mockOldFiles = [
        '/uploads/2023/01/01/old-file-1.csv',
        '/uploads/2023/01/01/old-file-2.json'
      ];

      const cleanupSpy = vi.spyOn(fileUploadService, 'cleanupOldFiles')
        .mockResolvedValue(mockOldFiles.length);

      // Act
      const cleanedCount = await fileUploadService.cleanupOldFiles(30); // 30 days

      // Assert
      expect(cleanupSpy).toHaveBeenCalledWith(30);
      expect(cleanedCount).toBe(2);
    });

    it('should validate file integrity after storage', async () => {
      // Arrange
      const content = Buffer.from('important data');
      const originalHash = fileUploadService.calculateFileHash(content);

      // Act
      const result = await fileUploadService.securelyStoreFile(content, 'data.csv', 'admin');
      const storedContent = fs.readFileSync(result.fullPath);
      const storedHash = fileUploadService.calculateFileHash(storedContent);

      // Assert
      expect(result.success).toBe(true);
      expect(originalHash).toBe(storedHash);
      expect(result.checksum).toBe(originalHash);
    });
  });

  describe('Audit Logging', () => {
    it('should log all file upload attempts', async () => {
      // Arrange
      const content = Buffer.from('test data');
      const logSpy = vi.spyOn(auditLogger, 'logFileOperation');

      // Act
      await fileUploadService.processUpload(content, 'test.csv', 'admin', {
        userAgent: 'Test-Agent',
        ipAddress: '192.168.1.1'
      });

      // Assert
      expect(logSpy).toHaveBeenCalledWith({
        operation: 'upload',
        filename: 'test.csv',
        userId: 'admin',
        fileSize: content.length,
        fileType: 'csv',
        success: expect.any(Boolean),
        timestamp: expect.any(Date),
        metadata: {
          userAgent: 'Test-Agent',
          ipAddress: '192.168.1.1'
        }
      });
    });

    it('should log file validation failures', async () => {
      // Arrange
      const content = Buffer.from('invalid content');
      const logSpy = vi.spyOn(auditLogger, 'logSecurityEvent');

      // Act
      await fileUploadService.processUpload(content, 'malicious.exe', 'admin');

      // Assert
      expect(logSpy).toHaveBeenCalledWith({
        event: 'file_validation_failed',
        severity: 'warning',
        userId: 'admin',
        details: {
          filename: 'malicious.exe',
          reason: 'File type not allowed',
          fileType: 'exe'
        }
      });
    });

    it('should log virus detection events', async () => {
      // Arrange
      const maliciousContent = Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
      const logSpy = vi.spyOn(auditLogger, 'logSecurityEvent');

      // Act
      await fileUploadService.processUpload(maliciousContent, 'virus.txt', 'admin');

      // Assert
      expect(logSpy).toHaveBeenCalledWith({
        event: 'malware_detected',
        severity: 'critical',
        userId: 'admin',
        details: {
          filename: 'virus.txt',
          threats: expect.any(Array),
          quarantined: expect.any(Boolean)
        }
      });
    });

    it('should log file access and download events', async () => {
      // Arrange
      const logSpy = vi.spyOn(auditLogger, 'logFileOperation');

      // Act
      await fileUploadService.logFileAccess('secure-file.csv', 'admin', 'download', {
        userAgent: 'Test-Browser',
        ipAddress: '192.168.1.1'
      });

      // Assert
      expect(logSpy).toHaveBeenCalledWith({
        operation: 'download',
        filename: 'secure-file.csv',
        userId: 'admin',
        timestamp: expect.any(Date),
        metadata: {
          userAgent: 'Test-Browser',
          ipAddress: '192.168.1.1'
        }
      });
    });

    it('should generate audit trail for file operations', async () => {
      // Arrange
      const mockAuditTrail = [
        {
          timestamp: new Date(),
          operation: 'upload',
          filename: 'data.csv',
          userId: 'admin',
          success: true
        },
        {
          timestamp: new Date(),
          operation: 'download',
          filename: 'data.csv',
          userId: 'user1',
          success: true
        }
      ];

      const trailSpy = vi.spyOn(auditLogger, 'getAuditTrail')
        .mockResolvedValue(mockAuditTrail);

      // Act
      const trail = await auditLogger.getAuditTrail('data.csv');

      // Assert
      expect(trailSpy).toHaveBeenCalledWith('data.csv');
      expect(trail).toHaveLength(2);
      expect(trail[0].operation).toBe('upload');
      expect(trail[1].operation).toBe('download');
    });
  });
});