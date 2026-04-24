import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/fon9/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Fighting Wars',
        short_name: 'FightWars',
        description: 'A multiplayer real-time combat game',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,svg,ico,woff,woff2,ttf,mp3,wav,ogg,json}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: '/fon9/index.html',
        runtimeCaching: [
          {
            urlPattern: /.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fighting-wars-all',
              expiration: { maxEntries: 500 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
});
