/**
 * Configuration de base de données en mémoire pour les tests
 * Utilise SQLite en mémoire (:memory:) pour des tests isolés et rapides
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema';
import { DatabaseManager } from '@/db/index';
import path from 'path';
import { vi } from 'vitest';

export interface TestDatabaseInstance {
  db: ReturnType<typeof drizzle>;
  sqlite: Database.Database;
  cleanup: () => void;
}

/**
 * Crée une instance de base de données en mémoire pour les tests
 */
export function createTestDatabase(): TestDatabaseInstance {
  // Utilise :memory: pour une base de données SQLite en mémoire
  const sqlite = new Database(':memory:');

  // Configure les pragmas pour les tests
  sqlite.pragma('journal_mode = MEMORY');
  sqlite.pragma('synchronous = OFF');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('temp_store = MEMORY');

  // Initialise Drizzle ORM
  const db = drizzle(sqlite, { schema });

  // Exécute les migrations
  const migrationsPath = path.join(process.cwd(), 'drizzle/migrations');
  try {
    migrate(db, { migrationsFolder: migrationsPath });
  } catch (error) {
    console.warn('Migrations not found or failed, continuing with empty database:', error);
  }

  return {
    db,
    sqlite,
    cleanup: (): void => {
      sqlite.close();
    },
  };
}

/**
 * Singleton pour la base de données de test
 * Permet de partager la même instance entre les tests si nécessaire
 */
class TestDatabaseManager {
  private static instance: TestDatabaseInstance | null = null;

  static getInstance(): TestDatabaseInstance {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = createTestDatabase();
    }
    return TestDatabaseManager.instance;
  }

  static resetInstance(): void {
    if (TestDatabaseManager.instance) {
      TestDatabaseManager.instance.cleanup();
      TestDatabaseManager.instance = null;
    }
  }

  static cleanup(): void {
    TestDatabaseManager.resetInstance();
  }
}

/**
 * Hook pour configurer la base de données de test avant chaque test
 */
export function setupTestDatabase(): TestDatabaseInstance {
  const testDb = createTestDatabase();

  // Nettoie les données entre les tests
  const tables = Object.values(schema);
  tables.forEach(table => {
    try {
      testDb.sqlite.prepare(`DELETE FROM ${(table as any)._.name}`).run();
    } catch {
      // La table pourrait ne pas exister encore, on ignore l'erreur
    }
  });

  return testDb;
}

/**
 * Utilitaire pour mocker le DatabaseManager dans les tests avec Vitest
 */
export function mockDatabaseManager(testDb: TestDatabaseInstance): void {
  // Mock de la méthode getInstance pour retourner notre base de données de test
  vi.spyOn(DatabaseManager, 'getInstance').mockImplementation(() => {
    return {
      connect: () => Promise.resolve(testDb.db),
      getDatabase: () => testDb.db,
      getDatabaseInfo: () =>
        Promise.resolve({
          databasePath: ':memory:',
          databaseExists: true,
          databaseName: 'test',
          isConnected: true,
          isReady: true,
        }),
      close: () => Promise.resolve(),
    } as any;
  });
}

export { TestDatabaseManager };
