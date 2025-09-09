import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { createClient as createRedisClient } from 'redis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Docker Infrastructure E2E Test Suite
 * =====================================
 * Tests the complete Docker setup for Discord Reminder Bot with PostgreSQL and Redis
 */

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DOCKER_COMPOSE_FILE = path.join(PROJECT_ROOT, 'docker-compose.yml');
const ENV_FILE = path.join(PROJECT_ROOT, '.env.docker');

// Test configuration
const TEST_CONFIG = {
  postgres: {
    host: 'localhost',
    port: 5432,
    user: 'bot_user',
    password: 'secure_password',
    database: 'discord_bot'
  },
  redis: {
    host: 'localhost',
    port: 6379
  },
  dashboard: {
    url: 'http://localhost:3000',
    healthEndpoint: '/health'
  },
  timeout: 60000 // 1 minute timeout for Docker operations
};

test.describe('Discord Bot Docker Infrastructure', () => {
  let pgPool: Pool;
  let redisClient: any;
  let dockerStartTime: number;

  test.beforeAll(async () => {
    console.log('🚀 Starting Docker Infrastructure Test Suite...');
    dockerStartTime = Date.now();

    try {
      // Ensure we're in the right directory
      process.chdir(PROJECT_ROOT);
      console.log(`📁 Working directory: ${PROJECT_ROOT}`);

      // Check required files exist
      if (!fs.existsSync(DOCKER_COMPOSE_FILE)) {
        throw new Error(`docker-compose.yml not found at ${DOCKER_COMPOSE_FILE}`);
      }

      if (!fs.existsSync(ENV_FILE)) {
        console.log('⚠️  .env.docker not found, creating minimal environment...');
        const minimalEnv = `
POSTGRES_DB=discord_bot
POSTGRES_USER=bot_user
POSTGRES_PASSWORD=secure_password
POSTGRES_PORT=5432
REDIS_PORT=6379
DATABASE_TYPE=postgres
ENABLE_DASHBOARD=true
DASHBOARD_PORT=3000
NODE_ENV=production
`;
        fs.writeFileSync(ENV_FILE, minimalEnv.trim());
      }

      console.log('🐳 Building and starting Docker services...');
      
      // Stop any existing services
      try {
        execSync('docker compose down --volumes --remove-orphans', { 
          stdio: 'pipe',
          env: { ...process.env, COMPOSE_FILE: 'docker-compose.yml' }
        });
      } catch (error) {
        console.log('ℹ️  No existing services to stop');
      }

      // Build and start services
      const startCommand = 'docker compose --env-file .env.docker up --build --detach --wait';
      console.log(`📦 Running: ${startCommand}`);
      
      execSync(startCommand, { 
        stdio: 'inherit',
        timeout: TEST_CONFIG.timeout,
        env: { ...process.env, COMPOSE_FILE: 'docker-compose.yml' }
      });

      console.log('✅ Docker services started successfully');

      // Wait a bit for services to fully initialize
      console.log('⏳ Waiting for services to initialize...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Initialize database connection
      pgPool = new Pool({
        host: TEST_CONFIG.postgres.host,
        port: TEST_CONFIG.postgres.port,
        user: TEST_CONFIG.postgres.user,
        password: TEST_CONFIG.postgres.password,
        database: TEST_CONFIG.postgres.database,
        connectionTimeoutMillis: 10000
      });

      // Initialize Redis connection
      redisClient = createRedisClient({
        socket: {
          host: TEST_CONFIG.redis.host,
          port: TEST_CONFIG.redis.port
        }
      });
      
      await redisClient.connect();
      console.log('🔌 Database connections established');

    } catch (error) {
      console.error('💥 Docker setup failed:', error);
      
      // Attempt cleanup on failure
      try {
        execSync('docker compose down --volumes --remove-orphans', { stdio: 'inherit' });
      } catch (cleanupError) {
        console.error('Failed to cleanup after error:', cleanupError);
      }
      
      throw new Error(`Docker setup failed: ${error.message}`);
    }
  });

  test.afterAll(async () => {
    console.log('🧹 Cleaning up Docker environment...');
    
    try {
      // Close database connections
      if (pgPool) {
        await pgPool.end();
        console.log('📡 PostgreSQL connection closed');
      }
      
      if (redisClient) {
        await redisClient.quit();
        console.log('📡 Redis connection closed');
      }

      // Stop and remove all containers, volumes, and networks
      execSync('docker compose down --volumes --remove-orphans', { 
        stdio: 'inherit',
        env: { ...process.env, COMPOSE_FILE: 'docker-compose.yml' }
      });

      const totalTime = ((Date.now() - dockerStartTime) / 1000).toFixed(2);
      console.log(`✅ Cleanup complete (Total test time: ${totalTime}s)`);

    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  });

  test('should have all Docker containers running and healthy', async () => {
    console.log('🔍 Checking container status...');
    
    try {
      // Get container status
      const psOutput = execSync('docker compose ps --format json', { 
        encoding: 'utf8',
        env: { ...process.env, COMPOSE_FILE: 'docker-compose.yml' }
      });
      
      const containers = JSON.parse(psOutput);
      console.log(`📊 Found ${containers.length} containers`);

      // Check PostgreSQL container
      const postgres = containers.find(c => c.Service === 'postgres');
      expect(postgres, 'PostgreSQL container should exist').toBeDefined();
      expect(postgres.State, 'PostgreSQL should be running').toBe('running');
      if (postgres.Health) {
        expect(postgres.Health, 'PostgreSQL should be healthy').toBe('healthy');
      }

      // Check Redis container
      const redis = containers.find(c => c.Service === 'redis');
      expect(redis, 'Redis container should exist').toBeDefined();
      expect(redis.State, 'Redis should be running').toBe('running');
      if (redis.Health) {
        expect(redis.Health, 'Redis should be healthy').toBe('healthy');
      }

      // Check main application container
      const app = containers.find(c => c.Service === 'discord-reminder-bot');
      expect(app, 'Discord bot container should exist').toBeDefined();
      expect(app.State, 'Discord bot should be running').toBe('running');

      console.log('✅ All containers are running properly');
      
    } catch (error) {
      console.error('Container status check failed:', error);
      
      // Get logs for debugging
      try {
        const logs = execSync('docker compose logs --tail=50', { encoding: 'utf8' });
        console.log('📋 Recent container logs:', logs);
      } catch (logError) {
        console.error('Failed to get container logs:', logError);
      }
      
      throw error;
    }
  });

  test('should connect to PostgreSQL database successfully', async () => {
    console.log('🐘 Testing PostgreSQL connectivity...');
    
    try {
      // Test basic connection
      const timeResult = await pgPool.query('SELECT NOW() as current_time');
      expect(timeResult.rows).toHaveLength(1);
      expect(timeResult.rows[0].current_time).toBeInstanceOf(Date);
      
      // Test schema exists
      const schemaResult = await pgPool.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = 'discord_bot'
      `);
      expect(schemaResult.rows).toHaveLength(1);
      
      // Test some expected tables exist
      const tablesResult = await pgPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'discord_bot' 
        AND table_name IN ('users', 'guilds', 'events')
      `);
      expect(tablesResult.rows.length).toBeGreaterThanOrEqual(1);
      
      console.log(`✅ PostgreSQL connection successful (${tablesResult.rows.length} tables found)`);
      
    } catch (error) {
      console.error('PostgreSQL connectivity test failed:', error);
      throw error;
    }
  });

  test('should connect to Redis successfully', async () => {
    console.log('🔴 Testing Redis connectivity...');
    
    try {
      // Test basic ping
      const pingResult = await redisClient.ping();
      expect(pingResult).toBe('PONG');
      
      // Test set/get operations
      const testKey = 'discord_bot:test:' + Date.now();
      const testValue = 'test-value-' + Math.random();
      
      await redisClient.set(testKey, testValue, { EX: 60 });
      const retrievedValue = await redisClient.get(testKey);
      
      expect(retrievedValue).toBe(testValue);
      
      // Cleanup test key
      await redisClient.del(testKey);
      
      console.log('✅ Redis connection and operations successful');
      
    } catch (error) {
      console.error('Redis connectivity test failed:', error);
      throw error;
    }
  });

  test('should access the dashboard endpoint', async ({ page }) => {
    console.log('🖥️  Testing dashboard accessibility...');
    
    try {
      // Set longer timeout for dashboard startup
      page.setDefaultTimeout(30000);
      
      // Try to access the dashboard health endpoint
      const healthUrl = TEST_CONFIG.dashboard.url + TEST_CONFIG.dashboard.healthEndpoint;
      console.log(`📡 Checking health endpoint: ${healthUrl}`);
      
      const healthResponse = await page.request.get(healthUrl);
      
      if (healthResponse.ok()) {
        const healthData = await healthResponse.json();
        expect(healthData.status).toBe('ok');
        console.log('✅ Health endpoint accessible:', healthData);
      } else {
        console.log(`⚠️  Health endpoint returned status ${healthResponse.status()}`);
        
        // Try the main dashboard page as fallback
        console.log(`📡 Trying main dashboard: ${TEST_CONFIG.dashboard.url}`);
        await page.goto(TEST_CONFIG.dashboard.url, { waitUntil: 'domcontentloaded' });
        
        // Check if page loaded without major errors
        const title = await page.title();
        console.log(`📄 Dashboard page title: "${title}"`);
        
        // Page should not be completely empty
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.trim().length).toBeGreaterThan(0);
      }
      
      console.log('✅ Dashboard accessibility test passed');
      
    } catch (error) {
      console.error('Dashboard accessibility test failed:', error);
      
      // Get container logs for debugging
      try {
        const botLogs = execSync('docker compose logs discord-reminder-bot --tail=20', { encoding: 'utf8' });
        console.log('🤖 Bot container logs:', botLogs);
      } catch (logError) {
        console.error('Failed to get bot logs:', logError);
      }
      
      throw error;
    }
  });

  test('should verify database migration completed successfully', async () => {
    console.log('🔄 Testing database migration...');
    
    try {
      // Check if key tables exist with correct structure
      const tableQueries = [
        { name: 'users', query: "SELECT column_name FROM information_schema.columns WHERE table_schema = 'discord_bot' AND table_name = 'users'" },
        { name: 'guilds', query: "SELECT column_name FROM information_schema.columns WHERE table_schema = 'discord_bot' AND table_name = 'guilds'" },
        { name: 'events', query: "SELECT column_name FROM information_schema.columns WHERE table_schema = 'discord_bot' AND table_name = 'events'" }
      ];
      
      for (const tableQuery of tableQueries) {
        const result = await pgPool.query(tableQuery.query);
        expect(result.rows.length, `Table '${tableQuery.name}' should have columns`).toBeGreaterThan(0);
        
        // Check for expected columns
        const columnNames = result.rows.map(row => row.column_name);
        expect(columnNames, `Table '${tableQuery.name}' should have id column`).toContain('id');
        expect(columnNames, `Table '${tableQuery.name}' should have created_at column`).toContain('created_at');
        
        console.log(`📊 Table '${tableQuery.name}': ${columnNames.length} columns`);
      }
      
      // Test that we can insert and query data
      const testResult = await pgPool.query(`
        INSERT INTO discord_bot.users (discord_id, username) 
        VALUES ('test_123', 'test_user') 
        ON CONFLICT (discord_id) DO UPDATE SET username = EXCLUDED.username
        RETURNING id, discord_id, username
      `);
      
      expect(testResult.rows).toHaveLength(1);
      expect(testResult.rows[0].discord_id).toBe('test_123');
      
      console.log('✅ Database migration verification successful');
      
    } catch (error) {
      console.error('Database migration verification failed:', error);
      throw error;
    }
  });

  test('should test volume persistence', async () => {
    console.log('💾 Testing volume persistence...');
    
    try {
      // Insert test data
      const testData = {
        discord_id: 'persistence_test_' + Date.now(),
        username: 'test_persistence_user'
      };
      
      await pgPool.query(`
        INSERT INTO discord_bot.users (discord_id, username) 
        VALUES ($1, $2)
      `, [testData.discord_id, testData.username]);
      
      // Restart just the PostgreSQL container to test persistence
      console.log('🔄 Restarting PostgreSQL container...');
      execSync('docker compose restart postgres', { 
        stdio: 'inherit',
        env: { ...process.env, COMPOSE_FILE: 'docker-compose.yml' }
      });
      
      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Verify data still exists
      const result = await pgPool.query(`
        SELECT discord_id, username 
        FROM discord_bot.users 
        WHERE discord_id = $1
      `, [testData.discord_id]);
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].discord_id).toBe(testData.discord_id);
      
      console.log('✅ Volume persistence test passed');
      
    } catch (error) {
      console.error('Volume persistence test failed:', error);
      throw error;
    }
  });
});