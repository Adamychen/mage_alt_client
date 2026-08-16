import { defineConfig } from '@playwright/test'

const FAKE_MODE = process.env.E2E_BACKEND !== 'real'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // en modo fake (por defecto) el e2e no depende del stack: vite se levanta solo
  webServer: FAKE_MODE
    ? {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      }
    : undefined,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
})
