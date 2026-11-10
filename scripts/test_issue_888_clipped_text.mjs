#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISSUE_888_SERVED_LAYOUT_CSS,
  SHARED_LIVE_CONFLICT_LAYOUT_CSS,
  SHARED_LIVE_FLIGHT_LOGO_NAME_CSS,
} from '../src/vacation/shared-trip-oe-list-row-patch.mjs';
import { ellipsisClippedTextHelperSource } from './shepherd-staging-smoke-layout-overflow.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const patchSource = readFileSync(path.join(root, 'src/vacation/trek-live-product-patches.mjs'), 'utf8');
const rowPatchSource = readFileSync(path.join(root, 'src/vacation/shared-trip-oe-list-row-patch.mjs'), 'utf8');
const appHtml = readFileSync(path.join(root, 'vacation-app.html'), 'utf8');
const css = readFileSync(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const clientCss = readFileSync(path.join(root, 'apps/vacation-client/src/styles.css'), 'utf8');
const layoutEval = readFileSync(path.join(root, 'scripts/shepherd-staging-smoke-layout-eval.mjs'), 'utf8');

assert.match(rowPatchSource, /data-ts-flight-time":"1"/);
assert.doesNotMatch(
  rowPatchSource,
  /data-ts-flight-time":"1"[\s\S]{0,120}textOverflow:"ellipsis"/,
  'flight depart/arrive chips must not ellipsis-clip',
);
assert.match(
  patchSource,
  /const CONFLICT_LABEL_PATCH = 'ua\.isConflict[\s\S]*flexWrap:"wrap"[\s\S]*overflow:"visible"/,
);

assert.match(rowPatchSource, /data-ts-flight-row-grid":"1"/);
assert.match(rowPatchSource, /data-ts-flight-qo-rest":"1"/);
assert.match(rowPatchSource, /minWidth:"max-content"/);
assert.match(
  rowPatchSource,
  /ISSUE_888_SERVED_LAYOUT_CSS[\s\S]*@media \(max-width:480px\)\{[\s\S]*\[data-ts-flight-row-grid="1"\]:not\(\[data-ts-flight-qo-rest="1"\]\)\{display:grid/,
  'served #888 mobile flight row uses grid at 390',
);
assert.match(
  clientCss,
  /\.tsv-row-flight-main \[data-ts-flight-arrive="1"\]/,
  'vacation-client flight arrive chip must have explicit @390 grid placement',
);

assert.match(appHtml, /function tripDates\(trip\)/);
assert.match(appHtml, /\$\{start\.mon\} \$\{start\.d\}–\$\{end\.d\}, \$\{start\.y\}/);
assert.match(appHtml, /trip-trigger-text/);
assert.doesNotMatch(appHtml, /\.trip-button span \{[\s\S]*text-overflow: ellipsis/);
assert.match(appHtml, /\.trip-option b,\s*\n\s*\.trip-option small \{[\s\S]*white-space: normal/);

assert.match(css, /\[data-ts-flight-time="1"\]/);
assert.match(css, /\[data-ts-conflict-label="1"\]/);
assert.ok(css.includes(SHARED_LIVE_FLIGHT_LOGO_NAME_CSS), 'served flight logo+name CSS must match patch SoT');
assert.ok(css.includes(SHARED_LIVE_CONFLICT_LAYOUT_CSS), 'served conflict label CSS must match patch SoT');
assert.ok(css.includes(ISSUE_888_SERVED_LAYOUT_CSS), 'served #888 layout CSS block must match patch SoT');
assert.match(
  rowPatchSource,
  /Zn=bn\(G\)\?n\.jsx\("strong",\{style:\{lineHeight:1,display:"block",fontWeight:800/,
  'flight list row name must stay airline-only strong for Gate B name line',
);
assert.doesNotMatch(rowPatchSource, /OE_ROW_ZN_STRONG_PATCH = 'Zn=bn\(G\)\?n\.jsx\(Qo/);

assert.match(clientCss, /\.tsv-timeline-conflict \{[\s\S]*?white-space: normal[\s\S]*?overflow-wrap: anywhere/);

assert.match(ellipsisClippedTextHelperSource(), /tsSampleEllipsisClippedOwnText/);
assert.match(layoutEval, /ellipsis_text_clipped/);

assert.match(
  readFileSync(path.join(root, 'scripts/shepherd-staging-smoke-layout-nyc.mjs'), 'utf8'),
  /ellipsisClippedCount/,
);
assert.match(
  readFileSync(path.join(root, 'scripts/shepherd-staging-smoke-layout-nyc.mjs'), 'utf8'),
  /ellipsis_text_clipped count=/,
);

async function assertFlightTimesInsideCardsAt390() {
  const { ensureBuiltClient, startPreviewServer } = await import('../apps/vacation-client/test/shell-layout.mjs');
  const { finalizeServedSharedTripPayload } = await import('../src/vacation/shared-trip-served-page.mjs');
  const { applyCapturedLogos } = await import('../src/vacation/thing-logo-capture.mjs');
  const { buildNycPr225SharedTrip, NYC_PR225_SLUG } = await import('./fixtures/nyc-pr225-shared-trip.mjs');
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(root, 'package.json'));
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    puppeteer = require('/tmp/pptr/node_modules/puppeteer-core');
  }

  await ensureBuiltClient();
  const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
  const app = await startPreviewServer(tripPayload);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(
      `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(NYC_PR225_SLUG)}`,
      { waitUntil: 'networkidle0', timeout: 120000 },
    );
    await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button.tsv-tab')) {
        if (btn.getAttribute('aria-label') === 'Flights') {
          btn.click();
          break;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    const violations = await page.evaluate(() => {
      const out = [];
      for (const card of document.querySelectorAll('button.tsv-row-flight-main')) {
        const cardRect = card.getBoundingClientRect();
        for (const chip of card.querySelectorAll('[data-ts-flight-depart="1"], [data-ts-flight-arrive="1"], [data-ts-flight-time="1"]')) {
          const chipRect = chip.getBoundingClientRect();
          const text = (chip.textContent || '').trim();
          if (!text) continue;
          if (chipRect.right > cardRect.right + 0.5 || chipRect.left < cardRect.left - 0.5) {
            out.push({
              text: text.slice(0, 32),
              chipRight: chipRect.right,
              cardRight: cardRect.right,
            });
          }
        }
      }
      return out;
    });
    assert.deepEqual(
      violations,
      [],
      `flight time chips must sit inside card bounds at 390px (${JSON.stringify(violations)})`,
    );
    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }
}

await assertFlightTimesInsideCardsAt390();

console.log('issue #888 clipped-text + switcher date format harness passed');
