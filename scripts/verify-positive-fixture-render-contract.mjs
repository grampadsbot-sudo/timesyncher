#!/usr/bin/env node
/**
 * Independent rendered positive-fixture contract for apps/vacation-client (TSV #343).
 * Fixture passability evidence only — not a Gate B verdict or staging approval.
 *
 * Usage:
 *   node scripts/verify-positive-fixture-render-contract.mjs [--artifact-dir=PATH]
 *
 * See scripts/verify-positive-fixture-render-contract.md
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { buildBudgetModel, formatUsd, placesForBudget } from '../apps/vacation-client/src/lib/budgetModel.mjs';
import {
  numericPrice,
  placeName,
  placesForCategoryTab,
  rowSummary,
} from '../apps/vacation-client/src/lib/listTabModel.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  buildNycCraigKimDaybydayTripPositiveV1,
  NYC_POSITIVE_FIXTURE_VERSION,
} from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import {
  assessGateBNycFixtureContract,
  gateBNycFixturePayloadSha256,
  renderedPrice,
  wordCount,
} from './lib/gate-b-nyc-fixture-contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const clientRoot = path.join(root, 'apps/vacation-client');
const require = createRequire(path.join(root, 'package.json'));

const POSITIVE_PAYLOAD_SHA256 =
  '98119a045d6b3053816cc5b97bc183fb2b33c605bc0f7878740d52116c75b9c8';
const POSITIVE_PAYLOAD_BYTES = 711352;
const MIN_DESC_WORDS = 30;
const VIEWPORTS = [390, 1280];
const LIST_TABS = [
  { id: 'flights', label: 'Flights' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'cars', label: 'Cars' },
  { id: 'restaurants', label: 'Restaurants' },
  { id: 'stores', label: 'Stores' },
  { id: 'events', label: 'The Rest' },
];
const CAR_PLACE_ID = 609;

function parseArtifactDir(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--artifact-dir=')) return arg.slice('--artifact-dir='.length);
  }
  return process.env.TSV343_ARTIFACT_DIR || path.join(root, 'evidence', 'tsv-343-positive-render-contract');
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function payloadBytesDigest(payload) {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    body: bytes.toString('utf8'),
  };
}

function loadPlaywright() {
  const candidates = [
    'playwright',
    'playwright-core',
    path.join(process.env.HOME || '', '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'Playwright is required (Ubuntu: npx playwright --version). Set CHROME_PATH for bundled Chromium.',
  );
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': buf.length,
  });
  res.end(buf);
}

async function ensureBuiltClient(sourceSha) {
  const { existsSync } = await import('node:fs');
  if (!existsSync(path.join(clientRoot, 'node_modules', 'vite'))) {
    execFileSync('npm', ['ci'], { cwd: clientRoot, stdio: ['inherit', 'ignore', 'inherit'] });
  }
  execFileSync('npm', ['run', 'build'], {
    cwd: clientRoot,
    stdio: ['inherit', 'ignore', 'inherit'],
    env: { ...process.env, TSV_SOURCE_SHA: sourceSha },
  });
}

async function startHarnessServer({ tripJson, slug, sourceSha }) {
  const distDir = path.join(clientRoot, 'dist');
  const html = await readFile(path.join(distDir, 'vacation-app-next.html'), 'utf8');

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api/version') {
      return send(res, 200, JSON.stringify({ sha: sourceSha, build: sourceSha }), 'application/json; charset=utf-8');
    }
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === slug) {
        return send(res, 200, tripJson, 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json; charset=utf-8');
    }
    const editMatch = pathname.match(/^\/api\/shared\/([^/]+)\/edit-access\/?$/);
    if (editMatch && req.method === 'GET') {
      return send(res, 200, JSON.stringify({ canEdit: false }), 'application/json; charset=utf-8');
    }
    if (pathname === '/vacation-app-next.html' || pathname === '/') {
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    const rel = pathname.replace(/^\//, '');
    const filePath = path.join(distDir, rel);
    if (filePath.startsWith(distDir)) {
      try {
        const data = await readFile(filePath);
        const type = rel.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : rel.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
        return send(res, 200, data, type);
      } catch {
        /* fall through */
      }
    }
    send(res, 404, 'missing', 'text/plain');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function expectedListRows(trip) {
  const rows = [];
  for (const { id: tab, label } of LIST_TABS) {
    for (const place of placesForCategoryTab(trip, tab)) {
      const override = overrideFor(trip, place);
      rows.push({
        placeId: place.id,
        tab,
        tabLabel: label,
        name: placeName(place),
        expectedSummary: rowSummary(place, trip),
        expectedMinWords: MIN_DESC_WORDS,
        expectedPrice: renderedPrice(trip, place),
        expectedTimeline: override.timeline === true,
        timelineToggleExpected: tab === 'flights' || tab === 'hotels' || tab === 'cars',
      });
    }
  }
  return rows;
}

