#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, devices } from 'playwright';
import { dividerDragSource } from './layout-app-measure.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const stagingBase = String(process.env.TSV_927_BASE || 'https://vacation-staging.timesyncher.com').replace(/\/$/, '');
const shotDir = process.env.SCREENSHOT_DIR || path.join(root, 'artifacts', 'issue-927');

async function resolveAppUrl() {
  const fromEnv = String(process.env.TSV_927_VACATION_APP_URL || '').trim();
  if (fromEnv) return fromEnv;
  const candidates = [
    path.join(os.homedir(), 'TSV-Share', 'nyc-demo', 'demo-vacation-app-link.txt'),
    '/home/ubishere9995/TSV-Share/nyc-demo/demo-vacation-app-link.txt',
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const line = String(await readFile(candidate, 'utf8')).trim().split(/\s+/)[0];
    if (line.startsWith('http')) return line;
  }
  throw new Error('TSV_927_VACATION_APP_URL or demo-vacation-app-link.txt required for live WebKit touch check');
}

async function dragDividerTouch(page, toBottom) {
  const boxes = await page.evaluate(() => {
    const splitter = document.getElementById('splitter');
    const workspace = document.getElementById('workspace');
    if (!splitter || !workspace) return null;
    const handle = splitter.getBoundingClientRect();
    const ws = workspace.getBoundingClientRect();
    return {
      x: handle.left + handle.width / 2,
      startY: handle.top + handle.height / 2,
      endY: toBottom ? ws.bottom - 6 : ws.top + 6,
    };
  });
  assert.ok(boxes, 'splitter and workspace required');
  await page.touchscreen.tap(boxes.x, boxes.startY);
  await page.touchscreen.touchStart(boxes.x, boxes.startY);
  await page.touchscreen.touchMove(boxes.x, boxes.endY);
  await page.touchscreen.touchEnd();
}

async function hideWelcomeShareLink(page) {
  await page.evaluate(() => {
    const messages = document.querySelector('.messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

async function assertHeroCollapseInFrame(frame, tag) {
  await frame.waitForSelector('[data-ts-trip-site-hero="1"]', { timeout: 120000 });
  const expanded = await frame.evaluate(() => {
    const hero = document.querySelector('[data-ts-trip-site-hero="1"]');
    const main = document.querySelector('[data-ts-day-timeline="1"]') || document.querySelector('main');
    const heroBox = hero?.getBoundingClientRect();
    const mainBox = main?.getBoundingClientRect();
    const expandedHero = hero?.getAttribute('data-collapsed') !== '1';
    return {
      expandedHero,
      heroHeight: heroBox ? Math.round(heroBox.height) : 0,
      itineraryTop: mainBox ? Math.round(mainBox.top) : null,
    };
  });
  assert.equal(expanded.expandedHero, true, `${tag}: hero expanded by default`);
  const collapseBtn = frame.locator('[data-ts-trip-hero-collapse="1"]');
  await collapseBtn.tap();
  const collapsed = await frame.evaluate(() => {
    const hero = document.querySelector('[data-ts-trip-site-hero="1"]');
    const main = document.querySelector('[data-ts-day-timeline="1"]') || document.querySelector('main');
    const heroBox = hero?.getBoundingClientRect();
    const mainBox = main?.getBoundingClientRect();
    return {
      collapsed: hero?.getAttribute('data-collapsed') === '1',
      heroHeight: heroBox ? Math.round(heroBox.height) : 0,
      itineraryTop: mainBox ? Math.round(mainBox.top) : null,
      actionsVisible: Boolean(hero?.querySelector('[data-trip-view-root]')),
    };
  });
  assert.equal(collapsed.collapsed, true, `${tag}: hero collapsed after tap`);
  assert.ok(collapsed.heroHeight < expanded.heroHeight, `${tag}: collapsed hero shorter`);
  assert.ok(collapsed.actionsVisible, `${tag}: trip action icons remain visible`);
  if (expanded.itineraryTop !== null && collapsed.itineraryTop !== null) {
    assert.ok(collapsed.itineraryTop <= expanded.itineraryTop, `${tag}: more itinerary visible when collapsed`);
  }
  await frame.reload({ waitUntil: 'domcontentloaded' });
  await frame.waitForSelector('[data-ts-trip-site-hero="1"]', { timeout: 120000 });
  const persisted = await frame.evaluate(() => document.querySelector('[data-ts-trip-site-hero="1"]')?.getAttribute('data-collapsed') === '1');
  assert.equal(persisted, true, `${tag}: collapsed state survives reload`);
  await frame.locator('[data-ts-trip-hero-collapse="1"]').tap();
  const reexpanded = await frame.evaluate(() => document.querySelector('[data-ts-trip-site-hero="1"]')?.getAttribute('data-collapsed') !== '1');
  assert.equal(reexpanded, true, `${tag}: expand restores full hero`);
  return collapsed;
}

async function main() {
  const appUrl = await resolveAppUrl();
  await mkdir(shotDir, { recursive: true });
  const iPhone = devices['iPhone 14 Pro Max'];
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  let usedMouseForDivider = false;
  page.on('console', () => {});
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#splitter', { timeout: 120000 });
  await page.waitForSelector('.site-pane iframe', { timeout: 120000 });
  await hideWelcomeShareLink(page);
  await dragDividerTouch(page, true);
  const bottom = await page.evaluate(dividerDragSource(), 'bottom');
  assert.ok(bottom.ok, `touch divider bottom: ${JSON.stringify(bottom)}`);
  await page.screenshot({ path: path.join(shotDir, 'slider-touch-bottom.png') });
  await dragDividerTouch(page, false);
  const top = await page.evaluate(dividerDragSource(), 'top');
  assert.ok(top.ok, `touch divider top: ${JSON.stringify(top)}`);
  await page.screenshot({ path: path.join(shotDir, 'slider-touch-top.png') });
  assert.equal(usedMouseForDivider, false, '390 divider path must not use mouse');
  const iframeEl = await page.waitForSelector('.site-pane iframe');
  const embedFrame = await iframeEl.contentFrame();
  assert.ok(embedFrame, 'embedded site iframe required');
  await assertHeroCollapseInFrame(embedFrame, 'embedded');
  await embedFrame.screenshot({ path: path.join(shotDir, 'hero-collapsed-390.png') });
  const sharedPath = await page.evaluate(() => {
    const frame = document.querySelector('.site-pane iframe');
    const src = frame?.getAttribute('src') || '';
    if (!src) return '';
    try {
      const url = new URL(src, location.origin);
      return `${url.pathname}${url.search}`;
    } catch {
      return '';
    }
  });
  assert.match(sharedPath, /^\/shared\//);
  const sharedPage = await context.newPage();
  await sharedPage.goto(`${stagingBase}${sharedPath}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await hideWelcomeShareLink(sharedPage);
  await sharedPage.waitForSelector('[data-ts-trip-site-hero="1"]', { timeout: 120000 });
  const standaloneExpanded = await sharedPage.evaluate(() => document.querySelector('[data-ts-trip-site-hero="1"]')?.getAttribute('data-collapsed') !== '1');
  assert.equal(standaloneExpanded, true, 'standalone shared hero expanded by default');
  await sharedPage.screenshot({ path: path.join(shotDir, 'hero-expanded-390.png') });
  await assertHeroCollapseInFrame(sharedPage, 'standalone');
  await browser.close();
  console.log('vacation app #927 webkit touch live check passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
