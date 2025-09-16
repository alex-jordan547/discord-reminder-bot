// Test du serveur Fastify sans Discord
import { createServer } from './dist/src/api/fastifyServer.js';

async function testServer() {
  try {
    console.log('🚀 Démarrage du serveur Fastify de test...');

    const server = await createServer();

    await server.listen({
      port: 3000,
      host: '0.0.0.0',
    });

    console.log('✅ Serveur Fastify en cours d\'exécution sur http://localhost:3000');
    console.log('🌐 Dashboard accessible pour les tests Playwright');

    // Garder le serveur en vie
    process.on('SIGINT', async () => {
      console.log('\n🛑 Arrêt du serveur...');
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

testServer();