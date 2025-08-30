/**
 * Test script to demonstrate the improved error logging
 */
import { createLogger, testErrorLogging } from './src/utils/loggingConfig';

const logger = createLogger('test');

console.log("=== Test du logging d'erreurs amélioré ===\n");

// Simuler une vraie erreur
try {
  throw new Error('Une erreur de test avec stack trace');
} catch (error) {
  // Ancienne méthode (qui ne marchait pas bien)
  console.log('1. Ancienne méthode (problématique):');
  logger.error('Error fetching selectable messages:', error);

  console.log('\n2. Nouvelle méthode recommandée (avec objet):');
  logger.error('Error fetching selectable messages', { err: error });

  console.log('\n3. Avec des données supplémentaires:');
  logger.error('Error fetching selectable messages', {
    err: error,
    channelId: '123456789',
    messageCount: 0,
    retryAttempt: 1,
  });
}

console.log('\n4. Test avec objet personnalisé:');
logger.error('Custom error scenario', {
  customError: {
    code: 'CHANNEL_NOT_FOUND',
    details: {
      channelId: '123456789',
      guildId: '987654321',
    },
  },
});

console.log('\n=== Fin des tests ===');
