/**
 * Discord Reminder Bot - Discord Client Setup and Event Handlers
 * 
 * Comprehensive Discord client setup with event handlers for:
 * - Bot ready event with slash command synchronization
 * - Message events for command parsing
 * - Reaction events for tracking user responses
 * - Error handling and reconnection logic
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
  ActivityType
} from 'discord.js';
import { Settings } from '@/config/settings';
import { featureFlagManager } from '@/config/featureFlags';
import { createLogger } from '@/utils/loggingConfig';
import { setupSlashCommands, syncSlashCommands } from '@/commands/slash';
import { setupEventHandlers } from '@/commands/handlers';
import { EventManager } from '@/services/eventManager';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { ReactionTracker } from '@/services/reactionTracker';

const logger = createLogger('bot');

/**
 * Create and configure Discord client with all necessary intents and event handlers
 */
export async function createDiscordClient(): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers, // For permission checking
    ],
  });

  // Initialize services
  const eventManager = new EventManager();
  const reminderScheduler = new ReminderScheduler(client, eventManager);
  const reactionTracker = new ReactionTracker(eventManager);

  // Store services on client for access in commands
  (client as any).eventManager = eventManager;
  (client as any).reminderScheduler = reminderScheduler;
  (client as any).reactionTracker = reactionTracker;

  // Bot ready event - called when bot is fully connected
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`✅ Bot connected as ${readyClient.user.tag}`);
    logger.info(`📊 Present on ${readyClient.guilds.cache.size} server(s)`);

    // Log server information
    readyClient.guilds.cache.forEach(guild => {
      logger.info(`  - ${guild.name} (ID: ${guild.id})`);
    });

    // Set bot status
    readyClient.user.setActivity('events and reminders', { type: ActivityType.Watching });

    try {
      // Setup and synchronize slash commands
      setupSlashCommands(readyClient);
      const synced = await syncSlashCommands(readyClient);
      logger.info(`⚡ Synchronized ${synced.length} slash command(s) with Discord`);
    } catch (error) {
      logger.error(`Failed to sync slash commands: ${error}`);
    }

    // Setup command handlers
    setupEventHandlers(readyClient);

    // Load events from storage
    try {
      const loadedEvents = await eventManager.loadFromStorage();
      logger.info(`📥 Loaded ${loadedEvents.length} events from storage`);
    } catch (error) {
      logger.error(`Failed to load events from storage: ${error}`);
    }

    // Initialize reminder scheduler
    try {
      await reminderScheduler.initialize();
      logger.info('⏰ Reminder scheduler initialized');
    } catch (error) {
      logger.error(`Failed to initialize reminder scheduler: ${error}`);
    }

    // Set logger for feature flag manager
    featureFlagManager.setLogger({
      info: (msg: string) => logger.info(msg),
      warning: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    });

    logger.info('🎉 Bot initialization complete!');
  });

  // Message events for legacy command support
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    
    // Handle legacy text commands if needed
    // This can be removed once full migration to slash commands is complete
  });

  // Reaction events for tracking user responses
  client.on(Events.MessageReactionAdd, async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ) => {
    try {
      // Fetch partial data
      if (reaction.partial) {
        await reaction.fetch();
      }
      if (user.partial) {
        await user.fetch();
      }

      // Skip bot reactions
      if (user.bot) return;

      await reactionTracker.handleReactionAdd(reaction as MessageReaction, user as User);
    } catch (error) {
      logger.error(`Error handling reaction add: ${error}`);
    }
  });

  client.on(Events.MessageReactionRemove, async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ) => {
    try {
      // Fetch partial data
      if (reaction.partial) {
        await reaction.fetch();
      }
      if (user.partial) {
        await user.fetch();
      }

      // Skip bot reactions
      if (user.bot) return;

      await reactionTracker.handleReactionRemove(reaction as MessageReaction, user as User);
    } catch (error) {
      logger.error(`Error handling reaction remove: ${error}`);
    }
  });

  // Error handling
  client.on(Events.Error, (error) => {
    logger.error(`Discord client error: ${error.message}`);
  });

  client.on(Events.Warn, (warning) => {
    logger.warn(`Discord client warning: ${warning}`);
  });

  // Disconnect handling
  client.on(Events.ShardDisconnect, (closeEvent, id) => {
    logger.warn(`Shard ${id} disconnected: ${closeEvent.code} ${closeEvent.reason}`);
  });

  client.on(Events.ShardReconnecting, (id) => {
    logger.info(`Shard ${id} reconnecting...`);
  });

  client.on(Events.ShardResume, (id, replayedEvents) => {
    logger.info(`Shard ${id} resumed, replayed ${replayedEvents} events`);
  });

  return client;
}

/**
 * Helper function to create a fully configured Discord client
 * This is used by the main application entry point
 */
export { createDiscordClient };