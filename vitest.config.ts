import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    // Charge le fichier .env.test pour les tests
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      DATABASE_NAME: ':memory:',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/config': path.resolve(__dirname, './src/config'),
      '@/models': path.resolve(__dirname, './src/models'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/commands': path.resolve(__dirname, './src/commands'),
      '@/persistence': path.resolve(__dirname, './src/persistence'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
});
