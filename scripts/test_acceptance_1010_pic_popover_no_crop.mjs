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
  openThingDetailByName,
} from './acceptance_1005_touch_harness.mjs';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function popoverAuditScript(probeAttr) {
  return `(() => {
  const probe = ${JSON.stringify(probeAttr)};
  const vw = window.innerWidth;
  const margin = 4;
  const popup = document.querySelector('[' + probe + '] [data-ts-pic-popup="1"]');
  if (!popup) return { open: false };
  const rect = popup.getBoundingClientRect();
  const inView = rect.left >= margin && rect.top >= margin && rect.right <= vw - margin && rect.bottom <= window.innerHeight - margin;
  const buttons = ['[data-ts-pic-popup-close="1"]', '[data-ts-pic-fs-btn="1"]'].map((sel) => {
    const btn = popup.querySelector(sel);
    if (!btn) return { sel, found: false };
    const r = btn.getBoundingClientRect();
    return { sel, found: true, tappable: r.width >= 40 && r.height >= 40 && r.left >= margin && r.right <= vw - margin && r.top >= margin };
  });
  const img = popup.querySelector('img');
  let aspectOk = false;
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const box = img.getBoundingClientRect();
    const natural = img.naturalWidth / img.naturalHeight;
    const rendered = box.width / box.height;
    aspectOk = Math.abs(natural - rendered) / natural <= 0.02;
  }
  const sizeToggle = popup.querySelector('[data-ts-pic-size-toggle="1"]');
  return { open: true, inView, buttons, aspectOk, sizeToggleAbsent: !sizeToggle, vw };
})()`;
}

