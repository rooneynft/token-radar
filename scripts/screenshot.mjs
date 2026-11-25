// Takes the three Token Radar screenshots with headless Chromium (Playwright).
//   node scripts/screenshot.mjs [out-dir]
// Writes 1-board, 2-detail and 3-filtered into screenshots/ (repo root) by default.
// Viewport 1440x1200 (detail shot 1440x1440): long side 1440, short side at least 800,
// inside the gate's limits. The KPI strip is two rows of three plus the integrity strip
// and the accounting bar, so 900 px tall would cut the board table off at its header.
// JPEG quality 80 keeps each shot near 250-350 KB (cap 512 KiB each; the dossier caps at 1.5 MiB).
// Requires: playwright-core on NODE_PATH (shots/node_modules) and a Chromium build
// (Playwright-managed, or CHROME_PATH / a system Chrome). Re-run main.ts after taking the
// shots so out/ and dossier.json pick them up.
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync as fileExists } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, 'screenshots');
const page_url = `file://${join(root, 'out', 'dashboard', 'index.html')}`;

mkdirSync(outDir, { recursive: true });
// Prefer the Playwright-managed Chromium; fall back to a system Chrome if one exists
// (CHROME_PATH, or /usr/bin/google-chrome): the VM browser is not a real Chrome.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console error:', m.text()); });

// 1. The board, with the validation strip on top.
await page.goto(page_url, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#board .shell') !== null);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '1-board.jpg'), type: 'jpeg', quality: 80 });

// 2. A protocol's detail view: rank #1, Sentora Curator.
// A query string forces a full reload: a hash-only navigation would not re-run the page.
// The dialog is as tall as the viewport, and the netted farm plan (7 steps) runs past 900 px,
// so this shot uses a 1440x1440 viewport: long side 1440, short side 1440, inside the gate.
await page.setViewportSize({ width: 1440, height: 1440 });
await page.goto(`${page_url}?s=2#p=sentora-curator`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('dialog.detail[open]') !== null);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '2-detail.jpg'), type: 'jpeg', quality: 80 });

// 3. A filtered view: the Lending category. Same 1440x1200 viewport as shot 1,
// so the filtered rows show below the KPI strip and the accounting bar.
await page.setViewportSize({ width: 1440, height: 1200 });
await page.goto(`${page_url}?s=3#category=Lending`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#board .shell') !== null);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '3-filtered.jpg'), type: 'jpeg', quality: 80 });

await browser.close();
