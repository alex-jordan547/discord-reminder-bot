# GEMINI.md

## Project Overview

This is a Discord bot designed to track user availability for events by monitoring reactions to messages. It features automated reminders, dynamic scheduling, and persistent storage using a database. The project is a monorepo with a client-server architecture, built with Node.js, TypeScript, and Vue.js. It is containerized using Docker.

**Key Technologies:**

*   **Backend:** Node.js, TypeScript, Fastify, Drizzle ORM
*   **Frontend:** Vue.js
*   **Database:** PostgreSQL, Redis, SQLite (as a fallback)
*   **Containerization:** Docker
*   **Package Manager:** npm (or yarn)

**Project Structure:**

The project is organized as a monorepo with three main packages:

*   `server/`: The backend application (the Discord bot itself).
*   `client/`: The frontend web interface for managing the bot.
*   `shared/`: Code shared between the client and server.

## Building and Running

### Local Development

To run the application in a local development environment:

1.  **Install Dependencies:**
    ```bash
    npm run install:all
    ```

2.  **Run the Application:**
    ```bash
    npm run dev
    ```
    This will start both the server and the client in development mode with hot-reloading.

### Docker

To run the application using Docker:

1.  **Build the Docker Image:**
    ```bash
    npm run docker:build
    ```

2.  **Start the Application:**
    ```bash
    npm run docker:up
    ```

### Other Useful Commands

*   **Build for Production:**
    ```bash
    npm run build
    ```

*   **Run Tests:**
    ```bash
    npm run test
    ```

*   **Lint and Format:**
    ```bash
    npm run lint
    npm run format
    ```

*   **Database Migrations:**
    ```bash
    npm run db:migrate
    ```

## Development Conventions

*   **Code Style:** The project uses Prettier for code formatting and ESLint for linting. There are pre-commit hooks configured in `.pre-commit-config.yaml` to enforce these standards.
*   **Testing:** The project uses Vitest for unit and integration testing. Tests are located in the `tests` directory of both the `client` and `server` packages.
*   **Commits:** The `prepare_commit.sh` script in the `scripts` directory suggests that there might be a conventional commit message format in use.
