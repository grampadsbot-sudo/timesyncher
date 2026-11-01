#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const widths = [390, 1280];
const BASE_TOLERANCE_PX = 0.5;

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
  const publicJs = [
    '/vacation-app-request.js',
    '/ts-timeline-icon-patch.js',
    '/ts-car-brand-filter.js',
    '/ts-thing-media-overlay.js',
    '/post-purchase-gate.mjs',
  ];
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
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

async function clickTab(page, label) {
  await page.evaluate((tabLabel) => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
      return new RegExp(`^${tabLabel}$`, 'i').test(t);
    });
    if (!btn) throw new Error(`tab not found: ${tabLabel}`);
    btn.click();
  }, label);
}

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must match renderServedTrekBundle before #558 chrome checks');
assert.match(committed, /!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1"/);
assert.match(committed, /alignSelf:!ua\.endTime&&!ua\.isConflict\?"baseline":"start"/);

const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
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
    await clickTab(page, 'Day-by-Day');
    await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });

    const rows = await page.evaluate((tolerance) => {
      const tl = document.querySelector('[data-ts-day-timeline]');
      if (!tl) return { ok: false, reason: 'missing timeline' };
      const ctx = document.createElement('canvas').getContext('2d');
      const measureBaseline = (textNode) => {
        const parent = textNode.parentElement;
        const rg = document.createRange();
        rg.selectNodeContents(textNode);
        const q = [...rg.getClientRects()].find((r) => r.width && r.height);
        if (!q) return null;
        ctx.font = window.getComputedStyle(parent).font;
        const ascent = ctx.measureText(textNode.textContent || '').fontBoundingBoxAscent;
        return Number.isFinite(ascent) ? q.top + ascent : null;
      };
      const dayButtons = [...document.querySelectorAll('button')].filter((b) => /\bDay \d+\b/i.test(String(b.textContent || '').replace(/\s+/g, ' ').trim()));
      const samples = [];
      const visitDay = () => {
        for (const titleBtn of tl.querySelectorAll('[data-ts-timeline-title]')) {
          const title = String(titleBtn.textContent || '').replace(/\s+/g, ' ').trim();
          if (!title || /check-in:|sleep:|wake:/i.test(title)) continue;
          let row = null;
          for (let p = titleBtn.parentElement; p && p !== tl; p = p.parentElement) {
            if (p.querySelectorAll('[data-ts-timeline-title]').length !== 1) break;
            if (p.querySelector('[data-ts-timeline-icon], [data-ts-tab-emoji]')) {
              row = p;
              break;
            }
          }
          if (!row) continue;
          const notes = String(row.innerText || '')
            .split('\n')
            .map((x) => x.replace(/\s+/g, ' ').trim())
            .filter((x) => x && x !== title && !/^\d{1,2}:\d{2}\s?(am|pm)$/i.test(x));
          if (notes.some((x) => /^conflict with /i.test(x))) continue;
          const timeEl = row.querySelector('[data-ts-timeline-time]');
          if (!timeEl || timeEl.querySelector('div')) continue;
          const timeText = [...timeEl.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
          const titleText = [...titleBtn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
          if (!timeText || !titleText) continue;
          const timeBaseline = measureBaseline(timeText);
          const titleBaseline = measureBaseline(titleText);
          if (timeBaseline == null || titleBaseline == null) continue;
          samples.push({
            title: title.slice(0, 60),
            delta: Math.abs(timeBaseline - titleBaseline),
          });
        }
      };
      visitDay();
      for (const btn of dayButtons) {
        btn.click();
        visitDay();
      }
      const amelie = samples.find((s) => /amelie bistro/i.test(s.title));
      const worst = samples.reduce((best, s) => (s.delta > (best?.delta ?? -1) ? s : best), null);
      const bad = samples.filter((s) => s.delta > tolerance);
      return {
        ok: bad.length === 0 && Boolean(worst) && worst.delta <= tolerance,
        amelie,
        worst,
        bad: bad.slice(0, 5),
        count: samples.length,
      };
    }, BASE_TOLERANCE_PX);

    assert.ok(rows.count > 0, `no single-time rows measured at ${width}`);
    assert.ok(
      rows.ok,
      `#558 time/name baseline at ${width}: worst=${rows.worst?.title} ${rows.worst?.delta?.toFixed(2)} bad=${JSON.stringify(rows.bad)}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}

console.log('ui #558 day-by-day time/name baseline chrome checks passed');
