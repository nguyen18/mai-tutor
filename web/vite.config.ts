import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // The whole app works offline (owner's request 2026-11-19): a service worker keeps the app on the device
    // (see "Offline app" in ARCHITECTURE.md). Registered by src/lib/pwa.ts, which applies an update only when
    // the app starts, so a new version never reloads a page someone is writing on.
    VitePWA({
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        name: 'Mai',
        short_name: 'Mai',
        description: 'Learn Vietnamese or Spanish from the words you actually use.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // White, like the icon's background (owner's request 2026-11-20; cream the day before): the launch screen.
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app itself: every page's code (the journal, the Cheatsheet and Mai's worker included), styles,
        // pictures and the fonts' Latin, Vietnamese, digit and emoji files. Not precached: the sticker
        // lifter's library (vision_bundle, saved on first use below), the fonts' Cyrillic, Greek and maths
        // files, and the Cheatsheet data (kept for the language being learned, below).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/vision_bundle-*.js', '**/*-cyrillic-*.woff2', '**/*-cyrillic-ext-*.woff2', '**/*-greek-*.woff2', '**/*-math-*.woff2', 'cheatsheet/**'],
        // Hash routes only, so every navigation is index.html.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // The first install takes over the open page (later versions wait: src/lib/pwa.ts).
        clientsClaim: true,
        runtimeCaching: [
          {
            // Each language's pre-built Cheatsheet (~1.4 MB): shown from the device, refreshed in the background.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/cheatsheet/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'mai-cheatsheets', expiration: { maxEntries: 12 } },
          },
          {
            // Tap-to-lift (lib/lift.ts), saved the first time it's used (owner's choice): its library chunk,
            // MediaPipe's WebAssembly from jsDelivr and the model from Google (~18 MB). Versioned URLs.
            urlPattern: ({ url }) =>
              /\/vision_bundle-[^/]+\.js$/.test(url.pathname) ||
              (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@mediapipe/')) ||
              (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/')),
            handler: 'CacheFirst',
            options: { cacheName: 'mai-sticker-lift', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20 } },
          },
          {
            // Font files outside the precache (Cyrillic, Greek, maths), if a page ever needs them.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: { cacheName: 'mai-fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  // Mai offline (src/lib/offline) runs the functions' shared code from ../supabase/functions/_shared.
  server: { fs: { allow: ['..'] } },
  worker: { format: 'es' },
})
