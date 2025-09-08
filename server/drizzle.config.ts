import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/discord_bot.db',
  },
  verbose: true,
  strict: true,
});
