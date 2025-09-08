/**
 * Configuration globale pour les tests avec base de données en mémoire
 * Ce fichier est chargé automatiquement par Vitest avant chaque test
 */

import { beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

// Charge le fichier .env.test avant toute autre chose
config({ path: path.resolve(process.cwd(), 'server/.env.test'), override: true });

// Configuration avant tous les tests
beforeAll(async () => {
  console.log('🧪 Configuration des tests avec base de données en mémoire...');
  console.log(`DATABASE_PATH: ${process.env.DATABASE_PATH}`);
  console.log(`DATABASE_NAME: ${process.env.DATABASE_NAME}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
});

// Configuration avant chaque test
beforeEach(async () => {
  // S'assurer que les variables d'environnement sont toujours définies
  process.env.DATABASE_PATH = ':memory:';
  process.env.DATABASE_NAME = ':memory:';
  process.env.NODE_ENV = 'test';
});

// Nettoyage après chaque test
afterEach(async () => {
  // Nettoie les imports de modules si nécessaire
});

// Nettoyage final après tous les tests
afterAll(async () => {
  console.log('✅ Tests terminés, base de données en mémoire nettoyée');
});

// Exporte des utilitaires pour les tests
export * from './testDatabase';
