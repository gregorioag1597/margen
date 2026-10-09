/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Librerías grandes en archivos propios: cambian poco, así el navegador las
// reutiliza de su caché cuando se publica una nueva versión de la app.
const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'react-router', 'scheduler'],
  supabase: ['@supabase'],
  forms: ['zod', 'react-hook-form', '@hookform'],
  data: ['@tanstack', 'decimal.js'],
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // App instalable (Android, iPhone y computadora). Solo guarda en caché la
    // app en sí; los datos siempre vienen de Supabase (necesitan conexión).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Margen · costos, precios y ganancias',
        short_name: 'Margen',
        description: 'Cuánto te cuesta cada producto, a qué precio venderlo y cuánto ganás.',
        lang: 'es-AR',
        theme_color: '#0f5c4a',
        background_color: '#f6f8f7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          for (const [chunk, packages] of Object.entries(VENDOR_CHUNKS)) {
            if (packages.some((p) => id.includes(`node_modules/${p}/`) || id.includes(`node_modules\\${p}\\`))) return chunk;
          }
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
