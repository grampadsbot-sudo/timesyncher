#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { NYC_DAYBYDAY_SLUG } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const defaultLiveApiPath = fileURLToPath(
  new URL('./fixtures/nyc-screen-trip99-live-shared-api.json', import.meta.url),
);
const outDir =
  process.env.NYC_SCREEN_VERIFY_OUT ||
  fileURLToPath(new URL('../.artifacts/nyc-screen-verify/screenshots', import.meta.url));
const useStaging = process.env.NYC_SCREEN_USE_STAGING === '1';
const liveApiPath = process.env.NYC_SCREEN_LIVE_API || defaultLiveApiPath;

const liveApiRaw = JSON.parse(await readFile(liveApiPath, 'utf8'));
const tripPayload = finalizeServedSharedTripPayload(liveApiRaw);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const amelie = tripPayload.thingOverrides?.['place:670'];
const expectedCarBrandKeys = (() => {
  const brands = new Set();
  const ovs = tripPayload.thingOverrides || {};
  for (const place of liveApiRaw.places || []) {
    const cat = typeof place.category === 'object' ? place.category?.name : place.category;
    if (cat !== 'Car') continue;
    const rc = String(ovs[`place:${place.id}`]?.rentalCompany || '').trim();
    if (rc) brands.add(rc.toLowerCase());
  }
  return [...brands].sort();
})();
assert.equal(expectedCarBrandKeys.length, 4, 'live NYC API has four distinct car rentalCompany brands');
assert.ok(amelie?.summary && amelie?.longDetails, 'live API Amelie summary+longDetails required');
assert.notEqual(
  String(amelie.summary).replace(/\s+/g, ' ').trim().slice(0, 100),
  String(amelie.longDetails).replace(/\s+/g, ' ').trim().slice(0, 100),
  'live stored summary vs longDetails must differ (place:670)',
);
const widths = [
  { w: 390, tag: 'phone' },
  { w: 1280, tag: 'desktop' },
];

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
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

