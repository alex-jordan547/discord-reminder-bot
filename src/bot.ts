/**
 * Discord Reminder Bot - TypeScript/Node.js Version
 *
 * Main bot entry point with configuration loading and basic Discord.js setup
 */

import {Client, GatewayIntentBits} from 'discord.js';
import {Settings} from '@/config/settings';
import {featureFlagManager} from '@/config/featureFlags';
import {createLogger, setupLogging} from '@/utils/loggingConfig';

// Initialize logging
setupLogging({
  logLevel: Settings.LOG_LEVEL,
  logToFile: Settings.LOG_TO_FILE,
  useColors: Settings.LOG_COLORS === undefined ? true : Settings.LOG_COLORS,
});

// Create bot-specific logger
const logger = createLogger('bot');

/**
 * Initialize Discord client with required intents
 */
function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Set up basic event listeners
  client.once('ready', () => {
    logger.info(`✅ Bot connecté en tant que ${client.user?.tag}`);
    Settings.logConfiguration(logger);

    // Set logger for feature flag manager
    featureFlagManager.setLogger({
      info: (msg: string) => logger.info(msg),
      warning: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    });
  });

  client.on('error', error => {
    logger.error(`Discord client error: ${error.message}`);
  });

  client.on('warn', warning => {
    logger.warn(`Discord client warning: ${warning}`);
  });

  return client;
}

/**
 * Main function to start the bot
 */
async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting Discord Reminder Bot (TypeScript)...');

    // Create Discord client
    const client = createDiscordClient();

    // Login to Discord
    await client.login(Settings.TOKEN);

    // Handle process signals for graceful shutdown
    const handleShutdown = (signal: string): void => {
      logger.info(`📥 Received ${signal}, shutting down gracefully...`);
      client.destroy();
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    logger.error(`❌ Failed to start bot: ${error}`);
    process.exit(1);
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error starting bot:', error);
    process.exit(1);
  });
}

export default main;