// Renders the app icon and iOS splash screens from SVG using Playwright's Chromium.
// Usage: node scripts/generate-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const svg = readFileSync(resolve(root, 'public/icons/icon.svg'), 'utf8');
// In the Claude Code sandbox Playwright finds Chromium via PLAYWRIGHT_BROWSERS_PATH.
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') && !process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const page = await browser.newPage();

async function render(html, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
  const jpeg = out.endsWith('.jpg');
  await page.screenshot({ path: resolve(root, out), type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 82 : undefined });
  console.log('wrote', out);
}

const icon = (size, pad = 0, bg = '#070d24') =>
  `<div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
     <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`;

await render(icon(180), 180, 180, 'public/icons/apple-touch-icon-180.png');
await render(icon(192), 192, 192, 'public/icons/icon-192.png');
await render(icon(512), 512, 512, 'public/icons/icon-512.png');
await render(icon(512, 64), 512, 512, 'public/icons/icon-maskable-512.png');

const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.32);
  return `<div style="width:${w}px;height:${h}px;background:radial-gradient(ellipse at 50% 30%, #16367a 0%, #070d24 60%, #04081a 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s * 0.18)}px;font-family:Georgia,'Times New Roman',serif">
    <div style="width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.22)}px;overflow:hidden;box-shadow:0 0 ${Math.round(s * 0.4)}px rgba(242,200,110,.25)">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    <div style="color:#f2c86e;letter-spacing:.3em;font-size:${Math.round(s * 0.16)}px;font-weight:700">TENGRI SOLAR</div>
    <div style="color:#9cc8ef;letter-spacing:.2em;font-size:${Math.round(s * 0.07)}px">ETERNAL BLUE SKY</div>
  </div>`;
};
for (const [w, h] of [[1290, 2796], [1179, 2556], [1170, 2532], [750, 1334], [1640, 2360], [1668, 2388], [2048, 2732]]) {
  await render(splash(w, h), w, h, `public/splash/splash-${w}x${h}.jpg`);
}
await browser.close();
