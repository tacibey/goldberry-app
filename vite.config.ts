import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Goldberry: Netlify-hosted Vite PWA. Whop is our money rail (API + Elements),
// not our host — so no @whop/cli/vite plugin here on purpose.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Goldberry — snack-size gold savings',
        short_name: 'Goldberry',
        description: 'Goal-based micro-gold vaults. Stack gold by the gram.',
        theme_color: '#0c0a09',
        background_color: '#0c0a09',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // local dev talks to Netlify functions seamlessly
      '/.netlify/functions': 'http://localhost:8888',
    },
  },
})
