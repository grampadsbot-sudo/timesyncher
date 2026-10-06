import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import { qrSvg } from '../../src/vacation/qr-svg.mjs';
import { allowedQrPayload, qrPayloadFromUrl } from '../../src/vacation/pdf-qr-svg-handler.mjs';

const QR_DISPLAY_SIZE = 72;

export function loadPuppeteer(root) {
  const require = createRequire(path.join(root, 'package.json'));
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

export function nycTripPayload({ withMedia, intakeSlug }) {
  const categories = {
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
    hotel: { id: 4, name: 'Hotel', icon: '🏨' },
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
    { day: 1, time: '10:30', name: 'JFK arrival & AirTrain', id: 571, summary: 'Land mid-morning; grab coffee before the ride in.', cat: 'activity' },
    { day: 1, time: '16:00', name: 'Midtown hotel check-in', id: 572, summary: 'Drop bags and confirm late checkout for departure day.', cat: 'hotel' },
    { day: 1, time: '19:00', name: 'West Village welcome dinner', id: 573, summary: 'Keep it casual — walk-ins OK after 8 if plans shift.', cat: 'restaurant' },
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
      logo_url: '/icons/timesyncher-icon-black-transparent.png',
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

export function absolutizeMediaUrls(payload, origin) {
  const abs = (u) => {
    const rel = String(u || '');
    if (!rel || /^https?:\/\//i.test(rel)) return rel;
    return `${origin}${rel.startsWith('/') ? rel : `/${rel}`}`;
  };
  return {
    ...payload,
    trip: payload.trip ? { ...payload.trip, logo_url: abs(payload.trip.logo_url) } : payload.trip,
    media: (payload.media || []).map((row) => ({
      ...row,
      url: abs(row.url),
      publicUrl: abs(row.publicUrl),
      thumbnailUrl: abs(row.thumbnailUrl || row.url),
    })),
  };
}

function sendText(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

export async function startServer({ root, html, js, css, buildPayload, intakeSlug }) {
  let origin = '';
  const fixtureDir = path.join(root, 'public/fixture-media');
  const iconPath = path.join(root, 'public/icons/timesyncher-icon-black-transparent.png');
  const publicFiles = {
    '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
    '/icons/timesyncher-icon-black-transparent.png': iconPath,
  };
  const server = createServer(async (req, res) => {
    const tripPayload = buildPayload(origin);
    const url = new URL(req.url || '/', origin || 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (publicFiles[pathname]) {
      const file = await readFile(publicFiles[pathname]);
      const type = pathname.endsWith('.png') ? 'image/png' : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname === '/manifest.webmanifest') {
      return sendText(res, 200, JSON.stringify({ name: 'TimeSyncher Vacation', start_url: '/' }), 'application/manifest+json');
    }
    if (pathname.startsWith('/icons/') && pathname !== '/icons/timesyncher-icon-black-transparent.png') {
      return sendText(res, 200, '', 'image/png');
    }
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    if (pathname.startsWith('/api/pdf/qr.svg')) {
      const payload = qrPayloadFromUrl(`${origin}${req.url || ''}`);
      if (!allowedQrPayload(payload)) return sendText(res, 400, 'bad qr payload', 'text/plain; charset=utf-8');
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
  return { origin, close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))) };
}

export function sleep(ms) {
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

export async function openDay(page, origin, dayNumber, intakeSlug) {
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
  if (!ok) throw new Error(`Day ${dayNumber} chip missing`);
  await sleep(1200);
  await page.waitForFunction(
    () => [...document.querySelectorAll('div')].some((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr')),
    { timeout: 60000 },
  );
}

export async function clipFullDaySection(page, dayNumber) {
  return page.evaluate((day) => {
    const pad = 6;
    const union = (a, b) => ({
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    });
    let box = null;
    const timeline = document.querySelector('[data-ts-day-timeline="1"]');
    if (timeline) box = timeline.getBoundingClientRect();
    const rows = [...document.querySelectorAll('div')].filter((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr'));
    for (const el of rows) box = box ? union(box, el.getBoundingClientRect()) : el.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.max(0, box.left - pad),
      y: Math.max(0, box.top - pad),
      width: box.right - box.left + pad * 2,
      height: box.bottom - box.top + pad * 2,
      day,
    };
  }, dayNumber);
}

export async function readLayoutSignals(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter((el) => (el.style?.gridTemplateColumns || '').includes('74px 22px 1fr'));
    let root = rows[0]?.parentElement || null;
    while (root && root !== document.body) {
      if (rows[0] && root.contains(rows[0])) {
        const card = root.matches('[data-ts-day-timeline="1"]')
          || (String(root.style?.borderRadius || '').includes('14') && String(root.style?.border || '').includes('border-faint'));
        if (card) break;
      }
      root = root.parentElement;
    }
    root = root && root !== document.body ? root : document.querySelector('[data-ts-day-timeline="1"]');
    const headerRow = root?.querySelector('div[style*="padding"][style*="borderBottom"]');
    const headerButtons = headerRow ? headerRow.querySelectorAll('button').length : 0;
    const tripHeaderLogo = [...document.querySelectorAll('header img, [data-ts-logo-chip] img, img[src*="timesyncher"]')].find(
      (img) => img.naturalWidth > 0,
    );
    const emptyMediaSquares = rows.reduce((n, row) => {
      const dead = [...(row.parentElement?.querySelectorAll('.print-media-card') || [])].filter(
        (el) => !el.querySelector('img[src], img[data-logo-src]'),
      );
      return n + dead.length;
    }, 0);
    const scope = root || document.body;
    return {
      hasDayContainer: Boolean(root),
      candidateDayMarker: Boolean(document.querySelector('[data-ts-day-timeline="1"]')),
      headerButtons,
      tripHeaderLogoLoaded: Boolean(tripHeaderLogo),
      rowCount: rows.length,
      rowGridOk: rows.length > 0 && rows.every((r) => (r.style?.gridTemplateColumns || '').includes('74px 22px 1fr')),
      emptyMediaSquares,
      timelineMediaMounts: scope.querySelectorAll('[data-itinerary-day-media="1"],[data-itinerary-row-media="1"]').length,
      timelineImages: [...scope.querySelectorAll('img')].map((img) => ({
        naturalWidth: img.naturalWidth,
        src: img.currentSrc || img.src,
      })),
    };
  });
}

export async function getExcludeRects(page, clip) {
  return page.evaluate((clipBox) => {
    const pad = 3;
    const sel = [
      '[data-row-summary]',
      '[data-itinerary-day-media]',
      '[data-itinerary-row-media]',
      '.print-media-card',
      '[data-ts-timeline-icon]',
      '[data-ts-timeline-title]',
    ].join(', ');
    const rects = [];
    const push = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      rects.push({
        x: Math.max(0, Math.floor(r.left - clipBox.x - pad)),
        y: Math.max(0, Math.floor(r.top - clipBox.y - pad)),
        w: Math.ceil(r.width + pad * 2),
        h: Math.ceil(r.height + pad * 2),
      });
    };
    for (const el of document.querySelectorAll(sel)) push(el);
    for (const style of document.querySelectorAll('[data-ts-day-timeline="1"] style')) {
      if (style.parentElement) push(style.parentElement);
    }
    return rects;
  }, clip);
}

function pixelInRect(x, y, rects) {
  return rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

export function diffRatioMasked(aBuf, bBuf, excludeRects) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let diff = 0;
  let total = 0;
  let rawDiff = 0;
  let rawTotal = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ai = (a.width * y + x) << 2;
      const bi = (b.width * y + x) << 2;
      const dr = Math.abs(a.data[ai] - b.data[bi]);
      const dg = Math.abs(a.data[ai + 1] - b.data[bi + 1]);
      const db = Math.abs(a.data[ai + 2] - b.data[bi + 2]);
      const changed = dr + dg + db > 24;
      rawTotal += 1;
      if (changed) rawDiff += 1;
      if (pixelInRect(x, y, excludeRects)) continue;
      total += 1;
      if (changed) diff += 1;
    }
  }
  return {
    masked: { diff, total, ratio: total ? diff / total : 0 },
    raw: { diff: rawDiff, total: rawTotal, ratio: rawTotal ? rawDiff / rawTotal : 1 },
  };
}

export async function compositeSideBySide(leftBuf, rightBuf) {
  const left = PNG.sync.read(leftBuf);
  const right = PNG.sync.read(rightBuf);
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: left.width + right.width + 3, height: h });
  out.data.fill(255);
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + 3, 0);
  return PNG.sync.write(out);
}
