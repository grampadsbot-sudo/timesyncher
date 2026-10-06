#!/usr/bin/env node
/** PR #225: 8 shared tabs @ 390/1280 — prod travel bundle (left) vs patched bundle (right). */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { patchSharedTripHostnameForLocalHarness } from '../src/vacation/trek-live-product-patches.mjs';
import { LOGO_TAB_SETTLE_MS, stitchLogoChipCropsPng } from './shepherd-staging-smoke-logo-metrics.mjs';
import { clickSharedTabByKeyword } from './shepherd-staging-smoke-shared-ui.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from './fixtures/nyc-pr225-shared-trip.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outRoot = process.argv[2] || '/opt/cursor/artifacts/pr225-nyc-sbs-r2';
const slug = NYC_PR225_SLUG;
const bundleName = 'index-BMaU4y5m.js';
const travelBase = String(process.env.TIMESYNCHER_TRAVEL_BASE_URL || '').replace(/\/$/, '')
  || `https://${['travel', 'timesyncher', 'com'].join('.')}`;
const prodBundleUrl = `${travelBase}/assets/${bundleName}`;

const TABS = [
  ['Day-by-Day', 'day-by-day'],
  ['Flights', 'flights'],
  ['Hotels', 'hotels'],
  ['Cars', 'cars'],
  ['Restaurants', 'restaurants'],
  ['Stores', 'stores'],
  ['The Rest', 'events'],
  ['Budget', 'budget'],
];

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function solidPng(size, rgb) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
      raw[i + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

async function loadProdBundle() {
  const cache = path.join(outRoot, bundleName);
  try {
    return await readFile(cache);
  } catch {
    const res = await fetch(prodBundleUrl);
    if (!res.ok) throw new Error(`fetch ${prodBundleUrl} HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(outRoot, { recursive: true });
    await writeFile(cache, buf);
    return buf;
  }
}

async function startServer({ html, js, css, tripPayload, logo, bundlePath }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === bundlePath) return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname === '/post-purchase-gate.mjs') {
      try {
        return send(res, 200, await readFile(path.join(root, 'public/post-purchase-gate.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname === '/ts-timeline-icon-patch.js') {
      try {
        return send(res, 200, await readFile(path.join(root, 'public/ts-timeline-icon-patch.js'), 'utf8'), 'text/javascript; charset=utf-8');
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname === '/ts-car-brand-filter.js' || pathname === '/ts-thing-media-overlay.js') {
      try {
        return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname === '/ts-thing-media/bindings.json') {
      try {
        return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname === '/src/onboarding/eula-markdown.mjs') {
      try {
        return send(res, 200, await readFile(path.join(root, 'src/onboarding/eula-markdown.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname.endsWith('/edit-access')) {
      return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/icons/')) {
      try {
        const rel = pathname.slice(1);
        const filePath = pathname.endsWith('timesyncher-icon-black-transparent.png')
          ? path.join(root, 'public/icons/icon.svg')
          : path.join(root, 'public', rel);
        const body = await readFile(filePath);
        const type = filePath.endsWith('.svg') ? 'image/svg+xml' : filePath.endsWith('.png') ? 'image/png' : 'application/octet-stream';
        return send(res, 200, body, type);
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname.endsWith('.png') || pathname.endsWith('.ico') || pathname.endsWith('.svg')) return send(res, 200, logo, 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === slug) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/ts-') && pathname.endsWith('.js')) {
      try {
        return send(res, 200, await readFile(path.join(root, pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
      } catch {
        return send(res, 404, 'no', 'text/plain');
      }
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const FIXED_CLIP = { '390': 542, '1280': 537 };

async function captureTab(page, label, viewportTag, pinnedY) {
  let clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button,[role="tab"]')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.scrollIntoView({ block: 'nearest', inline: 'center' });
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  if (!clicked) {
    const keywords = [];
    const norm = String(label || '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .trim()
      .toLowerCase();
    if (norm.includes('day-by-day') || norm.includes('day by day')) keywords.push('day-by-day', 'day');
    else if (norm.includes('rest')) keywords.push('rest', 'event');
    else if (norm.includes('hotel')) keywords.push('hotels', 'hotel');
    else if (norm.includes('flight')) keywords.push('flights', 'flight');
    else if (norm.includes('car')) keywords.push('cars', 'car');
    else keywords.push(norm, norm.split(/\s+/)[0]);
    for (const kw of [...new Set(keywords.filter(Boolean))]) {
      if (await clickSharedTabByKeyword(page, kw)) {
        clicked = true;
        break;
      }
    }
  }
  if (!clicked) throw new Error(`tab not found: ${label}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
  const clip = await page.evaluate((want, yPin) => {
    const tab = [...document.querySelectorAll('button,[role="tab"]')].find((btn) => btn.getAttribute('aria-label') === want)
      || [...document.querySelectorAll('button,[role="tab"]')].find((btn) => {
        const normalize = (text) => String(text || '')
          .replace(/\p{Extended_Pictographic}/gu, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        const target = normalize(want);
        const combined = normalize([btn.textContent, btn.getAttribute('title'), btn.getAttribute('aria-label')].join(' '));
        return combined.includes(target) || (target.includes('day') && combined.includes('day-by-day'));
      });
    const top = tab ? tab.getBoundingClientRect().top : 0;
    const y = typeof yPin === 'number' ? yPin : Math.max(0, top - 8);
    return { x: 0, y, width: window.innerWidth, height: 560 };
  }, label, pinnedY);
  const fixedH = FIXED_CLIP[viewportTag] || 560;
  clip.height = fixedH;
  clip.width = clip.width || (viewportTag === '1280' ? 1280 : 390);
  return page.screenshot({ type: 'png', encoding: 'binary', clip });
}

async function main() {
  const fixture = buildNycPr225SharedTrip();
  const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(fixture));
  tripPayload.trip = {
    ...tripPayload.trip,
    title: `TimeSyncher ${tripPayload.trip?.title || 'trip'}`,
    description: `TimeSyncher ${tripPayload.trip?.description || ''}`.trim(),
  };
  const bundlePath = `/assets/${bundleName}`;
  const prodBundle = patchSharedTripHostnameForLocalHarness((await loadProdBundle()).toString('utf8'));
  const [htmlRaw, css, patchedBundle] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-BKun7ofk.js')),
  ]);
  const html = htmlRaw.replace("trek.src = '/assets/index-BKun7ofk.js'", `trek.src = '${bundlePath}'`);
  const logo = solidPng(18, [15, 118, 110]);
  await mkdir(outRoot, { recursive: true });

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const viewports = [
    { width: 390, height: 844, tag: '390' },
    { width: 1280, height: 800, tag: '1280' },
  ];

  try {
    for (const viewport of viewports) {
      for (const [bundleLabel, js] of [['nyc-final', prodBundle], ['live-patched', patchedBundle]]) {
        const app = await startServer({ html, js, css, tripPayload, logo, bundlePath });
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const url = request.url();
          if (
            url.startsWith(app.origin)
            || url.startsWith('data:')
            || url.startsWith('blob:')
            || url.includes('fonts.googleapis.com')
            || url.includes('fonts.gstatic.com')
            || url.includes('unpkg.com/leaflet')
          ) {
            request.continue();
          } else {
            request.abort('blockedbyclient');
          }
        });
        await page.setViewport({ width: viewport.width, height: viewport.height });
        await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(
          () => /Day-by-Day/i.test(document.body?.innerText || ''),
          { timeout: 90000 },
        );
        const clipY = await page.evaluate(() => {
          const tab = [...document.querySelectorAll('button,[role="tab"]')].find((btn) => btn.getAttribute('aria-label') === 'Day-by-Day');
          const top = tab ? tab.getBoundingClientRect().top : 0;
          return Math.max(0, top - 8);
        });
        for (const [label, stem] of TABS) {
          const shot = await captureTab(page, label, viewport.tag, clipY);
          await writeFile(path.join(outRoot, `${bundleLabel}-${stem}-${viewport.tag}.png`), shot);
        }
        await page.close();
        await app.close();
      }
      for (const [, stem] of TABS) {
        const left = await readFile(path.join(outRoot, `nyc-final-${stem}-${viewport.tag}.png`));
        const right = await readFile(path.join(outRoot, `live-patched-${stem}-${viewport.tag}.png`));
        await stitchLogoChipCropsPng([left, right], path.join(outRoot, `${stem}-${viewport.tag}-side-by-side.png`));
      }
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ outRoot, zip: '/opt/cursor/artifacts/pr225-nyc-sbs-r2.zip', bundleName, viewports: viewports.map((v) => v.tag), tabs: TABS.map((t) => t[1]) }));

  const { execFileSync } = await import('node:child_process');
  execFileSync('zip', ['-qr', '/opt/cursor/artifacts/pr225-nyc-sbs-r2.zip', '.'], { cwd: outRoot });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
