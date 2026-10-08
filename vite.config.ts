/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Librerías grandes en archivos propios: cambian poco, así el navegador las
// reutiliza de su caché cuando se publica una nueva versión de la app.
const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'react-router', 'scheduler'],
  supabase: ['@supabase'],
  forms: ['zod', 'react-hook-form', '@hookform'],
  data: ['@tanstack', 'decimal.js'],
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
