#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const slug = 'intake-435a4d049b1d';
const widths = [390, 1280];
const tabs = [
  ['Day-by-Day', 'day-by-day'],
  ['Flights', 'flights'],
  ['Hotels', 'hotels'],
  ['Cars', 'cars'],
  ['Restaurants', 'restaurants'],
  ['Stores', 'stores'],
  ['The Rest', 'the-rest'],
  ['Budget', 'budget'],
];
const artifactRoot = process.env.SHARED_OVERFLOW_ARTIFACT_ROOT || '';
const tabShotRoot = process.env.PR225_TAB_ARTIFACT_ROOT || '';

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

async function startServer({ html, js, css, tripPayload, logo }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname.endsWith('.png') || pathname.endsWith('.ico') || pathname.endsWith('.svg')) return send(res, 200, logo, 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === slug) return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      return send(res, 404, '{}', 'application/json');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{}', 'application/json');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function overflowProbe() {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('button')].map((btn) => {
    const box = btn.getBoundingClientRect();
    return { label: btn.getAttribute('aria-label') || '', right: Math.round(box.right) };
  }).filter((btn) => btn.right > window.innerWidth + 1);
  return { scrollWidth: root.scrollWidth, innerWidth: window.innerWidth, buttons };
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/intake-435a4d049b1d.json'), 'utf8'));
const tripPayload = finalizeServedSharedTripPayload(fixture);
tripPayload.trip = {
  ...tripPayload.trip,
  title: `TimeSyncher ${tripPayload.trip?.title || 'trip'}`,
  description: `TimeSyncher ${tripPayload.trip?.description || ''}`.trim(),
};
const [html, css, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const logo = solidPng(18, [15, 118, 110]);
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const app = await startServer({ html, js, css, tripPayload, logo });
const failures = [];
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:')) request.continue();
    else request.abort('blockedbyclient');
  });
  if (artifactRoot) await mkdir(artifactRoot, { recursive: true });
  if (tabShotRoot) await mkdir(tabShotRoot, { recursive: true });
  for (const width of widths) {
    const height = width === 390 ? 844 : 800;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => /TimeSyncher/.test(document.body?.innerText || ''), { timeout: 90000 });
    for (const [label, fileStem] of tabs) {
      const clicked = await page.evaluate((want) => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.getAttribute('aria-label') === want) {
            btn.click();
            return true;
          }
        }
        return false;
      }, label);
      assert.equal(clicked, true, `missing tab ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const measure = await page.evaluate(overflowProbe);
      if (measure.scrollWidth > measure.innerWidth) failures.push({ width, label, ...measure });
      if (tabShotRoot) {
        await page.screenshot({ path: path.join(tabShotRoot, `${fileStem}-${width}.png`) });
        if (fileStem === 'flights') {
          const sortClip = await page.evaluate(() => {
            const header = document.querySelector('[data-ts-list-sort-header]');
            if (!header) return null;
            const box = header.getBoundingClientRect();
            return {
              x: Math.max(0, Math.floor(box.left - 8)),
              y: Math.max(0, Math.floor(box.top - 4)),
              width: Math.min(window.innerWidth, Math.ceil(box.width + 16)),
              height: Math.min(140, Math.ceil(box.height + 12)),
            };
          });
          if (sortClip) {
            await page.screenshot({
              path: path.join(tabShotRoot, `flights-sort-after-${width}.png`),
              clip: sortClip,
            });
          }
        }
      }
      if (artifactRoot && ['Cars', 'Hotels', 'Restaurants'].includes(label)) {
        const file = path.join(artifactRoot, `${label.toLowerCase()}-${width}.png`);
        const clip = await page.evaluate((want) => {
          const tab = [...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === want);
          const top = tab ? tab.getBoundingClientRect().top : 0;
          return { x: 0, y: Math.max(0, top - 8), width: window.innerWidth, height: Math.min(560, window.innerHeight - Math.max(0, top - 8)) };
        }, label);
        await page.screenshot({ path: file, clip });
      }
      if (width === 390 && label === 'Hotels') {
        const sort = await page.evaluate(() => {
          const names = () => {
            const header = document.querySelector('[data-ts-list-sort-header]');
            const root = header?.parentElement;
            if (!root) return [];
            const rows = [...root.children].filter((el) => el !== header && el.querySelector('button[aria-label="Open thing details"]'));
            return rows.map((row) => {
              const btn = row.querySelector('button[aria-label="Open thing details"]');
              return btn ? String(btn.textContent || '').trim() : '';
            }).filter(Boolean);
          };
          const click = (which) => {
            const header = document.querySelector('[data-ts-list-sort-header]');
            const btn = [...(header ? header.querySelectorAll('button') : [])].find((el) => String(el.textContent || '').trim().toLowerCase().startsWith(which));
            if (!btn) return false;
            btn.click();
            return true;
          };
          return new Promise((resolve) => {
            const started = click('name');
            setTimeout(() => {
              const first = names();
              click('name');
              setTimeout(() => {
                const loose = [...document.querySelectorAll('button')].filter((el) => /^(name|price)/i.test(String(el.textContent || '').trim()) && !el.closest('[data-ts-list-sort-header]'));
                resolve({ started, first, second: names(), loose: loose.length });
              }, 120);
            }, 120);
          });
        });
        assert.equal(sort.started, true, 'Name column label missing');
        assert.equal(sort.loose, 0, 'separate Name/Price pills are still visible');
        assert.ok(sort.first.length >= 2, 'hotels need two rows to check name sort');
        const byName = (dir) => (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) * dir;
        assert.deepEqual([...sort.first].sort(byName(1)), sort.first);
        assert.deepEqual([...sort.second].sort(byName(-1)), sort.second);
      }
    }
  }
  await page.close();
} finally {
  await app.close();
  await browser.close();
}

if (failures.length) console.error(JSON.stringify(failures, null, 2));
assert.deepEqual(failures, []);
console.log('shared trip has no horizontal overflow at 390 and 1280');
