#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
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

async function startServer({ html, js, css, tripPayload, canEdit }) {
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
    if (pathname === '/src/onboarding/eula-markdown.mjs') {
      return send(res, 200, await readFile(path.join(root, 'src/onboarding/eula-markdown.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) {
      return send(res, 200, JSON.stringify({ canEdit: !!canEdit }), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      return send(res, 200, '', 'image/png');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
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

const js = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());

const app = await startServer({ html, js, css, tripPayload, canEdit: false });
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
    await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate((slug) => {
      if (typeof window.localStorage?.removeItem === 'function') {
        window.localStorage.removeItem(`timesyncher-section-visibility:${slug}`);
      }
    }, NYC_DAYBYDAY_SLUG);
    await page.reload({ waitUntil: 'networkidle0', timeout: 120000 });
    await clickTab(page, 'Day-by-Day');
    await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
    await page.evaluate(() => {
      const dayBtn = [...document.querySelectorAll('button')].find((b) => /\bDay 1\b/i.test(String(b.textContent || '').replace(/\s+/g, ' ').trim()));
      if (dayBtn) dayBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    if (width === 390) {
      const tbdCheck = await page.evaluate(() => {
        const times = [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-time]')];
        const tbd = times.find((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim() === 'TBD');
        if (!tbd) {
          return { ok: false, samples: times.slice(0, 5).map((el) => String(el.textContent || '').trim()) };
        }
        const row = tbd.parentElement;
        const titleCol = row && row.children.length >= 3 ? row.children[2] : null;
        return {
          ok: true,
          timeAlign: window.getComputedStyle(tbd).alignSelf,
          titleAlign: titleCol ? window.getComputedStyle(titleCol).alignSelf : '',
          titleInline: titleCol ? String(titleCol.getAttribute('style') || '') : '',
        };
      });
      assert.ok(tbdCheck.ok, `untimed TBD row at ${width}: ${(tbdCheck.samples || []).join(' | ')}`);
      assert.equal(tbdCheck.timeAlign, 'baseline', `#690 TBD time column baseline at ${width}`);
      assert.ok(
        tbdCheck.titleAlign === 'baseline' || /align-self:\s*baseline|alignSelf:\s*baseline/i.test(tbdCheck.titleInline),
        `#688 title baseline with TBD at ${width} (align=${tbdCheck.titleAlign})`,
      );
    }

    await page.evaluate(() => {
      const btn = document.querySelector('[data-trip-view-root] button[aria-label="Config Options"]');
      if (!btn) throw new Error('Config Options button missing');
      btn.click();
    });
    await page.waitForFunction(() => /Trip View/i.test(document.querySelector('[data-trip-view-root]')?.innerText || ''), {
      timeout: 120000,
    });

    const baselineHotels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-title]')]
        .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /Check-in:|Sleep:|Wake:/i.test(t)).length,
    );
    assert.ok(baselineHotels > 0, `hotel timeline rows before toggle at ${width}`);

    async function toggleTripView(label) {
      await page.evaluate((tripLabel) => {
        const root = document.querySelector('[data-trip-view-root]');
        const btn = [...root.querySelectorAll('button')].find((b) => new RegExp(tripLabel, 'i').test(b.textContent || ''));
        if (!btn) throw new Error(`trip-view toggle missing: ${tripLabel}`);
        btn.click();
      }, label);
      await new Promise((r) => setTimeout(r, 400));
    }

    async function tripViewChecked(label) {
      return page.evaluate((tripLabel) => {
        const root = document.querySelector('[data-trip-view-root]');
        const btn = [...root.querySelectorAll('button')].find((b) => new RegExp(tripLabel, 'i').test(b.textContent || ''));
        const box = btn?.querySelector('input[type="checkbox"]');
        return box ? box.checked : null;
      }, label);
    }

    await toggleTripView('Hotels');
    assert.equal(await tripViewChecked('Hotels'), false, `B7 hotels checkbox off at ${width}`);
    const hiddenHotels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-title]')]
        .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /Check-in:|Sleep:|Wake:/i.test(t)).length,
    );
    assert.equal(hiddenHotels, 0, `B7 hotels toggle hides day rows at ${width}`);

    await toggleTripView('Flights');
    assert.equal(await tripViewChecked('Flights'), false, `B7 flights checkbox off at ${width}`);
    const hiddenFlights = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-title]')]
        .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /flight|airport/i.test(t)).length,
    );
    assert.equal(hiddenFlights, 0, `B7 flights toggle hides day rows at ${width}`);

    await toggleTripView('Cars');
    assert.equal(await tripViewChecked('Cars'), false, `B7 cars checkbox off at ${width}`);
    const hiddenCars = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-title]')]
        .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /^(Pickup|Drop-off):/i.test(t)).length,
    );
    assert.equal(hiddenCars, 0, `B7 cars toggle hides day rows at ${width}`);

    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}

console.log(`ui #754 shared slug ${NYC_DAYBYDAY_SLUG} chrome checks passed`);
