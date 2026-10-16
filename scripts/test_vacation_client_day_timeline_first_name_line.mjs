import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from './fixtures/nyc-pr225-shared-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const INK_MAX = Number(process.env.VACATION_CLIENT_TIMELINE_INK_MAX || '0.5');

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

async function measureTimelineFirstNameLineInk(page) {
  return page.evaluate((maxInk) => {
    const rows = [];
    for (const icon of document.querySelectorAll('[data-ts-timeline-icon="1"]')) {
      const head = icon.closest('.tsv-timeline-head');
      const title = head?.querySelector('[data-ts-timeline-title="1"]');
      if (!title) continue;
      const iconRect = icon.getBoundingClientRect();
      if (iconRect.height < 4) continue;
      const range = document.createRange();
      range.selectNodeContents(title);
      const lineRects = [...range.getClientRects()];
      const firstLine = lineRects[0];
      range.detach();
      if (!firstLine || firstLine.height < 4) continue;
      const titleMid = firstLine.top + firstLine.height / 2;
      const iconMid = iconRect.top + iconRect.height / 2;
      const deltaPx = Math.abs(iconMid - titleMid);
      const titleText = (title.textContent || '').replace(/\s+/g, ' ').trim();
      rows.push({
        title: titleText.slice(0, 64),
        lineCount: lineRects.length,
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

export async function runVacationClientDayTimelineFirstNameLineTests() {
  const { ensureBuiltClient, startPreviewServer } = await import(
    '../apps/vacation-client/test/shell-layout.mjs'
  );
  await ensureBuiltClient();
  const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
  const app = await startPreviewServer(tripPayload);
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const inkFailures = [];

  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      const height = width === 390 ? 844 : 800;
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(
        `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(NYC_PR225_SLUG)}`,
        { waitUntil: 'networkidle0', timeout: 120000 },
      );
      await page.waitForSelector('[data-ts-day-timeline="1"]', { timeout: 90000 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      });
      await new Promise((r) => setTimeout(r, 400));

      const ink = await measureTimelineFirstNameLineInk(page);
      if (!ink.pass) inkFailures.push({ width, viewport: 'top', ...ink });

      const wrapped = ink.rows.find((row) =>
        /JetBlue BOS → JFK/i.test(row.title),
      );
      assert.ok(wrapped, `expected long flight title row at ${width}px`);
      assert.ok(
        wrapped.deltaPx <= INK_MAX,
        `long wrapping name + times must align to first line @${width}px (delta=${wrapped.deltaPx})`,
      );
    }
    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }

  assert.deepEqual(inkFailures, []);
  console.log('vacation-client day timeline first-name-line alignment passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVacationClientDayTimelineFirstNameLineTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
