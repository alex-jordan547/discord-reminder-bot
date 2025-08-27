/**
 * Discord Reminder Bot - Main Entry Point (TypeScript)
 *
 * Main application entry point that initializes the Discord client,
 * sets up event handlers, and optionally starts the Fastify server.
 *
 * Migration from Python bot.py to TypeScript with enhanced features.
 */

import { Settings } from '@/config/settings';
import { createLogger, closeLogging } from '@/utils/loggingConfig';
import { createDiscordClient } from './bot';
import { createServer } from './server/fastifyServer';
import { validateEnvironmentConfig } from '@/utils/validation';

const logger = createLogger('index.ts');

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string, client?: any, server?: any): Promise<void> {
  logger.info(`📥 Received ${signal}, shutting down gracefully...`);

  try {
    // Close Fastify server
    if (server) {
      await server.close();
      logger.info('✅ Fastify server closed');
    }

    // Destroy Discord client
    if (client) {
      client.destroy();
      logger.info('✅ Discord client destroyed');
    }

    // Close logging system properly
    await closeLogging();
    console.log('✅ Logging system closed');

    process.exit(0);
  } catch (error) {
    console.error(`Error during shutdown: ${error}`);
    // Force close logging and exit
    await closeLogging().catch(() => {});
    setTimeout(() => process.exit(1), 50);
  }
}

/**
 * Main application initialization function
 */
async function main(): Promise<void> {
  let client: any = null;
  let server: any = null;

  try {
    logger.info('🚀 Starting Discord Reminder Bot (TypeScript)...');

    // Validate configuration
    const configErrors = validateEnvironmentConfig();
    if (configErrors.length > 0) {
      logger.error('Configuration validation failed:');
      configErrors.forEach(error => logger.error(`  - ${error}`));
      // Give logger time to flush before exit
      await new Promise(resolve => setTimeout(resolve, 100));
      await closeLogging();
      process.exit(1);
    }

    // Validate Discord token
    if (!Settings.TOKEN) {
      logger.error('❌ Discord token is missing! Set the DISCORD_TOKEN environment variable');
      logger.error('📖 Guide: https://discord.com/developers/applications');
      // Give logger time to flush before exit
      await new Promise(resolve => setTimeout(resolve, 100));
      await closeLogging();
      process.exit(1);
    }

    // Log configuration
    Settings.logConfiguration(logger);

    // Create Discord client
    client = await createDiscordClient();

    // Optionally create Fastify server for health checks and APIs
    if (Settings.SERVER_ENABLED) {
      try {
        server = await createServer();
        await server.listen({
          port: Settings.SERVER_PORT,
          host: Settings.SERVER_HOST,
        });
        logger.info(`🌐 Fastify server running on ${Settings.SERVER_HOST}:${Settings.SERVER_PORT}`);
      } catch (error) {
        logger.error(`Failed to start Fastify server: ${error}`);
        if (Settings.SERVER_REQUIRED) {
          throw error;
        }
      }
    }

    // Setup shutdown handlers
    process.on('SIGINT', () => void gracefulShutdown('SIGINT', client, server));
    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM', client, server));

    // Login to Discord
    await client.login(Settings.TOKEN);

    logger.info('✅ Application started successfully');
  } catch (error) {
    logger.error(`❌ Failed to start application: ${error}`);

    // Cleanup on error
    if (server) {
      try {
        await server.close();
      } catch (closeError) {
        logger.error(`Error closing server: ${closeError}`);
      }
    }

    if (client) {
      try {
        client.destroy();
      } catch (destroyError) {
        logger.error(`Error destroying client: ${destroyError}`);
      }
    }

    // Close logging system properly before exit
    await closeLogging();
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', async error => {
  logger.error('Unhandled promise rejection:', error);
  await closeLogging().catch(() => {});
  setTimeout(() => process.exit(1), 50);
});

// Handle uncaught exceptions
process.on('uncaughtException', async error => {
  logger.error('Uncaught exception:', error);
  await closeLogging().catch(() => {});
  setTimeout(() => process.exit(1), 50);
});

// Start the application if this file is run directly
// ES module equivalent of require.main === module
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(error => {
    console.error('Fatal error starting application:', error);
    process.exit(1);
  });
}

export default main;
