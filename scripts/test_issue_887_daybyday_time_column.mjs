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
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(rebaked, committed, 'committed served bundle must match renderServedTrekBundle');
assert.match(committed, /tsFltStructRange=G=>/);
assert.match(committed, /tsTimelineRowTime=ua=>/);
assert.match(committed, /const gr=wn=>wn\.type==="hotel-wake"\?-1:wn\.type==="hotel-sleep"\?1e5:Io\(wn\.time\)/);
assert.doesNotMatch(committed, /endTime:ri\(_i,30\)/);
assert.match(committed, /children:ua\.time\?tsTimelineRowTime\(ua\):"TB"\+"D"/);

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

function parseMinutes(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

try {
  for (const width of [390, 1280]) {
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

    const audit = await page.evaluate(() => {
      const timelines = [...document.querySelectorAll('[data-ts-day-timeline]')];
      const day1 = timelines[0];
      const rows = day1
        ? [...day1.querySelectorAll('[data-ts-timeline-title]')].map((el) => {
            const row = el.closest('[style*="grid"]') || el.parentElement?.parentElement;
            const timeEl = row?.querySelector('[data-ts-timeline-time]') || row?.children?.[0];
            const title = String(el.textContent || '').replace(/\s+/g, ' ').trim();
            const timeText = String(timeEl?.textContent || '').replace(/\s+/g, ' ').trim();
            return { title, timeText };
          })
        : [];

      const dupEnds = [];
      for (const tl of timelines) {
        const timeCells = [...tl.querySelectorAll('[data-ts-timeline-time]')];
        for (const cell of timeCells) {
          const text = String(cell.textContent || '').replace(/\s+/g, ' ').trim();
          const times = text.match(/\d{1,2}(:\d{2})?\s*(am|pm)/gi) || [];
          if (times.length >= 2 && times[0].replace(/\s+/g, ' ').trim() === times[1].replace(/\s+/g, ' ').trim()) {
            dupEnds.push(text);
          }
        }
      }

      const day1Text = String(day1?.innerText || '');
      return {
        rows,
        dupEnds,
        aaRow: rows.find((row) => /American Airlines/i.test(row.title)) || null,
        blueNoteDup: /8:30\s*pm[\s\S]*8:30\s*pm/i.test(day1Text),
        checkInDup: /4:00\s*pm[\s\S]*4:30\s*pm/i.test(day1Text),
      };
    });

    const timedCutoff = (() => {
      let lastTimed = -1;
      let firstUntimed = Number.POSITIVE_INFINITY;
      let sleepIdx = -1;
      audit.rows.forEach((row, idx) => {
        if (/^Sleep:/i.test(row.title)) sleepIdx = idx;
        const mins = parseMinutes(row.timeText.replace(/\b(PT|ET)\b/gi, '').trim());
        const isTbd = /\bTBD\b/i.test(row.timeText);
        if (mins != null) lastTimed = Math.max(lastTimed, idx);
        if (isTbd || mins == null) firstUntimed = Math.min(firstUntimed, idx);
        assert.ok(row.timeText.length > 0 || isTbd, `time column empty for row at ${width}: ${row.title}`);
      });
      if (lastTimed >= 0 && firstUntimed < Number.POSITIVE_INFINITY) {
        assert.ok(lastTimed < firstUntimed, `timed rows must precede TBD at ${width}`);
      }
      const sleepRows = audit.rows.filter((row) => /^Sleep:/i.test(row.title));
      if (sleepRows.length) {
        assert.ok(/^Sleep:/i.test(audit.rows[audit.rows.length - 1]?.title || ''), `Sleep must be last row on day 1 at ${width}`);
      }
      return { lastTimed, firstUntimed, sleepIdx };
    })();

    assert.equal(audit.dupEnds.length, 0, `duplicate end times at ${width}: ${audit.dupEnds.join('; ')}`);
    assert.ok(audit.aaRow, `American Airlines row at ${width}`);
    assert.match(audit.aaRow.timeText, /12:37\s*pm\s*PT/i, `AA departure PT at ${width}`);
    assert.match(audit.aaRow.timeText, /8:59\s*pm\s*ET/i, `AA arrival ET at ${width}`);
    assert.doesNotMatch(audit.aaRow.timeText, /\b2:37\s*pm\b/i, `fabricated AA end at ${width}`);
    assert.equal(audit.blueNoteDup, false, `duplicated Blue Note end at ${width}`);
    assert.equal(audit.checkInDup, false, `fabricated check-in end at ${width}`);

    for (const dayNum of [2, 7, 8]) {
      await page.evaluate((d) => {
        const btn = [...document.querySelectorAll('button')].find((b) => {
          const t = String(b.textContent || '').replace(/\s+/g, ' ').trim();
          return new RegExp(`^Day ${d}$`, 'i').test(t);
        });
        if (!btn) throw new Error(`day pill missing: ${d}`);
        btn.click();
      }, dayNum);
      await new Promise((r) => setTimeout(r, 250));
      const dayRows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-title]')].map((el) =>
          String(el.textContent || '').replace(/\s+/g, ' ').trim(),
        ),
      );
      const wakeIdx = dayRows.findIndex((t) => /^Wake:/i.test(t));
      const sleepIdx = dayRows.findIndex((t) => /^Sleep:/i.test(t));
      if (dayNum >= 2 && dayNum <= 7) {
        assert.ok(wakeIdx === 0, `Day ${dayNum} Wake must be first row at ${width}: ${dayRows.slice(0, 3).join(' | ')}`);
        assert.ok(sleepIdx === dayRows.length - 1, `Day ${dayNum} Sleep must be last at ${width}`);
        const wakeTime = await page.evaluate(() => {
          const row = [...document.querySelectorAll('[data-ts-day-timeline] [data-ts-timeline-title]')].find((el) =>
            /^Wake:/i.test(String(el.textContent || '')),
          );
          const grid = row?.closest('[style*="grid"]') || row?.parentElement?.parentElement;
          const timeEl = grid?.querySelector('[data-ts-timeline-time]') || grid?.children?.[0];
          return String(timeEl?.textContent || '').replace(/\s+/g, ' ').trim();
        });
        assert.match(wakeTime, /\bTBD\b/i, `Day ${dayNum} Wake time column at ${width}`);
      }
      if (dayNum === 8) {
        assert.equal(wakeIdx, 0, `Day 8 Wake first at ${width}`);
        assert.equal(sleepIdx, -1, `Day 8 must not show Sleep at ${width}`);
      }
    }
  }
} finally {
  await browser.close();
  await app.close();
}

console.log('issue #887 day-by-day time column checks passed');
