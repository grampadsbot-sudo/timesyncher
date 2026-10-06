#!/usr/bin/env node
/** Day 2 NYC timeline — aligned day-section crop, reference vs candidate. */
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
const outDir = '/opt/cursor/artifacts/pr232-day2-fix';
const zipPath = '/opt/cursor/artifacts/pr232-day2-fix.zip';
const intakeSlug = 'nyc-june-fixture-pr232';
const referenceBundlePath = process.env.NYC_REFERENCE_BUNDLE || '/tmp/index-BMaU4y5m.js';
const dayNumber = 2;
const widths = [390, 1280];

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function nycTripPayload() {
  const categories = {
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
  };
  const days = [1, 2, 3, 4, 5].map((day) => ({
    id: 500 + day,
    trip_id: 99,
    day_number: day,
    date: `2026-06-${String(day + 9).padStart(2, '0')}`,
    notes: '',
    title: '',
  }));
  const places = [];
  const assignments = Object.fromEntries(days.map((day) => [String(day.id), []]));
  const thingOverrides = {};
  const media = [];
  const rows = [
    { day: 2, time: '09:00', name: 'Metropolitan Museum of Art', id: 601, summary: 'Quiet hour in the European galleries before the crowds.', cat: 'activity' },
    { day: 2, time: '12:30', name: 'Le Bernardin', id: 602, summary: 'Lunch reservation — tasting menu, dress code observed.', cat: 'restaurant' },
    { day: 2, time: '15:00', name: 'Central Park Boat House', id: 603, summary: 'Rowboat on the lake if the line is short.', cat: 'activity' },
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
    const photoPath = `/fixture-media/place-${row.id}.jpg`;
    media.push({
      id: `media-${row.id}`,
      thingId: row.id,
      place_id: row.id,
      thingName: row.name,
      dayId: day.id,
      dayNumber: row.day,
      caption: row.name,
      mediaKind: row.id === 602 ? 'video' : 'photo',
      mimeType: row.id === 602 ? 'application/octet-stream' : 'image/jpeg',
      originalName: row.id === 602 ? 'le-bernardin-clip.mp4' : 'thumb.jpg',
      publicUrl: row.id === 602 ? '/api/pdf/qr.svg?data=le-bernardin-clip' : photoPath,
      url: row.id === 602 ? '/api/pdf/qr.svg?data=le-bernardin-clip' : photoPath,
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
      description: 'TimeSyncher shared NYC timeline QA',
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
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function startServer({ html, js, css, tripPayload }) {
  const fixtureDir = path.join(root, 'public/fixture-media');
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
      return sendText(res, 200, file, pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8');
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
        '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#fff" stroke="#e5e7eb"/><path d="M8 8h12v12H8zM52 8h12v12H52zM8 52h12v12H8z" fill="#111"/></svg>',
        'image/svg+xml',
      );
    }
    if (/^\/fixture-media\/.+\.jpg$/i.test(pathname)) {
      const file = await readFile(path.join(fixtureDir, path.basename(pathname)));
      return sendText(res, 200, file, 'image/jpeg');
    }
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) {
      return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: tripPayload.media });
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === intakeSlug) return sendJson(res, 200, tripPayload);
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
  if (!clicked) throw new Error(`tab missing: ${label}`);
}

async function openDay2(page, origin) {
  await page.goto(`${origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => (document.body?.innerText || '').includes('NYC June 2026'), { timeout: 120000 });
  await sleep(1500);
  await clickTab(page, 'Day-by-Day');
  await sleep(1200);
  const ok = await page.evaluate((day) => {
    const dayBtn = [...document.querySelectorAll('button')].find((btn) => new RegExp(`^\\s*day\\s*${day}\\s*$`, 'i').test((btn.innerText || '').trim()));
    if (!dayBtn) return false;
    dayBtn.click();
    return true;
  }, dayNumber);
  if (!ok) throw new Error('Day 2 chip missing');
  await sleep(1200);
  await page.waitForFunction(
    () => [...document.querySelectorAll('div')].some((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr')),
    { timeout: 60000 },
  );
}

async function clipDaySection(page) {
  return page.evaluate(() => {
    const section = document.querySelector('[data-ts-day-timeline="1"]');
    if (section) {
      const r = section.getBoundingClientRect();
      const pad = 4;
      return {
        x: Math.max(0, r.left - pad),
        y: Math.max(0, r.top - pad),
        width: Math.min(window.innerWidth, r.width + pad * 2),
        height: Math.min(window.innerHeight, r.height + pad * 2),
      };
    }
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
    const header = document.querySelector('[data-itinerary-day-media="1"]')?.closest('[data-ts-day-timeline="1"]')
      || document.querySelector('[data-itinerary-day-media="1"]')?.parentElement;
    if (header) {
      const hr = header.getBoundingClientRect();
      top = Math.min(top, hr.top);
    }
    const pad = 4;
    return {
      x: Math.max(0, left - pad),
      y: Math.max(0, top - pad),
      width: Math.min(window.innerWidth, right - left + pad * 2),
      height: Math.min(window.innerHeight, bottom - top + pad * 2),
    };
  });
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

async function compositeSideBySide(leftBuf, rightBuf) {
  const left = PNG.sync.read(leftBuf);
  const right = PNG.sync.read(rightBuf);
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: left.width + right.width + 3, height: h });
  out.data.fill(255);
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + 3, 0);
  return PNG.sync.write(out);
}

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
  zipPath,
  headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  day: dayNumber,
  captures: [],
};

for (const width of widths) {
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
        if (url.includes('/api/auth/app-config') || url.includes('/auth/app-config')) return request.abort('blockedbyclient');
        if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('https://fonts.') || url.startsWith('https://unpkg.com')) {
          return request.continue();
        }
        request.abort('blockedbyclient');
      });
      await openDay2(page, app.origin);
      const clip = await clipDaySection(page);
      if (!clip || clip.width < 40 || clip.height < 40) throw new Error(`clip missing w${width} ${phase.tag}`);
      const buf = await page.screenshot({ type: 'png', clip });
      const file = path.join(outDir, `day-${dayNumber}-w${width}-${phase.tag}.png`);
      await writeFile(file, buf);
      shots[phase.tag] = { file, buf };
      await page.close();
    } finally {
      await app.close();
    }
  }
  const sideBySide = await compositeSideBySide(shots['nyc-reference'].buf, shots['pr232-candidate'].buf);
  const sidePath = path.join(outDir, `day-${dayNumber}-w${width}-side-by-side.png`);
  await writeFile(sidePath, sideBySide);
  const { ratio, diff, total } = diffRatio(shots['nyc-reference'].buf, shots['pr232-candidate'].buf);
  report.captures.push({
    width,
    sideBySide: sidePath,
    reference: shots['nyc-reference'].file,
    candidate: shots['pr232-candidate'].file,
    pixelDiffRatio: Number(ratio.toFixed(4)),
    pixelDiffPixels: diff,
    pixelDiffTotal: total,
    crop: 'data-ts-day-timeline day section (fallback: timeline rows bbox)',
  });
}

await browser.close();
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
execFileSync('zip', ['-j', zipPath, ...report.captures.flatMap((c) => [c.reference, c.candidate, c.sideBySide])]);
console.log(JSON.stringify(report, null, 2));
