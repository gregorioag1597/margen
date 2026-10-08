import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de punta a punta. Corren contra la demo pública (datos en memoria):
 * no crean cuentas ni tocan Supabase. Los flujos de registro/ingreso se
 * prueban contra un Supabase local (supabase start), ver e2e/auth.spec.ts.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'es-AR',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'computadora', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
