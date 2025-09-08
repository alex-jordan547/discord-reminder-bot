import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    vue(),
    tsconfigPaths(),
  ],

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/dashboard/test-setup.ts'],
    include: ['src/dashboard/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'coverage'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/dashboard',
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/dashboard/test-setup.ts',
      ],
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@dashboard': resolve(__dirname, 'src/dashboard'),
    },
  },

  define: {
    'process.env.NODE_ENV': '"test"',
  },
});