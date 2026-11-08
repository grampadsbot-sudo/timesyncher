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
const hotelRow = '<li class="tsv-row" data-ts-list-row="1"><span data-ts-list-row-name="1"><strong>The Wallace Hotel</strong></span> $310</li>';
const taggedHotelRow = '<li data-list-row="1" data-thing-category="hotel"><button><span data-ts-list-row-name="1"><strong>Hotel Edison</strong></span> $182</button></li>';
const hertzA =
  '<li data-list-row="1" data-thing-category="car" data-rental-company="Hertz" data-logo-src="https://icons.duckduckgo.com/ip3/hertz.com.ico"><span data-ts-list-row-name="1"><strong>Hertz JFK — Compact SUV</strong></span> $64</li>';
const hertzB =
  '<li data-list-row="1" data-thing-category="car" data-rental-company="Hertz" data-logo-src="https://icons.duckduckgo.com/ip3/hertz.com.ico"><span data-ts-list-row-name="1"><strong>Hertz JFK — Midsize sedan</strong></span> $71</li>';
const thrifty =
  '<li data-list-row="1" data-thing-category="car" data-rental-company="Thrifty" data-logo-src="https://www.thrifty.com/favicon.ico"><span data-ts-list-row-name="1"><strong>Thrifty JFK — Midsize sedan</strong></span> $55</li>';
const browser = await loadPuppeteer().launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
async function brands(body) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><div data-shared-live-tab="cars"><ul>${body}</ul></div></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const out = await page.evaluate(() =>
    [...document.querySelectorAll('[data-ts-brand-toggle]')].map((b) => ({
      key: b.dataset.tsBrandToggle,
      label: b.textContent?.replace(/\s+/g, ' ').trim() || '',
    })),
  );
  await page.close();
  return out;
}
async function visible(body, brandKey) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><div data-shared-live-tab="cars"><ul>${body}</ul></div></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate((key) => {
    const toggle = document.querySelector(`[data-ts-brand-toggle="${key}"] input`);
    if (toggle && toggle.checked) toggle.click();
  }, brandKey);
  await new Promise((r) => setTimeout(r, 50));
  const visibleCount = await page.evaluate(() =>
    [...document.querySelectorAll('[data-list-row]')].filter((el) => el.offsetParent !== null).length,
  );
  await page.close();
  return visibleCount;
}
async function brandsOnFlightsTab(body) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><div id="root"><ul>${body}</ul></div></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    const flights = document.createElement('button');
    flights.setAttribute('role', 'tab');
    flights.setAttribute('aria-label', 'Flights');
    flights.setAttribute('aria-selected', 'true');
    document.body.prepend(flights);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const out = await page.evaluate(() => ({
    brands: [...document.querySelectorAll('[data-ts-brand-toggle]')].map((b) => b.dataset.tsBrandToggle),
    bar: !!document.querySelector('[data-ts-car-brands]'),
  }));
  await page.close();
  return out;
}

try {
  assert.deepEqual(await brands(hotelRow), [], 'list rows without tsv-row-car are not car brands');
  assert.deepEqual(await brands(taggedHotelRow), [], 'tagged hotel rows are not car brands');
  const allCars = await brands(hertzA + hertzB + thrifty);
  assert.deepEqual(
    allCars.map((b) => b.key).sort(),
    ['hertz', 'thrifty'],
    'one checkbox per rentalCompany brand, not per vehicle',
  );
  assert.ok(allCars.every((b) => !/suv|sedan|compact|midsize/i.test(b.label)), 'toggle labels must be brand names');
  assert.equal(await visible(hertzA + hertzB + thrifty, 'hertz'), 1, 'unchecking Hertz hides every Hertz row');
  const flightsLeak = await brandsOnFlightsTab(hertzA);
  assert.deepEqual(flightsLeak.brands, [], 'car remove controls must not mount when Flights tab is active');
  assert.equal(flightsLeak.bar, false, 'car brand bar must not mount when Flights tab is active');
} finally {
  await browser.close();
}
console.log('car brand filter scope checks passed');
