// Takes the three Token Radar screenshots with headless Chromium (Playwright).
//   node scripts/screenshot.mjs [out-dir]
// Writes 1-board, 2-detail and 3-filtered into screenshots/ (repo root) by default.
// Viewport 1440x900: long side 1440, short side 900, inside the gate's limits.
// JPEG quality 80 keeps each shot near 250-350 KB (cap 512 KiB each; the dossier caps at 1.5 MiB).
// Requires: npm install playwright-core in shots/ (or anywhere on NODE_PATH) and a Chromium
// build (npx playwright-core install chromium). Re-run main.ts after taking the shots so
// out/ and dossier.json pick them up.
import { chromium } from 'playwright-core';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, 'screenshots');
const page_url = `file://${join(root, 'out', 'dashboard', 'index.html')}`;

mkdirSync(outDir, { recursive: true });
// Prefer the Playwright-managed Chromium; fall back to a system Chrome if one exists
// (CHROME_PATH, or /usr/bin/google-chrome): the VM browser is not a real Chrome.
import { existsSync as fileExists } from 'node:fs';
const chromePath = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fileExists(p));
const launchOpts = { args: ['--no-sandbox', '--force-color-profile=srgb'] };
let browser;
try {
  browser = await chromium.launch(launchOpts);
} catch (e) {
  if (!chromePath) throw e;
  console.log('playwright chromium unavailable, falling back to', chromePath);
  browser = await chromium.launch({ ...launchOpts, executablePath: chromePath });
}
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console error:', m.text()); });

// 1. The board.
await page.goto(page_url, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#board .shell') !== null);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '1-board.jpg'), type: 'jpeg', quality: 80 });

// 2. A protocol's detail view: rank #1, Steakhouse Financial.
// A query string forces a full reload: a hash-only navigation would not re-run the page.
// The dialog is as tall as the viewport, and the netted farm plan (7 steps) runs past 900 px,
// so this shot uses a 1440x1200 viewport: long side 1440, short side 1200, inside the gate.
await page.setViewportSize({ width: 1440, height: 1200 });
await page.goto(`${page_url}?s=2#p=steakhouse-financial`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('dialog.detail[open]') !== null);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '2-detail.jpg'), type: 'jpeg', quality: 80 });

// 3. A filtered view: the Lending category.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${page_url}?s=3#category=Lending`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#board .shell') !== null);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '3-filtered.jpg'), type: 'jpeg', quality: 80 });

await browser.close();
for (const f of ['1-board.jpg', '2-detail.jpg', '3-filtered.jpg']) {
  const s = statSync(join(outDir, f));
  console.log(`${f}: ${s.size} bytes${s.size > 524288 ? ' OVER THE 512 KiB CAP' : ''}`);
}
console.log('screenshots written to', outDir);
