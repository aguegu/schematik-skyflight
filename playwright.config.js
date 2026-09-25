import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5178',
    viewport: { width:1440, height:960 },
    launchOptions: { channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: { command:'npm run dev -- --port 5178 --strictPort', url:'http://127.0.0.1:5178', reuseExistingServer:!process.env.CI },
});