function priceDomExpectation(price) {
  if (price === null || price === undefined) return { required: false, pattern: null };
  if (price === 0) return { required: true, pattern: '$0' };
  return { required: true, pattern: `$${price}` };
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button.tsv-tab')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  return clicked;
}

async function scrapeVisibleListRows(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const li of document.querySelectorAll('[data-ts-list-row="1"]')) {
      const nameEl = li.querySelector('[data-ts-list-row-name="1"]');
      const descEl = li.querySelector('.tsv-row-desc');
      const priceEl = li.querySelector('.tsv-row-price');
      const toggle = li.querySelector('.tsv-timeline-toggle input[type="checkbox"]');
      const name = (nameEl?.textContent || '').replace(/\s+/g, ' ').trim();
      const description = (descEl?.textContent || '').replace(/\s+/g, ' ').trim();
      rows.push({
        name,
        description,
        descriptionWords: description ? description.split(/\s+/).filter(Boolean).length : 0,
        priceText: (priceEl?.textContent || '').replace(/\s+/g, ' ').trim(),
        timelineChecked: toggle ? toggle.checked : null,
        hasTimelineToggle: Boolean(toggle),
        domSnippet: li.outerHTML.slice(0, 4000),
      });
    }
    return rows;
  });
}

async function scrapeBudgetInventory(page) {
  return page.evaluate(() => {
    const tripTimeline = document
      .querySelector('[data-ts-budget-trip-total="1"] .tsv-budget-timeline-pill')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
    const rows = [...document.querySelectorAll('[data-ts-budget-row="1"]')].map((node) => ({
      placeId: node.getAttribute('data-place-id'),
      name: node.querySelector('.tsv-budget-line-name')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      amountText: node.querySelector('.tsv-budget-line-amount')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }));
    const bucketTimeline = [...document.querySelectorAll('[data-ts-budget-bucket]')].map((node) => ({
      bucket: node.getAttribute('data-ts-budget-bucket'),
      timelinePill: node.querySelector('.tsv-budget-timeline-pill')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }));
    return { tripTimeline, rows, bucketTimeline };
  });
}

async function openCarDetail(page, carName) {
  await clickTab(page, 'Cars');
  await new Promise((r) => setTimeout(r, 400));
  const opened = await page.evaluate((wantName) => {
    const target = String(wantName || '').toLowerCase();
    for (const btn of document.querySelectorAll('button.tsv-row-car-main, button.tsv-row-main')) {
      const nameEl = btn.querySelector('[data-ts-list-row-name="1"]');
      const label = (nameEl?.textContent || btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (label.toLowerCase() === target) {
        btn.click();
        return label;
      }
    }
    return null;
  }, carName);
  if (!opened) return null;
  await page.waitForSelector('[data-ts-detail-panel="1"]', { timeout: 20000 });
  return page.evaluate(() => {
    const readField = (key) =>
      document.querySelector(`[data-ts-detail-field="${key}"]`)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      pickupLocation: readField('pickupLocation'),
      returnLocation: readField('returnLocation'),
      summary: readField('summary'),
      domSnippet: document.querySelector('[data-ts-detail-panel="1"]')?.outerHTML?.slice(0, 6000) || '',
    };
  });
}

function matchRowByName(domRows, expectedName) {
  const norm = expectedName.toLowerCase();
  return domRows.find((row) => row.name.toLowerCase() === norm);
}

