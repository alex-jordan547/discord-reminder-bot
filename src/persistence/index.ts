/**
 * Persistence layer exports for Discord Reminder Bot
 *
 * Provides centralized exports for database and storage functionality using Drizzle ORM
 */

import { createLogger } from '@/utils/loggingConfig';

const logger = createLogger('persistence');

export {
  DatabaseManager,
  type DatabaseConfig,
  type DatabaseInfo,
  db as databaseManager,
} from './database.js';

export {
  eventRepo,
  userRepo,
  guildRepo,
  guildConfigRepo,
  reminderLogRepo,
  EventRepository,
  UserRepository,
  GuildRepository,
  GuildConfigRepository,
  ReminderLogRepository,
} from './database.js';

// Legacy compatibility - create a simple storage interface that uses Drizzle repos
import { eventRepo } from './database.js';

export class DrizzleStorage {
  async initialize(): Promise<boolean> {
    logger.info('Initializing DrizzleStorage with new Drizzle ORM implementation');

    try {
      // Test database connection
      logger.debug('Testing database connection...');
      await eventRepo.getByMessageId('test');

      logger.info('DrizzleStorage initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize DrizzleStorage:', error);
      return false;
    }
  }

  // Add other methods as needed for compatibility
}

// Export factory function for easy initialization
export async function createStorage(): Promise<DrizzleStorage> {
  logger.info('Creating new DrizzleStorage instance');

  const storage = new DrizzleStorage();
  const initialized = await storage.initialize();

  if (!initialized) {
    const errorMsg = 'Failed to initialize Drizzle storage - database connection failed';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info('DrizzleStorage created and initialized successfully');
  return storage;
}
