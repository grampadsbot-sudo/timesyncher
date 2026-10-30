import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../../../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from '../../../scripts/fixtures/nyc-pr225-shared-trip.mjs';
import {
  buildEnrichedDetailSharedTrip,
  ENRICHED_DETAIL_SCENARIOS,
  ENRICHED_DETAIL_SLUG,
} from './fixtures/enriched-detail-shared-trip.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));

const INK_MAX = Number(process.env.VACATION_CLIENT_DETAIL_INK_MAX || '0.5');

const NYC_SCENARIOS = [
  { tab: 'Restaurants', namePattern: /sample nyc restaurant/i, slug: 'restaurant' },
  { tab: 'Hotels', namePattern: /the manhattan club/i, slug: 'hotel' },
  { tab: 'Flights', namePattern: /jetblue/i, slug: 'flight' },
];

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

async function measureDetailLogoInk(page) {
  return page.evaluate((maxInk) => {
    const chip = document.querySelector('[data-ts-detail-logo-chip="1"]');
    const name = document.querySelector('[data-ts-detail-name="1"]');
    if (!chip || !name) return { pass: true, skipped: true, reason: 'no logo chip' };
    const chipRect = chip.getBoundingClientRect();
    const nameRect = name.getBoundingClientRect();
    const chipMid = chipRect.top + chipRect.height / 2;
    const nameMid = nameRect.top + nameRect.height / 2;
    const deltaPx = Math.abs(chipMid - nameMid);
    return { deltaPx, pass: deltaPx <= maxInk };
  }, INK_MAX);
}

async function openDetailFromTab(page, tabLabel, namePattern) {
  const clickedTab = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button.tsv-tab')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.click();
        return true;
      }
    }
    return false;
  }, tabLabel);
  assert.equal(clickedTab, true, `missing tab ${tabLabel}`);
  await new Promise((r) => setTimeout(r, 400));
  const opened = await page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, 'i');
    for (const btn of document.querySelectorAll('button.tsv-row-main, button.tsv-row-car-main, button.tsv-row-flight-main')) {
      const nameEl = btn.querySelector('[data-ts-list-row-name="1"]');
      const label = (nameEl?.textContent || btn.textContent || '').trim();
      if (pattern.test(label)) {
        btn.click();
        return label;
      }
    }
    return null;
  }, namePattern.source);
  assert.ok(opened, `no list row for ${namePattern} on ${tabLabel}`);
  await page.waitForSelector('[data-ts-detail-panel="1"]', { timeout: 15000 });
  return opened;
}

async function closeDetail(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-ts-detail-panel="1"]'), { timeout: 5000 });
}

