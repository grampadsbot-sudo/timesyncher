#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { renderDayItineraryHtml, renderThingCardHtml } from '../src/vacation/itinerary-print.mjs';

const root = new URL('..', import.meta.url);
const moduleRel = 'src/vacation/itinerary-print.mjs';
const bundleRel = 'public/assets/index-BKun7ofk.js';
const markers = ['data-thing-card="1"', 'data-day-itinerary="1"'];
const cardSource = renderThingCardHtml.toString();
const daySource = renderDayItineraryHtml.toString();

function walk(rel, out = []) {
  const abs = new URL(rel, root);
  const stat = statSync(abs);
  if (stat.isDirectory()) {
    for (const name of readdirSync(abs)) {
      if (name === 'node_modules' || name === 'fixtures') continue;
      walk(path.posix.join(rel, name), out);
    }
    return out;
  }
  if (nameOk(rel)) out.push(rel);
  return out;
}

function nameOk(rel) {
  return rel.endsWith('.mjs') || rel.endsWith('.js') || rel.endsWith('.html');
}

function lineAllowed(line) {
  return /NEEDLE|PATCH/.test(line) || line.includes('assert.match') || line.includes('assert.doesNotMatch');
}

const files = [
  ...walk('src'),
  'shared-app.html',
  bundleRel,
];
const bundle = readFileSync(new URL(bundleRel, root), 'utf8');
assert.ok(bundle.includes(cardSource));
assert.ok(bundle.includes(daySource));
assert.match(bundle, /return tsRenderThingCard\(/);
assert.match(bundle, /sr=tsRenderDayItinerary\(/);
assert.match(bundle, /data-day-itinerary-mount/);

for (const rel of files) {
  const text = rel === bundleRel ? bundle : readFileSync(new URL(rel, root), 'utf8');
  for (const marker of markers) {
    if (!text.includes(marker)) continue;
    if (rel === moduleRel) continue;
    if (rel === bundleRel) {
      const injected = cardSource.split(marker).length - 1 + daySource.split(marker).length - 1;
      const found = text.split(marker).length - 1;
      assert.equal(found, injected, `${rel} ${marker} outside the shared module`);
      continue;
    }
    const bad = text.split('\n').filter((line) => line.includes(marker) && !lineAllowed(line));
    assert.deepEqual(bad, [], `${rel} builds ${marker} outside itinerary-print.mjs`);
  }
}

const list = readFileSync(new URL('src/vacation/shared-trip-live-tab-lists.mjs', root), 'utf8');
const patches = readFileSync(new URL('src/vacation/trek-live-product-patches.mjs', root), 'utf8');
assert.match(list, /from '\.\/itinerary-print\.mjs'/);
assert.match(patches, /from '\.\/itinerary-print\.mjs'/);
assert.match(list, /renderThingCardHtml\(/);
assert.doesNotMatch(list, /data-thing-card="1"/);
const day = renderDayItineraryHtml({
  titleHtml: 'Day 1',
  openingHtml: '<p>open</p>',
  cardsHtml: renderThingCardHtml({ nameHtml: 'Place', bodyHtml: '<p>Summary</p>' }),
});
assert.match(day, /data-day-itinerary="1"/);
assert.match(day, /data-thing-card="1"/);
assert.match(day, /<p>Summary<\/p>/);

console.log('itinerary print single-module test passed');
