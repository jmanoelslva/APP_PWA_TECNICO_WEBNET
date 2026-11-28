import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // Versão do package.json (SemVer).
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registro manual (useRegisterSW em StatusBanners.tsx).
      injectRegister: false,
      workbox: {
        // Nunca cachear /api/*; /olt/ é outro app.
        navigateFallbackDenylist: [/^\/api\//, /^\/olt(\/|$)/],
        // Padrão (js/css/html) + a fonte Inter local, para abrir já com ela.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        // Push e toque no aviso em public/push-sw.js.
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'WEBNET',
        short_name: 'WEBNET',
        description: 'Ferramentas de campo para técnicos WEBNET: dados de cliente, endereço, conexão, ONU e OS.',
        lang: 'pt-BR',
        id: '/',
        start_url: '/',
        display: 'standalone',
        // Splash na cor da marca.
        background_color: '#236085',
        theme_color: '#236085',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // Acessível pelo IP local na mesma rede.
    host: true,
    proxy: {
      // Proxy do Vite para o backend local.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
