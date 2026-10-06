#!/usr/bin/env node
/**
 * NYC Day-by-Day timeline side-by-side (travel reference vs served bundle).
 * Output: /opt/cursor/artifacts/pr232-day-nyc/
 * Usage: node scripts/capture_pr232_day_nyc_side_by_side.mjs
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outDir = process.env.PR232_DAY_NYC_DIR || '/opt/cursor/artifacts/pr232-day-nyc';
const intakeSlug = 'nyc-june-fixture-pr232';
const referenceBundlePath = process.env.NYC_REFERENCE_BUNDLE || '/tmp/index-BMaU4y5m.js';
const widths = [390, 1280];
const dayNumbers = [2, 3];

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

const tinyJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP///9j/4AAQSkZJRgABAQEASABIAAD/2wBDAFA3PEY8MlBGQUZaVVBfeMiCeG5uePWvuZHI////////////////////////////////////////////////////2wBDAQ8aGxwYISorKz4yPj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj7/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
  'base64',
);

function nycTripPayload() {
  const categories = {
    hotel: { id: 1, name: 'Hotel', icon: '🏨' },
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
    transport: { id: 5, name: 'Transport', icon: '🚌' },
  };
  const days = [1, 2, 3, 4, 5].map((day) => ({
    id: 500 + day,
    trip_id: 99,
    day_number: day,
    date: `2026-06-${String(day + 9).padStart(2, '0')}`,
    notes: day === 2 ? 'Central Park morning' : '',
    title: day === 3 ? 'Midtown museums' : '',
  }));
  const places = [];
  const assignments = Object.fromEntries(days.map((day) => [String(day.id), []]));
  const thingOverrides = {};
  const media = [];
  const rows = [
    { day: 2, time: '09:00', name: 'Metropolitan Museum of Art', cat: 'activity', id: 601, summary: 'Quiet hour in the European galleries before the crowds.' },
    { day: 2, time: '12:30', name: 'Le Bernardin', cat: 'restaurant', id: 602, summary: 'Lunch reservation — tasting menu, dress code observed.' },
    { day: 2, time: '15:00', name: 'Central Park Boat House', cat: 'activity', id: 603, summary: 'Rowboat on the lake if the line is short.' },
    { day: 3, time: '10:00', name: 'MoMA', cat: 'activity', id: 604, summary: 'Member entry; focus on the photography wing.' },
    { day: 3, time: '13:15', name: 'The Modern', cat: 'restaurant', id: 605, summary: 'Garden view table; keep it under two hours.' },
    { day: 3, time: '19:30', name: 'Lincoln Center', cat: 'activity', id: 606, summary: 'Evening performance — arrive early for the plaza.' },
  ];
  for (const row of rows) {
    const day = days.find((d) => d.day_number === row.day);
    const kind = categories[row.cat];
    const place = {
      id: row.id,
      trip_id: 99,
      name: row.name,
      description: row.summary,
      lat: 40.78,
      lng: -73.96,
      address: 'New York, NY',
      category_id: kind.id,
      category_name: kind.name,
      category_icon: kind.icon,
      category: { id: kind.id, name: kind.name, icon: kind.icon },
      reservation_status: 'confirmed',
      place_time: row.time,
      website: '',
      notes: '',
      source: 'fixture-nyc',
    };
    places.push(place);
    assignments[String(day.id)].push({
      id: 700 + row.id,
      day_id: day.id,
      order_index: assignments[String(day.id)].length,
      notes: '',
      place,
    });
    thingOverrides[`place:${row.id}`] = { timeline: true, category: 'other', summary: row.summary };
    media.push({
      id: `media-${row.id}`,
      thingId: row.id,
      thingName: row.name,
      dayId: day.id,
      dayNumber: row.day,
      caption: row.name,
      mediaKind: row.id === 602 ? 'video' : 'photo',
      mimeType: row.id === 602 ? 'application/octet-stream' : 'image/jpeg',
      originalName: row.id === 602 ? 'le-bernardin-clip.mp4' : 'thumb.jpg',
      publicUrl: row.id === 602 ? `/api/pdf/qr.svg?data=le-bernardin-clip` : `/fixture-media/place-${row.id}.jpg`,
      url: row.id === 602 ? `/api/pdf/qr.svg?data=le-bernardin-clip` : `/fixture-media/place-${row.id}.jpg`,
      kind: row.id === 602 ? 'video' : 'photo',
    });
  }
  media.push({
    id: 'day2-cover',
    dayId: days[1].id,
    dayNumber: 2,
    caption: 'Day 2 skyline',
    mediaKind: 'photo',
    mimeType: 'image/jpeg',
    originalName: 'day2-skyline.jpg',
    publicUrl: '/fixture-media/day-2-skyline.jpg',
    url: '/fixture-media/day-2-skyline.jpg',
    kind: 'photo',
  });
  return finalizeServedSharedTripPayload({
    trip: {
      id: 99,
      title: 'TimeSyncher Vacation — NYC June 2026 fixture',
      description: 'TimeSyncher shared NYC timeline QA (Craig / Kim synthetic fixture)',
      start_date: '2026-06-10',
      end_date: '2026-06-14',
      currency: 'USD',
      lat: 40.78,
      lng: -73.96,
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories: Object.values(categories),
    permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: false, share_collab: false },
    media,
    reservations: [],
    accommodations: [],
    packing: [],
    budget: [],
    collab: [],
    thingOverrides,
    timesyncherIntake: true,
  });
}

function sendText(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function startServer({ html, js, css, tripPayload }) {
  const publicFiles = {
    '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
    '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
    '/ts-thing-media/bindings.json': path.join(root, 'public/ts-thing-media/bindings.json'),
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (publicFiles[pathname]) {
      const file = await readFile(publicFiles[pathname]);
      const type = pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname === '/manifest.webmanifest') {
      return sendText(res, 200, JSON.stringify({ name: 'TimeSyncher Vacation', start_url: '/' }), 'application/manifest+json');
    }
    if (pathname.startsWith('/icons/')) return sendText(res, 200, '', 'image/png');
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    if (pathname.startsWith('/api/pdf/qr.svg')) {
      return sendText(
        res,
        200,
        '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#fff"/><path d="M8 8h12v12H8zM52 8h12v12H52zM8 52h12v12H8z" fill="#111"/></svg>',
        'image/svg+xml',
      );
    }
    if (/^\/fixture-media\//.test(pathname)) {
      return sendText(res, 200, tinyJpeg, 'image/jpeg');
    }
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) {
      return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: tripPayload.media });
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === intakeSlug) return sendJson(res, 200, tripPayload);
      return sendJson(res, 404, { error: 'missing', code: 'shared_trip_slug_not_found' });
    }
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diffRatio(aBuf, bBuf) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let diff = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ai = (a.width * y + x) << 2;
      const bi = (b.width * y + x) << 2;
      const dr = Math.abs(a.data[ai] - b.data[bi]);
      const dg = Math.abs(a.data[ai + 1] - b.data[bi + 1]);
      const db = Math.abs(a.data[ai + 2] - b.data[bi + 2]);
      if (dr + dg + db > 24) diff += 1;
      total += 1;
    }
  }
  return { diff, total, ratio: total ? diff / total : 1 };
}

async function compositeSideBySide(leftBuf, rightBuf, width) {
  const left = PNG.sync.read(leftBuf);
  const right = PNG.sync.read(rightBuf);
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: left.width + right.width + 3, height: h + 28 });
  out.data.fill(255);
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 28);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + 3, 28);
  return PNG.sync.write(out);
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  if (!clicked) throw new Error(`tab button missing: ${label}`);
}

async function openDayByDay(page, origin, dayNumber) {
  await page.goto(`${origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(
    () => (document.body?.innerText || '').includes('NYC June 2026'),
    { timeout: 120000 },
  );
  await sleep(1500);
  await clickTab(page, 'Day-by-Day');
  await sleep(1200);
  const dayClicked = await page.evaluate((day) => {
    const dayBtn = [...document.querySelectorAll('button')].find((btn) => new RegExp(`^\\s*day\\s*${day}\\s*$`, 'i').test((btn.innerText || btn.textContent || '').trim()));
    if (!dayBtn) return false;
    dayBtn.click();
    return true;
  }, dayNumber);
  if (!dayClicked) throw new Error(`day chip missing: Day ${dayNumber}`);
  await sleep(1200);
  await page.waitForFunction(
    () => [...document.querySelectorAll('div')].some((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr')),
    { timeout: 60000 },
  );
}

async function captureTimeline(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr'));
    if (!rows.length) return null;
    let top = Infinity;
    let left = Infinity;
    let right = 0;
    let bottom = 0;
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    const header = [...document.querySelectorAll('div')].find((el) => el.querySelector('[data-itinerary-day-media="1"]'));
    if (header) {
      const hr = header.getBoundingClientRect();
      top = Math.min(top, hr.top);
    }
    const pad = 8;
    return {
      x: Math.max(0, left - pad),
      y: Math.max(0, top - pad),
      width: Math.min(window.innerWidth, right - left + pad * 2),
      height: Math.min(window.innerHeight, bottom - top + pad * 2),
    };
  });
}

async function main() {
  const tripPayload = nycTripPayload();
  const [html, css, candidateJs, referenceJs] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
    readFile(referenceBundlePath, 'utf8'),
  ]);

  await mkdir(outDir, { recursive: true });

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const report = {
    outDir,
    headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    referenceBundle: referenceBundlePath,
    candidateHasDayMount: candidateJs.includes('data-day-itinerary-mount'),
    referenceHasDayMount: referenceJs.includes('data-day-itinerary-mount'),
    captures: [],
    pdfGate: null,
  };

  for (const width of widths) {
    for (const day of dayNumbers) {
      const shots = {};
      for (const phase of [
        { tag: 'nyc-reference', js: referenceJs },
        { tag: 'pr232-candidate', js: candidateJs },
      ]) {
        const app = await startServer({ html, css, js: phase.js, tripPayload });
        try {
          const page = await browser.newPage();
          await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
          await page.setRequestInterception(true);
          page.on('request', (request) => {
            const url = request.url();
            if (url.includes('/api/auth/app-config') || url.includes('/auth/app-config')) {
              request.abort('blockedbyclient');
              return;
            }
            if (
              url.startsWith(app.origin)
              || url.startsWith('data:')
              || url.startsWith('blob:')
              || url.startsWith('https://fonts.')
              || url.startsWith('https://unpkg.com')
              || url.includes('cartocdn.com')
              || url.includes('openstreetmap.org')
            ) {
              request.continue();
              return;
            }
            request.abort('blockedbyclient');
          });
          await openDayByDay(page, app.origin, day);
          const clip = await captureTimeline(page);
          if (!clip || clip.width < 40 || clip.height < 40) {
            throw new Error(`timeline clip missing day ${day} width ${width} (${phase.tag})`);
          }
          const buf = await page.screenshot({ type: 'png', clip });
          const file = path.join(outDir, `day-${day}-w${width}-${phase.tag}.png`);
          await writeFile(file, buf);
          shots[phase.tag] = { file, buf };
          await page.close();
        } finally {
          await app.close();
        }
      }
      const sideBySide = await compositeSideBySide(shots['nyc-reference'].buf, shots['pr232-candidate'].buf, width);
      const sidePath = path.join(outDir, `day-${day}-w${width}-side-by-side.png`);
      await writeFile(sidePath, sideBySide);
      const { ratio, diff, total } = diffRatio(shots['nyc-reference'].buf, shots['pr232-candidate'].buf);
      const structuralPass = !candidateJs.includes('data-day-itinerary-mount') && candidateJs.includes('gridTemplateColumns:"74px 22px 1fr"');
      report.captures.push({
        day,
        width,
        sideBySide: sidePath,
        reference: shots['nyc-reference'].file,
        candidate: shots['pr232-candidate'].file,
        pixelDiffRatio: Number(ratio.toFixed(4)),
        pixelDiffPixels: diff,
        pixelDiffTotal: total,
        timelineGridPass: structuralPass,
        note: 'Expected diff from summaries and media; grid must stay 74px/22px/1fr and no day-itinerary-mount.',
      });
    }
  }

  await browser.close();

  try {
    execFileSync('node', ['scripts/test_keepsake_style2.mjs'], { cwd: root, stdio: 'pipe', timeout: 120000 });
    report.pdfGate = { pass: true, check: 'scripts/test_keepsake_style2.mjs (keepsake markup + Big Island intake fixtures)' };
  } catch (error) {
    report.pdfGate = { pass: false, check: 'scripts/test_keepsake_style2.mjs', stderr: String(error.stderr || error.message).slice(0, 2000) };
  }

  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    path.join(outDir, 'provenance-rejected-keepsake-crops.md'),
    `# Provenance: rejected day-by-day-keepsake-390/1280.png

Those PNGs under the project agent store \`media/day-by-day-keepsake-390.png\` and \`1280.png\` were **not** NYC TREK timeline renders.

- Capture path: local-only \`scripts/capture_day_by_day_keepsake_crop.mjs\` (never committed).
- Markup: \`renderDayItineraryHtml\` + \`thingCardWebStyleTag()\` / \`THING_CARD_WEB_CSS\` from \`src/vacation/itinerary-print.mjs\`.
- Bundle: \`DAY_ROW_PATCH\` in \`trek-live-product-patches.mjs\` replaced native \`Re.map\` rows with \`tsRenderDayItinerary\` / \`data-day-itinerary-mount\` boxes.

Root fix in this PR: remove that patch; keep native NYC grid rows; inject summaries/media only inside existing rows.

Regenerated NYC side-by-sides: \`${outDir}/day-*-side-by-side.png\`.
`,
  );

  console.log(JSON.stringify(report, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  await main();
}
