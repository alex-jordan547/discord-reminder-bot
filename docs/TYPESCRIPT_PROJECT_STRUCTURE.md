# TypeScript Project Structure Design

## 📁 Detailed Project Architecture

### Root Structure
```
discord-reminder-bot-ts/
├── src/                            # Source code
├── tests/                          # Test files
├── docs/                           # Documentation
├── scripts/                        # Utility scripts
├── migrations/                     # Database migrations
├── config/                         # Configuration files
├── .github/                        # GitHub Actions workflows
├── logs/                          # Runtime logs (gitignored)
├── data/                          # Runtime data (gitignored) 
├── dist/                          # Compiled output (gitignored)
├── node_modules/                  # Dependencies (gitignored)
└── [config files]                 # Package.json, tsconfig, etc.
```

---

## 🔍 Source Code Structure (`src/`)

### Main Entry Points
```typescript
// src/index.ts - Application entry point
import { config } from './config';
import { createBot } from './bot';
import { createServer } from './server';
import { logger } from './utils/logger';

async function main() {
  // Initialize configuration
  // Setup logging
  // Create Discord bot
  // Create Fastify server (optional)
  // Start services
}

// src/bot.ts - Discord bot setup
import { Client, GatewayIntentBits } from 'discord.js';
import { EventManager } from './services/event-manager';
import { ReminderScheduler } from './services/reminder-scheduler';

export async function createBot() {
  // Configure Discord client
  // Register event handlers
  // Setup command handlers
  // Initialize services
}
```

### Configuration Module (`src/config/`)
```typescript
// src/config/index.ts
export { config } from './settings';
export { validateConfig } from './validation';

// src/config/settings.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  discord: z.object({
    token: z.string(),
    clientId: z.string(),
    guildIds: z.array(z.string()).optional(),
  }),
  database: z.object({
    path: z.string().default('./data/bot.db'),
    autoMigrate: z.boolean().default(true),
    backupOnMigration: z.boolean().default(true),
  }),
  reminders: z.object({
    defaultIntervalHours: z.number().default(24),
    minIntervalMinutes: z.number().default(5),
    maxIntervalMinutes: z.number().default(1440),
    maxMentionsPerReminder: z.number().default(50),
    delayBetweenReminders: z.number().default(2000),
  }),
  server: z.object({
    enabled: z.boolean().default(false),
    port: z.number().default(3000),
    host: z.string().default('0.0.0.0'),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    toFile: z.boolean().default(true),
    colors: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export const config = ConfigSchema.parse(process.env);

// src/config/validation.ts
import { ConfigSchema } from './settings';

export function validateConfig(env: NodeJS.ProcessEnv) {
  // Validate environment variables
  // Transform and parse configuration
  // Return validated config or throw detailed errors
}
```

### Database & Models (`src/models/`)
```typescript
// src/models/index.ts
export * from './schema';
export * from './database';
export * from './types';

// src/models/database.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-kit/migrator';

export class DatabaseManager {
  private db: Database.Database;
  private orm: ReturnType<typeof drizzle>;

  constructor(path: string) {
    this.db = new Database(path);
    this.orm = drizzle(this.db);
    // Configure WAL mode, foreign keys, etc.
  }

  async initialize(): Promise<void> {
    // Run migrations
    // Setup indexes
    // Validate schema
  }
}

// src/models/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const guilds = sqliteTable('guilds', {
  guildId: text('guild_id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const channels = sqliteTable('channels', {
  channelId: text('channel_id').primaryKey(),
  guildId: text('guild_id').references(() => guilds.guildId),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const events = sqliteTable('events', {
  messageId: text('message_id').primaryKey(),
  guildId: text('guild_id').references(() => guilds.guildId),
  channelId: text('channel_id').references(() => channels.channelId),
  title: text('title').notNull(),
  intervalHours: real('interval_hours').notNull(),
  lastRemindedAt: integer('last_reminded_at', { mode: 'timestamp' }),
  isPaused: integer('is_paused', { mode: 'boolean' }).default(false),
  usersWhoReacted: text('users_who_reacted', { mode: 'json' }).default('[]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// src/models/types.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { guilds, channels, events } from './schema';

export type Guild = InferSelectModel<typeof guilds>;
export type Channel = InferSelectModel<typeof channels>;
export type Event = InferSelectModel<typeof events>;

export type NewGuild = InferInsertModel<typeof guilds>;
export type NewChannel = InferInsertModel<typeof channels>;
export type NewEvent = InferInsertModel<typeof events>;
```

