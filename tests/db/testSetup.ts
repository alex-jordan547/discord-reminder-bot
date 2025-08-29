/**
 * Test setup for Drizzle ORM database tests
 *
 * Creates an in-memory SQLite database for testing purposes
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema.js';
import { DatabaseManager } from '@/db/index.js';
import path from 'path';

let testDb: Database.Database;
let testDrizzle: ReturnType<typeof drizzle>;

/**
 * Setup test database before all tests
 */
export async function setupTestDatabase() {
  // Create in-memory database for tests
  testDb = new Database(':memory:');
  testDrizzle = drizzle(testDb, { schema });

  // Run migrations on test database
  const migrationsFolder = path.join(process.cwd(), 'drizzle/migrations');
  migrate(testDrizzle, { migrationsFolder });

  return { testDb, testDrizzle };
}

/**
 * Cleanup test database after all tests
 */
export async function cleanupTestDatabase() {
  if (testDb) {
    testDb.close();
  }
}

/**
 * Clear all data from test database before each test
 */
export async function clearTestData() {
  if (!testDrizzle) return;

  // Clear all tables in reverse dependency order
  await testDrizzle.delete(schema.reminderLogs);
  await testDrizzle.delete(schema.reactions);
  await testDrizzle.delete(schema.guildConfigs);
  await testDrizzle.delete(schema.events);
  await testDrizzle.delete(schema.users);
  await testDrizzle.delete(schema.guilds);
}

/**
 * Mock database manager for tests
 */
export class TestDatabaseManager extends DatabaseManager {
  async getDb() {
    if (!testDrizzle) {
      throw new Error('Test database not initialized');
    }
    return testDrizzle;
  }
}

/**
 * Create test data helpers
 */
export const createTestData = {
  guild: (overrides: Partial<typeof schema.guilds.$inferInsert> = {}) => ({
    guildId: '123456789',
    guildName: 'Test Guild',
    ownerId: '987654321',
    memberCount: 100,
    isActive: true,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  event: (overrides: Partial<typeof schema.events.$inferInsert> = {}) => ({
    messageId: '555666777',
    channelId: '111222333',
    guildId: '123456789',
    title: 'Test Event',
    description: 'A test event description',
    intervalMinutes: 60,
    isPaused: false,
    usersWhoReacted: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  user: (overrides: Partial<typeof schema.users.$inferInsert> = {}) => ({
    userId: '444555666',
    guildId: '123456789',
    username: 'TestUser',
    isBot: false,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  guildConfig: (overrides: Partial<typeof schema.guildConfigs.$inferInsert> = {}) => ({
    guildId: '123456789',
    defaultReminderInterval: 60,
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD HH:mm',
    allowedRoles: '[]',
    blockedChannels: '[]',
    maxEventsPerGuild: 50,
    enableAutoCleanup: true,
    cleanupDays: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  reminderLog: (overrides: Partial<typeof schema.reminderLogs.$inferInsert> = {}) => ({
    messageId: '555666777',
    channelId: '111222333',
    guildId: '123456789',
    reminderType: 'scheduled' as const,
    recipientCount: 5,
    successCount: 5,
    errorCount: 0,
    sentAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }),
};

// Global setup/teardown for tests
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await cleanupTestDatabase();
});

beforeEach(async () => {
  await clearTestData();
});
