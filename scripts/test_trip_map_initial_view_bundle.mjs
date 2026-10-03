import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { computeTripMapInitialView } from '../src/vacation/trip-map-initial-view.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});

const rendered = renderServedTrekBundle(raw.toString('utf8'));
assert.match(rendered, /tsTripMapInitialView=/);
assert.match(rendered, /tsMapIv=I\.useMemo\(\(\)=>tsTripMapInitialView\(\{places:z,trip:r\}\)/);
assert.match(rendered, /data-map-center-unresolved/);
assert.match(rendered, /tsBindTripMapHookLeaflet/);
assert.match(rendered, /data-ts-map-center/);
assert.match(rendered, /window\.__tsTripMap/);
assert.equal(rendered.includes('or=[p.default_lat'), false);
assert.equal(rendered.includes('center:r=[48.8566,2.3522]'), false);
assert.equal(rendered.includes('center:z=[48.8566,2.3522]'), false);
assert.equal(rendered.includes('default_lat:48.8566'), false);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must match renderServedTrekBundle');

const sample = computeTripMapInitialView({
  places: [{ id: 1, lat: 1.1, lng: 2.2 }],
  trip: {},
});
assert.equal(sample.ok, true);

console.log('trip map initial view bundle tests passed');
