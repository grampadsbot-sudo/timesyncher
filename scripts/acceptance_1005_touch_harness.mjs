import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { sendCachedBindingMedia } from '../src/vacation/bind-thing-media-cache.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const COPY_SLUG = 'demo-acceptance-1005-local';
const COPY_TRIP_ID = 1005005;
export const COPY_BIND_VIDEO_ID = '6ba36f2a-e9f2-467e-9e61-3aac64fe165a';
const NYC_STATUE_VIDEO_BINDING_ID = 'nyc-bind-video-day2';
const COPY_VIDEO_PACK = ['las', 'vegas', 'vacation', '3'].join('-');
const FIXTURE_MP4 = `public/ts-thing-media/${COPY_VIDEO_PACK}/bellagio-fountain-night-video.mp4`;

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

function rewriteCopyMediaUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  return url
    .replace(/shareToken=[^&]+/gi, `shareToken=${encodeURIComponent(COPY_SLUG)}`)
    .replace(new RegExp(`id=${NYC_STATUE_VIDEO_BINDING_ID}`, 'gi'), `id=${COPY_BIND_VIDEO_ID}`);
}

function remapCopyVideoRow(row) {
  if (!row || (row.mediaKind !== 'video' && row.kind !== 'video' && !String(row.mimeType || '').startsWith('video/'))) {
    return row;
  }
  const next = { ...row, id: COPY_BIND_VIDEO_ID, shareToken: COPY_SLUG };
  for (const key of ['url', 'publicUrl', 'public_url', 'thumbnail_url', 'thumbnailUrl']) {
    if (next[key]) next[key] = rewriteCopyMediaUrl(next[key]);
  }
  return next;
}

export function cloneCopyTripPayload() {
  const payload = structuredClone(buildNycCraigKimDaybydayTrip());
  payload.trip.id = COPY_TRIP_ID;
  for (const day of payload.days || []) day.trip_id = COPY_TRIP_ID;
  if (Array.isArray(payload.media)) payload.media = payload.media.map(remapCopyVideoRow);
  for (const place of payload.places || []) {
    for (const key of ['bound_media', 'media', 'photos', 'videos']) {
      if (Array.isArray(place[key])) place[key] = place[key].map(remapCopyVideoRow);
    }
  }
  return finalizeServedSharedTripPayload(payload);
}

function servedBundleJs() {
  const upstream = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf8',
  });
  const js = renderServedTrekBundle(upstream);
  assert.match(js, /tsPicScrollHint/);
  assert.match(js, /tsThingTimelineMedia=/);
  assert.match(js, /controls:!0,playsInline:!0,preload:"metadata"/);
  return js;
}

