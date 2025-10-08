import { defineConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';
import { splitVendorChunkPlugin } from 'vite';

export default defineConfig(async ({ command, mode }) => {
  const plugins = [
    // Vue.js 3 support
    vue(),
    // Support des chemins TypeScript définis dans tsconfig.json
    tsconfigPaths(),
    // Split vendor chunks for better caching
    splitVendorChunkPlugin(),
  ];

  // Try to add PWA plugin if available
  try {
    const { VitePWA } = await import('vite-plugin-pwa');
    plugins.push(VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Discord Reminder Bot Dashboard',
        short_name: 'Reminders',
        description: 'A dashboard for managing the Discord Reminder Bot.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }));
    console.log('✅ PWA plugin loaded successfully');
  } catch (error) {
    console.warn('⚠️  vite-plugin-pwa not available, building without PWA support');
  }

  // Try to add compression plugins if available
  try {
    const compression = (await import('vite-plugin-compression')).default;
    // Gzip compression for production
    plugins.push(compression({
      algorithm: 'gzip',
      ext: '.gz',
    }));
    // Brotli compression for modern browsers
    plugins.push(compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }));
    console.log('✅ Compression plugins loaded successfully');
  } catch (error) {
    console.warn('⚠️  vite-plugin-compression not available, building without compression');
  }

  // Try to add bundle analyzer if available
  if (process.env.ANALYZE) {
    try {
      const { visualizer } = await import('rollup-plugin-visualizer');
      plugins.push(visualizer({
        filename: 'dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
      }));
      console.log('✅ Bundle analyzer loaded successfully');
    } catch (error) {
      console.warn('⚠️  rollup-plugin-visualizer not available, skipping bundle analysis');
    }
  }

  return {
    plugins,

  // Configuration pour le build du dashboard
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
    minify: 'esbuild',
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb
    reportCompressedSize: false, // Skip compressed size reporting for faster builds
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'chart-vendor': ['chart.js', 'vue-chartjs'],
        },
        // Dynamic import chunk naming
        chunkFileNames: chunkInfo => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()
            : 'chunk';
          return `js/[name]-[hash].js`;
        },
        assetFileNames: assetInfo => {
          const extType = assetInfo.name.split('.').at(1);
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            return `images/[name]-[hash][extname]`;
          }
          if (/css/i.test(extType)) {
            return `css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
  },

  // Configuration pour le serveur de développement
  server: {
    port: 3002,
    hmr: {
      overlay: true,
      clientPort: 3002,
    },
    proxy: {
      // Proxy API calls to the Fastify server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 30000,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },

  // Preview server configuration
  preview: {
    port: 3003,
    host: true,
  },

  // Performance optimizations
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'chart.js', 'vue-chartjs'],
    exclude: ['@vueuse/core'],
  },

  // ESBuild optimizations
  esbuild: {
    target: 'es2022',
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
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
  };
});
