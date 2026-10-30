#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const widths = [390, 1280];

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

async function startServer({ html, js, css, tripPayload }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(rebaked, committed, 'rebake served bundle before running this test');

assert.match(committed, /if\(hotel\)\{const summary=String\(ha\(G\)\.summary/);
assert.match(committed, /"data-ts-list-desc":"1"/);
assert.doesNotMatch(committed, /if\(hotel\)\{const summary=pick\(ha\(G\)\.summary/);

const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
let hotelExpect = 0;
for (const place of tripPayload.places || []) {
  const override = tripPayload.thingOverrides?.[`place:${place.id}`] || {};
  if (productThingCategory(place, override) === 'hotel') hotelExpect += 1;
}
assert.equal(hotelExpect, 22);

const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const app = await startServer({ html, js: committed, css, tripPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  for (const width of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('button[aria-label="Hotels"]', { timeout: 120000 });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /^Hotels$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()),
      );
      if (!btn) throw new Error('Hotels tab missing');
      btn.click();
    });
    await page.waitForSelector('[data-shared-live-tab="hotels"]', { timeout: 120000 });

    const stats = await page.evaluate(() => {
      function visible(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }
      function rowDescBox(li) {
        const nameEl = li.querySelector('[data-ts-list-row-name]');
        const nmTxt = nameEl ? (nameEl.textContent || '').trim() : '';
        const descLine = (() => {
          const ls = (li.innerText || '')
            .split('\n')
            .map((s) => s.replace(/\s+/g, ' ').trim())
            .filter(
              (s) =>
                s &&
                s !== nmTxt &&
                !(nmTxt && nmTxt.includes(s)) &&
                !/^\$/.test(s) &&
                !/^(Add price|Timeline|Open details|Remove|Edit|Move)\b/i.test(s) &&
                !/^D\d+$/.test(s) &&
                !/^[\d\s:apm\u2013\-]+$/i.test(s) &&
                s.split(' ').length >= 2,
            );
          ls.sort((a, b) => b.length - a.length);
          return ls.length ? ls[0].slice(0, 1200) : null;
        })();
        if (!descLine) return { descLine: null, descBox: null, listDescLeaf: null };
        const el = [...li.querySelectorAll('*')].find(
          (e) => !e.children.length && (e.textContent || '').replace(/\s+/g, ' ').trim() === descLine && visible(e),
        );
        const listDescLeaf = li.querySelector('[data-ts-list-desc="1"]');
        return {
          descLine,
          descBox: el ? true : null,
          listDescLeaf: listDescLeaf ? (listDescLeaf.textContent || '').replace(/\s+/g, ' ').trim() : null,
        };
      }
      const root = document.querySelector('[data-shared-live-tab="hotels"]');
      const rows = root
        ? [...root.querySelectorAll('li[data-list-row="1"]')].filter((li) => (li.dataset.thingCategory || '') === 'hotel')
        : [];
      let withLeaf = 0;
      let withDescBox = 0;
      let withListDesc = 0;
      for (const li of rows) {
        const { descBox, listDescLeaf, descLine } = rowDescBox(li);
        if (li.querySelector('[data-ts-list-desc="1"]')) withListDesc += 1;
        if (listDescLeaf && descLine && listDescLeaf === descLine) withLeaf += 1;
        if (descBox) withDescBox += 1;
      }
      return { rows: rows.length, withLeaf, withDescBox, withListDesc };
    });

    assert.equal(stats.rows, hotelExpect, `hotel list rows at ${width}`);
    assert.equal(stats.withListDesc, hotelExpect, `data-ts-list-desc nodes at ${width}`);
    assert.ok(stats.withDescBox >= Math.ceil(hotelExpect * 0.8), `capture desc_box ${stats.withDescBox}/${hotelExpect} at ${width}`);
    assert.ok(stats.withLeaf >= Math.ceil(hotelExpect * 0.8), `data-ts-list-desc leaf ${stats.withLeaf}/${hotelExpect} at ${width}`);
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}

console.log('hotel list desc capture leaf checks passed');
