#!/usr/bin/env node
/** Day 2 NYC — reference bundle (no media) vs candidate; full day-section crop. */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { qrSvg } from '../src/vacation/qr-svg.mjs';
import { allowedQrPayload, qrPayloadFromUrl } from '../src/vacation/pdf-qr-svg-handler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outDir = '/opt/cursor/artifacts/pr232-day2-final';
const zipPath = '/opt/cursor/artifacts/pr232-day2-final.zip';
const intakeSlug = 'nyc-june-fixture-pr232';
const referenceBundlePath = process.env.NYC_REFERENCE_BUNDLE || '/tmp/index-BMaU4y5m.js';
const dayNumber = 2;
const widths = [390, 1280];
const QR_DISPLAY_SIZE = 72;

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function nycTripPayload({ withMedia }) {
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
    if (withMedia) {
      const photoPath = `/fixture-media/place-${row.id}.jpg`;
      const videoPlayback = `/shared/${intakeSlug}/`;
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
        publicUrl: row.id === 602 ? `/api/pdf/qr.svg?data=${encodeURIComponent(videoPlayback)}` : photoPath,
        url: row.id === 602 ? `/api/pdf/qr.svg?data=${encodeURIComponent(videoPlayback)}` : photoPath,
        thumbnailUrl: row.id === 602 ? undefined : photoPath,
        kind: row.id === 602 ? 'video' : 'photo',
      });
    }
  }
  if (withMedia) {
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
  }
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

