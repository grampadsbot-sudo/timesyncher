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

export async function runVacationClientKeepsakeLayoutTests() {
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
    process.env.VACATION_CLIENT_KEEPSAKE_ARTIFACT_ROOT ||
    path.join(root, 'evidence', 'vacation-client-p2-6-keepsake');
  await mkdir(screenshotRoot, { recursive: true });

  const overflowFailures = [];
  const mapFailures = [];

  const journeyUrl = `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(
    NYC_PR225_SLUG,
  )}&journey=1&style=1&printMode=report&pdfReport=keepsake`;

  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      const height = width === 390 ? 844 : 800;
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(journeyUrl, { waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForSelector('[data-keepsake-journey="1"]', { timeout: 90000 });
      await page.waitForSelector('[data-ts-day-map="1"]', { timeout: 90000 });
      await page.waitForSelector('.leaflet-tile-loaded', { timeout: 90000 });
      await page.waitForSelector('.leaflet-marker-icon', { timeout: 90000 });

      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      });
      await new Promise((r) => setTimeout(r, 600));

      const measure = await page.evaluate(overflowProbe);
      if (measure.scrollWidth > measure.innerWidth) {
        overflowFailures.push({ width, ...measure });
      }

      const mapEvidence = await page.evaluate(() => ({
        tiles: document.querySelectorAll('.leaflet-tile-loaded').length,
        pins: document.querySelectorAll('.leaflet-marker-icon').length,
      }));
      if (mapEvidence.tiles < 1 || mapEvidence.pins < 1) {
        mapFailures.push({ width, ...mapEvidence });
      }

      await page.screenshot({
        path: path.join(screenshotRoot, `keepsake-${width}.png`),
        fullPage: true,
      });
    }
    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }

  assert.deepEqual(overflowFailures, []);
  assert.deepEqual(mapFailures, []);
  console.log('vacation-client keepsake layout checks passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runVacationClientKeepsakeLayoutTests();
}