async function probeEnrichedDetail(page, slug) {
  return page.evaluate((kind) => {
    const fields = [...document.querySelectorAll('[data-ts-detail-field]')].map((node) =>
      node.getAttribute('data-ts-detail-field'),
    );
    const reviewCount = document.querySelectorAll('[data-ts-detail-review="1"]').length;
    const totals = document.querySelector('[data-ts-detail-review-totals="1"]')?.textContent?.trim() || '';
    const summaryLen = (document.querySelector('[data-ts-detail-field="summary"]')?.textContent || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const composite = document.querySelector('[data-ts-detail-review-composite="1"]')?.textContent?.trim() || '';
    const needsReviews = !['flight', 'car'].includes(kind);
    const okCoords = fields.includes('coordinates');
    const okSummary = summaryLen >= 30;
    const okReviews = !needsReviews || reviewCount >= 4;
    const okTotals = !needsReviews || /Based on \d+ reviews, avg/i.test(totals);
    const okSources = !needsReviews || document.querySelectorAll('.tsv-detail-sources li').length >= 2;
    const okHappyHour = kind !== 'bar' || fields.includes('happyHour');
    const okItinerary = fields.includes('itineraryNote');
    return {
      fields,
      reviewCount,
      okCoords,
      okSummary,
      okReviews,
      okTotals,
      okSources,
      okHappyHour,
      okItinerary,
      okComposite: kind !== 'bar' || /Composite of/i.test(composite),
      pass:
        okCoords &&
        okSummary &&
        okReviews &&
        okTotals &&
        okSources &&
        okHappyHour &&
        okItinerary &&
        (kind !== 'bar' || /Composite of/i.test(composite)),
    };
  }, slug);
}

async function runNycLayoutChecks(page, app, screenshotRoot) {
  const overflowFailures = [];
  const inkFailures = [];
  for (const width of [390, 1280]) {
    const height = width === 390 ? 844 : 800;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(
      `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(NYC_PR225_SLUG)}`,
      { waitUntil: 'networkidle0', timeout: 120000 },
    );
    await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });

    for (const scenario of NYC_SCENARIOS) {
      await openDetailFromTab(page, scenario.tab, scenario.namePattern);
      const measure = await page.evaluate(overflowProbe);
      if (measure.scrollWidth > measure.innerWidth) {
        overflowFailures.push({ width, ...scenario, ...measure });
      }
      const ink = await measureDetailLogoInk(page);
      if (!ink.pass && !ink.skipped) {
        inkFailures.push({ width, ...scenario, ...ink });
      }
      if (width === 390) {
        const scrollable = await page.evaluate(() => {
          const body = document.querySelector('.tsv-detail-body');
          if (!body) return { ok: false };
          const style = getComputedStyle(body);
          return {
            ok: style.overflowY === 'auto' || style.overflowY === 'scroll',
            overflowY: style.overflowY,
          };
        });
        assert.equal(scrollable.ok, true, `detail body must scroll on mobile (${scrollable.overflowY})`);
      }
      await page.screenshot({
        path: path.join(screenshotRoot, `detail-${scenario.slug}-${width}.png`),
        fullPage: false,
      });
      await closeDetail(page);
    }

    if (width === 390) {
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button.tsv-tab')) {
          if (btn.getAttribute('aria-label') === 'Day-by-Day') btn.click();
        }
      });
      await new Promise((r) => setTimeout(r, 400));
      const openedTimeline = await page.evaluate(() => {
        const link = document.querySelector('button.tsv-timeline-link[data-ts-timeline-title="1"]');
        if (!link) return false;
        link.click();
        return true;
      });
      assert.equal(openedTimeline, true, 'timeline detail open');
      await page.waitForSelector('[data-ts-detail-panel="1"]', { timeout: 15000 });
      await closeDetail(page);
    }
  }
  return { overflowFailures, inkFailures };
}

async function runEnrichedAcceptanceChecks(page, app, screenshotRoot) {
  const acceptanceFailures = [];
  for (const width of [390, 1280]) {
    const height = width === 390 ? 844 : 800;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(
      `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(ENRICHED_DETAIL_SLUG)}`,
      { waitUntil: 'networkidle0', timeout: 120000 },
    );
    await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });

    for (const scenario of ENRICHED_DETAIL_SCENARIOS) {
      await openDetailFromTab(page, scenario.tab, scenario.namePattern);
      const measure = await page.evaluate(overflowProbe);
      if (measure.scrollWidth > measure.innerWidth) {
        acceptanceFailures.push({ width, ...scenario, rule: 'overflow', ...measure });
      }
      const probe = await probeEnrichedDetail(page, scenario.slug);
      if (!probe.pass) {
        acceptanceFailures.push({ width, ...scenario, rule: 'enriched-detail', ...probe });
      }
      await page.screenshot({
        path: path.join(screenshotRoot, `detail-enriched-${scenario.slug}-${width}.png`),
        fullPage: false,
      });
      await closeDetail(page);
    }
  }
  return acceptanceFailures;
}

export async function runVacationClientDetailLayoutTests() {
  const { ensureBuiltClient, startPreviewServer } = await import('./shell-layout.mjs');
  await ensureBuiltClient();
  const nycPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
  const enrichedPayload = finalizeServedSharedTripPayload(buildEnrichedDetailSharedTrip());
  const nycApp = await startPreviewServer(nycPayload);
  const enrichedApp = await startPreviewServer(enrichedPayload, { slug: ENRICHED_DETAIL_SLUG });
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const screenshotRoot =
    process.env.VACATION_CLIENT_DETAIL_ARTIFACT_ROOT ||
    path.join(root, 'evidence', 'vacation-client-p2-5-detail');
  await mkdir(screenshotRoot, { recursive: true });

  try {
    const page = await browser.newPage();
    const { overflowFailures, inkFailures } = await runNycLayoutChecks(page, nycApp, screenshotRoot);
    const acceptanceFailures = await runEnrichedAcceptanceChecks(page, enrichedApp, screenshotRoot);
    await page.close();
    assert.deepEqual(overflowFailures, []);
    assert.deepEqual(inkFailures, []);
    assert.deepEqual(acceptanceFailures, []);
  } finally {
    await nycApp.close();
    await enrichedApp.close();
    await browser.close();
  }

  console.log('vacation-client detail layout checks passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVacationClientDetailLayoutTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
