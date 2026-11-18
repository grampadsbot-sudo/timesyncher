#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function sendText(res, status, body, type) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': payload.length,
  });
  res.end(payload);
}

const chrome = await readFile(path.join(root, 'public/ts-vk-rebrand-chrome.js'), 'utf8');
assert.match(chrome, /observer\?\.disconnect\(\)/);
assert.match(chrome, /observer\?\.takeRecords\(\)/);
assert.match(chrome, /if \(embedded\) return/);
assert.match(chrome, /if \(map\[t\] === s\) return/);

const shell = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>issue-1016-switcher-probe</title>
</head>
<body>
  <div data-ts-shared-header="1"><h1>Craig / Kim NYC June 2026</h1></div>
  <select data-trip-switcher aria-label="Switch trip">
    <option>Craig / Kim NYC June 2026</option>
  </select>
</body>
</html>`;

const MAP = {
  'Craig / Kim NYC June 2026': 'copy-nyc-1016',
  'Las Vegas Strip Vacation': 'copy-vegas-1016',
  'Boston Weekend': 'copy-boston-1016',
};
const VISITED = ['copy-nyc-1016', 'copy-vegas-1016', 'copy-boston-1016'];
const SLUG = 'copy-nyc-1016';

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === `/shared/${SLUG}/`) return sendText(res, 200, shell, 'text/html; charset=utf-8');
  if (pathname === '/ts-vk-rebrand-chrome.js') return sendText(res, 200, chrome, 'text/javascript; charset=utf-8');
  sendText(res, 404, 'missing', 'text/plain; charset=utf-8');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((map, visited) => {
    localStorage.setItem('vk-trip-switcher-map', JSON.stringify(map));
    localStorage.setItem('vk-trip-switcher-visited-slugs', JSON.stringify(visited));
  }, MAP, VISITED);
  await page.goto(`${origin}/shared/${SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.addScriptTag({ url: `${origin}/ts-vk-rebrand-chrome.js` });

  await page.waitForFunction(() => {
    const sel = document.querySelector('[data-trip-switcher]');
    return sel && sel.options.length >= 3;
  }, { timeout: 15000 });

  const stats = await page.evaluate(() => new Promise((resolve) => {
    const sel = document.querySelector('[data-trip-switcher]');
    let rebuilds = 0;
    const mo = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some((n) => n.parentNode === sel))) rebuilds += 1;
    });
    mo.observe(sel, { childList: true });
    setTimeout(() => {
      mo.disconnect();
      resolve({
        optionCount: sel?.options.length || 0,
        rebuilds,
        values: [...(sel?.options || [])].map((o) => o.value),
        selected: sel?.value || '',
      });
    }, 2500);
  }));

  assert.equal(stats.optionCount, 3, `expected three switcher options, got ${JSON.stringify(stats)}`);
  assert.ok(stats.rebuilds <= 1, `hydrate must be idempotent after initial build, rebuilds=${stats.rebuilds}`);
  assert.equal(stats.selected, 'Craig / Kim NYC June 2026');
  assert.ok(stats.values.includes('Las Vegas Strip Vacation'));
  assert.ok(stats.values.includes('Boston Weekend'));

  const foreign = await page.evaluate(() => {
    localStorage.setItem('vk-trip-switcher-map', JSON.stringify({
      'Foreign Trip Title': 'foreign-share-slug',
      'Craig / Kim NYC June 2026': 'copy-nyc-1016',
      'Las Vegas Strip Vacation': 'copy-vegas-1016',
      'Boston Weekend': 'copy-boston-1016',
    }));
    localStorage.setItem('vk-trip-switcher-visited-slugs', JSON.stringify(['copy-nyc-1016', 'copy-vegas-1016', 'copy-boston-1016']));
    return true;
  });
  assert.equal(foreign, true);
  await page.evaluate(() => {
    document.body.appendChild(document.createElement('span')).remove();
  });
  await new Promise((r) => setTimeout(r, 1200));
  const privateTitles = await page.evaluate(() => [...document.querySelector('[data-trip-switcher]')?.options || []].map((o) => o.value));
  assert.equal(privateTitles.includes('Foreign Trip Title'), false, 'unvisited slug titles must not appear in switcher');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(() => resolve()));
}

console.log('test_issue_1016_trip_switcher_observer: ok');