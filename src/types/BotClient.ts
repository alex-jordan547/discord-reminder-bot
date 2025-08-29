/**
 * Discord Bot Client - Type-safe Discord client with integrated services
 * 
 * This module provides a type-safe extension of Discord.js Client that includes
 * all bot services as properly typed properties, eliminating the need for
 * unsafe type casting throughout the application.
 */

import { Client, ClientOptions, Collection, ChatInputCommandInteraction } from 'discord.js';
import { EventManager } from '@/services/eventManager';
import { ReminderScheduler } from '@/services/reminderScheduler';
import { ReactionTracker } from '@/services/reactionTracker';

/**
 * Interface defining the services that will be attached to the bot client
 */
export interface BotServices {
  eventManager: EventManager;
  reminderScheduler: ReminderScheduler;
  reactionTracker: ReactionTracker;
}

/**
 * Interface for slash command structure
 */
export interface SlashCommand {
  data: any; // SlashCommandBuilder or SlashCommandSubcommandsOnlyBuilder
  execute: (interaction: ChatInputCommandInteraction, client: DiscordBotClient) => Promise<void>;
}

/**
 * Type-safe Discord client with integrated bot services
 * 
 * This class extends the standard Discord.js Client to include all bot services
 * as properly typed properties, providing:
 * - Complete type safety without casting
 * - IDE auto-completion and IntelliSense
 * - Compile-time validation of service access
 * - Clear dependency declaration
 */
export class DiscordBotClient extends Client {
  /** Event management service for watching and tracking Discord events */
  public eventManager!: EventManager;
  
  /** Reminder scheduling service for automated notifications */
  public reminderScheduler!: ReminderScheduler;
  
  /** Reaction tracking service for monitoring user responses */
  public reactionTracker!: ReactionTracker;
  
  /** Collection of registered slash commands */
  public readonly commands = new Collection<string, SlashCommand>();

  /**
   * Creates a new Discord bot client
   * Services will be attached after construction to handle circular dependencies
   * 
   * @param options - Discord.js client options (intents, etc.)
   */
  constructor(options: ClientOptions) {
    super(options);
  }

  /**
   * Initialize bot services after client creation
   * This method handles the circular dependency between client and services
   * 
   * @param services - Bot services to attach to the client
   */
  public attachServices(services: BotServices): void {
    this.eventManager = services.eventManager;
    this.reminderScheduler = services.reminderScheduler;
    this.reactionTracker = services.reactionTracker;
  }
}