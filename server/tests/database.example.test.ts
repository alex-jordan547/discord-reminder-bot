/**
 * Test d'exemple montrant l'utilisation de la base de données en mémoire
 */

import { describe, it, expect } from 'vitest';
import { createTestDatabase } from './testDatabase';
import { events } from '#/db/schema';

describe('Base de données en mémoire - Exemple', () => {
  it('devrait pouvoir insérer et récupérer des données', async () => {
    // La base de données en mémoire est automatiquement configurée
    const testDb = createTestDatabase();

    // Test d'insertion
    const eventData = {
      messageId: '123456789012345678',
      channelId: '987654321098765432',
      guildId: '555666777888999000',
      title: 'Test Event',
      description: 'Description de test',
      intervalMinutes: 60,
      isPaused: false,
      lastRemindedAt: new Date(),
      usersWhoReacted: '["123456789012345678"]',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert dans la base de données en mémoire
    await testDb.db.insert(events).values(eventData);

    // Récupération des données
    const retrievedEvents = await testDb.db.select().from(events);

    expect(retrievedEvents).toHaveLength(1);
    expect(retrievedEvents[0].title).toBe('Test Event');
    expect(retrievedEvents[0].messageId).toBe('123456789012345678');

    // Nettoyage automatique après le test
    testDb.cleanup();
  });

  it('devrait avoir une base de données vide pour chaque test', async () => {
    const testDb = createTestDatabase();

    // Vérification que la base est vide au début du test
    const events_count = await testDb.db.select().from(events);
    expect(events_count).toHaveLength(0);

    testDb.cleanup();
  });
});