### Services Layer (`src/services/`)
```typescript
// src/services/event-manager.ts
export class EventManager {
  constructor(
    private database: DatabaseManager,
    private logger: Logger
  ) {}

  async createEvent(data: NewEvent): Promise<Event> {
    // Validate input data
    // Insert into database
    // Return created event
  }

  async getEventsByGuild(guildId: string): Promise<Event[]> {
    // Query database
    // Return filtered events
  }

  async updateEvent(messageId: string, updates: Partial<Event>): Promise<Event> {
    // Validate updates
    // Update database
    // Return updated event
  }

  async deleteEvent(messageId: string): Promise<boolean> {
    // Delete from database
    // Return success status
  }
}

// src/services/reminder-scheduler.ts
export class ReminderScheduler {
  private scheduledTasks = new Map<string, NodeJS.Timeout>();
  
  constructor(
    private eventManager: EventManager,
    private discordClient: Client,
    private logger: Logger
  ) {}

  async scheduleNextCheck(): Promise<void> {
    // Get all active events
    // Calculate next reminder time
    // Schedule or enter sleep mode
    // Implement dynamic scheduling logic
  }

  async checkReminders(): Promise<void> {
    // Find due reminders
    // Send reminder messages
    // Update last reminded time
    // Reschedule next check
  }

  private calculateNextReminderTime(events: Event[]): Date | null {
    // Implement precise timing calculation
    // Return null if no events to watch
  }
}

// src/services/reaction-tracker.ts
export class ReactionTracker {
  constructor(
    private eventManager: EventManager,
    private logger: Logger
  ) {}

  async handleReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
    // Check if message is being watched
    // Update user reactions
    // Save to database
  }

  async handleReactionRemove(reaction: MessageReaction, user: User): Promise<void> {
    // Check if message is being watched
    // Remove user reaction
    // Update database
  }
}

// src/services/permission-manager.ts
export class PermissionManager {
  constructor(private config: Config) {}

  hasAdminPermission(member: GuildMember): boolean {
    // Check admin roles
    // Validate permissions
  }

  canUseCommand(member: GuildMember, command: string): boolean {
    // Role-based command access
  }

  canAccessChannel(member: GuildMember, channel: GuildChannel): boolean {
    // Channel permission validation
  }
}
```

### Command System (`src/commands/`)
```typescript
// src/commands/index.ts
export { setupCommandHandlers } from './handlers';
export { setupSlashCommands } from './slash';

// src/commands/handlers/watch.ts
export class WatchCommandHandler {
  constructor(
    private eventManager: EventManager,
    private scheduler: ReminderScheduler,
    private permissionManager: PermissionManager
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Validate permissions
    // Parse message link
    // Create event
    // Schedule reminders
    // Send confirmation
  }
}

// src/commands/slash/index.ts
import { SlashCommandBuilder } from 'discord.js';

export const watchCommand = new SlashCommandBuilder()
  .setName('watch')
  .setDescription('Watch a message for reactions and send reminders')
  .addStringOption(option =>
    option.setName('link')
      .setDescription('Discord message link to watch')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('interval')
      .setDescription('Reminder interval in minutes')
      .setRequired(false)
      .addChoices(
        { name: '5 minutes', value: 5 },
        { name: '15 minutes', value: 15 },
        { name: '30 minutes', value: 30 },
        { name: '1 hour', value: 60 },
        { name: '2 hours', value: 120 },
        { name: '6 hours', value: 360 },
        { name: '12 hours', value: 720 },
        { name: '24 hours', value: 1440 },
      )
  );
```

### Utilities (`src/utils/`)
```typescript
// src/utils/logger.ts
import pino from 'pino';
import pretty from 'pino-pretty';

export function createLogger(config: Config['logging']) {
  const stream = config.colors 
    ? pretty({ colorize: true, levelFirst: true })
    : process.stdout;

  return pino({
    level: config.level,
    timestamp: pino.stdTimeFunctions.isoTime,
  }, stream);
}

// src/utils/discord-parser.ts
export interface ParsedMessageLink {
  guildId: string;
  channelId: string;
  messageId: string;
}

export function parseMessageLink(link: string): ParsedMessageLink {
  // Parse Discord message link
  // Validate format
  // Extract IDs
  // Return parsed data or throw error
}

export async function fetchMessage(
  client: Client,
  parsed: ParsedMessageLink
): Promise<Message> {
  // Fetch message from Discord
  // Handle errors gracefully
  // Return message or throw
}

// src/utils/validation.ts
import { z } from 'zod';

export const MessageLinkSchema = z.string().regex(
  /https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+/,
  'Invalid Discord message link format'
);

export const IntervalSchema = z.number()
  .min(5, 'Interval must be at least 5 minutes')
  .max(1440, 'Interval cannot exceed 24 hours');

export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(formatZodError(error));
    }
    throw error;
  }
}

// src/utils/errors.ts
export class BotError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class ValidationError extends BotError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class PermissionError extends BotError {
  constructor(message: string) {
    super(message, 'PERMISSION_ERROR', 403);
  }
}
```

### Server Module (`src/server/`) - Optional Fastify API
```typescript
// src/server/index.ts
import Fastify from 'fastify';
import { config } from '../config';

export async function createServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  await fastify.register(import('./routes/health'));
  await fastify.register(import('./routes/admin'));

  return fastify;
}

// src/server/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  });

  fastify.get('/health/bot', async () => {
    // Return Discord bot status
    // Database connection status
    // Active events count
    // Next reminder time
  });
};

export default health;
```

