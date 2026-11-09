#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { auditListRowPicPopup, isVisibleElement } from '../src/vacation/list-row-pic-popup-audit.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

assert.equal(isVisibleElement(null), false);
assert.equal(
  isVisibleElement({
    getBoundingClientRect: () => ({ width: 0, height: 10 }),
  }),
  false,
);
const cleanRow = {
  getBoundingClientRect: () => ({ top: 0 }),
  querySelectorAll: () => [],
};
assert.equal(auditListRowPicPopup(cleanRow).ok, true);
assert.equal(auditListRowPicPopup(null).ok, false);

const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundle, /data-ts-pic-thumb-wrap="1"/);
assert.match(bundle, /tsNrClose/);
assert.match(bundle, /ua===gr\.id\?Hl\(\):Rn\(gr\.id\)/);
assert.match(bundle, /data-ts-pic-popup":"1"/);

const upstreamPath = new URL('../public/assets/upstream/index-BKun7ofk.js', import.meta.url);
let upstream = null;
try {
  upstream = await readFile(upstreamPath, 'utf8');
} catch {
  upstream = null;
}
if (upstream) {
  const rebaked = renderServedTrekBundle(upstream);
  assert.equal(rebaked.includes('tsNrClose'), true);
  assert.equal(rebaked, bundle);
}

console.log('ui #866 pic-popup close bundle checks passed');
