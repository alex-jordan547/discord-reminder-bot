/**
 * Persistence layer exports for Discord Reminder Bot
 * 
 * Provides centralized exports for database and storage functionality
 */

export { DatabaseManager, DatabaseConfig, getDatabase } from './database.js';
export { 
  SqliteStorage, 
  type StorageOperationResult, 
  type PaginationOptions, 
  type EventFilters 
} from './sqliteStorage.js';

// Export factory function for easy initialization
export async function createStorage(): Promise<SqliteStorage> {
  const storage = new SqliteStorage();
  const initialized = await storage.initialize();
  
  if (!initialized) {
    throw new Error('Failed to initialize SQLite storage');
  }
  
  return storage;
}