### Type Definitions (`src/types/`)
```typescript
// src/types/discord.ts
import type { 
  Client, 
  Message, 
  MessageReaction, 
  User, 
  GuildMember,
  ChatInputCommandInteraction 
} from 'discord.js';

export interface BotContext {
  client: Client;
  eventManager: EventManager;
  scheduler: ReminderScheduler;
  permissionManager: PermissionManager;
}

export interface CommandHandler {
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  validate?(interaction: ChatInputCommandInteraction): Promise<boolean>;
}

// src/types/config.ts
export interface DatabaseConfig {
  path: string;
  autoMigrate: boolean;
  backupOnMigration: boolean;
}

export interface ReminderConfig {
  defaultIntervalHours: number;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  maxMentionsPerReminder: number;
  delayBetweenReminders: number;
}
```

---

## 📋 Configuration Files

### TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext", 
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": false,
    "checkJs": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "removeComments": true,
    "noEmitOnError": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/config": ["src/config"],
      "@/models": ["src/models"], 
      "@/services": ["src/services"],
      "@/utils": ["src/utils"],
      "@/types": ["src/types"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:prod": "pm2 start pm2.config.js",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui",
    "db:generate": "drizzle-kit generate:sqlite",
    "db:migrate": "drizzle-kit up:sqlite",
    "db:studio": "drizzle-kit studio",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "type-check": "tsc --noEmit"
  }
}
```

### Vitest Configuration (`vitest.config.ts`)
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['dist/', 'tests/', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Drizzle Configuration (`drizzle.config.ts`)
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/models/schema.ts',
  out: './migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: './data/bot.db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

### PM2 Configuration (`pm2.config.js`)
```javascript
module.exports = {
  apps: [{
    name: 'discord-reminder-bot',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    autorestart: true,
    max_restarts: 5,
    restart_delay: 5000,
  }]
};
```

---

## 🧪 Testing Structure (`tests/`)

### Test Organization
```
tests/
├── unit/                          # Unit tests
│   ├── config/
│   │   └── validation.test.ts
│   ├── models/
│   │   ├── database.test.ts
│   │   └── schema.test.ts
│   ├── services/
│   │   ├── event-manager.test.ts
│   │   ├── reminder-scheduler.test.ts
│   │   └── reaction-tracker.test.ts
│   └── utils/
│       ├── discord-parser.test.ts
│       └── validation.test.ts
├── integration/                   # Integration tests
│   ├── commands/
│   │   └── watch.test.ts
│   ├── database/
│   │   └── operations.test.ts
│   └── discord/
│       └── events.test.ts
├── e2e/                          # End-to-end tests
│   └── reminder-flow.test.ts
├── fixtures/                     # Test data
│   ├── discord-mocks.ts
│   └── database-fixtures.ts
└── helpers/                      # Test utilities
    ├── setup.ts
    └── database.ts
```

### Test Examples
```typescript
// tests/unit/services/event-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventManager } from '@/services/event-manager';
import { createTestDatabase } from '../helpers/database';

describe('EventManager', () => {
  let eventManager: EventManager;
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
    eventManager = new EventManager(database, mockLogger);
  });

  it('should create event successfully', async () => {
    const eventData = {
      messageId: '123456789',
      guildId: '987654321',
      channelId: '456789123',
      title: 'Test Event',
      intervalHours: 24,
    };

    const event = await eventManager.createEvent(eventData);
    
    expect(event).toBeDefined();
    expect(event.messageId).toBe(eventData.messageId);
    expect(event.title).toBe(eventData.title);
  });
});
```

---

## 🎯 Migration Mapping

### Direct Component Mappings

| Python Module | TypeScript Equivalent | Migration Complexity |
|---------------|----------------------|---------------------|
| `bot.py` | `src/index.ts` + `src/bot.ts` | Medium |
| `commands/handlers.py` | `src/commands/handlers/` | High |
| `commands/slash_commands.py` | `src/commands/slash/` | Medium |
| `config/settings.py` | `src/config/` | Low |
| `models/database_models.py` | `src/models/schema.ts` | Medium |
| `persistence/storage.py` | `src/models/database.ts` | Medium |
| `utils/logging_config.py` | `src/utils/logger.ts` | Low |
| `utils/message_parser.py` | `src/utils/discord-parser.ts` | Low |
| `utils/permissions.py` | `src/services/permission-manager.ts` | Low |

### New TypeScript-Specific Features
1. **Compile-time type safety** across all modules
2. **Zod runtime validation** for external inputs
3. **Drizzle ORM** with type-safe database queries
4. **Fastify integration** for health monitoring
5. **Modern ES modules** with path aliases
6. **Vitest testing** with native TypeScript support

---

This project structure provides a solid foundation for migrating the Discord Reminder Bot to TypeScript while preserving all existing functionality and adding type safety, better tooling, and improved developer experience.