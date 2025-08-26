/**
 * Discord Reminder Bot - Main Entry Point (TypeScript)
 * 
 * Main application entry point that initializes the Discord client,
 * sets up event handlers, and optionally starts the Fastify server.
 * 
 * Migration from Python bot.py to TypeScript with enhanced features.
 */

import { Client } from 'discord.js';
import { Settings } from '@/config/settings';
import { createLogger, setupLogging } from '@/utils/loggingConfig';
import { createDiscordClient } from './bot';
import { createServer } from './server/fastifyServer';
import { validateEnvironmentConfig } from '@/utils/validation';

// Initialize logging
setupLogging({
  logLevel: Settings.LOG_LEVEL,
  logToFile: Settings.LOG_TO_FILE,
  useColors: Settings.LOG_COLORS === undefined ? true : Settings.LOG_COLORS,
});

const logger = createLogger('main');

/**
 * Main application initialization function
 */
async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting Discord Reminder Bot (TypeScript)...');

    // Validate configuration
    const configErrors = validateEnvironmentConfig();
    if (configErrors.length > 0) {
      logger.error('Configuration validation failed:');
      configErrors.forEach(error => logger.error(`  - ${error}`));
      process.exit(1);
    }

    // Validate Discord token
    if (!Settings.TOKEN) {
      logger.error('❌ Discord token is missing! Set the DISCORD_TOKEN environment variable');
      logger.error('📖 Guide: https://discord.com/developers/applications');
      process.exit(1);
    }

    // Log configuration
    Settings.logConfiguration(logger);

    // Create Discord client
    const client = await createDiscordClient();

    // Optionally create Fastify server for health checks and APIs
    let server = null;
    if (Settings.SERVER_ENABLED) {
      try {
        server = await createServer();
        await server.listen({
          port: Settings.SERVER_PORT,
          host: Settings.SERVER_HOST
        });
        logger.info(`🌐 Fastify server running on ${Settings.SERVER_HOST}:${Settings.SERVER_PORT}`);
      } catch (error) {
        logger.error(`Failed to start Fastify server: ${error}`);
        if (Settings.SERVER_REQUIRED) {
          throw error;
        }
      }
    }

    // Login to Discord
    await client.login(Settings.TOKEN);

    // Handle process signals for graceful shutdown
    const handleShutdown = async (signal: string): Promise<void> => {
      logger.info(`📥 Received ${signal}, shutting down gracefully...`);
      
      try {
        // Close Fastify server
        if (server) {
          await server.close();
          logger.info('✅ Fastify server closed');
        }

        // Destroy Discord client
        client.destroy();
        logger.info('✅ Discord client destroyed');

        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => void handleShutdown('SIGINT'));
    process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

    logger.info('✅ Application started successfully');

  } catch (error) {
    logger.error(`❌ Failed to start application: ${error}`);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the application if this file is run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error starting application:', error);
    process.exit(1);
  });
}

export default main;