async function runRenderedContract({
  profile,
  trip,
  tripJson,
  slug,
  sourceSha,
  artifactDir,
  expectPass,
}) {
  const violations = [];
  const rowEvidence = [];
  const digest = payloadBytesDigest(trip);
  if (digest.sha256 !== tripJsonSha256(tripJson)) {
    violations.push('tripJson bytes must match JSON.stringify(payload) digest');
  }

  const offline =
    profile === 'positive'
      ? assessGateBNycFixtureContract(trip, { profile: 'positive' })
      : assessGateBNycFixtureContract(trip, { profile: 'negative' });
  if (expectPass && !offline.pass) {
    violations.push(`offline fixture contract failed: ${offline.violations.join('; ')}`);
  }
  if (!expectPass && offline.pass) {
    violations.push('negative profile unexpectedly passed offline fixture contract');
  }

  const app = await startHarnessServer({ tripJson, slug, sourceSha });
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const expectedRows = expectedListRows(trip);
  const budgetModel = buildBudgetModel(trip);
  const expectedBudgetIds = new Set(placesForBudget(trip).map((p) => String(p.id)));
  let carDetailEvidence = null;

  try {
    const page = await browser.newPage();
    for (const width of VIEWPORTS) {
      const height = width === 390 ? 844 : 800;
      await page.setViewportSize({ width, height });
      await page.goto(`${app.origin}/vacation-app-next.html?token=${encodeURIComponent(slug)}`, {
        waitUntil: 'networkidle',
        timeout: 120000,
      });
      await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });
      const buildStamp = await page.evaluate(
        () => document.querySelector('[data-build-stamp="1"]')?.textContent?.trim() || '',
      );

      for (const { label: tabLabel } of LIST_TABS) {
        if (!(await clickTab(page, tabLabel))) {
          violations.push(`missing tab ${tabLabel} at ${width}px`);
          continue;
        }
        await new Promise((r) => setTimeout(r, 450));
        const domRows = await scrapeVisibleListRows(page);
        const tabExpected = expectedRows.filter((row) => row.tabLabel === tabLabel);
        for (const expected of tabExpected) {
          const dom = matchRowByName(domRows, expected.name);
          if (!dom) {
            violations.push(`missing list row ${expected.placeId}:${expected.name} on ${tabLabel} at ${width}px`);
            continue;
          }
          if (dom.descriptionWords < expected.expectedMinWords) {
            violations.push(
              `${expected.placeId}:${expected.name} description ${dom.descriptionWords} words (<${expected.expectedMinWords}) at ${width}px on ${tabLabel}`,
            );
          }
          const priceExpect = priceDomExpectation(expected.expectedPrice);
          if (priceExpect.required && !dom.priceText.includes(priceExpect.pattern)) {
            violations.push(
              `${expected.placeId}:${expected.name} price expected ${priceExpect.pattern}, got "${dom.priceText}" at ${width}px`,
            );
          }
          if (expected.timelineToggleExpected) {
            if (!dom.hasTimelineToggle) {
              violations.push(`${expected.placeId}:${expected.name} missing timeline toggle on ${tabLabel}`);
            } else if (dom.timelineChecked !== expected.expectedTimeline) {
              violations.push(
                `${expected.placeId}:${expected.name} timeline toggle expected ${expected.expectedTimeline}, got ${dom.timelineChecked}`,
              );
            }
          }
          rowEvidence.push({
            profile,
            viewport: width,
            tab: tabLabel,
            placeId: expected.placeId,
            name: expected.name,
            descriptionWords: dom.descriptionWords,
            priceText: dom.priceText,
            timelineChecked: dom.timelineChecked,
            domSnippet: dom.domSnippet,
            buildStamp,
          });
        }
        if (domRows.length !== tabExpected.length) {
          violations.push(
            `${tabLabel} at ${width}px: expected ${tabExpected.length} [data-ts-list-row] rows, DOM has ${domRows.length}`,
          );
        }
      }

      if (!(await clickTab(page, 'Budget'))) {
        violations.push(`missing Budget tab at ${width}px`);
      } else {
        await new Promise((r) => setTimeout(r, 450));
        const budgetDom = await scrapeBudgetInventory(page);
        const domIds = new Set(budgetDom.rows.map((row) => row.placeId).filter(Boolean));
        for (const id of expectedBudgetIds) {
          if (!domIds.has(id)) {
            violations.push(`budget inventory missing place id ${id} at ${width}px`);
          }
        }
        const expectedTripTimeline = `${formatUsd(budgetModel.tripTimelinePlanned, budgetModel.currency)} timeline`;
        if (budgetDom.tripTimeline !== expectedTripTimeline) {
          violations.push(
            `budget trip timeline pill expected "${expectedTripTimeline}", got "${budgetDom.tripTimeline}" at ${width}px`,
          );
        }
        for (const bucket of budgetModel.buckets) {
          const domBucket = budgetDom.bucketTimeline.find((b) => b.bucket === bucket.label);
          const expectedBucketTimeline = `${formatUsd(bucket.timelinePlanned, budgetModel.currency)} timeline`;
          if (!domBucket || domBucket.timelinePill !== expectedBucketTimeline) {
            violations.push(
              `budget bucket ${bucket.label} timeline expected "${expectedBucketTimeline}", got "${domBucket?.timelinePill || ''}"`,
            );
          }
        }
      }

      if (width === 390 && profile === 'positive' && !carDetailEvidence) {
        const carPlace = trip.places.find((p) => Number(p.id) === CAR_PLACE_ID);
        carDetailEvidence = await openCarDetail(page, placeName(carPlace));
        if (!carDetailEvidence?.pickupLocation || !/jfk/i.test(carDetailEvidence.pickupLocation)) {
          violations.push(`car ${CAR_PLACE_ID} detail missing pickupLocation with JFK`);
        }
        if (!carDetailEvidence?.returnLocation || !/jfk/i.test(carDetailEvidence.returnLocation)) {
          violations.push(`car ${CAR_PLACE_ID} detail missing returnLocation with JFK`);
        }
      }
    }
  } finally {
    await browser.close();
    await app.close();
  }

  const pass = expectPass ? violations.length === 0 : violations.length > 0;
  return {
    profile,
    pass,
    expectPass,
    violations,
    offlineContract: offline,
    payloadBytes: digest.bytes,
    payloadBytesSha256: digest.sha256,
    contractProjectionSha256: gateBNycFixturePayloadSha256(trip),
    expectedListRowCount: expectedRows.length,
    rowEvidence,
    carDetailEvidence,
    contentGapsNoted: [
      'Flight baggage/seat and restaurant reviewer/dish fields are out of scope for this passability runner.',
    ],
  };
}

