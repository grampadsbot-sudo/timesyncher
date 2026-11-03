#!/usr/bin/env node
import assert from 'node:assert/strict';
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
const script = await readFile(path.join(root, 'public/ts-car-brand-filter.js'), 'utf8');
const hotelRow = '<li data-list-row="1" data-thing-category="hotel"><button><span data-ts-list-row-name="1"><strong>The Wallace Hotel</strong></span> $310</button><div>Below-row summary</div></li>';
const carRow = '<div data-category="car"><button>Hertz JFK $64</button></div>';
const browser = await loadPuppeteer().launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
async function brands(body) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><ul>${body}</ul></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const out = await page.evaluate(() => [...document.querySelectorAll('[data-ts-remove-brand]')].map((b) => b.dataset.tsRemoveBrand));
  await page.close();
  return out;
}
try {
  assert.deepEqual(await brands(hotelRow), [], 'hotel rows with a short priced button are not car brands');
  assert.deepEqual(await brands(hotelRow + carRow), ['Hertz JFK'], 'car rows still get remove controls');
} finally {
  await browser.close();
}
console.log('car brand filter scope checks passed');
