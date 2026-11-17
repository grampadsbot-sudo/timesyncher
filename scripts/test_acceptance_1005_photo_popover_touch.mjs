#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  COPY_BIND_VIDEO_ID,
  COPY_SLUG,
  cloneCopyTripPayload,
  startLocalPreview,
  sleep,
  clickDayChip,
  clickTab,
  openThingDetailByName,
  popupAuditScript,
  detailHeaderAuditScript,
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
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => /day-by-day/i.test(b.getAttribute('aria-label') || b.textContent || '')),
      { timeout: 180000 },
    );
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
    await sleep(1200);

    const thumb = await page.evaluate(() => {
      for (const row of document.querySelectorAll('[data-ts-day-timeline]')) {
        if (!/zabar/i.test(row.innerText || '')) continue;
        const wrap = row.querySelector('[data-ts-pic-thumb-wrap="1"]');
        if (!wrap) continue;
        wrap.setAttribute('data-ts-1005-probe', '1');
        const link = wrap.querySelector('a');
        if (!link) continue;
        const r = link.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return { err: 'no-zabar-thumb' };
    });
    assert.ok(thumb && !thumb.err, `Day-by-Day Zabar photo thumb missing on copy trip: ${JSON.stringify(thumb)}`);

    await page.touchscreen.tap(thumb.x, thumb.y);
    await sleep(700);
    await page.waitForSelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]', { timeout: 15000 });

    let audit = await page.evaluate(popupAuditScript);
    assert.ok(audit.open, `popover should open at ${viewport.width}`);

    const sizeBtn = await page.evaluate(() => {
      const btn = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-size-toggle="1"]');
      const r = btn?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    });
    assert.ok(sizeBtn, 'size toggle missing');
    await page.touchscreen.tap(sizeBtn.x, sizeBtn.y);
    await sleep(400);

    audit = await page.evaluate(popupAuditScript);
    assert.ok(audit.inView, `expanded popover in viewport at ${viewport.width}: ${JSON.stringify(audit)}`);
    assert.ok(audit.buttons.every((b) => b.found && b.tappable), `buttons tappable after expand at ${viewport.width}`);

    await page.touchscreen.tap(sizeBtn.x, sizeBtn.y);
    await sleep(300);
    const afterShrink = await page.evaluate(() => document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]')?.getBoundingClientRect().width || 0);
    assert.ok(afterShrink < audit.rect.width - 20, 'second expand tap returns toward base width');

    const scrollStart = await page.evaluate(() => {
      const r = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]')?.getBoundingClientRect();
      return { x: Math.min(window.innerWidth - 24, (r?.right ?? 0) + 40), y: Math.max(24, (r?.bottom ?? 0) + 80) };
    });
    await page.touchscreen.touchStart(scrollStart.x, scrollStart.y);
    await page.touchscreen.touchMove(scrollStart.x, scrollStart.y - 120);
    await page.touchscreen.touchEnd();
    await sleep(500);
    assert.ok(
      await page.evaluate(() => Boolean(document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]'))),
      `outside touch-scroll must not dismiss popover at ${viewport.width}`,
    );

    const outsideTap = await page.evaluate(() => {
      const r = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]')?.getBoundingClientRect();
      return { x: 16, y: Math.min(window.innerHeight - 24, (r?.bottom ?? 200) + 48) };
    });
    await page.touchscreen.tap(outsideTap.x, outsideTap.y);
    await sleep(400);
    assert.ok(
      await page.evaluate(() => !document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]')),
      `deliberate outside tap may close popover at ${viewport.width}`,
    );

    await clickDayChip(page, 2);
    await sleep(500);
    await openThingDetailByName(page, /statue of liberty/i);
    const headerAudit = await page.evaluate(detailHeaderAuditScript);
    assert.ok(headerAudit.ok, `Thing detail header must not host media at ${viewport.width}: ${JSON.stringify(headerAudit)}`);

    await page.close();
  }

  const videoPage = await browser.newPage();
  await videoPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await videoPage.goto(`${preview.origin}/shared/${COPY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
  await clickTab(videoPage, 'Day-by-Day');
  await videoPage.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
  await clickDayChip(videoPage, 2);
  await videoPage.waitForFunction(
    () => [...document.querySelectorAll('[data-ts-timeline-title]')].some((el) => /statue of liberty/i.test(el.textContent || '')),
    { timeout: 120000 },
  );
  await sleep(700);

  const videoThumb = await videoPage.evaluate(() => {
    const tl = document.querySelector('[data-ts-day-timeline]');
    if (!tl) return { err: 'no-timeline' };
    for (const btn of tl.querySelectorAll('[data-ts-timeline-title]')) {
      if (!/statue|liberty/i.test(btn.textContent || '')) continue;
      let row = btn.parentElement;
      for (let p = btn.parentElement; p && p !== tl; p = p.parentElement) {
        if (p.querySelectorAll('[data-ts-timeline-title]').length === 1 && p.querySelector('[data-ts-timeline-icon], [data-ts-tab-emoji]')) {
          row = p;
          break;
        }
      }
      const videoWrap = row?.querySelector('[data-row-video-qr="1"]')?.closest('[data-ts-pic-thumb-wrap="1"]');
      if (!videoWrap) return { err: 'no-video-wrap-on-row' };
      videoWrap.setAttribute('data-ts-1005-video-probe', '1');
      const link = videoWrap.querySelector('a');
      const r = link.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { err: 'no-video-thumb' };
  });
  assert.ok(videoThumb && !videoThumb.err, `Day-by-Day video tile missing: ${JSON.stringify(videoThumb)}`);
  await videoPage.touchscreen.tap(videoThumb.x, videoThumb.y);
  await sleep(700);
  const videoAudit = await videoPage.evaluate(() => {
    const popup = document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"]');
    const vid = popup?.querySelector('video');
    const rect = popup?.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 4;
    return {
      open: Boolean(popup && vid),
      inView: Boolean(rect && rect.left >= margin && rect.right <= vw - margin),
      hasControls: Boolean(vid?.hasAttribute('controls')),
    };
  });
  assert.ok(videoAudit.open && videoAudit.inView, `video popover in viewport: ${JSON.stringify(videoAudit)}`);
  assert.ok(videoAudit.hasControls, 'inline video must expose controls');

  const videoScrollStart = await videoPage.evaluate(() => {
    const r = document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"]')?.getBoundingClientRect();
    return { x: Math.min(window.innerWidth - 24, (r?.right ?? 0) + 48), y: Math.max(24, (r?.bottom ?? 0) + 72) };
  });
  await videoPage.touchscreen.touchStart(videoScrollStart.x, videoScrollStart.y);
  await videoPage.touchscreen.touchMove(videoScrollStart.x, videoScrollStart.y - 100);
  await videoPage.touchscreen.touchEnd();
  await sleep(400);
  assert.ok(
    await videoPage.evaluate(() => Boolean(document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"]'))),
    'outside touch-scroll must not dismiss video popover at 390px',
  );

  const videoReady = await videoPage.evaluate(async () => {
    const vid = document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"] video');
    if (!vid) return { ok: false };
    await new Promise((resolve) => {
      if (vid.readyState >= 1) resolve();
      else vid.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
    return { ok: vid.readyState >= 1, src: vid.currentSrc || vid.getAttribute('src') || '' };
  });
  assert.ok(videoReady.ok, `itinerary inline video metadata loaded: ${JSON.stringify(videoReady)}`);
  await videoPage.close();

  const rangeRes = await fetch(
    `${preview.origin}/api/bind-thing-media?shareToken=${encodeURIComponent(COPY_SLUG)}&id=${COPY_BIND_VIDEO_ID}&raw=1`,
    { headers: { Range: 'bytes=0-1' } },
  );
  assert.equal(rangeRes.status, 206, 'Range bytes=0-1 must return 206 on copy-trip media route');
  assert.match(String(rangeRes.headers.get('content-type') || ''), /video\/mp4/i);
  assert.equal(Buffer.from(await rangeRes.arrayBuffer()).length, 2);
} finally {
  await browser.close();
  await preview.close();
}

console.log('acceptance #1005 photo popover touch OK');