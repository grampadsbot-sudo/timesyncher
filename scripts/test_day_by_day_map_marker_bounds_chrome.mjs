#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildNycCraigKimDaybydayTripPositiveV1 } from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import { NYC_DAYBYDAY_SLUG } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const MAX_MARKER_PX = 32;
const widths = [390, 1280];

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

async function startServer({ html, js, css, tripPayload, logoPng }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname.endsWith('.png') || pathname.endsWith('.ico') || pathname.endsWith('.svg')) {
      return send(res, 200, logoPng, 'image/png');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{}', 'application/json');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function assertMarkerBoxes(boxes, width) {
  assert.ok(boxes.length >= 1, `day-by-day map must render markers at ${width}px`);
  for (const [index, box] of boxes.entries()) {
    for (const [kind, dims] of [
      ['marker', box.marker],
      ['img', box.img],
    ]) {
      if (!dims) continue;
      assert.ok(
        dims.w <= MAX_MARKER_PX && dims.h <= MAX_MARKER_PX,
        `${width}px marker ${index} ${kind} ${dims.w}x${dims.h} exceeds ${MAX_MARKER_PX}px`,
      );
    }
  }
}

const js = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTripPositiveV1());
const logoPng = solidPng(128, [180, 40, 40]);

const app = await startServer({ html, js, css, tripPayload, logoPng });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  for (const width of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('[data-ts-day-map="1"] .leaflet-marker-icon', { timeout: 120000 });
    const boxes = await page.evaluate(() => {
      const map = document.querySelector('[data-ts-day-map="1"]');
      return [...map.querySelectorAll('.leaflet-marker-icon')].map((el) => {
        const r = el.getBoundingClientRect();
        const img = el.querySelector('img');
        const ir = img ? img.getBoundingClientRect() : null;
        return {
          marker: { w: r.width, h: r.height },
          img: ir ? { w: ir.width, h: ir.height } : null,
        };
      });
    });
    assertMarkerBoxes(boxes, width);
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}

console.log('day-by-day map marker bounds chrome tests passed');
