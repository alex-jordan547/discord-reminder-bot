import { defineConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    // Vue.js 3 support
    vue(),
    
    // Support des chemins TypeScript définis dans tsconfig.json
    tsconfigPaths(),
  ],

  // Configuration pour le build du dashboard
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },

  // Configuration pour le serveur de développement
  server: {
    port: 3001,
    hmr: true, // HMR activé pour Vue.js
    proxy: {
      // Proxy API calls to the Fastify server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },

  // Résolution des modules
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Variables d'environnement
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  // Configuration des tests pour Vue.js
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});