const tripPayload = cloneCopyTripPayload();
const preview = await startLocalPreview(tripPayload);
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.goto(`${preview.origin}/shared/${COPY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
    await clickTab(page, 'Day-by-Day');
    await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
    await clickDayChip(page, 1);
    await sleep(500);

    const thumb = await page.evaluate(() => {
      for (const row of document.querySelectorAll('[data-ts-day-timeline]')) {
        if (!/zabar/i.test(row.innerText || '')) continue;
        const wrap = row.querySelector('[data-ts-pic-thumb-wrap="1"]');
        if (!wrap) continue;
        wrap.setAttribute('data-ts-1010-itin-probe', '1');
        const link = wrap.querySelector('a');
        if (!link) continue;
        const r = link.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return { err: 'no-zabar-thumb' };
    });
    assert.ok(thumb && !thumb.err, `itinerary thumb missing: ${JSON.stringify(thumb)}`);

    await page.touchscreen.tap(thumb.x, thumb.y);
    await sleep(700);
    await page.waitForSelector('[data-ts-1010-itin-probe="1"] [data-ts-pic-popup="1"]', { timeout: 15000 });
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[data-ts-1010-itin-probe="1"] [data-ts-pic-popup="1"] img');
        return img && img.naturalWidth > 0;
      },
      { timeout: 15000 },
    );

    let audit = await page.evaluate(popoverAuditScript('data-ts-1010-itin-probe="1"'));
    assert.ok(audit.open, `itinerary popover at ${viewport.width}`);
    assert.ok(audit.sizeToggleAbsent, 'no size toggle on itinerary popover');
    assert.ok(audit.buttons.length === 2 && audit.buttons.every((b) => b.found && b.tappable), 'close+fs tappable');
    assert.ok(audit.aspectOk, `itinerary image uncropped at ${viewport.width}`);
    assert.ok(audit.inView, `itinerary popover in view at ${viewport.width}`);

    const fsTap = await page.evaluate(() => {
      const btn = document.querySelector('[data-ts-1010-itin-probe="1"] [data-ts-pic-fs-btn="1"]');
      const r = btn?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    });
    await page.touchscreen.tap(fsTap.x, fsTap.y);
    await sleep(500);
    assert.ok(await page.evaluate(() => Boolean(document.querySelector('[data-ts-pic-fs-overlay="1"]'))), 'fullscreen opens');
    await page.evaluate(() => document.querySelector('[data-ts-pic-fs-exit="1"]')?.click());
    await sleep(400);

    const scrollStart = await page.evaluate(() => {
      const r = document.querySelector('[data-ts-1010-itin-probe="1"] [data-ts-pic-popup="1"]')?.getBoundingClientRect();
      return { x: Math.min(window.innerWidth - 24, (r?.right ?? 0) + 40), y: Math.max(24, (r?.bottom ?? 0) + 80) };
    });
    await page.touchscreen.touchStart(scrollStart.x, scrollStart.y);
    await page.touchscreen.touchMove(scrollStart.x, scrollStart.y - 120);
    await page.touchscreen.touchEnd();
    await sleep(500);
    assert.ok(
      await page.evaluate(() => Boolean(document.querySelector('[data-ts-1010-itin-probe="1"] [data-ts-pic-popup="1"]'))),
      `outside scroll keeps itinerary popover at ${viewport.width}`,
    );

    await page.evaluate(() => document.querySelector('[data-ts-1010-itin-probe="1"] [data-ts-pic-popup-close="1"]')?.click());
    await sleep(300);

    await clickDayChip(page, 2);
    await sleep(500);
    await openThingDetailByName(page, /statue of liberty walking tour/i);
    await page.waitForSelector('[data-ts-detail-photos="1"]', { timeout: 60000 });

    const detailThumb = await page.evaluate(() => {
      const photos = document.querySelector('[data-ts-detail-photos="1"]');
      let wrap = null;
      for (const candidate of photos?.querySelectorAll('[data-ts-pic-thumb-wrap="1"]') || []) {
        if (!candidate.querySelector('video')) {
          wrap = candidate;
          break;
        }
      }
      wrap = wrap || photos?.querySelector('[data-ts-pic-thumb-wrap="1"]');
      if (!wrap) return { err: 'no-detail-thumb' };
      wrap.setAttribute('data-ts-1010-detail-probe', '1');
      wrap.scrollIntoView({ block: 'center' });
      const link = wrap.querySelector('a');
      const r = link?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { err: 'no-link' };
    });
    assert.ok(detailThumb && !detailThumb.err, `detail photo thumb: ${JSON.stringify(detailThumb)}`);
    await sleep(400);

    await page.touchscreen.tap(detailThumb.x, detailThumb.y);
    await sleep(700);
    await page.waitForSelector('[data-ts-1010-detail-probe="1"] [data-ts-pic-popup="1"]', { timeout: 15000 });
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[data-ts-1010-detail-probe="1"] [data-ts-pic-popup="1"] img');
        return img && img.naturalWidth > 0;
      },
      { timeout: 15000 },
    );

    audit = await page.evaluate(popoverAuditScript('data-ts-1010-detail-probe="1"'));
    assert.ok(audit.open, `detail popover at ${viewport.width}`);
    assert.ok(audit.sizeToggleAbsent, 'no size toggle on detail popover');
    assert.ok(audit.buttons.every((b) => b.found && b.tappable), 'detail controls tappable');
    assert.ok(audit.aspectOk, `detail image uncropped at ${viewport.width}`);
    assert.ok(audit.inView, `detail popover in view at ${viewport.width}`);

    const closeTap = await page.evaluate(() => {
      const btn = document.querySelector('[data-ts-1010-detail-probe="1"] [data-ts-pic-popup-close="1"]');
      const r = btn?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    });
    await page.touchscreen.tap(closeTap.x, closeTap.y);
    await sleep(400);
    assert.ok(
      await page.evaluate(() => !document.querySelector('[data-ts-1010-detail-probe="1"] [data-ts-pic-popup="1"]')),
      `close works on detail popover at ${viewport.width}`,
    );

    await page.close();
  }
} finally {
  await browser.close();
  await preview.close();
}

console.log('acceptance #1010 pic popover no crop OK');