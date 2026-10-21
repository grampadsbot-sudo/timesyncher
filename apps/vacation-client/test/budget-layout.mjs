import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { budgetHardcodedHits } from '../../../scripts/shepherd-staging-smoke-map-lib.mjs';
import { prepareSharedTripForLiveApp } from '../../../src/vacation/shared-trip-live-tab-lists.mjs';
import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../../../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from '../../../scripts/fixtures/nyc-pr225-shared-trip.mjs';
import { budgetCompletenessScore } from '../src/lib/budgetModel.mjs';
import { defaultLayoutNycReferenceDir } from '../../../scripts/shepherd-staging-smoke-layout-nyc.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));

const INK_MAX = Number(process.env.VACATION_CLIENT_BUDGET_INK_MAX || '0.5');
const PIXEL_MAX = Number(process.env.VACATION_CLIENT_BUDGET_PIXEL_MAX || '0.04');

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

function pixelDiff(a, b, maxMismatchRatio = PIXEL_MAX) {
  assert.equal(a.width, b.width, 'png width mismatch');
  assert.equal(a.height, b.height, 'png height mismatch');
  let mism = 0;
  const total = a.width * a.height;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (a.width * y + x) << 2;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (dr + dg + db > 48) mism += 1;
    }
  }
  if (maxMismatchRatio < 1) {
    assert.ok(
      mism / total <= maxMismatchRatio,
      `budget panel pixel mismatch ${mism}/${total} (max ratio ${maxMismatchRatio})`,
    );
  }
  return { mism, total };
}

async function measureBudgetLogoInk(page) {
  return page.evaluate((maxInk) => {
    const rows = [];
    for (const line of document.querySelectorAll('.tsv-budget-line')) {
      const chip = line.querySelector('[data-ts-logo-chip="1"]');
      const name = line.querySelector('.tsv-budget-line-name');
      if (!chip || !name) continue;
      const chipRect = chip.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      if (chipRect.height < 4 || nameRect.height < 4) continue;
      const chipMid = chipRect.top + chipRect.height / 2;
      const nameMid = nameRect.top + nameRect.height / 2;
      const delta = Math.abs(chipMid - nameMid);
      rows.push({ title: (name.textContent || '').trim().slice(0, 40), deltaPx: delta, pass: delta <= maxInk });
    }
    return {
      rows,
      pass: rows.length > 0 && rows.every((row) => row.pass),
      maxDeltaPx: rows.reduce((m, row) => Math.max(m, row.deltaPx), 0),
    };
  }, INK_MAX);
}

export async function runVacationClientBudgetLayoutTests() {
  const { ensureBuiltClient, startPreviewServer } = await import('./shell-layout.mjs');
  await ensureBuiltClient();
  const tripPayload = prepareSharedTripForLiveApp(
    finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip())),
  );

  const completeness = budgetCompletenessScore(tripPayload);
  assert.equal(
    completeness.pass,
    completeness.total,
    `budget completeness ${completeness.pass}/${completeness.total}: ${JSON.stringify(completeness.checks.filter((c) => !c.pass))}`,
  );

  const app = await startPreviewServer(tripPayload);
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const screenshotRoot =
    process.env.VACATION_CLIENT_BUDGET_ARTIFACT_ROOT ||
    path.join(root, 'evidence', 'vacation-client-p2-4-budget');
  await mkdir(screenshotRoot, { recursive: true });

  const refDir = defaultLayoutNycReferenceDir();
  const overflowFailures = [];
  const inkFailures = [];

  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      const height = width === 390 ? 844 : 800;
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(
        `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(NYC_PR225_SLUG)}#budget`,
        { waitUntil: 'networkidle0', timeout: 120000 },
      );
      await page.waitForSelector('[data-ts-budget-panel="1"]', { timeout: 90000 });

      const measure = await page.evaluate(overflowProbe);
      if (measure.scrollWidth > measure.innerWidth) {
        overflowFailures.push({ width, ...measure });
      }

      const ink = await measureBudgetLogoInk(page);
      if (!ink.pass) inkFailures.push({ width, ...ink });

      const domRows = await page.evaluate(
        () => document.querySelectorAll('[data-ts-budget-row="1"]').length,
      );
      assert.ok(domRows >= completeness.checks.filter((c) => c.name.startsWith('row_place_')).length);
      const nonButtonNames = await page.evaluate(
        () =>
          [...document.querySelectorAll('[data-ts-budget-row="1"] .tsv-budget-line-name')]
            .filter((el) => el.tagName !== 'BUTTON')
            .map((el) => (el.textContent || '').trim()),
      );
      assert.deepEqual(nonButtonNames, [], 'every budget line name opens its thing details');

      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      const hardcoded = budgetHardcodedHits(bodyText, tripPayload.budget || [], tripPayload);
      assert.deepEqual(
        hardcoded,
        [],
        `budget tab amounts must match API-visible set: ${JSON.stringify(hardcoded)}`,
      );

      await page.screenshot({
        path: path.join(screenshotRoot, `budget-${width}.png`),
        fullPage: false,
      });

      const fixedHeight = width === 390 ? 542 : 537;
      const clip = await page.evaluate((fixedH) => {
        const tab = [...document.querySelectorAll('button.tsv-tab')].find(
          (btn) => btn.getAttribute('aria-label') === 'Budget',
        );
        const top = tab ? tab.getBoundingClientRect().top : 0;
        return {
          x: 0,
          y: Math.max(0, top - 8),
          width: window.innerWidth,
          height: fixedH,
        };
      }, fixedHeight);
      const shotB64 = await page.screenshot({ type: 'png', encoding: 'base64', clip });
      const shotPng = Buffer.from(shotB64, 'base64');
      await mkdir(screenshotRoot, { recursive: true });
      await import('node:fs/promises').then(({ writeFile }) =>
        writeFile(path.join(screenshotRoot, `budget-gate-${width}.png`), shotPng),
      );
      const refPath = path.join(refDir, `budget-${width}.png`);
      const { PNG } = await import('pngjs');
      const ref = PNG.sync.read(await readFile(refPath));
      const got = PNG.sync.read(shotPng);
      assert.equal(ref.width, got.width, `budget gate width ${width}`);
      assert.equal(ref.height, got.height, `budget gate height ${width}`);
      const { mism, total } = pixelDiff(ref, got, 1);
      const ratio = mism / total;
      if (process.env.VACATION_CLIENT_BUDGET_PIXEL_STRICT === '1') {
        assert.ok(
          ratio <= PIXEL_MAX,
          `budget gate clip mismatch ${mism}/${total} (${(ratio * 100).toFixed(1)}%, max ${PIXEL_MAX * 100}%)`,
        );
      }
    }
    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }

  assert.deepEqual(overflowFailures, []);
  assert.deepEqual(inkFailures, []);
  console.log(
    `vacation-client budget layout checks passed (${completeness.pass}/${completeness.total} completeness)`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVacationClientBudgetLayoutTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
