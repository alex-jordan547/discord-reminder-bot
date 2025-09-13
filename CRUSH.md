# Discord Reminder Bot CRUSH.md

This document outlines the conventions and commands for the Discord Reminder Bot project.

## Commands

### Installation
- `npm run install:all` - Installs dependencies for all workspaces.

### Development
- `npm run dev` - Starts server and client in watch mode.
- `npm run dev:server` - Starts the server.
- `npm run dev:client` - Starts the client.

### Testing
- `npm test` - Runs all tests.
- `npm run test:server` - Runs server tests.
- `npm run test:client` - Runs client tests.
- `npm run test:watch` - Runs tests in watch mode.
- To run a single test, use `vitest <test_file_path>`. For example, `cd server && vitest tests/unit/reactionTracker.voteFilter.test.ts`.

### Linting
- `npm run lint` - Lints all workspaces.
- `npm run lint:server` - Lints the server.
- `npm run lint:client` - Lints the client.
- `npm run lint:fix` - Lints and fixes all workspaces.

### Formatting
- `npm run format` - Formats all files.
- `npm run format:check` - Checks formatting.

## Code Style

### Formatting
- Use Prettier for formatting. The configuration is in `.prettierrc.json`.

### Imports
- Use ES module imports.
- Path aliases are configured for each workspace. `#/*` maps to `./src/*`.

### Naming Conventions
- Use camelCase for variables and functions.
- Use PascalCase for classes and types.

### Types
- Use TypeScript for type safety.
- Explicit function return types are preferred (`@typescript-eslint/explicit-function-return-type`: `warn`).

### Error Handling
- Unused variables are not allowed, unless they are prefixed with an underscore (`_`).
