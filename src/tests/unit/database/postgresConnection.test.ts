/**
 * Tests for PostgreSQL connection utilities and configuration management
 * Following TDD approach - these tests should fail initially
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgreSQLManager } from '@/db/postgresql';
import type { DatabaseConfig } from '@/db/types';

// Mock pg module
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      release: vi.fn()
    }),
    end: vi.fn().mockResolvedValue(undefined),
    ended: false,
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
    options: { max: 20 }
  }))
}));

describe('PostgreSQL Connection Management', () => {
  let postgresManager: PostgreSQLManager;
  
  beforeEach(() => {
    // Reset environment variables
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (postgresManager) {
      await postgresManager.close();
    }
  });

  describe('Connection Utilities', () => {
    it('should create PostgreSQL connection with default configuration', async () => {
      const config: DatabaseConfig = {
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

      postgresManager = new PostgreSQLManager(config);
      
      expect(postgresManager).toBeDefined();
      expect(postgresManager.getConfig()).toEqual(config);
    });

    it('should create connection pool with specified pool size', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 20,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      postgresManager = new PostgreSQLManager(config);
      await postgresManager.connect();
      
      const poolInfo = await postgresManager.getPoolInfo();
      expect(poolInfo.maxConnections).toBe(20);
    });

    it('should handle SSL configuration correctly', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: true,
        sslMode: 'require',
        poolSize: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        maxLifetime: 3600000
      };

      postgresManager = new PostgreSQLManager(config);
      
      expect(postgresManager.getConfig().ssl).toBe(true);
      expect(postgresManager.getConfig().sslMode).toBe('require');
    });

    it('should validate connection configuration', () => {
      const invalidConfig = {
        type: 'postgresql',
        host: '',
        port: -1,
        database: '',
        username: '',
        password: '',
        ssl: false,
        poolSize: 0,
        connectionTimeout: -1,
        idleTimeout: -1,
        maxLifetime: -1
      } as DatabaseConfig;

      expect(() => new PostgreSQLManager(invalidConfig)).toThrow('Invalid database configuration');
    });
  });

  describe('Environment-based Configuration', () => {
    it('should use SQLite configuration in development environment', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_TYPE = 'sqlite';
      process.env.DATABASE_PATH = './dev.db';

      const config = PostgreSQLManager.getEnvironmentConfig();
      
      expect(config.type).toBe('sqlite');
      expect(config.path).toBe('./dev.db');
    });

    it('should use PostgreSQL configuration in production environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_TYPE = 'postgresql';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/prod_db';

      const config = PostgreSQLManager.getEnvironmentConfig();
      
      expect(config.type).toBe('postgresql');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.database).toBe('prod_db');
      expect(config.username).toBe('user');
      expect(config.password).toBe('pass');
    });

    it('should parse DATABASE_URL correctly', () => {
      const databaseUrl = 'postgresql://testuser:testpass@testhost:5433/testdb?sslmode=require';
      
      const config = PostgreSQLManager.parseConnectionString(databaseUrl);
      
      expect(config.host).toBe('testhost');
      expect(config.port).toBe(5433);
      expect(config.database).toBe('testdb');
      expect(config.username).toBe('testuser');
      expect(config.password).toBe('testpass');
      expect(config.sslMode).toBe('require');
    });

    it('should handle missing environment variables gracefully', () => {
      // Save original values
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDatabaseType = process.env.DATABASE_TYPE;
      const originalDatabaseUrl = process.env.DATABASE_URL;
      const originalDatabasePath = process.env.DATABASE_PATH;

      // Set to development and clear database config
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_TYPE;
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_PATH;

      const config = PostgreSQLManager.getEnvironmentConfig();
      
      // Should default to SQLite in development
      expect(config.type).toBe('sqlite');
      expect(config.path).toBeDefined();

      // Restore original values
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
      if (originalDatabaseType !== undefined) process.env.DATABASE_TYPE = originalDatabaseType;
      if (originalDatabaseUrl !== undefined) process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalDatabasePath !== undefined) process.env.DATABASE_PATH = originalDatabasePath;
    });

    it('should override configuration with environment variables', () => {
      // Save original values
      const originalValues = {
        DATABASE_HOST: process.env.DATABASE_HOST,
        DATABASE_PORT: process.env.DATABASE_PORT,
        DATABASE_NAME: process.env.DATABASE_NAME,
        DATABASE_USER: process.env.DATABASE_USER,
        DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
        DATABASE_SSL: process.env.DATABASE_SSL,
        DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
        DATABASE_TYPE: process.env.DATABASE_TYPE
      };

      // Set override values
      process.env.DATABASE_TYPE = 'postgresql';
      process.env.DATABASE_HOST = 'override-host';
      process.env.DATABASE_PORT = '9999';
      process.env.DATABASE_NAME = 'override-db';
      process.env.DATABASE_USER = 'override-user';
      process.env.DATABASE_PASSWORD = 'override-pass';
      process.env.DATABASE_SSL = 'true';
      process.env.DATABASE_POOL_SIZE = '25';

      const config = PostgreSQLManager.getEnvironmentConfig();
      
      expect(config.host).toBe('override-host');
      expect(config.port).toBe(9999);
      expect(config.database).toBe('override-db');
      expect(config.username).toBe('override-user');
      expect(config.password).toBe('override-pass');
      expect(config.ssl).toBe(true);
      expect(config.poolSize).toBe(25);

      // Restore original values
      Object.entries(originalValues).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      });
    });
  });

  describe('Health Check and Retry Mechanisms', () => {
    it('should perform basic health check', async () => {
      const config: DatabaseConfig = {
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

      postgresManager = new PostgreSQLManager(config);
      
      const healthResult = await postgresManager.healthCheck();
      
      expect(healthResult).toHaveProperty('status');
      expect(healthResult).toHaveProperty('details');
      expect(healthResult).toHaveProperty('timestamp');
      expect(['healthy', 'unhealthy']).toContain(healthResult.status);
    });

    it('should implement exponential backoff retry mechanism', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'nonexistent-host',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 1000, // Short timeout for testing
        idleTimeout: 10000,
        maxLifetime: 3600000,
        retryAttempts: 3,
        retryDelay: 100 // Short delay for testing
      };

      postgresManager = new PostgreSQLManager(config);
      
      const startTime = Date.now();
      
      try {
        await postgresManager.connectWithRetry();
      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Should have attempted retries with exponential backoff
        // 100ms + 200ms + 400ms = 700ms minimum
        expect(duration).toBeGreaterThan(600);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should track retry attempts and failures', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'nonexistent-host',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 1000,
        idleTimeout: 10000,
        maxLifetime: 3600000,
        retryAttempts: 2,
        retryDelay: 50
      };

      postgresManager = new PostgreSQLManager(config);
      
      try {
        await postgresManager.connectWithRetry();
      } catch (error) {
        const stats = postgresManager.getConnectionStats();
        
        expect(stats.totalAttempts).toBe(3); // Initial + 2 retries
        expect(stats.failedAttempts).toBe(3);
        expect(stats.lastError).toBeDefined();
      }
    });

    it('should reset retry count on successful connection', async () => {
      const config: DatabaseConfig = {
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
        maxLifetime: 3600000,
        retryAttempts: 3,
        retryDelay: 100
      };

      postgresManager = new PostgreSQLManager(config);
      
      // Mock successful connection after retry
      const connectSpy = vi.spyOn(postgresManager, 'connect')
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);

      await postgresManager.connectWithRetry();
      
      const stats = postgresManager.getConnectionStats();
      expect(stats.successfulConnections).toBe(1);
      expect(stats.consecutiveFailures).toBe(0);
    });

    it('should implement circuit breaker pattern', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'nonexistent-host',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        poolSize: 10,
        connectionTimeout: 1000,
        idleTimeout: 10000,
        maxLifetime: 3600000,
        retryAttempts: 0, // No retries to speed up test
        retryDelay: 50,
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 5000
      };

      postgresManager = new PostgreSQLManager(config);
      
      // Mock the connect method to always fail
      const connectSpy = vi.spyOn(postgresManager, 'connect')
        .mockRejectedValue(new Error('Connection failed'));
      
      // Trigger circuit breaker - need enough failures to reach threshold
      // Each connectWithRetry call will increment failure count
      for (let i = 0; i < 3; i++) {
        try {
          await postgresManager.connectWithRetry();
        } catch (error) {
          // Expected to fail
        }
      }
      
      const circuitState = postgresManager.getCircuitBreakerState();
      expect(circuitState.state).toBe('open');
      expect(circuitState.failureCount).toBeGreaterThanOrEqual(3);
      
      connectSpy.mockRestore();
    });
  });
});