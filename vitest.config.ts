import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'events', 'fs', 'path', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],

  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/testSetup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}', 'src/tests/**/*.{js,ts}'],
    exclude: ['node_modules', 'dist', 'coverage'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/testSetup.ts',
      ],
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '#': resolve(__dirname, 'src'),
    },
  },

  define: {
    'process.env.NODE_ENV': '"test"',
  },
});
