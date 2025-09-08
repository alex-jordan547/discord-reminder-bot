import { defineConfig } from 'vite';
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

  // Configuration optimisée pour le développement
  build: {
    target: 'node18',
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    // Logs plus silencieux pour ne pas polluer la console du bot
    reportCompressedSize: false,
    watch: {
      include: 'src/**',
      exclude: ['node_modules/**', 'dist/**'],
    },
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      external: [
        'discord.js',
        'better-sqlite3',
        'drizzle-orm',
        'fastify',
        'pino',
        'pino-pretty',
        'chalk',
        'dotenv',
        'zod',
        'url',
        'path',
        'fs',
        /^node:/,
      ],
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
    },
  },

  // Configuration pour des logs informatifs en dev
  logLevel: 'info', // Afficher les informations de build et les warnings

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '#': resolve(__dirname, 'src'),
    },
  },

  define: {
    'process.env.NODE_ENV': '"development"',
  },
});
