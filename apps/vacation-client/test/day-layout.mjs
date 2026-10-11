import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../../../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from '../../../scripts/fixtures/nyc-pr225-shared-trip.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const INK_MAX = Number(process.env.VACATION_CLIENT_TIMELINE_INK_MAX || '0.5');

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function overflowProbe() {
  const scrollEl = document.scrollingElement;
  return {
    scrollWidth: scrollEl?.scrollWidth ?? document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
}

async function measureTimelineInk(page) {
  return page.evaluate((maxInk) => {
    const rows = [];
    for (const icon of document.querySelectorAll('[data-ts-timeline-icon="1"]')) {
      const head = icon.closest('.tsv-timeline-head');
      const title = head?.querySelector('[data-ts-timeline-title="1"]');
      if (!title) continue;
      const iconRect = icon.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      if (iconRect.height < 4 || titleRect.height < 4) continue;
      const iconMid = iconRect.top + iconRect.height / 2;
      const titleMid = titleRect.top + titleRect.height / 2;
      const deltaPx = Math.abs(iconMid - titleMid);
      rows.push({
        title: (title.textContent || '').trim().slice(0, 48),
        deltaPx,
        pass: deltaPx <= maxInk,
      });
    }
    return {
      rows,
      pass: rows.length > 0 && rows.every((row) => row.pass),
      maxDeltaPx: rows.reduce((max, row) => Math.max(max, row.deltaPx), 0),
    };
  }, INK_MAX);
}

async function mapBelowTimeline(page) {
  return page.evaluate(() => {
    const timeline = document.querySelector('[data-ts-day-timeline="1"]');
    const map = document.querySelector('[data-ts-day-map="1"]');
    if (!timeline || !map) return { ok: false, reason: 'missing markers' };
    const t = timeline.getBoundingClientRect();
    const m = map.getBoundingClientRect();
    return { ok: m.top + 1 >= t.bottom, timelineBottom: t.bottom, mapTop: m.top };
  });
}

export async function runVacationClientDayLayoutTests() {
  const { ensureBuiltClient, startPreviewServer } = await import('./shell-layout.mjs');
  await ensureBuiltClient();
  const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
  const app = await startPreviewServer(tripPayload);
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const screenshotRoot =
    process.env.VACATION_CLIENT_DAY_ARTIFACT_ROOT ||
    path.join(root, 'evidence', 'vacation-client-p2-3-day');
  await mkdir(screenshotRoot, { recursive: true });

  const overflowFailures = [];
  const inkFailures = [];
  const orderFailures = [];

  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      const height = width === 390 ? 844 : 800;
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(
        `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(NYC_PR225_SLUG)}`,
        { waitUntil: 'networkidle0', timeout: 120000 },
      );
      await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });
      await page.waitForSelector('[data-ts-day-timeline="1"]', { timeout: 90000 });

      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      });
      await new Promise((r) => setTimeout(r, 500));

      const measure = await page.evaluate(overflowProbe);
      if (measure.scrollWidth > measure.innerWidth) {
        overflowFailures.push({ width, ...measure });
      }

      const ink = await measureTimelineInk(page);
      if (!ink.pass) inkFailures.push({ width, day: 'default', ...ink });

      const order = await mapBelowTimeline(page);
      if (!order.ok) orderFailures.push({ width, day: 'default', ...order });

      await page.screenshot({
        path: path.join(screenshotRoot, `day-by-day-${width}.png`),
        fullPage: false,
      });

      const clickedDay5 = await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button.tsv-day-chip')) {
          if (btn.getAttribute('aria-label') === 'Day 5') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      assert.equal(clickedDay5, true, `Day 5 chip missing at ${width}px`);
      await page.waitForFunction(
        () => /Drop-off:\s*Priceline opaque/i.test(document.body?.innerText || ''),
        { timeout: 60000 },
      );
      await new Promise((r) => setTimeout(r, 400));

      const inkDay5 = await measureTimelineInk(page);
      if (!inkDay5.pass) inkFailures.push({ width, day: 5, ...inkDay5 });
      const orderDay5 = await mapBelowTimeline(page);
      if (!orderDay5.ok) orderFailures.push({ width, day: 5, ...orderDay5 });

      await page.screenshot({
        path: path.join(screenshotRoot, `day-by-day-day5-${width}.png`),
        fullPage: false,
      });
    }
    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }

  assert.deepEqual(overflowFailures, []);
  assert.deepEqual(inkFailures, []);
  assert.deepEqual(orderFailures, []);
  console.log('vacation-client day layout checks passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runVacationClientDayLayoutTests();
}