function absolutizeMediaUrls(payload, origin) {
  const media = (payload.media || []).map((row) => {
    const abs = (u) => {
      const rel = String(u || '');
      if (!rel || /^https?:\/\//i.test(rel)) return rel;
      return `${origin}${rel.startsWith('/') ? rel : `/${rel}`}`;
    };
    const url = abs(row.url);
    return {
      ...row,
      url,
      publicUrl: abs(row.publicUrl),
      thumbnailUrl: abs(row.thumbnailUrl || row.url),
    };
  });
  return { ...payload, media };
}

async function readLayoutSignals(page) {
  return page.evaluate(() => {
    const timeline = document.querySelector('[data-ts-day-timeline="1"]');
    const rows = [...document.querySelectorAll('div')].filter((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr'));
    const rowEmojis = rows.map((row) => {
      const iconCell = row.children[1];
      return (iconCell?.innerText || iconCell?.textContent || '').trim();
    });
    const imgs = timeline ? [...timeline.querySelectorAll('img')] : [];
    return {
      rowEmojis,
      timelineMediaMounts: timeline
        ? timeline.querySelectorAll('[data-itinerary-day-media="1"],[data-itinerary-row-media="1"]').length
        : 0,
      timelineImages: imgs.map((img) => ({
        src: img.currentSrc || img.src,
        naturalWidth: img.naturalWidth,
        alt: img.alt,
      })),
    };
  });
}

function sendText(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function startServer({ html, js, css, buildPayload }) {
  let origin = '';
  const fixtureDir = path.join(root, 'public/fixture-media');
  const publicFiles = {
    '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
    '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
    '/ts-thing-media/bindings.json': path.join(root, 'public/ts-thing-media/bindings.json'),
  };
  const server = createServer(async (req, res) => {
    const tripPayload = buildPayload(origin);
    const url = new URL(req.url || '/', origin || 'http://127.0.0.1');
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
      const payload = qrPayloadFromUrl(`${origin}${req.url || ''}`);
      if (!allowedQrPayload(payload)) {
        return sendText(res, 400, 'bad qr payload', 'text/plain; charset=utf-8');
      }
      return sendText(res, 200, qrSvg(payload, { size: QR_DISPLAY_SIZE }), 'image/svg+xml; charset=utf-8');
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
  origin = `http://127.0.0.1:${port}`;
  return {
    origin,
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

async function clipFullDaySection(page) {
  return page.evaluate(() => {
    const pad = 6;
    const union = (a, b) => ({
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    });
    let box = null;
    const timeline = document.querySelector('[data-ts-day-timeline="1"]');
    if (timeline) {
      box = timeline.getBoundingClientRect();
    }
    const rows = [...document.querySelectorAll('div')].filter((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr'));
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      box = box ? union(box, r) : r;
    }
    const dayHead = [...document.querySelectorAll('div,section')].find((el) => {
      const t = (el.innerText || '').trim();
      return /day\s*2/i.test(t) && el.contains(rows[0] || timeline);
    });
    if (dayHead) box = union(box || dayHead.getBoundingClientRect(), dayHead.getBoundingClientRect());
    if (!box) return null;
    return {
      x: Math.max(0, box.left - pad),
      y: Math.max(0, box.top - pad),
      width: box.right - box.left + pad * 2,
      height: box.bottom - box.top + pad * 2,
    };
  });
}

async function assertTimelineImages(page, phaseTag) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-ts-day-timeline="1"]');
      if (!root) return false;
      const imgs = [...root.querySelectorAll('img')];
      if (!imgs.length) return false;
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    { timeout: 60000 },
  );
  await page.evaluate(async () => {
    const root = document.querySelector('[data-ts-day-timeline="1"]') || document.body;
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(
      imgs.map(async (img) => {
        if (!img.decode) return;
        try {
          await img.decode();
        } catch {
          img.setAttribute('data-decode-failed', '1');
        }
      }),
    );
  });
  const broken = await page.evaluate(() => {
    const root = document.querySelector('[data-ts-day-timeline="1"]') || document.body;
    return [...root.querySelectorAll('img')]
      .filter((img) => !(img.naturalWidth > 0))
      .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt, naturalWidth: img.naturalWidth }));
  });
  if (broken.length) {
    throw new Error(`timeline img naturalWidth check failed (${phaseTag}): ${JSON.stringify(broken)}`);
  }
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
  referenceBundle: referenceBundlePath,
  day: dayNumber,
  captures: [],
};

for (const width of widths) {
  const shots = {};
  const layout = {};
  for (const phase of [
    { tag: 'nyc-reference', js: referenceJs, withMedia: false, assertImages: false },
    { tag: 'pr232-candidate', js: candidateJs, withMedia: true, assertImages: true },
  ]) {
    const basePayload = nycTripPayload({ withMedia: phase.withMedia });
    const app = await startServer({
      html,
      css,
      js: phase.js,
      buildPayload: (origin) => (phase.withMedia ? absolutizeMediaUrls(basePayload, origin) : basePayload),
    });
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
      let clip = await clipFullDaySection(page);
      if (!clip || clip.width < 40 || clip.height < 40) throw new Error(`clip missing w${width} ${phase.tag}`);
      const vpHeight = Math.ceil(clip.y + clip.height + 32);
      if (vpHeight > 900) {
        await page.setViewport({ width, height: Math.min(vpHeight, 4000), deviceScaleFactor: 1 });
        await sleep(400);
        clip = await clipFullDaySection(page);
      }
      if (phase.assertImages) await assertTimelineImages(page, phase.tag);
      layout[phase.tag] = await readLayoutSignals(page);
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
  const refSig = layout['nyc-reference'];
  const candSig = layout['pr232-candidate'];
  const layoutChecks = {
    referenceNoTimelineMedia: refSig.timelineMediaMounts === 0,
    candidateImagesLoaded: candSig.timelineImages.every((img) => img.naturalWidth > 0),
    rowEmojisMatch: JSON.stringify(refSig.rowEmojis) === JSON.stringify(candSig.rowEmojis),
    referenceEmojis: refSig.rowEmojis,
    candidateEmojis: candSig.rowEmojis,
  };
  layoutChecks.pass = layoutChecks.referenceNoTimelineMedia
    && layoutChecks.candidateImagesLoaded
    && layoutChecks.rowEmojisMatch;
  report.captures.push({
    width,
    sideBySide: sidePath,
    reference: shots['nyc-reference'].file,
    candidate: shots['pr232-candidate'].file,
    pixelDiffRatio: Number(ratio.toFixed(4)),
    pixelDiffPixels: diff,
    pixelDiffTotal: total,
    crop: 'full day section (header through last timeline row)',
    layoutChecks,
  });
}

report.layoutMatchPass = report.captures.every((c) => c.layoutChecks?.pass);
report.captureRound = 2;

await browser.close();
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
execFileSync('zip', ['-j', zipPath, ...report.captures.flatMap((c) => [c.reference, c.candidate, c.sideBySide])]);
console.log(JSON.stringify(report, null, 2));
