import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

// Strict Content-Security-Policy for production builds only (the dev server
// injects inline scripts for hot reload). The only external hosts the app
// contacts are Open-Meteo's forecast/elevation and geocoding APIs.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'tengri-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// Relative base + hash routing lets the same build run from a domain root,
// a GitHub Pages sub-path (/SOLAR322/) or a local static server.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: './',
        name: 'TENGRI SOLAR',
        short_name: 'Tengri Solar',
        description:
          'Personal solar, circadian rhythm and environmental intelligence under the Eternal Blue Sky.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#070b1a',
        theme_color: '#0b1430',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + fonts are precached. Environmental API responses are NOT
        // cached by the service worker: the app keeps its own timestamped
        // last-known snapshot so staleness can always be shown honestly.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Splash screens are only used by iOS at launch; keep them out of the precache.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
