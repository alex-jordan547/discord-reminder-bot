/**
 * Tests for database migration service
 * Following TDD approach - these tests should fail initially
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MigrationService } from '@/db/migration';
import { DatabaseManager } from '@/db/index';
import { PostgreSQLManager } from '@/db/postgresql';
import type { DatabaseConfig, MigrationResult, MigrationOptions } from '@/db/types';

// Mock the database managers
vi.mock('@/db/index');
vi.mock('@/db/postgresql');

describe('Database Migration Service', () => {
  let migrationService: MigrationService;
  let mockSQLiteManager: any;
  let mockPostgreSQLManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock SQLite manager
    mockSQLiteManager = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getDb: vi.fn().mockResolvedValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue([])
          })
        })
      }),
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
    };

    // Mock PostgreSQL manager
    mockPostgreSQLManager = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getDb: vi.fn().mockResolvedValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined)
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue([])
          })
        })
      }),
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
    };

    migrationService = new MigrationService();
  });

  afterEach(async () => {
    if (migrationService) {
      await migrationService.cleanup();
    }
  });

  describe('Data Transfer from SQLite to PostgreSQL', () => {
    it('should successfully migrate data from SQLite to PostgreSQL', async () => {
      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const options: MigrationOptions = {
        batchSize: 1000,
        validateData: true,
        createBackup: true,
        skipExisting: false
      };

      const result = await migrationService.migrate(sourceConfig, targetConfig, options);

      expect(result.success).toBe(true);
      expect(result.sourceType).toBe('sqlite');
      expect(result.targetType).toBe('postgresql');
      expect(result.recordsMigrated).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle migration with large datasets in batches', async () => {
      // Mock large dataset
      const mockData = Array.from({ length: 5000 }, (_, i) => ({
        id: i + 1,
        name: `Test ${i + 1}`,
        created_at: new Date()
      }));

      mockSQLiteManager.getDb.mockResolvedValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue(mockData)
          })
        })
      });

      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './large_test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const options: MigrationOptions = {
        batchSize: 1000,
        validateData: true,
        createBackup: true,
        skipExisting: false
      };

      const result = await migrationService.migrate(sourceConfig, targetConfig, options);

      expect(result.success).toBe(true);
      expect(result.recordsMigrated).toBe(5000);
      expect(result.batchesProcessed).toBe(5); // 5000 / 1000 = 5 batches
    });

    it('should validate data integrity during migration', async () => {
      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const options: MigrationOptions = {
        batchSize: 1000,
        validateData: true,
        createBackup: true,
        skipExisting: false
      };

      const result = await migrationService.migrate(sourceConfig, targetConfig, options);

      expect(result.validationResults).toBeDefined();
      expect(result.validationResults?.sourceRecordCount).toBeGreaterThanOrEqual(0);
      expect(result.validationResults?.targetRecordCount).toBeGreaterThanOrEqual(0);
      expect(result.validationResults?.checksumMatch).toBe(true);
    });

    it('should handle migration errors gracefully', async () => {
      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const options: MigrationOptions = {
        batchSize: 1000,
        validateData: true,
        createBackup: true,
        skipExisting: false
      };

      // Mock the createDatabaseManager to throw an error
      const originalCreateManager = migrationService['createDatabaseManager'];
      migrationService['createDatabaseManager'] = vi.fn().mockImplementation((config) => {
        if (config.type === 'postgresql') {
          return {
            connect: async () => {
              throw new Error('Connection failed');
            },
            close: async () => {},
            getDb: async () => {
              throw new Error('Connection failed');
            },
            healthCheck: async () => ({ status: 'unhealthy' })
          };
        }
        return originalCreateManager.call(migrationService, config);
      });

      const result = await migrationService.migrate(sourceConfig, targetConfig, options);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Connection failed');
      
      // Restore original method
      migrationService['createDatabaseManager'] = originalCreateManager;
    });
  });

  describe('Schema Mapping and Data Transformation', () => {
    it('should create schema mapping between SQLite and PostgreSQL', async () => {
      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const schemaMapping = await migrationService.createSchemaMapping(sourceConfig, targetConfig);

      expect(schemaMapping).toBeDefined();
      expect(schemaMapping.tables).toBeDefined();
      expect(Array.isArray(schemaMapping.tables)).toBe(true);
      expect(schemaMapping.transformations).toBeDefined();
    });

    it('should transform SQLite data types to PostgreSQL equivalents', async () => {
      const sqliteData = {
        id: 1,
        name: 'Test',
        is_active: 1, // SQLite boolean as integer
        created_at: 1640995200, // SQLite timestamp as integer
        metadata: '{"key": "value"}' // SQLite JSON as text
      };

      const transformedData = await migrationService.transformData(sqliteData, 'sqlite', 'postgresql');

      expect(transformedData.id).toBe(1);
      expect(transformedData.name).toBe('Test');
      expect(transformedData.is_active).toBe(true); // Converted to boolean
      expect(transformedData.created_at).toBeInstanceOf(Date); // Converted to Date
      expect(typeof transformedData.metadata).toBe('object'); // Parsed JSON
    });

    it('should handle data type conversion errors', async () => {
      const invalidData = {
        id: 'not_a_number',
        created_at: 'invalid_timestamp',
        metadata: 'invalid_json{'
      };

      const result = await migrationService.transformData(invalidData, 'sqlite', 'postgresql');

      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should preserve data relationships during transformation', async () => {
      const sourceData = [
        { table: 'users', id: 1, name: 'User 1' },
        { table: 'events', id: 1, user_id: 1, title: 'Event 1' }
      ];

      const transformedData = await migrationService.transformRelatedData(sourceData);

      expect(transformedData).toBeDefined();
      expect(transformedData.length).toBe(2);
      expect(transformedData[1].user_id).toBe(1); // Relationship preserved
    });
  });

  describe('Rollback Functionality', () => {
    it('should create backup before migration', async () => {
      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const backupResult = await migrationService.createBackup(targetConfig);

      expect(backupResult.success).toBe(true);
      expect(backupResult.backupPath).toBeDefined();
      expect(backupResult.backupSize).toBeGreaterThanOrEqual(0);
      expect(backupResult.timestamp).toBeInstanceOf(Date);
    });

    it('should rollback failed migration', async () => {
      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const backupPath = './backup_test.sql';
      
      // Add a small delay to ensure the test has some duration
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const rollbackResult = await migrationService.rollback(targetConfig, backupPath);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.restoredRecords).toBeGreaterThanOrEqual(0);
      expect(rollbackResult.duration).toBeGreaterThan(0);
    });

    it('should validate rollback integrity', async () => {
      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const backupPath = './backup_test.sql';
      const originalChecksum = 'abc123';
      
      const rollbackResult = await migrationService.rollback(targetConfig, backupPath, {
        validateIntegrity: true,
        originalChecksum
      });

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.integrityCheck).toBeDefined();
      expect(rollbackResult.integrityCheck?.checksumMatch).toBe(true);
    });

    it('should handle rollback errors', async () => {
      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const invalidBackupPath = './nonexistent_backup.sql';
      
      const rollbackResult = await migrationService.rollback(targetConfig, invalidBackupPath);

      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.errors).toBeDefined();
      expect(rollbackResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Migration Progress and Monitoring', () => {
    it('should track migration progress', async () => {
      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const options: MigrationOptions = {
        batchSize: 1000,
        validateData: true,
        createBackup: true,
        skipExisting: false,
        onProgress: vi.fn()
      };

      await migrationService.migrate(sourceConfig, targetConfig, options);

      expect(options.onProgress).toHaveBeenCalled();
    });

    it('should provide migration statistics', async () => {
      const stats = await migrationService.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalMigrations).toBeGreaterThanOrEqual(0);
      expect(stats.successfulMigrations).toBeGreaterThanOrEqual(0);
      expect(stats.failedMigrations).toBeGreaterThanOrEqual(0);
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    it('should log migration events', async () => {
      const sourceConfig: DatabaseConfig = {
        type: 'sqlite',
        path: './test.db'
      };

      const targetConfig: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      const options: MigrationOptions = {
        batchSize: 1000,
        validateData: true,
        createBackup: true,
        skipExisting: false
      };

      await migrationService.migrate(sourceConfig, targetConfig, options);

      const logs = await migrationService.getMigrationLogs();

      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });
  });
});