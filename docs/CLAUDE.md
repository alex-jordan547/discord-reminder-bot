# CLAUDE.md - Discord Reminder Bot Development Guide

This file provides essential development guidance for Claude Code instances working with the Discord Reminder Bot TypeScript codebase.

## 🚀 Essential Commands

### Development & Testing
```bash
# Core development workflow
yarn dev                    # Run development server with hot reload
yarn build                  # Production build via Vite
yarn test                   # Run Vitest test suite
yarn test:watch             # Run tests in watch mode
yarn test:coverage          # Generate test coverage report

# Code quality & validation
yarn lint                   # ESLint validation
yarn lint:fix              # Auto-fix ESLint issues
yarn lint:strict           # Lint with zero warnings allowed
yarn format                # Format code with Prettier
yarn format:check          # Check if code is properly formatted
yarn type-check            # TypeScript type checking
yarn type-check:strict     # Strict TypeScript checking
yarn quality:all           # Run all quality checks (lint + format + type-check + coverage)

# Database operations
yarn db:generate           # Generate Drizzle schema
yarn db:migrate           # Run database migrations
yarn db:push              # Push schema changes
yarn db:studio            # Launch Drizzle Studio GUI
yarn db:drop              # Drop database tables (destructive)

# Docker workflows
yarn docker:build         # Build Docker image
yarn docker:run           # Run via docker-compose
yarn docker:dev           # Development with Docker

# Security & audit
yarn security:audit       # Security audit
yarn security:fix         # Auto-fix security issues
```

### Production Operations
```bash
yarn start                 # Start production server (requires built files)
yarn clean                # Remove dist directory
yarn preview              # Preview production build
```

## 🏗️ Architecture Overview

This is a **TypeScript Discord bot** that migrated from Python, focusing on event reminder management with reaction tracking.

### Core Technology Stack
- **Runtime**: Node.js >=18.0.0, ESNext modules with strict TypeScript
- **Discord**: Discord.js v14 with comprehensive intents
- **Database**: Drizzle ORM + better-sqlite3 with auto-migration from legacy JSON
- **Build**: Vite with custom configuration, preserving modules
- **Testing**: Vitest with coverage, organized unit/integration structure
- **Validation**: Zod schemas for environment and data validation
- **Logging**: Pino with structured logging and optional colorization

### Project Structure
```
src/
├── index.ts                 # Main entry point with graceful shutdown
├── bot.ts                   # Discord client setup and event handlers
├── config/
│   ├── settings.ts          # Centralized Zod-validated configuration
│   └── featureFlags.ts      # Feature flag management system
├── db/
│   ├── index.ts             # Database connection and initialization
│   └── schema.ts            # Drizzle ORM table definitions
├── models/                  # Domain models with comprehensive validation
│   ├── BaseModel.ts         # Abstract base with common functionality
│   ├── Event.ts             # Core event model with business logic
│   ├── Guild.ts             # Guild/server configuration
│   ├── User.ts              # User tracking across servers
│   └── [Reaction|GuildConfig|ReminderLog].ts
├── services/                # Business logic services
│   ├── eventManager.ts      # Event lifecycle management
│   ├── reminderScheduler.ts # Dynamic scheduling with ±5s precision
│   ├── reactionTracker.ts   # Real-time reaction monitoring
│   └── guildConfigManager.ts # Per-guild configuration
├── commands/                # Discord command handling
│   ├── slash.ts             # Modern slash command setup
│   ├── handlers.ts          # Command business logic (refactored for DRY)
│   └── configHandler.ts     # Configuration management commands
├── persistence/             # Data layer
│   ├── index.ts             # Storage abstraction
│   └── sqliteStorage.ts     # SQLite implementation with migrations
├── server/                  # Optional Fastify REST API
│   └── fastifyServer.ts     # Health checks and management endpoints
├── utils/                   # Utilities and helpers
│   ├── loggingConfig.ts     # Structured logging with color support
│   ├── permissions.ts       # Role-based access control
│   ├── validation.ts        # Input validation utilities
│   ├── messageParser.ts     # Discord message link parsing
│   └── errorRecovery.ts     # Retry logic with exponential backoff
└── types/                   # TypeScript type definitions
    └── BotClient.ts         # Extended Discord client with services
```

## 🔧 Key Development Concepts

### 1. **Strict TypeScript Configuration**
- `exactOptionalPropertyTypes: true` - Distinguish `undefined` from optional properties
- `noUncheckedIndexedAccess: true` - Array/object access returns `T | undefined`
- Path aliases: `@/*` and `#/*` both resolve to `src/*`
- ES modules with `.ts` extensions in imports

### 2. **Database Architecture (SQLite + Drizzle ORM)**
- **Primary Tables**: `events`, `users`, `guilds`, `guild_configs`, `reactions`, `reminder_logs`
- **Key Features**: Foreign key constraints, proper indexing, timestamp columns
- **Migration Strategy**: Auto-migrate from legacy JSON with backup/rollback support
- **Schema Location**: `src/db/schema.ts` with exported TypeScript types

