import { defineConfig } from 'vite';
import { resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(async ({ command, mode }) => {
  const plugins = [
    tsconfigPaths(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'events', 'fs', 'path', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ];

  // Try to add compression plugin if available
  try {
    const { default: compression } = await import('vite-plugin-compression');
    plugins.push(compression({
      algorithm: 'gzip',
      ext: '.gz',
    }));
    console.log('✅ Compression plugin loaded successfully');
  } catch (error) {
    console.warn('⚠️  vite-plugin-compression not available, building without compression');
  }

  return {
    plugins,

    // Fix ESBuild platform issues
    optimizeDeps: {
      esbuildOptions: {
        target: 'node18',
        platform: 'node',
      },
    },

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
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
    },
  };
});
