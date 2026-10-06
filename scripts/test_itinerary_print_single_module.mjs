#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { renderThingCardHtml } from '../src/vacation/itinerary-print.mjs';

const root = new URL('..', import.meta.url);
const moduleRel = 'src/vacation/itinerary-print.mjs';
const bundleRel = 'public/assets/index-BKun7ofk.js';
const cardMarker = 'data-thing-card="1"';
const cardSource = renderThingCardHtml.toString();

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
assert.match(bundle, /return tsRenderThingCard\(/);
assert.doesNotMatch(bundle, /tsRenderDayItinerary=/);
assert.doesNotMatch(bundle, /data-day-itinerary-mount/);
assert.match(bundle, /gridTemplateColumns:"74px 22px 1fr"/);
assert.match(bundle, /tsItineraryDayMedia=function itineraryDayMedia/);
assert.match(bundle, /tsItineraryRowMedia=function itineraryRowMediaInline/);
assert.match(bundle, /data-row-summary="1"/);

for (const rel of files) {
  const text = rel === bundleRel ? bundle : readFileSync(new URL(rel, root), 'utf8');
  if (!text.includes(cardMarker)) continue;
  if (rel === moduleRel) continue;
  if (rel === bundleRel) {
    const injected = cardSource.split(cardMarker).length - 1;
    const found = text.split(cardMarker).length - 1;
    assert.equal(found, injected, `${rel} ${cardMarker} outside the shared module`);
    continue;
  }
  const bad = text.split('\n').filter((line) => line.includes(cardMarker) && !lineAllowed(line));
  assert.deepEqual(bad, [], `${rel} builds ${cardMarker} outside itinerary-print.mjs`);
}

const list = readFileSync(new URL('src/vacation/shared-trip-live-tab-lists.mjs', root), 'utf8');
const patches = readFileSync(new URL('src/vacation/trek-live-product-patches.mjs', root), 'utf8');
assert.match(list, /from '\.\/itinerary-print\.mjs'/);
assert.match(patches, /from '\.\/itinerary-print\.mjs'/);
assert.match(list, /renderThingCardHtml\(/);
assert.doesNotMatch(list, /data-thing-card="1"/);
assert.doesNotMatch(patches, /DAY_ROW_PATCH/);

const described = renderThingCardHtml({
  nameHtml: 'Place',
  summaryHtml: '<div data-row-summary="1" data-summary-thing-only="1">Short from summary</div>',
  bodyHtml: '<p>Summary</p>',
});
assert.match(described, /<h3>Place<\/h3><div data-row-summary="1" data-summary-thing-only="1">Short from summary<\/div>/);

console.log('itinerary print single-module test passed');
