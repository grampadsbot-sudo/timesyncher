#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const sharedApp = readFileSync(new URL('../shared-app.html', import.meta.url), 'utf8');
const vacationApp = readFileSync(new URL('../vacation-app.html', import.meta.url), 'utf8');

assert.match(sharedApp, /\[data-ts-logo-chip\]\[data-tab-category\] \{/);
assert.match(sharedApp, /top:\s*0\s*!important/);
assert.doesNotMatch(sharedApp, /\[data-ts-logo-chip\]\[data-tab-category="(?:hotels|cars|flights|stores)"\]/);
assert.doesNotMatch(vacationApp, /data-tab-category/);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const tabPatch = rendered.match(/data-tab-category":G\.id[^]{0,260}/)?.[0] || '';
assert.ok(tabPatch.includes('data-tab-category":G.id'), 'category tab patch must set data-tab-category');
assert.equal((rendered.match(/data-tab-category":G\.id/g) || []).length, 1, 'bundle must contain one tab-category anchor');

const tabChipAnchor = rendered.match(/data-tab-category":G\.id[^]{0,320}/)?.[0] || '';
assert.ok(tabChipAnchor.includes('data-ts-logo-chip'), 'tab row chip uses data-tab-category');
assert.doesNotMatch(vacationApp, /data-tab-category/);
assert.doesNotMatch(vacationApp, /\[data-ts-logo-chip\]\[data-tab-category/);

const mapChip = rendered.match(/data-ts-logo-chip="1" style="width:30px[^]{0,120}/)?.[0] || '';
assert.ok(mapChip && !mapChip.includes('data-tab-category'), 'map marker chip must not use data-tab-category');

console.log('shared tab category css blast radius tests passed');
