import { defineConfig } from '@playwright/test';

// Only Chromium is available in the build sandbox, so iPhone/iPad are emulated
// by viewport, pixel ratio, touch and user agent. Real Safari testing on
// devices is still recommended (see README).
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    timezoneId: 'Asia/Almaty',
    locale: 'en-GB',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
  projects: [
    { name: 'iphone-se', use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA } },
    { name: 'iphone-15', use: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS_UA } },
    { name: 'iphone-landscape', use: { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS_UA } },
    { name: 'ipad-portrait', use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA } },
    { name: 'ipad-landscape', use: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA } },
  ],
});
