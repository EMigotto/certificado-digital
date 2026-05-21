import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  /* Serve both the prototype (port 3199) and built SPA (port 3200) */
  webServer: [
    {
      command: 'npx serve docs/features/c3/prototypes -l 3199 --no-clipboard',
      port: 3199,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build:frontend && npx serve dist/public -l 3200 --no-clipboard',
      port: 3200,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