function tripJsonSha256(tripJson) {
  return createHash('sha256').update(Buffer.from(tripJson, 'utf8')).digest('hex');
}

async function main() {
  const artifactDir = parseArtifactDir(process.argv.slice(2));
  await mkdir(artifactDir, { recursive: true });

  const sourceSha = gitSha();
  await ensureBuiltClient(sourceSha);
  const buildSha = gitSha();

  const positiveTrip = buildNycCraigKimDaybydayTripPositiveV1();
  const positiveJson = JSON.stringify(positiveTrip);
  const positiveDigest = payloadBytesDigest(positiveTrip);
  if (positiveDigest.bytes !== POSITIVE_PAYLOAD_BYTES || positiveDigest.sha256 !== POSITIVE_PAYLOAD_SHA256) {
    console.error(
      JSON.stringify(
        {
          pass: false,
          blocked: 'positive payload bytes/sha256 mismatch',
          expected: { bytes: POSITIVE_PAYLOAD_BYTES, sha256: POSITIVE_PAYLOAD_SHA256 },
          actual: { bytes: positiveDigest.bytes, sha256: positiveDigest.sha256 },
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const negativeTrip = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
  const negativeJson = JSON.stringify(negativeTrip);

  const positive = await runRenderedContract({
    profile: 'positive',
    trip: positiveTrip,
    tripJson: positiveJson,
    slug: GATE_B_APPROVED_SHARED_SLUG,
    sourceSha: buildSha,
    artifactDir,
    expectPass: true,
  });

  const negative = await runRenderedContract({
    profile: 'negative',
    trip: negativeTrip,
    tripJson: negativeJson,
    slug: `${GATE_B_APPROVED_SHARED_SLUG}-negative`,
    sourceSha: buildSha,
    artifactDir,
    expectPass: false,
  });

  const report = {
    check: 'positive-fixture-render-contract',
    pass: positive.pass && negative.pass,
    sourceGitSha: sourceSha,
    buildGitSha: buildSha,
    fixtureVersion: NYC_POSITIVE_FIXTURE_VERSION,
    payloadBytesSha256: positiveDigest.sha256,
    payloadBytes: positiveDigest.bytes,
    contractProjectionSha256: gateBNycFixturePayloadSha256(positiveTrip),
    command: 'node scripts/verify-positive-fixture-render-contract.mjs',
    positive,
    negative,
    notGateBVerdict: true,
  };

  const outPath = path.join(artifactDir, 'positive-fixture-render-contract.json');
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
