#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { renderStarRatingHtml } from '../src/vacation/star-rating-model.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const bundle = readFileSync(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');

assert.match(
  css,
  /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*\[data-shared-live-tab="hotels"\][\s\S]*\[data-ts-hotel-row-head="1"\]/,
  'served CSS must address Hotels list titles at 390px via data-ts-hotel-row-head',
);
assert.match(
  css,
  /\[data-shared-live-tab="hotels"\] \[data-ts-hotel-row-head="1"\] strong[\s\S]*white-space:\s*normal!important/,
  'hotel names wrap at 390px',
);
assert.doesNotMatch(
  css,
  /\[data-shared-live-tab="hotels"\] \[data-ts-hotel-row-head="1"\] strong[\s\S]*text-overflow:\s*ellipsis!important/,
  'hotel names must not ellipsis-clip at 390px',
);
assert.match(
  bundle,
  /data-ts-hotel-row-head":"1"[\s\S]*whiteSpace:"normal",overflowWrap:"anywhere",fontWeight:800\},children:Re/,
  'served bundle hotel title strong wraps',
);
assert.match(bundle, /data-ts-hotel-row-head":"1"/, 'served bundle must mark hotel row head for mobile CSS');
assert.match(bundle, /data-ts-budget-row":"1"/);
assert.match(bundle, /data-ts-budget-panel":"1"/);

const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  puppeteer = require('/tmp/pptr/node_modules/puppeteer-core');
}
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.setContent(`<style>${css}</style><div data-shared-live-tab="hotels" style="width:calc(100% - 32px);margin:16px"></div>`);
  const start = bundle.indexOf('be=({item:G})=>');
  const end = bundle.indexOf(',tt=G=>', start);
  assert.ok(start > 0 && end > start, 'served list renderer anchors exist');
  const names = [
    'Motto by Hilton New York City Times Square',
    'TownePlace Suites by Marriott New York Manhattan/Chelsea',
    'Library Hotel by Library Hotel Collection',
    'Park Central Hotel New York',
  ];
  const measurements = await page.evaluate(({ rows, names, stars }) => {
    const jsx = (type, props) => {
      if (typeof type === 'function') return type(props);
      const node = document.createElement(type);
      for (const [key, value] of Object.entries(props || {})) {
        if (key === 'style') {
          for (const [property, v] of Object.entries(value)) {
            node.style[property] = typeof v === 'number' && v !== 0 && !['fontWeight', 'lineHeight', 'flexShrink', 'zIndex'].includes(property) ? `${v}px` : v;
          }
        } else if (key === 'dangerouslySetInnerHTML') node.innerHTML = value.__html;
        else if (key !== 'children' && !key.startsWith('on')) node.setAttribute(key, value);
      }
      for (const child of [props?.children].flat(Infinity)) {
        if (child !== null && child !== undefined && child !== false) node.append(child);
      }
      return node;
    };
    const env = {
      n: { jsx, jsxs: jsx }, mr: (p) => p.name, ie: () => '$404',
      Mi: () => false, Zi: () => true, bn: () => false, ha: (p) => p,
      tsPrimaryPlaceStarRating: () => 4.5, tsRenderStarRatingHtml: () => stars,
      tsStarRatingAria: () => '4.5 out of 5 stars', fo: () => [], _l: () => '',
      Qt: (p) => p.id, It: () => 'hotel', Sa: false, xt: null, Ce: false,
      kl: () => null, Ds: () => false, Nr: () => null,
      la: { start_date: '2026-06-17' }, cn: [], Qa: [], Yi: () => [], Ar: () => '', hn: () => '',
      tsThingTravelTotalLabel: (p) => {
        const raw = String(p?.price ?? '$404').replace(/[^\d.]/g, '');
        const rate = Number(raw) || 404;
        return `$${Math.round(rate * 7 * 1.2).toLocaleString('en-US')} est. total`;
      },
      dc: () => jsx('span', { style: { width: 28, minWidth: 28, height: 28 } }),
    };
    const render = new Function(...Object.keys(env), `const ${rows};return Oe;`)(...Object.values(env));
    const list = document.querySelector('[data-shared-live-tab]');
    document.body.style.margin = '0';
    return names.map((name, id) => {
      const row = render({ id, name });
      list.append(row);
      const title = row.querySelector('[data-ts-list-row-name] strong');
      const range = document.createRange();
      range.selectNodeContents(title);
      const rects = [...range.getClientRects()].filter((r) => r.width > 1);
      const header = row.querySelector('[data-ts-thing-header]').getBoundingClientRect();
      const rating = row.querySelector('[data-ts-list-row-rating]').getBoundingClientRect();
      const glyphs = row.querySelector('.ts-star-rating').getBoundingClientRect();
      const dates = row.querySelector('[data-ts-list-date-range]').getBoundingClientRect();
      const price = row.querySelector('[data-ts-list-price]').getBoundingClientRect();
      const nameRow = row.querySelector('[data-ts-logo-name-pair]').getBoundingClientRect();
      let clipped = false;
      for (let el = title; el && el !== row; el = el.parentElement) {
        const style = getComputedStyle(el);
        clipped ||= style.textOverflow === 'ellipsis' || style.whiteSpace === 'nowrap' || style.overflowX === 'hidden' || (style.webkitLineClamp && style.webkitLineClamp !== 'none');
      }
      return { name: title.textContent, lines: new Set(rects.map((r) => Math.round(r.top))).size, clipped,
        inBounds: rects.every((r) => r.left >= header.left && r.right <= header.right),
        clearOfStars: rects.every((r) => r.right <= glyphs.left || r.bottom <= glyphs.top || r.top >= glyphs.bottom),
        starsBeforeDates: glyphs.width > 40 && dates.left >= glyphs.right - 4,
        datesRight: dates.right >= header.right - 4 && dates.left > glyphs.right,
        priceTop: price.top <= nameRow.bottom + 2 && price.right <= header.right + 1 };
    });
  }, { rows: bundle.slice(start, end), names, stars: renderStarRatingHtml(4.5) });
  for (const [i, measured] of measurements.entries()) {
    assert.equal(measured.name, names[i]);
    assert.ok(measured.lines > 0 && measured.lines <= 3, `${measured.name}: ${measured.lines} lines at 390px`);
    assert.equal(measured.clipped, false, `${measured.name}: full name visible`);
    assert.equal(measured.inBounds, true, `${measured.name}: name stays in row`);
    assert.equal(measured.clearOfStars, true, `${measured.name}: name does not overlap stars`);
    assert.equal(measured.starsBeforeDates, true, `${measured.name}: stars precede dates on second row`);
    assert.equal(measured.datesRight, true, `${measured.name}: dates right-aligned`);
    assert.equal(measured.priceTop, true, `${measured.name}: price on name row`);
  }
} finally {
  await browser.close();
}

console.log('shared hotels 390px name wrap contract OK');
