import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../../../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from '../../../scripts/fixtures/nyc-pr225-shared-trip.mjs';
import { collectCategoryTabInkMetrics } from '../../../scripts/lib/shared-trip-category-tab-icon-metrics.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const clientRoot = path.join(root, 'apps/vacation-client');
const require = createRequire(import.meta.url);

const TAB_ARIA = [
  'Day-by-Day',
  'Flights',
  'Hotels',
  'Cars',
  'Restaurants',
  'Stores',
  'The Rest',
  'Budget',
];

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

export async function ensureBuiltClient() {
  const { existsSync } = await import('node:fs');
  const hasDeps = existsSync(path.join(clientRoot, 'node_modules', 'vite'));
  if (!hasDeps) {
    execFileSync('npm', ['ci'], { cwd: clientRoot, stdio: 'inherit' });
  }
  execFileSync('npm', ['run', 'build'], { cwd: clientRoot, stdio: 'inherit' });
}

export async function startPreviewServer(tripPayload) {
  const distDir = path.join(clientRoot, 'dist');
  const html = await readFile(path.join(distDir, 'vacation-app-next.html'), 'utf8');
  const tripJson = JSON.stringify(tripPayload);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api/version') {
      return send(res, 200, '{"sha":"vacation-client-test"}', 'application/json; charset=utf-8');
    }
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_PR225_SLUG) {
        return send(res, 200, tripJson, 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json; charset=utf-8');
    }
    if (pathname === '/vacation-app-next.html' || pathname === '/') {
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    const rel = pathname.replace(/^\//, '');
    const filePath = path.join(distDir, rel);
    if (filePath.startsWith(distDir)) {
      try {
        const data = await readFile(filePath);
        const type = rel.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : rel.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
        return send(res, 200, data, type);
      } catch {
        /* fall through */
      }
    }
    send(res, 404, 'missing', 'text/plain');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function overflowProbe() {
  const scrollEl = document.scrollingElement;
  return {
    scrollWidth: scrollEl?.scrollWidth ?? document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
}

export async function runVacationClientShellTests() {
  await ensureBuiltClient();
  const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
  const app = await startPreviewServer(tripPayload);
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const failures = [];
  const screenshotRoot =
    process.env.VACATION_CLIENT_SHELL_ARTIFACT_ROOT ||
    path.join(root, 'evidence', 'vacation-client-p2-1-shell');
  await mkdir(screenshotRoot, { recursive: true });

  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      const height = width === 390 ? 844 : 800;
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(
        `${app.origin}/vacation-app-next.html?token=${encodeURIComponent(NYC_PR225_SLUG)}`,
        { waitUntil: 'networkidle0', timeout: 120000 },
      );
      await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });

      for (const label of TAB_ARIA) {
        const clicked = await page.evaluate((want) => {
          for (const btn of document.querySelectorAll('button.tsv-tab')) {
            if (btn.getAttribute('aria-label') === want) {
              btn.click();
              return true;
            }
          }
          return false;
        }, label);
        assert.equal(clicked, true, `missing tab ${label} at ${width}px`);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.documentElement.scrollLeft = 0;
          document.body.scrollLeft = 0;
        });
        await new Promise((r) => setTimeout(r, 550));
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const measure = await page.evaluate(overflowProbe);
        if (measure.scrollWidth > measure.innerWidth) {
          failures.push({ width, label, ...measure });
        }
        const inkMetrics = await collectCategoryTabInkMetrics(page);
        const row = inkMetrics.find((entry) => entry.tab === label);
        assert.ok(row, `missing ink metrics for ${label}`);
        const maxInk = Number(process.env.VACATION_CLIENT_TAB_INK_MAX || '0.75');
        assert.ok(
          Math.abs(row.iconVsTabPx) <= maxInk,
          `${label} icon vs tab pill ${row.iconVsTabPx.toFixed(2)}px at ${width}px (max ${maxInk})`,
        );
      }

      if (width === 390) {
        const mobileTabs = await page.evaluate(() => {
          const flights = [...document.querySelectorAll('button[aria-label="Flights"]')][0];
          const hotels = [...document.querySelectorAll('button[aria-label="Hotels"]')][0];
          const labelDisplay = (btn) => {
            const label = btn?.querySelector('.tsv-tab-label');
            return label ? getComputedStyle(label).display : null;
          };
          return {
            flightsLabelDisplay: labelDisplay(flights),
            hotelsLabelDisplay: labelDisplay(hotels),
          };
        });
        assert.equal(mobileTabs.flightsLabelDisplay, 'none', 'inactive Flights label hidden at 390');
        assert.equal(mobileTabs.hotelsLabelDisplay, 'none', 'inactive Hotels label hidden at 390');
      }

      await page.screenshot({
        path: path.join(screenshotRoot, `shell-${width}.png`),
        fullPage: false,
      });
    }

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-ts-embed', '1');
    });
    const embedFooter = await page.evaluate(() => {
      const footer = document.querySelector('footer[data-build-stamp="1"]');
      if (!footer) return { missing: true };
      const style = getComputedStyle(footer);
      return { visibility: style.visibility, width: style.width };
    });
    assert.equal(embedFooter.missing, undefined);
    assert.equal(embedFooter.visibility, 'hidden');

    await page.close();
  } finally {
    await app.close();
    await browser.close();
  }

  assert.deepEqual(failures, []);
  const { runVacationClientListLayoutTests } = await import('./list-layout.mjs');
  await runVacationClientListLayoutTests();
  const { runVacationClientDayLayoutTests } = await import('./day-layout.mjs');
  await runVacationClientDayLayoutTests();
  console.log('vacation-client shell layout checks passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runVacationClientShellTests();
}
