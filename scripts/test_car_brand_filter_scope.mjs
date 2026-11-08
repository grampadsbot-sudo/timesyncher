#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = process.env.CAR_BRAND_FALLBACK_OUT || path.join(root, '.artifacts/nyc-screen-verify/screenshots');
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
const noLogo =
  '<li data-list-row="1" data-thing-category="car" data-rental-company="Dollar"><span data-ts-list-row-name="1"><strong>Dollar JFK — Compact</strong></span> $49</li>';
const brokenLogo =
  '<li data-list-row="1" data-thing-category="car" data-rental-company="Priceline" data-logo-src="data:image/png;base64,AA=="><span data-ts-list-row-name="1"><strong>Priceline opaque JFK — SUV</strong></span> $62</li>';
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
async function shotBrandBar(body, name, width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 220 });
  await page.setContent(`<!doctype html><body><div data-shared-live-tab="cars"><ul>${body}</ul></div></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-ts-brand-toggle] img');
      return img && (img.dataset.tsBrandLogoFallback === 'category' || img.naturalWidth > 0);
    },
    { timeout: 5000 },
  );
  await mkdir(outDir, { recursive: true });
  const tag = width <= 390 ? 'phone' : 'desktop';
  await page.screenshot({ path: path.join(outDir, `pt3019-cars-brand-${name}-${tag}-preview.png`) });
  await page.close();
}

async function categoryFallbackInk(body) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><div data-shared-live-tab="cars"><ul>${body}</ul></div></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-ts-brand-toggle] img');
      return img && img.dataset.tsBrandLogoFallback === 'category';
    },
    { timeout: 5000 },
  );
  const out = await page.evaluate(() => {
    const img = document.querySelector('[data-ts-brand-toggle] img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    let light = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 64) continue;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < 120) ink += 1;
      else if (lum > 230) light += 1;
    }
    return { ink, light, nw: img.naturalWidth, src: img.getAttribute('src') || '' };
  });
  await page.close();
  return out;
}

async function brandLogos(body) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><div data-shared-live-tab="cars"><ul>${body}</ul></div></body>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-ts-brand-toggle] img');
      return img && (img.dataset.tsBrandLogoFallback === 'category' || img.naturalWidth > 0);
    },
    { timeout: 5000 },
  );
  const out = await page.evaluate(() =>
    [...document.querySelectorAll('[data-ts-brand-toggle] img')].map((img) => ({
      brand: img.closest('[data-ts-brand-toggle]')?.dataset?.tsBrandToggle || '',
      src: img.getAttribute('src') || '',
      nw: img.naturalWidth,
      fb: img.dataset.tsBrandLogoFallback || '',
    })),
  );
  await page.close();
  return out;
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
  const missingUrl = await brandLogos(noLogo);
  assert.equal(missingUrl.length, 1);
  assert.equal(missingUrl[0].fb, 'category');
  assert.ok(missingUrl[0].nw > 0, 'no-URL brand shows category icon');
  assert.match(missingUrl[0].src, /^data:image\/svg\+xml/);
  assert.doesNotMatch(decodeURIComponent(missingUrl[0].src), /<text[\s>]/i, 'category fallback must not use SVG text glyphs');
  const broken = await brandLogos(brokenLogo);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].fb, 'category');
  assert.ok(broken[0].nw > 0, 'broken URL brand falls back to category icon');
  const noUrlInk = await categoryFallbackInk(noLogo);
  assert.ok(noUrlInk.ink >= 12, `category fallback renders vector ink: ${JSON.stringify(noUrlInk)}`);
  const brokenInk = await categoryFallbackInk(brokenLogo);
  assert.ok(brokenInk.ink >= 12, `broken-url category fallback renders vector ink: ${JSON.stringify(brokenInk)}`);
  for (const width of [390, 1280]) {
    await shotBrandBar(noLogo, 'no-url-fallback', width);
    await shotBrandBar(brokenLogo, 'broken-url-fallback', width);
  }
} finally {
  await browser.close();
}
console.log('car brand filter scope checks passed');
