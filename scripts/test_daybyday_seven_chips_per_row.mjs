#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  puppeteer = require('/tmp/pptr/node_modules/puppeteer-core');
}

const root = new URL('../', import.meta.url);
const origin = 'http://127.0.0.1:1185';
const fixturePath = '/shared/week-row-fixture/';
const apiPath = '/api/shared/week-row-fixture';
const viewports = [[390, 844], [430, 932], [1280, 800]];
const dayCount = 17;
const days = Array.from({ length: dayCount }, (_, index) => {
  const dayNumber = index + 1;
  return {
    id: dayNumber,
    trip_id: 1185,
    day_number: dayNumber,
    title: `Fixture itinerary for day ${dayNumber}`,
    date: `2026-06-${String(dayNumber).padStart(2, '0')}`,
  };
});
const fixture = {
  trip: {
    id: 1185,
    title: 'Week Row Fixture',
    start_date: days[0].date,
    end_date: days.at(-1).date,
    currency: 'USD',
  },
  days,
  assignments: [],
  places: [],
  categories: [],
  media: [],
  permissions: { share_map: true },
};

const types = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
};

async function respondToFixture(request) {
  const { origin: requestOrigin, pathname } = new URL(request.url());
  if (requestOrigin !== origin || request.method() !== 'GET') return request.abort();
  if (pathname === apiPath || pathname === `${apiPath}/`) {
    return request.respond({ contentType: types.json, body: JSON.stringify(fixture) });
  }
  if (pathname.startsWith('/api/')) {
    return request.respond({
      contentType: types.json,
      body: JSON.stringify({ canEdit: false, notices: [], bindings: [], media: [] }),
    });
  }
  const relativePath = pathname === fixturePath ? 'shared-app.html' : `public${pathname}`;
  const body = await readFile(new URL(relativePath, root)).catch((error) => {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
    return null;
  });
  if (!body) return request.respond({ status: 404 });
  return request.respond({ contentType: types[relativePath.split('.').at(-1)], body });
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const screenshotDir = process.env.DAY_CHIP_SCREENSHOTS;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

try {
  const measurements = [];
  for (const [width, height] of viewports) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: width < 500, isMobile: width < 500 });
      await page.setRequestInterception(true);
      page.on('request', respondToFixture);
      await page.goto(`${origin}${fixturePath}`, { waitUntil: 'domcontentloaded' });
      await page.locator('::-p-xpath(//button[normalize-space(.)="Day-by-Day"])').click();
      const selector = '::-p-xpath(//div[normalize-space(text())="Vacation Day View"]/../../following-sibling::div[1][button])';
      const group = await page.waitForSelector(selector, { visible: true });
      await page.evaluate(() => document.fonts.ready);
      const chips = await group.evaluate((element) => [...element.children].map((button) => {
        const box = button.getBoundingClientRect();
        const groupBox = element.getBoundingClientRect();
        const style = getComputedStyle(button);
        const label = document.createRange();
        label.selectNodeContents(button);
        const text = label.getBoundingClientRect();
        const tolerance = 0.5;
        return {
          label: button.textContent.trim(),
          top: box.top,
          visible: text.width > 0 && text.height > 0
            && box.left >= Math.max(0, groupBox.left) - tolerance
            && box.right <= Math.min(window.innerWidth, groupBox.right) + tolerance
            && text.left >= box.left + button.clientLeft - tolerance
            && text.right <= box.left + button.clientLeft + button.clientWidth + tolerance
            && text.top >= box.top + button.clientTop - tolerance
            && text.bottom <= box.top + button.clientTop + button.clientHeight + tolerance,
          overflow: [style.overflowX, style.overflowY, style.textOverflow],
        };
      }));
      const rows = [];
      for (const chip of chips) {
        if (!rows.length || Math.abs(chip.top - rows.at(-1)[0].top) > 1) rows.push([]);
        rows.at(-1).push(chip);
      }
      console.log(`${width}x${height}: ${rows.map((row) => row.map((chip) => chip.label).join(', ')).join(' | ')}`);
      if (screenshotDir) {
        await group.screenshot({ path: `${screenshotDir}/day-chips-${width}.png`, scrollIntoView: true });
      }
      measurements.push({ width, height, rows, chips });
    } finally {
      await page.close();
    }
  }

  const expectedRows = [];
  for (let index = 0; index < dayCount; index += 7) {
    expectedRows.push(days.slice(index, index + 7).map(({ day_number }) => `Day ${day_number}`));
  }
  for (const { width, height, rows, chips } of measurements) {
    const size = `${width}x${height}`;
    assert.deepEqual(rows.map((row) => row.map(({ label }) => label)), expectedRows, `${size} day chip rows`);
    for (const chip of chips) {
      assert.ok(chip.visible, `${size} ${chip.label} must fit inside the chip and viewport`);
      assert.ok(chip.overflow.every((value) => !['hidden', 'clip', 'ellipsis'].includes(value) || value === 'clip' && chip.overflow[2] === value),
        `${size} ${chip.label} must not use hidden overflow or an ellipsis`);
    }
  }
} finally {
  await browser.close();
}
