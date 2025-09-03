import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    // Support des chemins TypeScript définis dans tsconfig.json
    tsconfigPaths(),

    // Génération des fichiers de déclaration TypeScript
    dts({
      outDir: 'dist/types',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],

  // Configuration pour le build de production
  build: {
    target: 'node20',
    lib: {
      entry: {
        bot: resolve(__dirname, 'src/bot.ts'),
        index: resolve(__dirname, 'src/index.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false, // Désactivé pour faciliter le debugging en production
    rollupOptions: {
      external: [
        // Dépendances externes qui ne doivent pas être bundlées
        'discord.js',
        'better-sqlite3',
        'drizzle-orm',
        'fastify',
        'pino',
        'chalk',
        'dotenv',
        'zod',
        // Node.js built-ins
        'fs',
        'path',
        'url',
        'crypto',
        'events',
        'stream',
        'util',
        'buffer',
        'process',
        /^node:/,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },

  // Configuration pour le mode développement
  server: {
    hmr: false, // HMR désactivé pour les applications Node.js
  },

  // Résolution des modules
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '#': resolve(__dirname, 'src'),
    },
  },

  // Variables d'environnement
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  // Configuration des tests (si Vitest est utilisé avec Vite)
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/testSetup.ts'],
  },
});
