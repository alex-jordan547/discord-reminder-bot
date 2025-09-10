import { defineConfig } from 'vite';
import { resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';
import compression from 'vite-plugin-compression';

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
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
  ],

  // Configuration pour build et développement
  build: {
    target: 'node18',
    outDir: 'dist',
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      external: [
        'discord.js',
        'better-sqlite3',
        'drizzle-orm',
        'fastify',
        '@fastify/cookie',
        '@fastify/cors',
        '@fastify/multipart',
        '@fastify/rate-limit',
        '@fastify/websocket',
        'bcrypt',
        'ioredis',
        'jsonwebtoken',
        'pg',
        'pino',
        'pino-pretty',
        'chalk',
        'dotenv',
        'redis',
        'ws',
        'zod',
        'url',
        'path',
        'fs',
        'vm',
        'crypto',
        'events',
        'stream',
        'util',
        'buffer',
        /^node:/,
      ],
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
      treeshake: {
        moduleSideEffects: false,
      },
    },
  },

  // Cache configuration pour améliorer les performances
  cacheDir: 'node_modules/.vite',

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
