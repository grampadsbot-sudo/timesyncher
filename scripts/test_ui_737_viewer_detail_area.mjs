#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import {
  dedupeNeighborhoodChipLabels,
  neighborhoodChipLabel,
  neighborhoodChipMatchesFilter,
} from '../src/vacation/neighborhood-chip-label.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

assert.equal(
  neighborhoodChipLabel(
    'Lincoln Square · Read more · How to get there · 66th St – Lincoln Center • 3 min',
  ),
  'Lincoln Square',
);

assert.equal(
  neighborhoodChipLabel(
    'Chelsea and Clinton, Midtown Manhattan 14th to 59th Street Closest Airport: LGA',
  ),
  'Chelsea',
);

assert.equal(neighborhoodChipLabel('upper west side'), 'Upper West Side');
assert.deepEqual(
  dedupeNeighborhoodChipLabels(['Upper West Side', 'upper west side', 'UPPER WEST SIDE']),
  ['Upper West Side'],
);
assert.equal(neighborhoodChipMatchesFilter('Upper West Side', 'upper west side'), true);
assert.equal(neighborhoodChipMatchesFilter('Upper West Side', 'Upper West Side'), true);

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed);

const { patchUi737 } = await import('../src/vacation/trek-ui-737-patch.mjs');

assert.match(committed, /tsNeighborhoodChipLabel=raw=>/);
assert.match(committed, /if\(s===s\.toLowerCase\(\)&&\/\[a-z\]\/\.test\(s\)/);
assert.match(committed, /const tsChipLabel=raw=>/);
assert.match(committed, /return raw\?tsChipLabel\(raw\):""/);
assert.match(committed, /const nk=n\.toLowerCase\(\);if\(!seen\.has\(nk\)\)/);
assert.match(committed, /const n=\(raw=>\{let s=String\(raw\?\?""\)/);
assert.match(committed, /Ce&&n\.jsxs\("fieldset",\{"data-shared-readonly":void 0/);

const round737Only = patchUi737(committed);
assert.equal(round737Only, committed);

console.log('ui #737 viewer detail + area chip checks passed');
