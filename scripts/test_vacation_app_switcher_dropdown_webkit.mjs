#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessions, startServer } from './layout-shell-harness.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const candidates = [
    'playwright',
    'playwright-core',
    path.join(root, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
    path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('Playwright required for vacation-app switcher WebKit layout test');
}
const { webkit } = loadPlaywright();

const viewports = [
  { width: 390, height: 844, tag: '390' },
  { width: 430, height: 932, tag: '430' },
];

async function assertSwitcher(page, tag) {
  const closed = await page.evaluate(() => {
    const title = document.querySelector('#tripButton .trip-trigger-title');
    return (title?.textContent || '').trim();
  });
  assert.ok(closed.length > 0, `${tag}: closed switcher label must be non-empty`);
  assert.equal(closed, 'NYC June 2026', `${tag}: derived NYC short name`);

  await page.click('#tripButton');
  await page.waitForFunction(() => document.querySelector('#vacationDropdown')?.classList.contains('open'));
  const panel = await page.evaluate(() => {
    const list = document.querySelector('#vacationDropdown .trip-list');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = list?.getBoundingClientRect();
    if (!box) return { ok: false, reason: 'missing trip-list' };
    return {
      ok: box.left >= 0 && box.top >= 0 && box.right <= vw && box.bottom <= vh,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      vw,
      vh,
    };
  });
  assert.ok(panel.ok, `${tag}: dropdown inside viewport ${JSON.stringify(panel)}`);

  await page.click('#messageText');
  await page.waitForFunction(() => !document.querySelector('#vacationDropdown')?.classList.contains('open'));
}

async function assertSplitterPill(page, tag) {
  const pill = await page.evaluate(() => {
    const splitter = document.getElementById('splitter');
    const row = document.getElementById('splitterRow');
    if (!splitter) return null;
    const after = getComputedStyle(splitter, '::after');
    const touch = (row || splitter).getBoundingClientRect();
    return {
      width: Math.round(parseFloat(after.width) || 0),
      height: Math.round(parseFloat(after.height) || 0),
      handleHeight: Math.round(touch.height),
    };
  });
  assert.ok(pill, `${tag}: splitter required for SITE fixture`);
  assert.ok(pill.width <= 30 && pill.width >= 24, `${tag}: pill width ~27px got ${pill.width}`);
  assert.ok(pill.height <= 3 && pill.height >= 1, `${tag}: pill height ~2px got ${pill.height}`);
  assert.ok(pill.handleHeight >= 44, `${tag}: splitter touch target >= 44px`);
}

async function main() {
  const server = await startServer();
  const browser = await webkit.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const url = `${server.origin}/vacation-app.html?session=${sessions.SWITCHER}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#tripButton', { timeout: 15000 });
      await page.waitForSelector('#splitter', { timeout: 15000 });
      await assertSwitcher(page, viewport.tag);
      await assertSplitterPill(page, viewport.tag);
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log('test_vacation_app_switcher_dropdown_webkit: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
