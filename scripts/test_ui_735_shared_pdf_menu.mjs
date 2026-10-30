#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { productStyleOneViewUrl } from '../src/vacation/keepsake-style2-handler.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(rebaked, committed);

assert.match(
  committed,
  /Cu=G=>\{const Re=G==="keepsake"\|\|G==="keepsake-style-2"\?Ha\(\):"";const tsTok=String\(r\|\|e\|\|""\)\.trim\(\)/,
);
assert.match(committed, /Tu=G=>\{const tsTok=String\(r\|\|e\|\|""\)\.trim\(\)/);
assert.match(committed, /window\.location\.assign\(url\);ht\(!1\)\}/);

const chromePath = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  console.log('ui #735 shared PDF menu bundle checks passed (puppeteer-core unavailable; chrome skipped)');
  process.exit(0);
}

function send(res, status, body, type, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length, ...headers });
  res.end(buf);
}

async function startServer({ html, js, css, tripPayload }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
    }
    const pdfMatch = pathname.match(/^\/api\/pdf\/shared\/([^/]+)\/report\/([^/]+)\.pdf$/);
    if (pdfMatch && req.method === 'GET') {
      const token = decodeURIComponent(pdfMatch[1]);
      const report = decodeURIComponent(pdfMatch[2]);
      assert.equal(token, NYC_DAYBYDAY_SLUG);
      assert.equal(report, 'keepsake');
      const location = productStyleOneViewUrl({
        shareToken: token,
        origin: `http://127.0.0.1:${server.address().port}`,
        search: url.search,
      });
      return send(res, 302, '', 'text/plain', { location });
    }
    if (pathname.startsWith('/shared/') && pathname.includes('/journey')) {
      return send(res, 200, '<!doctype html><html><body data-ae-print="1">print</body></html>', 'text/html; charset=utf-8');
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

const [html, css] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
]);
const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());

const app = await startServer({ html, js: committed, css, tripPayload });
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('[aria-label="PDFs"]', { timeout: 60000 });

  const targetPromise = browser.waitForTarget(
    (target) => target.url().includes('/api/pdf/shared/') || target.url().includes('/journey?'),
    { timeout: 30000 },
  );
  await page.click('[aria-label="PDFs"]');
  await page.waitForFunction(() => /Style one/i.test(document.body.innerText || ''), { timeout: 10000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((node) => /Style one/i.test(node.innerText || ''));
    if (!btn) throw new Error('Style one PDF menu item missing');
    btn.click();
  });

  const target = await targetPromise;
  const pdfPage = await target.page();
  assert.ok(pdfPage, 'PDF menu should open a printable target');
  await pdfPage.waitForFunction(() => /printMode=report/.test(location.href) || document.body?.getAttribute('data-ae-print') === '1', {
    timeout: 30000,
  });
  const href = pdfPage.url();
  assert.match(href, /pdfReport=keepsake|data-ae-print/);
} finally {
  await browser.close();
  await app.close();
}

console.log(`ui #735 shared PDF menu checks passed for slug ${NYC_DAYBYDAY_SLUG}`);