### 3. **Event Model System**
- **Central Entity**: `Event` class in `src/models/Event.ts`
- **Dual Constructor**: Supports both object data and individual parameters
- **Validation**: Comprehensive validation with detailed error reporting
- **Serialization**: Multiple formats (toDict, toJSON, fromDict) for compatibility
- **Business Logic**: Built-in methods for reminder timing, reaction counting, status reporting

### 4. **Service Architecture**
- **EventManager**: CRUD operations and business rules
- **ReminderScheduler**: Dynamic scheduling system with smart sleep mode
- **ReactionTracker**: Real-time Discord reaction event handling  
- **GuildConfigManager**: Per-server configuration management
- **Dependency Injection**: Services attached to extended Discord client

### 5. **Configuration System**
- **File**: `src/config/settings.ts` with Zod validation
- **Environment Variables**: Comprehensive schema with defaults and type coercion
- **Key Features**: Test mode detection, interval validation, display formatting
- **Multi-Environment**: Development/production/test configuration support

## 🧪 Testing Approach

### Test Organization
```
src/tests/
├── unit/                    # Unit tests for individual components
│   └── watchCommand.unit.test.ts  # Example: command handler logic
├── integration/             # Integration tests for system interactions
│   └── reactionConfigSimple.integration.test.ts
├── persistence/             # Database and storage tests
│   └── eventDescription.test.ts
├── minimal.test.ts          # Focused debugging tests
└── sqliteStorageMock.ts     # Test utilities and mocks
```

### Testing Strategy
- **Unit Tests**: Focus on individual class/function behavior
- **Integration Tests**: Test service interactions and Discord API integration  
- **Validation Tests**: Ensure strict TypeScript compliance and data integrity
- **Mock Services**: Available in `src/services/__mocks__/` for isolation

### Key Test Files to Reference
- `src/tests/minimal.test.ts` - Simple Event model validation patterns
- `src/tests/unit/watchCommand.unit.test.ts` - Command handler testing approach
- `src/tests/persistence/eventDescription.test.ts` - Database operation testing

## 💡 Development Patterns

### 1. **Error Handling Philosophy**
```typescript
// Preferred: Detailed validation with error collection
const errors = event.validate();
if (errors.length > 0) {
    // Handle specific validation errors
}

// Legacy: Boolean validation (being phased out)
if (!event.isValid()) {
    // Generic handling
}
```

### 2. **Async Service Patterns**
```typescript
// Services are attached to Discord client for DI
client.eventManager.createEvent(eventData);
await client.reminderScheduler.scheduleNext();
await client.reactionTracker.handleReactionAdd(reaction, user);
```

### 3. **Configuration Access**
```typescript
import { Settings } from '@/config/settings';

// Validated environment access
Settings.TOKEN              // Discord bot token
Settings.isTestMode()      // Test mode detection  
Settings.validateIntervalMinutes(60)  // Input validation with clamping
```

### 4. **Database Operations**
```typescript
// Using Drizzle ORM with proper typing
const storage = new SqliteStorage();
const event = await storage.getEvent(messageId);
const success = await storage.saveEvent(event);
```

## 🔍 Key Files for Understanding

### Core Application Flow
- `src/index.ts` - Application bootstrap with graceful shutdown
- `src/bot.ts` - Discord client setup and event handlers
- `src/commands/handlers.ts` - Recent refactoring eliminates duplication

### Data Layer Understanding  
- `src/models/Event.ts` - Complete business logic and validation patterns
- `src/db/schema.ts` - Database structure with relationships and constraints
- `src/persistence/sqliteStorage.ts` - Data access patterns

### Configuration & Environment
- `src/config/settings.ts` - All configuration logic with Zod validation
- `package.json` scripts section - Available development commands

### Recent Refactoring Context
- Recent work focused on TypeScript strict mode compliance
- Code deduplication in command handlers with improved type safety
- Enhanced unit test coverage for watch command functionality
- Event description field handling improved (null/undefined distinction)

## 🚨 Important Development Notes

### **TypeScript Strictness**
- Code uses `exactOptionalPropertyTypes: true` - be careful with optional fields
- Array access requires null checks due to `noUncheckedIndexedAccess: true`
- Import paths use `@/` prefix consistently

### **Database Migration Context**
- System supports both SQLite (preferred) and JSON fallback
- Auto-migration from legacy Python JSON format
- Description field handling: `null` from DB converts to `undefined` in models

### **Testing Considerations**
- Test files show patterns for Discord ID validation (18+ digit strings)
- Event validation is comprehensive - follow existing patterns
- Mock services available for unit test isolation

### **Build System**  
- Vite configuration preserves module structure in output
- External dependencies (Discord.js, better-sqlite3) not bundled
- Development server uses nodemon for TypeScript execution

This guide focuses on the architectural patterns and development workflows specific to this Discord bot codebase. The system emphasizes type safety, comprehensive validation, and modern TypeScript patterns while maintaining compatibility with Discord.js ecosystem requirements.