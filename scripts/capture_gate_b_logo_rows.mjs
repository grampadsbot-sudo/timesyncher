#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const slug = 'intake-435a4d049b1d';
const artifactDir = process.env.GATE_B_ARTIFACT_DIR || '/opt/cursor/artifacts/gate-b-logo-rows-r1';
const zipOut = process.env.GATE_B_ZIP || '/opt/cursor/artifacts/gate-b-logo-rows-r1.zip';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'content-length': buf.length, 'cache-control': 'no-store' });
  res.end(buf);
}

async function startServer({ html, js, css, tripPayload, staticFiles }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    for (const [route, file] of Object.entries(staticFiles)) {
      if (pathname === route) {
        const body = await readFile(file);
        const type = route.endsWith('.mjs') ? 'text/javascript' : 'text/javascript; charset=utf-8';
        return send(res, 200, body, type);
      }
    }
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname.startsWith('/icons/')) return send(res, 200, Buffer.alloc(0), 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === slug) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{}', 'application/json');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

async function clickTab(page, keyword) {
  return page.evaluate((kw) => {
    const norm = (t) => String(t || '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const want = norm(kw);
    for (const node of document.querySelectorAll('button,[role="tab"],a,[data-tab],[data-ts-tab]')) {
      const combined = [node.textContent, node.getAttribute('title'), node.getAttribute('data-tab'), node.getAttribute('data-ts-tab')].join(' ');
      if (norm(combined).includes(want)) {
        node.click();
        return true;
      }
    }
    return false;
  }, keyword);
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/intake-435a4d049b1d.json'), 'utf8'));
const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos({
  trip: fixture.trip,
  places: fixture.places,
  thingOverrides: fixture.thingOverrides,
  days: fixture.days,
  assignments: fixture.assignments,
  categories: fixture.categories,
}));

const [html, css, js, timelinePatch, brandFilter, mediaOverlay] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-timeline-icon-patch.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-car-brand-filter.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-thing-media-overlay.js'), 'utf8'),
]);

const staticFiles = {
  '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
  '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
  '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
  '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
};

const server = await startServer({ html, js, css, tripPayload, staticFiles });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto(`${server.origin}/shared/${slug}/`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => document.querySelector('[data-shared-live-tab]') || document.body?.innerText?.includes('Day-by-Day'), { timeout: 60000 });

await mkdir(artifactDir, { recursive: true });
const captures = [];
for (const tab of ['hotels', 'cars']) {
  const clicked = await clickTab(page, tab);
  if (!clicked) throw new Error(`tab_not_clicked:${tab}`);
  await new Promise((r) => setTimeout(r, 1200));
  for (const width of [390, 1280]) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 400));
    const rowCount = await page.evaluate(() => document.querySelectorAll('li[data-list-row="1"]').length);
    const chipCount = await page.evaluate(() => document.querySelectorAll('li[data-list-row="1"] [data-ts-logo-chip]').length);
    if (rowCount < 1 || chipCount < 1) throw new Error(`missing_rows_or_chips:${tab}@${width} rows=${rowCount} chips=${chipCount}`);
    const file = path.join(artifactDir, `${tab}-${width}.png`);
    await page.screenshot({ path: file, fullPage: false });
    captures.push({ tab, width, file, rowCount, chipCount });
  }
}
await browser.close();
await server.close();

await execFileSync('zip', ['-j', zipOut, ...captures.map((c) => c.file)], { stdio: 'inherit' });
console.log(JSON.stringify({ artifactDir, zipOut, captures }, null, 2));
