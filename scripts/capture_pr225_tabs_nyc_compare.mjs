#!/usr/bin/env node
/** PR #225: 8 shared tabs @ 390/1280 — travel.timesyncher.com bundle (left) vs patched bundle (right). */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { LOGO_TAB_SETTLE_MS, stitchLogoChipCropsPng } from './shepherd-staging-smoke-logo-metrics.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outRoot = process.argv[2] || '/opt/cursor/artifacts/pr225-tabs';
const slug = 'intake-435a4d049b1d';
const bundleName = 'index-BMaU4y5m.js';
const prodBundleUrl = `https://travel.timesyncher.com/assets/${bundleName}`;

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

async function captureTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  if (!clicked) throw new Error(`tab not found: ${label}`);
  await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
  const clip = await page.evaluate((want) => {
    const tab = [...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === want);
    const top = tab ? tab.getBoundingClientRect().top : 0;
    return { x: 0, y: Math.max(0, top - 8), width: window.innerWidth, height: Math.min(560, window.innerHeight - Math.max(0, top - 8)) };
  }, label);
  return page.screenshot({ type: 'png', encoding: 'binary', clip });
}

async function main() {
  const fixture = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/intake-435a4d049b1d.json'), 'utf8'));
  const tripPayload = finalizeServedSharedTripPayload(fixture);
  tripPayload.trip = {
    ...tripPayload.trip,
    title: `TimeSyncher ${tripPayload.trip?.title || 'trip'}`,
    description: `TimeSyncher ${tripPayload.trip?.description || ''}`.trim(),
  };
  const bundlePath = `/assets/${bundleName}`;
  const [htmlRaw, css, patchedBundle, prodBundle] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-BKun7ofk.js')),
    loadProdBundle(),
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
          if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:')) request.continue();
          else request.abort('blockedbyclient');
        });
        await page.setViewport({ width: viewport.width, height: viewport.height });
        await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => /TimeSyncher/.test(document.body?.innerText || ''), { timeout: 90000 });
        for (const [label, stem] of TABS) {
          const shot = await captureTab(page, label);
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

  console.log(JSON.stringify({ outRoot, bundleName, viewports: viewports.map((v) => v.tag), tabs: TABS.map((t) => t[1]) }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
