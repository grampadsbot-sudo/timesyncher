#!/usr/bin/env node
/** One-off: flights sort header crops from pre-label bundle (pill sort). */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outRoot = process.argv[2] || '/opt/cursor/artifacts/pr225-tabs';
const pillCommit = process.argv[3] || '48ab8b4525423a82a1ae4314114685102f5f6d33';
const slug = 'intake-435a4d049b1d';

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

async function main() {
  const js = execFileSync('git', ['show', `${pillCommit}:public/assets/index-BKun7ofk.js`], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8');
  const fixture = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/intake-435a4d049b1d.json'), 'utf8'));
  const tripPayload = finalizeServedSharedTripPayload(fixture);
  const [html, css] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  ]);
  const logo = Buffer.alloc(0);
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
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
  const origin = `http://127.0.0.1:${port}`;
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  await mkdir(outRoot, { recursive: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 800 });
      await page.goto(`${origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => /TimeSyncher/.test(document.body?.innerText || ''), { timeout: 90000 });
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.getAttribute('aria-label') === 'Flights') {
            btn.click();
            break;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 400));
      const clip = await page.evaluate(() => {
        const pills = [...document.querySelectorAll('button')].filter((el) => /^(name|price)/i.test(String(el.textContent || '').trim()));
        if (!pills.length) return null;
        let top = Infinity;
        let left = Infinity;
        let right = 0;
        let bottom = 0;
        for (const el of pills) {
          const b = el.getBoundingClientRect();
          top = Math.min(top, b.top);
          left = Math.min(left, b.left);
          right = Math.max(right, b.right);
          bottom = Math.max(bottom, b.bottom);
        }
        return {
          x: Math.max(0, Math.floor(left - 8)),
          y: Math.max(0, Math.floor(top - 4)),
          width: Math.min(window.innerWidth, Math.ceil(right - left + 16)),
          height: Math.min(120, Math.ceil(bottom - top + 12)),
        };
      });
      if (clip) {
        await page.screenshot({ path: path.join(outRoot, `flights-sort-before-${width}.png`), clip });
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
