#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { applySharedLiveTabBundlePatches } from '../src/vacation/trek-live-product-patches.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const patchSource = await readFile(`${root}/src/vacation/trek-live-product-patches.mjs`, 'utf8');
assert.match(patchSource, /CONFLICT_LABEL_PATCH = '[^']*minWidth:0,flex:"1 1 0"/);
assert.doesNotMatch(patchSource, /CONFLICT_LABEL_PATCH = '[^']*whiteSpace:"nowrap"/);
assert.doesNotMatch(patchSource, /CONFLICT_LABEL_PATCH = '[^']*textOverflow:"ellipsis"/);

const upstream = execFileSync(
  'git',
  ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'],
  { maxBuffer: 25 * 1024 * 1024 },
).toString('utf8');
const patched = applySharedLiveTabBundlePatches(upstream, { served: true });
const labelIdx = patched.indexOf('data-ts-conflict-label":"1"');
assert.ok(labelIdx > 0, 'served conflict label marker must apply from upstream');
const labelSlice = patched.slice(labelIdx, labelIdx + 520);
assert.doesNotMatch(labelSlice, /whiteSpace:"nowrap"/);
assert.doesNotMatch(labelSlice, /textOverflow:"ellipsis"/);
assert.match(labelSlice, /flex:"1 1 0"/);

const served = await readFile(`${root}/public/assets/index-BKun7ofk.js`, 'utf8');
assert.match(served, /data-ts-conflict-label":"1"/);
assert.doesNotMatch(served, /data-ts-conflict-label":"1"[^]{0,400}whiteSpace:"nowrap"/);

console.log('timeline conflict label wrap passed');
