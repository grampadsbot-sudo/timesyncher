import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { patchTripMapHarnessHook } from '../src/vacation/trek-live-product-patches.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});

const rendered = renderServedTrekBundle(raw.toString('utf8'));
assert.match(rendered, /tsBindTripMapHookLeaflet/);
assert.match(rendered, /data-ts-map-center/);
assert.match(rendered, /data-ts-map-zoom/);
assert.match(rendered, /data-ts-map-bounds/);
assert.match(rendered, /data-ts-map-engine/);
assert.match(rendered, /window\.__tsTripMap/);
assert.match(rendered, /tsPublishTripMapHook/);

assert.throws(
  () => patchTripMapHarnessHook('tsMapIv=I.useMemo(()=>tsTripMapInitialView({places:z,trip:r})'),
  /missing MapContainer anchor/,
);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must include trip map harness hook patch');

console.log('trip map harness hook bundle tests passed');