export async function startLocalPreview(tripPayload) {
  const [html, css] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  ]);
  const js = servedBundleJs();
  const publicJs = [
    '/vacation-app-request.js',
    '/ts-timeline-icon-patch.js',
    '/ts-pic-popup-viewer.js',
    '/ts-car-brand-filter.js',
    '/ts-thing-media-overlay.js',
    '/post-purchase-gate.mjs',
  ];
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/json; charset=utf-8');
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/ts-thing-media/') && pathname !== '/ts-thing-media/bindings.json') {
      const assetPath = path.join(root, 'public', pathname.replace(/^\//, ''));
      if (existsSync(assetPath)) {
        const mime = assetPath.toLowerCase().endsWith('.mp4') ? 'video/mp4' : assetPath.toLowerCase().endsWith('.webm') ? 'video/webm' : 'image/jpeg';
        return send(res, 200, await readFile(assetPath), mime);
      }
      return send(res, 200, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg');
    }
    if (pathname === '/api/bind-thing-media') {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const raw = url.searchParams.get('raw') === '1';
      const id = decodeURIComponent(url.searchParams.get('id') || '');
      if (raw && id === COPY_BIND_VIDEO_ID && (req.method === 'GET' || req.method === 'HEAD')) {
        const bytes = await readFile(path.join(root, FIXTURE_MP4));
        sendCachedBindingMedia(res, req, { bytes, mimeType: 'video/mp4', originalName: 'bellagio-fountain-night-video.mp4' });
        return;
      }
    }
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      const assetPath = path.join(root, 'public', pathname.replace(/^\//, ''));
      if (existsSync(assetPath)) return send(res, 200, await readFile(assetPath), 'image/png');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === COPY_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))) };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function clickDayChip(page, dayNum) {
  await page.evaluate((n) => {
    const btn = [...document.querySelectorAll('button')].find((b) => new RegExp(`^Day ${n}\\b`, 'i').test(String(b.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!btn) throw new Error(`day chip not found: Day ${n}`);
    btn.click();
  }, dayNum);
}

export async function clickTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button')) {
      const text = (btn.getAttribute('aria-label') || btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (new RegExp(`^${want}$`, 'i').test(text)) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  assert.ok(clicked, `tab missing: ${label}`);
}

export async function openThingDetailByName(page, nameRe) {
  const hit = await page.evaluate((reSource) => {
    const re = new RegExp(reSource, 'i');
    const listRow = [...document.querySelectorAll('li[data-list-row="1"] button,[data-ts-day-timeline] button')].find((btn) =>
      re.test(String(btn.getAttribute('aria-label') || btn.textContent || '').replace(/\s+/g, ' ').trim()),
    );
    if (!listRow) return { err: 'row-missing' };
    listRow.scrollIntoView({ block: 'center' });
    const r = listRow.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, nameRe.source || nameRe);
  assert.ok(hit && !hit.err, `detail row missing for /${nameRe}/: ${JSON.stringify(hit)}`);
  await page.touchscreen.tap(hit.x, hit.y);
  await sleep(900);
  await page.waitForSelector('[data-ts-detail-name]', { timeout: 60000 });
}

export function popupAuditScript() {
  const vw = window.innerWidth;
  const margin = 4;
  const popup = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]');
  if (!popup) return { open: false };
  const rect = popup.getBoundingClientRect();
  const inView = rect.left >= margin && rect.top >= margin && rect.right <= vw - margin && rect.bottom <= window.innerHeight - margin;
  const buttons = ['[data-ts-pic-popup-close="1"]', '[data-ts-pic-size-toggle="1"]', '[data-ts-pic-fs-btn="1"]'].map((sel) => {
    const btn = popup.querySelector(sel);
    if (!btn) return { sel, found: false };
    const r = btn.getBoundingClientRect();
    return { sel, found: true, tappable: r.width >= 40 && r.height >= 40 && r.left >= margin && r.right <= vw - margin && r.top >= margin };
  });
  return { open: true, inView, rect: { width: rect.width }, buttons, vw };
}

export function detailHeaderAuditScript() {
  const header = document.querySelector('[data-ts-thing-header="1"][data-ts-detail-title-wrap="1"]');
  const title = document.querySelector('[data-ts-detail-name]');
  const photos = document.querySelector('[data-ts-detail-photos="1"]');
  if (!header || !title || !photos) return { ok: false, reason: 'detail-missing' };
  const headerMedia = [...header.querySelectorAll('img,video')].filter((el) => !el.closest('[data-ts-detail-logo-chip="1"]')).length;
  const titleStyle = getComputedStyle(title);
  const titleRect = title.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const titleUsesWordWrap = ['anywhere', 'break-word'].includes(titleStyle.overflowWrap) || ['normal', 'pre-wrap'].includes(titleStyle.whiteSpace);
  const sectionVideo = photos.querySelector('video');
  return {
    ok: headerMedia === 0 && titleUsesWordWrap && titleRect.width >= Math.min(headerRect.width * 0.45, window.innerWidth * 0.42) && Boolean(sectionVideo),
    headerMedia,
    titleUsesWordWrap,
    titleWidth: titleRect.width,
    sectionHasVideo: Boolean(sectionVideo),
  };
}