import { test, expect, type Page } from '@playwright/test';
import { makeForecastFixture } from '../../src/test/fixtures';

// Fixed clock: 2026-10-15 09:30 in Almaty (UTC+5). Fixture data is synthetic test data.
const NOW = new Date('2026-10-15T04:30:00Z');
const MIDNIGHT_ALMATY = Date.UTC(2026, 9, 14, 19) / 1000;
const LOCATION = { id: 'almaty', name: 'Almaty, Kazakhstan', latitude: 43.2389, longitude: 76.8897, source: 'search', accuracyM: null, altitudeM: 786, altitudeSource: 'geocoder', altitudeAccuracyM: null, timezone: 'Asia/Almaty', updatedAt: 1 };

async function setup(page: Page, opts: { location?: boolean; api?: 'ok' | 'fail' } = {}) {
  await page.clock.setFixedTime(NOW);
  if (opts.location !== false) {
    await page.addInitScript((loc) => {
      if (!localStorage.getItem('tengri.settings.v1')) localStorage.setItem('tengri.settings.v1', JSON.stringify({ location: loc, onboarded: true }));
    }, LOCATION);
  }
  await page.route('https://api.open-meteo.com/**', (route) =>
    opts.api === 'fail'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: true, reason: 'Service unavailable' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeForecastFixture({ startUnix: MIDNIGHT_ALMATY - 86400, hours: 96 })) }),
  );
}

async function noHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, 'page must not scroll horizontally').toBeLessThanOrEqual(iw + 1);
}

const ROUTES = ['', 'explorer', 'planner', 'circadian', 'journal', 'spectrum', 'archive', 'settings', 'more'];

test('every screen renders without horizontal overflow, with adaptive navigation', async ({ page }, info) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const r of ROUTES) {
    await page.goto(`/#/${r}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main h1, main .clock').first()).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-${r || 'command'}.png`, fullPage: r === '' });
  }
  const phone = (page.viewportSize()?.width ?? 0) < 768;
  await expect(page.locator(phone ? 'nav.tabbar' : 'nav.rail')).toBeVisible();
  await expect(page.locator(phone ? 'nav.rail' : 'nav.tabbar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('command center shows calculated sun data and labelled model data', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('.hero .clock')).toHaveText('09:30');
  await expect(page.getByText('Recommended now')).toBeVisible();
  await expect(page.getByText(/of daylight/)).toBeVisible();
  await expect(page.locator('.badge.modeled').first()).toBeVisible();
  await expect(page.locator('.badge.calculated').first()).toBeVisible();
  await expect(page.getByText('Sunrise', { exact: true }).first()).toBeVisible();
});

test('provider failure shows an explicit unavailable state, never invented values', async ({ page }) => {
  await setup(page, { api: 'fail' });
  await page.goto('/');
  await expect(page.getByText(/could not be loaded/)).toBeVisible();
  await expect(page.getByText(/Weather is unavailable/)).toBeVisible();
  await expect(page.getByText(/No UV value is available right now/)).toBeVisible();
  await expect(page.getByText(/of daylight/)).toBeVisible(); // calculated data still works
});

test('onboarding with manual coordinates leads to the dashboard', async ({ page }) => {
  await setup(page, { location: false });
  await page.goto('/');
  await expect(page.getByText('Where is your sky?')).toBeVisible();
  await page.getByRole('button', { name: 'Coordinates' }).click();
  await page.getByLabel('Latitude (°N +)').fill('51.1694');
  await page.getByLabel('Longitude (°E +)').fill('71.4491');
  await page.getByLabel('Name (optional)').fill('Astana');
  await page.getByRole('button', { name: 'Use these coordinates' }).click();
  await expect(page.locator('.hero .sub')).toContainText('Astana');
});

test('journal entry persists across reloads and feeds trends', async ({ page }) => {
  await setup(page);
  await page.goto('/#/journal');
  await page.getByRole('button', { name: 'Log this morning' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Went to bed').fill('23:00');
  await dialog.getByLabel('Fell asleep (est.)').fill('23:20');
  await dialog.getByLabel('Woke up', { exact: true }).fill('07:05');
  await expect(dialog.getByText(/Sleep ≈ 7 h 45 min/)).toBeVisible();
  await dialog.getByRole('group', { name: 'Sleep quality' }).getByRole('button', { name: '4' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Slept 7 h 45 min/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Slept 7 h 45 min/)).toBeVisible();
  await page.getByRole('button', { name: 'Trends' }).click();
  await expect(page.getByRole('img', { name: 'Sleep duration per night' })).toBeVisible();
});

test('solar clock can be scrubbed with the keyboard', async ({ page }) => {
  await setup(page);
  await page.goto('/#/explorer');
  const handle = page.getByRole('slider', { name: 'Inspect time of day' });
  const before = await handle.getAttribute('aria-valuenow');
  await handle.focus();
  await page.keyboard.press('PageUp');
  const after = await handle.getAttribute('aria-valuenow');
  expect(Number(after)).toBe((Number(before) + 60) % 1440);
});
