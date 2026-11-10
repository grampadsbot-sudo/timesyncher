#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': buf.length,
  });
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
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) {
      return send(res, 200, JSON.stringify({ canEdit: false }), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      return send(res, 200, '', 'image/png');
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
      const t = String(b.textContent || '').replace(/\s+/g, ' ').trim();
      return new RegExp(`^${tabLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(t);
    });
    if (!btn) throw new Error(`tab button not found: ${tabLabel}`);
    btn.click();
  }, label);
}

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  cwd: root,
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(rebaked, committed, 'committed served bundle must match renderServedTrekBundle');
assert.match(
  committed,
  /data-ts-conflict-label":"1"[\s\S]*flexWrap:"wrap"/,
  'conflict label chrome must wrap at narrow width',
);
assert.doesNotMatch(
  committed,
  /data-ts-conflict-label":"1"[\s\S]*flexWrap:"nowrap"[\s\S]*whiteSpace:"nowrap"[\s\S]*overflow:"hidden"/,
  'conflict label must not clip with nowrap+hidden',
);
assert.match(committed, /gridTemplateColumns:"minmax\(52px,max-content\) 22px minmax\(0,1fr\)"/, 'day timeline grid time column must size to the unwrapped time+zone');

const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());

const app = await startServer({ html, js: committed, css, tripPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((slug) => {
    if (typeof window.localStorage?.removeItem === 'function') {
      window.localStorage.removeItem(`timesyncher-section-visibility:${slug}`);
    }
  }, NYC_DAYBYDAY_SLUG);
  await page.reload({ waitUntil: 'networkidle0', timeout: 120000 });
  await clickTab(page, 'Day-by-Day');
  await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });

  const audit = await page.evaluate(() => {
    const timelines = [...document.querySelectorAll('[data-ts-day-timeline]')];
    const day1 = timelines[0];
    const conflictLabels = day1 ? [...day1.querySelectorAll('[data-ts-conflict-label="1"]')] : [];
    const conflictAudit = conflictLabels.map((el) => {
      const cs = getComputedStyle(el);
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      const parent = el.parentElement;
      const parentWidth = parent ? parent.clientWidth : 0;
      const overflowParent = parent && el.scrollWidth > parent.clientWidth + 1;
      return {
        text,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        whiteSpace: cs.whiteSpace,
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        clipped: el.scrollWidth > el.clientWidth + 1,
        nowrapHidden: cs.whiteSpace === 'nowrap' && (cs.overflow === 'hidden' || cs.overflowX === 'hidden'),
        overflowParent,
        parentWidth,
      };
    });

    const timeZoneLines = [];
    for (const tl of timelines.slice(0, 1)) {
      const timeCells = [...tl.querySelectorAll('[data-ts-timeline-time]')];
      for (const cell of timeCells) {
        const rawText = String(cell.innerText || '');
        if (/(^|\n)\s*(PT|ET)\s*($|\n)/m.test(rawText)) {
          timeZoneLines.push(rawText);
        }
        if (/(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*\n\s*(PT|ET)\b/i.test(rawText)) {
          timeZoneLines.push(rawText);
        }
        const range = document.createRange();
        range.selectNodeContents(cell);
        const rects = [...range.getClientRects()].filter((r) => r.width && r.height);
        if (/\d{1,2}:\d{2}\s*(?:am|pm)?\s*(PT|ET)\b/i.test(rawText.replace(/\s+/g, ' '))) {
          const looksWrappedZone = rects.some((r, i) => r.width < 24 && i > 0);
          if (looksWrappedZone) timeZoneLines.push(rawText + ' [rects=' + rects.length + ' w=' + rects.map((r) => Math.round(r.width)).join(',') + ']');
        }
      }
    }

    const aaConflict = conflictAudit.find((row) => /Conflict with American Airlines/i.test(row.text)) || null;

    return { conflictAudit, timeZoneLines, aaConflict, conflictCount: conflictAudit.length };
  });

  assert.ok(audit.conflictCount >= 4, `day 1 must show conflict banners at 390 (got ${audit.conflictCount})`);
  assert.ok(audit.aaConflict, 'American Airlines conflict banner must render on day 1');
  assert.match(audit.aaConflict.text, /Conflict with American Airlines/i);
  assert.doesNotMatch(audit.aaConflict.text, /Conflict with American Ai…/);
  assert.equal(audit.aaConflict.clipped, false, `conflict banner clipped: sw=${audit.aaConflict.scrollWidth} cw=${audit.aaConflict.clientWidth}`);
  assert.equal(audit.aaConflict.nowrapHidden, false, 'conflict banner must not use nowrap+hidden');
  assert.equal(audit.aaConflict.overflowParent, false, 'conflict banner must not overflow its card');

  for (const row of audit.conflictAudit) {
    assert.equal(row.clipped, false, `conflict clipped at 390: ${row.text.slice(0, 60)}`);
    assert.equal(row.nowrapHidden, false, `conflict nowrap clip at 390: ${row.text.slice(0, 60)}`);
  }

  assert.equal(audit.timeZoneLines.length, 0, `PT/ET must stay on one line with clock time: ${audit.timeZoneLines.join(' | ')}`);
} finally {
  await browser.close();
  await app.close();
}

console.log('issue #944 day-by-day conflict banner + TZ one-line checks passed');
