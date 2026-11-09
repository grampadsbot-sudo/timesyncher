#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { NYC_DAYBYDAY_SLUG } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir =
  process.env.VK_877_EVIDENCE_DIR || fileURLToPath(new URL('../../vkfill-877-job', import.meta.url));
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

async function startLocalPreview() {
  const liveApiRaw = JSON.parse(
    await readFile(path.join(root, 'scripts/fixtures/nyc-screen-trip99-live-shared-api.json'), 'utf8'),
  );
  const tripPayload = finalizeServedSharedTripPayload(liveApiRaw);
  const [html, js, css] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  ]);
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
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/json; charset=utf-8');
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/ts-thing-media/') && pathname !== '/ts-thing-media/bindings.json') {
      const assetPath = path.join(root, 'public', pathname.replace(/^\//, ''));
      if (existsSync(assetPath)) {
        return send(res, 200, await readFile(assetPath), 'image/jpeg');
      }
      return send(res, 200, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg');
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
    if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) {
      return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    }
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickTab(page, label) {
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

async function auditRowInPage(page) {
  return page.evaluate(() => {
    const row = [...document.querySelectorAll('li[data-list-row="1"]')].find((li) =>
      /statue of liberty walking tour/i.test(li.textContent || ''),
    );
    if (!row) return { err: 'no-row' };
    const popups = [...row.querySelectorAll('[data-ts-pic-popup]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const thumbWraps = [...row.querySelectorAll('[data-ts-pic-thumb-wrap]')];
    const stripRoot = thumbWraps[0]?.parentElement || row;
    const logoChips = [...stripRoot.querySelectorAll('[data-ts-logo-chip]')];
    const photoImg = thumbWraps
      .flatMap((wrap) => [...wrap.querySelectorAll('img')])
      .find((img) => !img.classList.contains('print-media-qr'));
    const photoSrc = photoImg?.getAttribute('src') || '';
    const qrPresent = Boolean(row.querySelector('img.print-media-qr, .print-media-qr'));
    return {
      visiblePopups: popups.length,
      logoChips: logoChips.length,
      photoSrc,
      photoThingMedia: /\/ts-thing-media\//.test(photoSrc),
      qrPresent,
    };
  });
}

await mkdir(outDir, { recursive: true });
const preview = await startLocalPreview();
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const head = 'b2b8bbc076fcae30da54aa43f878cd3bd9178900';

try {
  for (const w of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900 });
    await page.goto(`${preview.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => /events|the rest/i.test(b.getAttribute('aria-label') || b.textContent || '')),
      { timeout: 180000 },
    );
    await clickTab(page, 'The Rest');
    await sleep(1500);

    const beforeAudit = await auditRowInPage(page);
    assert.ok(!beforeAudit.err, beforeAudit.err || 'Statue row missing');
    const beforePath = path.join(outDir, `877-statue-before-${w}.png`);
    await page.screenshot({ path: beforePath });

    const rowSel = await page.evaluate(() => {
      const row = [...document.querySelectorAll('li[data-list-row="1"]')].find((li) =>
        /statue of liberty walking tour/i.test(li.textContent || ''),
      );
      if (!row) return null;
      row.setAttribute('data-ts-877-probe', '1');
      return 'li[data-ts-877-probe="1"] [data-ts-pic-thumb-wrap="1"] a';
    });
    assert.ok(rowSel, 'Statue thumb link missing');
    await page.click(rowSel);
    await sleep(500);
    const hasPopup = await page.evaluate(() =>
      Boolean(document.querySelector('li[data-ts-877-probe="1"] [data-ts-pic-popup="1"]')),
    );
    const openPath = path.join(outDir, `877-statue-open-${w}.png`);
    await page.screenshot({ path: openPath });
    assert.ok(hasPopup, `popup should open at ${w}`);

    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await sleep(500);

    const afterAudit = await auditRowInPage(page);
    assert.equal(afterAudit.visiblePopups, 0, `visible pic popups after close at ${w}`);
    assert.equal(afterAudit.logoChips, 0, `logo chips after close at ${w}`);
    assert.ok(afterAudit.photoThingMedia, `photo thumb still /ts-thing-media/ at ${w}: ${afterAudit.photoSrc}`);
    assert.ok(afterAudit.qrPresent, `QR thumb present at ${w}`);
    const afterPath = path.join(outDir, `877-statue-after-${w}.png`);
    await page.screenshot({ path: afterPath });
    await page.close();
  }
} finally {
  await browser.close();
  await preview.close();
}

await writeFile(
  path.join(outDir, '877-chrome-result.json'),
  `${JSON.stringify({ ok: true, slug: NYC_DAYBYDAY_SLUG, widths, head }, null, 2)}\n`,
);
console.log('ui #877 pic-popup media strip chrome passed');
