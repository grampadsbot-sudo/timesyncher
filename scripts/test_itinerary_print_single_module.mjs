#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  dayItineraryBundleExpr,
  itinerarySurfaceCss,
  renderDayItineraryHtml,
  renderThingCardHtml,
  thingCardBundleExpr,
} from '../src/vacation/itinerary-print.mjs';

const root = new URL('..', import.meta.url);
const moduleRel = 'src/vacation/itinerary-print.mjs';
const bundleRel = 'public/assets/index-BKun7ofk.js';
const markers = ['data-thing-card="1"', 'data-day-itinerary="1"'];
const cardExpr = thingCardBundleExpr();
const dayExpr = dayItineraryBundleExpr();

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
  if (rel.endsWith('.mjs') || rel.endsWith('.js') || rel.endsWith('.html')) out.push(rel);
  return out;
}

function lineAllowed(line) {
  return /NEEDLE|PATCH/.test(line) || line.includes('assert.match') || line.includes('assert.doesNotMatch');
}

const bundle = readFileSync(new URL(bundleRel, root), 'utf8');
assert.match(bundle, /data-ts-list-sort-header/);
assert.doesNotMatch(bundle, /Wr=\(\)=>null/);
assert.doesNotMatch(bundle, /data-day-itinerary-mount/);
assert.match(bundle, /gridTemplateColumns:"74px 22px 1fr"/);
assert.equal(bundle.includes(cardExpr), false);
assert.equal(bundle.includes(dayExpr), false);

for (const rel of [...walk('src'), 'shared-app.html']) {
  if (rel === moduleRel) continue;
  const text = readFileSync(new URL(rel, root), 'utf8');
  for (const marker of markers) {
    if (!text.includes(marker)) continue;
    const bad = text.split('\n').filter((line) => line.includes(marker) && !lineAllowed(line));
    assert.deepEqual(bad, [], `${rel} builds ${marker} outside itinerary-print.mjs`);
  }
}

const list = readFileSync(new URL('src/vacation/shared-trip-live-tab-lists.mjs', root), 'utf8');
assert.match(list, /from '\.\/itinerary-print\.mjs'/);
assert.match(list, /renderThingCardHtml\(/);
assert.doesNotMatch(list, /data-thing-card="1"/);
assert.notEqual(itinerarySurfaceCss('web'), itinerarySurfaceCss('print'));
const card = renderThingCardHtml({ nameHtml: 'Place', summaryHtml: 'Summary' });
const printed = renderThingCardHtml({ surface: 'print', nameHtml: 'Place', summaryHtml: 'Summary' });
assert.match(card, /data-surface="web"/);
assert.match(printed, /data-surface="print"/);
assert.match(card, /class="ts-nyc-card"/);
assert.match(printed, /class="ts-nyc-card"/);
const day = renderDayItineraryHtml({ titleHtml: 'Day 1', rowsHtml: card });
assert.match(day, /data-day-itinerary="1"/);
assert.match(day, /data-surface="web"/);
assert.match(day, /data-thing-card="1"/);

console.log('itinerary print single-module test passed');
