import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { GATE_B_APPROVED_SHARED_SLUG } from '../fixtures/gate-b-approved-shared-trip.mjs';
import { NYC_PR225_SLUG } from '../fixtures/nyc-pr225-shared-trip.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const distDir = path.join(root, 'dist');
const SHARED_ENTRY = '/vacation-app-next.html';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    try {
      return require('/tmp/pptr/node_modules/puppeteer-core');
    } catch {
      return null;
    }
  }
}

function builderSrc(src) {
  return src.startsWith('^') ? src : `^${src}$`;
}

function firstRoute(pathname, routes) {
  for (const route of routes) {
    const match = pathname.match(new RegExp(builderSrc(route.src)));
    if (match) return { route, match };
  }
  return null;
}

function destPath(route, match) {
  const dest = route.dest.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '');
  return dest.split('?')[0];
}

function readServeDistRewrites(source) {
  const entry = source.match(/SHARED_ENTRY\s*=\s*"([^"]+)"/);
  const vacation = source.match(/VACATION_APP_ENTRY\s*=\s*"([^"]+)"/);
  assert.ok(entry && vacation, 'serve-dist.py shared entry constants');
  return { sharedEntry: entry[1], vacationAppEntry: vacation[1] };
}

async function waitForHttp(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status >= 200 && res.status < 500) return;
    } catch (err) {
      void err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not respond: ${url}`);
}

export async function runSharedServedVacationClientTests() {
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

  const htmlPath = path.join(distDir, 'vacation-app-next.html');
  await access(htmlPath, constants.R_OK);
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /vacation-app-next-.*\.js/);
  assert.doesNotMatch(html, /index-BKun7ofk\.js/);

  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  const serveDistSource = await readFile(path.join(root, 'capture/serve-dist.py'), 'utf8');
  const py = readServeDistRewrites(serveDistSource);
  assert.equal(py.sharedEntry, SHARED_ENTRY);

  const routeSlug = NYC_PR225_SLUG;
  const probes = [
    { path: `/shared/${routeSlug}`, dest: SHARED_ENTRY },
    { path: `/shared/${routeSlug}/journey`, dest: SHARED_ENTRY },
    { path: `/shared/${routeSlug}/report/daily`, dest: SHARED_ENTRY },
    { path: '/edit-access', dest: SHARED_ENTRY },
    { path: '/shared', dest: '/vacation-app.html' },
    { path: '/shared/', dest: '/vacation-app.html' },
  ];
  for (const probe of probes) {
    const found = firstRoute(probe.path, vercel.routes);
    assert.ok(found, probe.path);
    assert.equal(destPath(found.route, found.match), probe.dest, probe.path);
  }

  assert.equal(py.sharedEntry, SHARED_ENTRY);
  assert.equal(py.vacationAppEntry, '/vacation-app.html');

  const port = 9876 + Math.floor(Math.random() * 200);
  const server = spawn('python3', [path.join(root, 'capture/serve-dist.py')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${origin}/api/version`);

    const puppeteer = loadPuppeteer();
    if (!puppeteer) {
      console.warn(
        'shared served vacation client browser checks skipped: puppeteer-core is not installed',
      );
      return;
    }
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const slug = NYC_PR225_SLUG;
    const trekRequests = [];
    try {
      const page = await browser.newPage();
      page.on('request', (req) => {
        const u = req.url();
        if (u.includes('index-BKun7ofk.js')) trekRequests.push(u);
      });

      for (const viewport of [
        { width: 390, height: 844, tag: '390' },
        { width: 1280, height: 800, tag: '1280' },
      ]) {
        await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
        await page.goto(`${origin}/shared/${encodeURIComponent(slug)}/`, {
          waitUntil: 'networkidle0',
          timeout: 120000,
        });
        await page.waitForSelector('[data-trip-view-root="1"]', { timeout: 90000 });
        await page.waitForSelector('footer[data-build-stamp="1"]', { timeout: 30000 });
        const flightsClicked = await page.evaluate(() => {
          for (const btn of document.querySelectorAll('button.tsv-tab')) {
            if (btn.getAttribute('aria-label') === 'Flights') {
              btn.click();
              return true;
            }
          }
          return false;
        });
        assert.equal(flightsClicked, true, `Flights tab click @ ${viewport.tag}`);
        await page.waitForSelector('li[data-list-row="1"]', { timeout: 30000 });

        const hooks = await page.evaluate(() => {
          const flightsTab = [...document.querySelectorAll('button')].find(
            (btn) => btn.textContent?.trim() === 'Flights' || btn.getAttribute('aria-label') === 'Flights',
          );
          const h1 = document.querySelector('h1');
          const footer = document.querySelector('footer[data-build-stamp]');
          const listRow = document.querySelector('li[data-list-row]');
          const detailBtn = document.querySelector('button[aria-label="Open thing details"]');
          return {
            flights: Boolean(flightsTab),
            h1: Boolean(h1 && h1.textContent?.trim()),
            footer: Boolean(footer),
            listRow: Boolean(listRow),
            detailBtn: Boolean(detailBtn),
          };
        });
        assert.equal(hooks.flights, true, `Flights tab @ ${viewport.tag}`);
        assert.equal(hooks.h1, true, `trip title h1 @ ${viewport.tag}`);
        assert.equal(hooks.footer, true, `build stamp footer @ ${viewport.tag}`);
        assert.equal(hooks.listRow, true, `list row @ ${viewport.tag}`);
        assert.equal(hooks.detailBtn, true, `detail opener @ ${viewport.tag}`);

        const artifactRoot =
          process.env.SHARED_SERVED_VACATION_CLIENT_ARTIFACT_ROOT ||
          path.join(root, 'evidence', 'tsv-335-shared-served');
        await mkdir(artifactRoot, { recursive: true });
        await page.screenshot({
          path: path.join(artifactRoot, `shared-${slug}-${viewport.tag}.png`),
          fullPage: false,
        });
      }
      await page.close();
    } finally {
      await browser.close();
    }
    assert.deepEqual(trekRequests, [], 'must not request TREK bundle');

    const gateB = await fetch(`${origin}/api/shared/${encodeURIComponent(GATE_B_APPROVED_SHARED_SLUG)}/`);
    assert.equal(gateB.status, 200);
    const gateJson = await gateB.json();
    assert.ok(Array.isArray(gateJson.places) && gateJson.places.length > 0);
  } finally {
    server.kill('SIGTERM');
  }
}
