import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from './fixtures/nyc-pr225-shared-trip.mjs';
import { collectCategoryTabInkMetrics, inkMetricsFailures } from './lib/shared-trip-category-tab-icon-metrics.mjs';

const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/tmp/pptr/node_modules/puppeteer-core'); }
const root = fileURLToPath(new URL('..', import.meta.url));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
execFileSync('npm', ['run', 'build'], { cwd: root, env: { ...process.env, TIMESYNCHER_BUILD_SHA: sha }, stdio: 'pipe' });
const payload = JSON.stringify(buildNycPr225SharedTrip());
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (/^\/api\/shared\//.test(pathname)) { res.setHeader('content-type', 'application/json'); res.end(pathname.includes('edit-access') ? '{"canEdit":false}' : payload); return; }
  const relative = pathname.startsWith('/shared/') ? 'shared-app.html' : pathname.replace(/^\//, '');
  const file = path.resolve(root, 'dist', relative);
  if (!file.startsWith(path.resolve(root, 'dist') + path.sep)) { res.writeHead(404).end(); return; }
  try { const data = await readFile(file); res.setHeader('content-type', relative.endsWith('.html') ? 'text/html' : relative.endsWith('.js') || relative.endsWith('.mjs') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'); res.end(data); } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const artifacts = process.env.TSV_LOGO_TEST_OUT || await mkdtemp(path.join(tmpdir(), 'shared-logo-geometry-'));
await mkdir(artifacts, { recursive: true });
const failures = [];
const evidence = [];
const categories = ['Day-by-Day', 'Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest', 'Budget'];
function check(ok, message) { if (!ok) failures.push(message); }
function ink(png, box, metric, extent = box, inset = 1) {
  const [left, top, width, height] = box;
  const x0 = Math.max(0, Math.round(left + inset)); const x1 = Math.min(png.width - 1, Math.round(left + width - 1 - inset));
  const y0 = Math.max(0, Math.round(top + inset)); const y1 = Math.min(png.height - 1, Math.round(top + height - 1 - inset));
  const ring = new Map();
  const rgb = (x, y) => { const i = (y * png.width + x) * 4; return [...png.data.subarray(i, i + 3)]; };
  const add = (x, y) => { const key = rgb(x, y).join(','); ring.set(key, (ring.get(key) || 0) + 1); };
  for (let x = x0; x <= x1; x++) { add(x, y0); add(x, y1); }
  for (let y = y0; y <= y1; y++) { add(x0, y); add(x1, y); }
  const bg = [...ring].sort((a, b) => b[1] - a[1])[0]?.[0].split(',').map(Number);
  if (!bg) return null;
  let min = Infinity; let max = -Infinity; let mass = 0; let sum = 0;
  for (let y = y0; y <= y1; y++) for (let x = Math.max(x0, Math.round(extent[0] - 3)); x <= Math.min(x1, Math.round(extent[0] + extent[2] + 3)); x++) {
    const color = rgb(x, y); const differences = color.map((v, i) => Math.abs(v - bg[i]));
    const alpha = png.data[(y * png.width + x) * 4 + 3];
    if (metric === 'bbox' ? Math.max(...differences) > 24 : alpha >= 16 && differences.reduce((a, b) => a + b, 0) >= 18) {
      min = Math.min(min, y); max = Math.max(max, y);
      const weight = differences.reduce((a, b) => a + b, 0) * alpha / 255; sum += y * weight; mass += weight;
    }
  }
  return metric === 'bbox' ? Number.isFinite(min) ? (min + max + 1) / 2 : null : mass ? sum / mass : null;
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage(); await page.setViewport({ width, height: 844, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/shared/${NYC_PR225_SLUG}`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => document.fonts.ready);
    for (const category of categories) {
      const tab = await page.$(`button[aria-label="${category}"]`);
      check(!!tab, `${width} ${category}: required tab missing`); if (!tab) continue;
      await tab.click(); await new Promise(resolve => setTimeout(resolve, 250));
      const geometry = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
        const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
        const line = el => {
          if (!el) return null;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
          while ((node = walker.nextNode())) { if (!node.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); const r = [...range.getClientRects()].find(r => r.width && r.height); if (r) return [r.left, r.top, r.width, r.height]; }
          return null;
        };
        const h1 = document.querySelector('h1');
        const image = [...document.querySelectorAll('#root img')].find(el => visible(el) && h1 && el.getBoundingClientRect().bottom <= h1.getBoundingClientRect().top + 4 && el.getBoundingClientRect().width >= 12);
        const rows = [...document.querySelectorAll('li[data-list-row]')].filter(visible).map(row => {
          const chip = row.querySelector('[data-ts-logo-chip]'); const name = row.querySelector('[data-ts-list-row-name]'); const image = chip?.querySelector('img');
          return { row: rect(row), chip: chip && rect(chip), name: line(name), label: name?.textContent, decoded: image ? image.complete && image.naturalWidth > 0 : null };
        });
        const timeline = [...document.querySelectorAll('[data-ts-timeline-icon]')].filter(visible).map(icon => {
          let row = icon.parentElement; while (row && !row.querySelector('[data-ts-timeline-title]')) row = row.parentElement;
          return { chip: rect(icon), name: line(row?.querySelector('[data-ts-timeline-title]')) };
        });
        const tabs = [...document.querySelectorAll('button[aria-label]')].filter(button => visible(button) && ['Day-by-Day', 'Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest', 'Budget'].includes(button.getAttribute('aria-label'))).map(button => { const icon = button.querySelector('[data-ts-category-tab-icon]'); return { box: rect(button), icon: icon && rect(icon), name: button.getAttribute('aria-label'), active: getComputedStyle(button).backgroundColor === 'rgb(17, 24, 39)' }; });
        return { header: image && rect(image), rows, timeline, tabs, sha: document.querySelector('meta[name=timesyncher-build]')?.content };
      });
      check(geometry.tabs.length === 8, `${width} ${category}: incomplete tab measurements`);
      check(geometry.sha === sha, `${width} ${category}: wrong build`);
      check(!!geometry.header && Math.abs(geometry.header[0] + geometry.header[2] / 2 - width / 2) <= 2, `${width} ${category}: actual header logo off viewport midpoint`);
      const png = PNG.sync.read(Buffer.from(await page.screenshot({ fullPage: true })));
      for (const row of geometry.rows) {
        check(!!row.chip && !!row.name, `${width} ${category} ${row.label}: unmeasured row/name`); if (!row.chip || !row.name) continue;
        const cy = row.chip[1] + row.chip[3] / 2; const nameCy = row.name[1] + row.name[3] / 2;
        check(Math.abs(cy - row.row[1] - row.row[3] / 2) <= 6, `${width} ${category} ${row.label}: chip-to-row`);
        check(Math.abs(cy - nameCy) <= 0.5, `${width} ${category} ${row.label}: chip-to-first-name-line`);
        const raster = ink(png, row.chip, 'bbox'); row.ink = raster;
        check(raster !== null && Math.abs(raster - cy) <= 0.5, `${width} ${category} ${row.label}: raster-ink-to-chip`);
        check(raster !== null && Math.abs(raster - nameCy) <= 0.5, `${width} ${category} ${row.label}: raster-ink-to-first-name-line`);
      }
      for (const t of geometry.tabs) {
        check(!!t.icon, `${width} ${category} ${t.name}: unmeasured tab`); if (!t.icon || t.box[0] < 0 || t.box[0] + t.box[2] > width) continue;
        t.mass = ink(png, t.box.map(Math.round), 'mass', t.icon.map(Math.round), 3);
        check(t.mass !== null && Math.abs(t.mass - Math.round(t.box[1]) - Math.round(t.box[3]) / 2) <= 0.5, `${width} ${category} ${t.name}: composited tab mass`);
      }
      for (const t of geometry.timeline) {
        check(!!t.name, `${width} ${category}: unmeasured timeline first line`); if (!t.name) continue;
        const cy = t.name[1] + t.name[3] / 2; const raster = ink(png, t.chip, 'bbox'); t.ink = raster;
        check(Math.abs(t.chip[1] + t.chip[3] / 2 - cy) <= 0.5, `${width} ${category}: timeline box-to-first-name-line`);
        check(raster !== null && Math.abs(raster - cy) <= 0.5, `${width} ${category}: timeline glyph-to-first-name-line`);
      }
      const shellObserver = await collectCategoryTabInkMetrics(page);
      geometry.shellObserverFailures = inkMetricsFailures(shellObserver, 0.75);
      check(geometry.shellObserverFailures.length === 0, `${width} ${category}: shell observer metric on served entry`);
      evidence.push({ width, category, ...geometry });
      await writeFile(path.join(artifacts, `${category.replaceAll(/\W/g, '')}-${width}.png`), PNG.sync.write(png));
    }
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(artifacts, 'geometry.json'), JSON.stringify({ sha, evidence, failures }, null, 2));
console.log(`served geometry artifacts ${artifacts}; ${failures.length} failures`);
assert.deepEqual(failures, []);
