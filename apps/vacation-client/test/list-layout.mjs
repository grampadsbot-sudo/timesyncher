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

const LIST_TABS = ['Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest'];
const INK_MAX = Number(process.env.VACATION_CLIENT_ROW_INK_MAX || '0.5');

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

async function measureRowLogoInk(page) {
  return page.evaluate((maxInk) => {
    const rows = [];
    for (const name of document.querySelectorAll('[data-ts-list-row-name="1"]')) {
      const host = name.closest('.tsv-row-main, .tsv-row-car-main, button');
      const chip = host?.querySelector('[data-ts-logo-chip="1"]');
      if (!chip || !name) continue;
      const chipRect = chip.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      if (chipRect.height < 4 || nameRect.height < 4) continue;
      const range = document.createRange();
      range.selectNodeContents(name);
      const firstLine = range.getClientRects()[0];
      range.detach();
      const nameMid = firstLine
        ? firstLine.top + firstLine.height / 2
        : nameRect.top + nameRect.height / 2;
      const chipMid = chipRect.top + chipRect.height / 2;
      const delta = Math.abs(chipMid - nameMid);
      rows.push({ title: (name.textContent || '').trim().slice(0, 48), deltaPx: delta, pass: delta <= maxInk });
    }
    return {
      rows,
      pass: rows.length > 0 && rows.every((row) => row.pass),
      maxDeltaPx: rows.reduce((m, row) => Math.max(m, row.deltaPx), 0),
    };
  }, INK_MAX);
}

export async function runVacationClientListLayoutTests() {
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
    process.env.VACATION_CLIENT_LIST_ARTIFACT_ROOT ||
    path.join(root, 'evidence', 'vacation-client-p2-2-lists');
  await mkdir(screenshotRoot, { recursive: true });

  const overflowFailures = [];
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
      await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });

      for (const label of LIST_TABS) {
        const clicked = await page.evaluate((want) => {
          for (const btn of document.querySelectorAll('button.tsv-tab')) {
            if (btn.getAttribute('aria-label') === want) {
              btn.click();
              return true;
            }
          }
          return false;
        }, label);
        assert.equal(clicked, true, `missing tab ${label} at ${width}px`);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.documentElement.scrollLeft = 0;
          document.body.scrollLeft = 0;
        });
        await new Promise((r) => setTimeout(r, 400));
        const measure = await page.evaluate(overflowProbe);
        if (measure.scrollWidth > measure.innerWidth) {
          overflowFailures.push({ width, label, ...measure });
        }
        const ink = await measureRowLogoInk(page);
        if (!ink.pass) {
          inkFailures.push({ width, label, ...ink });
        }
        const slug = label.toLowerCase().replace(/\s+/g, '-');
        await page.screenshot({
          path: path.join(screenshotRoot, `${slug}-${width}.png`),
          fullPage: false,
        });
      }
    }
    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }

  assert.deepEqual(overflowFailures, []);
  assert.deepEqual(inkFailures, []);
  console.log('vacation-client list layout checks passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVacationClientListLayoutTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
