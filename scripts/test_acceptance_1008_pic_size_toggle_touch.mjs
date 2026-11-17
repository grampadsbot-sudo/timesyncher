#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  COPY_SLUG,
  cloneCopyTripPayload,
  startLocalPreview,
  sleep,
  clickTab,
  clickDayChip,
} from './acceptance_1005_touch_harness.mjs';

const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

const tripPayload = cloneCopyTripPayload();
const preview = await startLocalPreview(tripPayload);
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const popupProbeAudit = `(() => {
  const vw = window.innerWidth;
  const margin = 4;
  const popup = document.querySelector('[data-ts-1008-probe="1"] [data-ts-pic-popup="1"]');
  if (!popup) return { open: false };
  const rect = popup.getBoundingClientRect();
  const inView = rect.left >= margin && rect.top >= margin && rect.right <= vw - margin && rect.bottom <= window.innerHeight - margin;
  const buttons = ['[data-ts-pic-popup-close="1"]', '[data-ts-pic-fs-btn="1"]'].map((sel) => {
    const btn = popup.querySelector(sel);
    if (!btn) return { sel, found: false };
    const r = btn.getBoundingClientRect();
    return { sel, found: true, tappable: r.width >= 40 && r.height >= 40 && r.left >= margin && r.right <= vw - margin && r.top >= margin };
  });
  const sizeToggle = popup.querySelector('[data-ts-pic-size-toggle="1"]');
  return { open: true, inView, rect: { width: rect.width }, buttons, sizeToggleAbsent: !sizeToggle, vw };
})()`;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.goto(`${preview.origin}/shared/${COPY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
  await clickTab(page, 'Day-by-Day');
  await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
  await clickDayChip(page, 1);
  await sleep(500);
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('[data-ts-day-timeline] [data-ts-pic-thumb-wrap="1"] a') ||
          document.querySelector('[data-ts-pic-thumb-wrap="1"] a'),
      ),
    { timeout: 120000 },
  );
  await sleep(400);

  const thumb = await page.evaluate(() => {
    for (const row of document.querySelectorAll('[data-ts-day-timeline]')) {
      if (!/zabar/i.test(row.innerText || '')) continue;
      const wrap = row.querySelector('[data-ts-pic-thumb-wrap="1"]');
      if (!wrap) continue;
      wrap.setAttribute('data-ts-1008-probe', '1');
      const link = wrap.querySelector('a');
      if (!link) continue;
      const r = link.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { err: 'no-zabar-thumb' };
  });
  assert.ok(thumb && !thumb.err, `Zabar photo thumb missing: ${JSON.stringify(thumb)}`);

  await page.touchscreen.tap(thumb.x, thumb.y);
  await sleep(700);
  await page.waitForSelector('[data-ts-1008-probe="1"] [data-ts-pic-popup="1"]', { timeout: 15000 });

  let audit = await page.evaluate(popupProbeAudit);
  assert.ok(audit.open, 'photo popover should open at 390px');
  assert.ok(audit.sizeToggleAbsent, 'size toggle must be absent (#1010)');
  assert.ok(audit.buttons.length === 2 && audit.buttons.every((b) => b.found), 'exactly close and fullscreen controls');
  assert.ok(audit.inView, `popover in viewport: ${JSON.stringify(audit)}`);
  assert.ok(audit.buttons.every((b) => b.tappable), 'controls tappable');

  const fsTap = await page.evaluate(() => {
    const btn = document.querySelector('[data-ts-1008-probe="1"] [data-ts-pic-fs-btn="1"]');
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  assert.ok(fsTap, 'fullscreen toggle coords');
  await page.touchscreen.tap(fsTap.x, fsTap.y);
  await sleep(500);
  assert.ok(
    await page.evaluate(() => Boolean(document.querySelector('[data-ts-pic-fs-overlay="1"]'))),
    'fullscreen overlay opens',
  );
  await page.evaluate(() => document.querySelector('[data-ts-pic-fs-exit="1"]')?.click());
  await sleep(400);

  const scrollStart = await page.evaluate(() => {
    const r = document.querySelector('[data-ts-1008-probe="1"] [data-ts-pic-popup="1"]')?.getBoundingClientRect();
    return { x: Math.min(window.innerWidth - 24, (r?.right ?? 0) + 40), y: Math.max(24, (r?.bottom ?? 0) + 80) };
  });
  await page.touchscreen.touchStart(scrollStart.x, scrollStart.y);
  await page.touchscreen.touchMove(scrollStart.x, scrollStart.y - 120);
  await page.touchscreen.touchEnd();
  await sleep(500);
  assert.ok(
    await page.evaluate(() => Boolean(document.querySelector('[data-ts-1008-probe="1"] [data-ts-pic-popup="1"]'))),
    'outside touch-scroll must not dismiss popover',
  );

  await page.close();
} finally {
  await browser.close();
  await preview.close();
}

console.log('acceptance #1008 pic size toggle touch OK');