async function startLocalPreview() {
  const [html, js, css, carFilter] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
    readFile(path.join(root, 'public/ts-car-brand-filter.js'), 'utf8'),
  ]);
  const bundleSha256 = createHash('sha256').update(js).digest('hex');
  const publicJs = [
    '/vacation-app-request.js',
    '/ts-timeline-icon-patch.js',
    '/ts-car-brand-filter.js',
    '/ts-thing-media-overlay.js',
    '/post-purchase-gate.mjs',
  ];
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname === '/ts-car-brand-filter.js') return send(res, 200, carFilter, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/src/onboarding/eula-markdown.mjs') {
      return send(res, 200, await readFile(path.join(root, 'src/onboarding/eula-markdown.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      return send(res, 200, '', 'image/png');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
    }
    if (pathname.startsWith('/api/')) {
      return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    }
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    bundleSha256,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const stagingOrigin = process.env.NYC_SCREEN_STAGING_ORIGIN || 'https://vacation-staging.timesyncher.com';
let appOrigin = stagingOrigin;
let bundleSha256 = null;
let localApp = null;
if (!useStaging) {
  localApp = await startLocalPreview();
  appOrigin = localApp.origin;
  bundleSha256 = localApp.bundleSha256;
}

await mkdir(outDir, { recursive: true });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const shotSuffix = useStaging ? 'staging' : 'preview';
const evidence = {
  screenshots: [],
  checks: [],
  origin: appOrigin,
  bundleSha256,
  slug: NYC_DAYBYDAY_SLUG,
  liveApiPath,
};

try {
  for (const { w, tag } of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${appOrigin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => /cars/i.test(b.getAttribute('aria-label') || b.textContent || '')),
      { timeout: 180000 },
    );

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /^cars$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    const cars = await page.evaluate(() => ({
      toggles: [...document.querySelectorAll('[data-ts-brand-toggle]')].map((el) => ({
        brand: el.dataset.tsBrandToggle,
        label: el.textContent?.replace(/\s+/g, ' ').trim() || '',
        hasLogo: !!el.querySelector('img[src]'),
        logoSrc: el.querySelector('img[src]')?.getAttribute('src') || '',
      })),
      rows: document.querySelectorAll('[data-shared-live-tab="cars"] [data-list-row]').length,
      visibleRows: [...document.querySelectorAll('[data-shared-live-tab="cars"] [data-list-row]')].filter((el) => el.offsetParent !== null).length,
    }));
    assert.equal(cars.rows, 7, `live car rows at ${tag}`);
    assert.deepEqual(
      cars.toggles.map((t) => t.brand).sort(),
      expectedCarBrandKeys,
      `one toggle per rentalCompany brand at ${tag}`,
    );
    assert.ok(cars.toggles.every((t) => !/suv|sedan|compact|midsize|full-size/i.test(t.label)), `car toggle labels are brands at ${tag}`);
    assert.ok(cars.toggles.every((t) => t.hasLogo && /^https?:\/\//.test(t.logoSrc)), `car brand logos at ${tag}`);
    evidence.checks.push({
      tag,
      carsToggles: cars.toggles.length,
      carLogos: cars.toggles.filter((t) => t.hasLogo).length,
      carRows: cars.rows,
      carBrandLabels: cars.toggles.map((t) => t.label),
    });
    const hertzRows = (liveApiRaw.places || []).filter((p) => {
      const cat = typeof p.category === 'object' ? p.category?.name : p.category;
      if (cat !== 'Car') return false;
      return String(tripPayload.thingOverrides?.[`place:${p.id}`]?.rentalCompany || '').toLowerCase() === 'hertz';
    }).length;
    assert.ok(hertzRows >= 1, 'live API includes Hertz car rows for brand-hide proof');
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-ts-brand-toggle="hertz"] input');
      if (toggle?.checked) toggle.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const afterHideHertz = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('[data-shared-live-tab="cars"] [data-list-row]')].filter((el) => el.offsetParent !== null).length,
    }));
    assert.equal(
      afterHideHertz.visible,
      cars.visibleRows - hertzRows,
      `unchecking Hertz hides all ${hertzRows} Hertz row(s) at ${tag}`,
    );
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-ts-brand-toggle="hertz"] input');
      if (toggle && !toggle.checked) toggle.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const afterRestore = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('[data-shared-live-tab="cars"] [data-list-row]')].filter((el) => el.offsetParent !== null).length,
    }));
    assert.equal(afterRestore.visible, cars.visibleRows, `brand restore at ${tag}`);
    evidence.checks.push({ tag, carHideVisible: afterHideHertz.visible, carRestoreVisible: afterRestore.visible, hertzRows });
    await page.screenshot({ path: path.join(outDir, `pt3019-cars-${tag}-${shotSuffix}.png`) });
    evidence.screenshots.push(`pt3019-cars-${tag}-${shotSuffix}.png`);

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /the rest/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    const clickEventsChip = (chip) =>
      page.evaluate((label) => {
        const root = document.querySelector('[data-shared-live-tab="events"]')?.parentElement || document.body;
        [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();
      }, chip);
    const eventsSnap = () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-shared-live-tab="events"]')?.parentElement || document.body;
        const areaChips = ['All areas', 'Financial District', 'Greenwich Village', 'Harlem', 'Midtown', 'Upper West Side', 'West Village'];
        const typeChips = ['All types', 'music', 'sightseeing', 'tickets', 'other', 'tour', 'transport', 'family_event'];
        const visible = (names) =>
          names.filter((name) => [...root.querySelectorAll('button')].some((b) => b.textContent?.trim() === name));
        return {
          rows: document.querySelectorAll('[data-shared-live-tab="events"] [data-list-row]').length,
          emptyCopy: [...document.querySelectorAll('[data-shared-live-tab="events"] div')].some((el) =>
            /No events match those filters/i.test(el.textContent || ''),
          ),
          areaChips: visible(areaChips),
          typeChips: visible(typeChips),
        };
      });
    const startEvents = await eventsSnap();
    assert.ok(startEvents.rows > 0, `events tab starts with rows at ${tag}`);
    assert.equal(startEvents.emptyCopy, false, `events tab starts without empty trap at ${tag}`);
    await clickEventsChip('Greenwich Village');
    await new Promise((r) => setTimeout(r, 500));
    const gv = await eventsSnap();
    assert.ok(gv.rows > 0, `Greenwich Village keeps matching rows at ${tag}`);
    assert.equal(gv.emptyCopy, false, `Greenwich Village is not a dead-end at ${tag}`);
    assert.deepEqual(gv.typeChips, ['All types', 'music'], `opposite filter offers only types with GV things at ${tag}`);
    await clickEventsChip('music');
    await new Promise((r) => setTimeout(r, 500));
    const gvMusic = await eventsSnap();
    assert.ok(gvMusic.rows > 0, `Greenwich Village + music stays nonempty at ${tag}`);
    await clickEventsChip('All areas');
    await new Promise((r) => setTimeout(r, 500));
    await clickEventsChip('All types');
    await new Promise((r) => setTimeout(r, 400));
    await clickEventsChip('family_event');
    await new Promise((r) => setTimeout(r, 500));
    const familyType = await eventsSnap();
    assert.ok(familyType.rows > 0, `family_event alone lists rows at ${tag}`);
    assert.equal(familyType.emptyCopy, false, `family_event is not a dead-end at ${tag}`);
    assert.ok(familyType.areaChips.length > 1, `family_event still offers area chips at ${tag}`);
    await clickEventsChip('Greenwich Village');
    await new Promise((r) => setTimeout(r, 500));
    const gvFamilyStale = await eventsSnap();
    assert.ok(gvFamilyStale.rows > 0, `Greenwich Village + family_event stale reconcile keeps rows at ${tag}`);
    assert.equal(gvFamilyStale.emptyCopy, false, `Greenwich Village + family_event must not zero-trap at ${tag}`);
    await clickEventsChip('All types');
    await clickEventsChip('All areas');
    await new Promise((r) => setTimeout(r, 400));
    const afterReset = await eventsSnap();
    assert.ok(afterReset.rows >= gvMusic.rows, `All areas reset restores rows at ${tag}`);
    await clickEventsChip('tour');
    await new Promise((r) => setTimeout(r, 500));
    const tourOnly = await eventsSnap();
    assert.ok(tourOnly.rows > 0, `tour type alone stays nonempty at ${tag}`);
    await clickEventsChip('Greenwich Village');
    await new Promise((r) => setTimeout(r, 500));
    const stale = await eventsSnap();
    assert.ok(stale.rows > 0, `stale area/type reconcile still lists rows at ${tag}`);
    assert.equal(stale.emptyCopy, false, `stale reconcile must not zero-result trap at ${tag}`);
    await clickEventsChip('All types');
    await clickEventsChip('All areas');
    await new Promise((r) => setTimeout(r, 400));
    evidence.checks.push({
      tag,
      eventsStartRows: startEvents.rows,
      eventsGvRows: gv.rows,
      eventsFamilyTypeRows: familyType.rows,
      eventsGvFamilyStaleRows: gvFamilyStale.rows,
      eventsStaleRows: stale.rows,
    });
    await page.screenshot({ path: path.join(outDir, `pt3020-rest-${tag}-${shotSuffix}.png`) });
    evidence.screenshots.push(`pt3020-rest-${tag}-${shotSuffix}.png`);

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /^restaurants$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('strong')].find((el) => /amelie/i.test(el.textContent || ''));
      const btn = row?.closest('button') || row?.closest('[data-list-row]')?.querySelector('button');
      (btn || row)?.click();
    });
    await page.waitForSelector('[data-ts-detail-summary-readonly]', { timeout: 120000 });
    const storedSummary = norm(amelie.summary);
    const storedDetails = norm(amelie.longDetails);
    const detail = await page.evaluate(() => {
      const normText = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const summary = normText(document.querySelector('[data-ts-detail-summary-readonly] p')?.textContent || document.querySelector('[data-ts-detail-summary-readonly]')?.innerText);
      const details = normText(document.querySelector('[data-ts-detail-field="longDetails"] p')?.textContent || '');
      const website = document.querySelector('[data-ts-detail-info-box="website"]');
      const hh = document.querySelector('[data-ts-detail-field="happyHourDetails"]');
      const parent = website?.parentElement;
      let hhImmediatelyAfterWebsite = false;
      if (website && hh && parent) {
        const kids = [...parent.children];
        const wi = kids.indexOf(website);
        const hi = kids.indexOf(hh);
        hhImmediatelyAfterWebsite = wi >= 0 && hi === wi + 1;
      }
      return { summary, details, hasHh: !!hh, hasWebsite: !!website, hhImmediatelyAfterWebsite };
    });
    assert.equal(detail.summary, storedSummary, `detail summary matches stored summary at ${tag}`);
    assert.equal(detail.details, storedDetails, `detail Details panel matches stored longDetails at ${tag}`);
    assert.ok(detail.summary.length > 30 && detail.details.length > 80, `detail panels substantive at ${tag}`);
    assert.notEqual(detail.summary.slice(0, 80), detail.details.slice(0, 80), `summary vs details differ in UI at ${tag}`);
    assert.equal(detail.hasWebsite, true, `website info box at ${tag}`);
    assert.equal(detail.hasHh, true, `nonempty HH view at ${tag}`);
    assert.equal(detail.hhImmediatelyAfterWebsite, true, `HH immediately after website at ${tag}`);
    await page.evaluate(() => {
      const back = [...document.querySelectorAll('button')].find((b) => /close|back/i.test(b.textContent || b.getAttribute('aria-label') || ''));
      back?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('strong')].find((el) => /^carbone$/i.test(el.textContent?.trim() || ''));
      (row?.closest('button') || row)?.click();
    });
    await page.waitForSelector('[data-ts-detail-summary-readonly]', { timeout: 120000 });
    const carboneHh = await page.evaluate(() => ({
      hh: !!document.querySelector('[data-ts-detail-field="happyHourDetails"]'),
      hhEditor: !!document.querySelector('textarea[placeholder*="happy-hour" i]'),
    }));
    assert.equal(carboneHh.hh, false, `empty HH hidden in viewer at ${tag}`);
    assert.equal(carboneHh.hhEditor, false, `empty HH editor hidden in viewer at ${tag}`);
    evidence.checks.push({
      tag,
      detailSummaryLen: detail.summary.length,
      detailUiDetailsLen: detail.details.length,
      summaryDistinctFromDetails: detail.summary.slice(0, 60) !== detail.details.slice(0, 60),
      hhAfterWebsite: detail.hhImmediatelyAfterWebsite,
      carboneHhHidden: !carboneHh.hh,
    });
    await page.screenshot({ path: path.join(outDir, `pt3018-detail-${tag}-${shotSuffix}.png`) });
    evidence.screenshots.push(`pt3018-detail-${tag}-${shotSuffix}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  if (localApp) await localApp.close();
}

await writeFile(
  path.join(path.dirname(outDir), 'nyc-screen-verify-chrome-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(`nyc screen verify ${shotSuffix} chrome checks passed`);
