import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Deve coincidere con il nome del repository GitHub (GitHub Pages)
  base: '/Fantacalcio-serieb/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Il nuovo service worker si attiva subito e la pagina si ricarica:
      // nessuno resta con una versione vecchia dell'app
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Fantacalcio Serie B',
        short_name: 'Fanta B',
        description: 'Lega privata di fantacalcio sulla Serie B',
        lang: 'it',
        theme_color: '#16a34a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Solo i file dell'app: i dati di Supabase non vengono mai messi in cache
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
})
