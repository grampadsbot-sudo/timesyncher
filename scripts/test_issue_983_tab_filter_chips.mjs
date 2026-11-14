#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { patchSharedTabCrossFilters } from '../src/vacation/trek-shared-tab-cross-filter-patch.mjs';
import {
  areaChipsForTab,
  filterPlaces,
  reconcileListFilters,
  typeChipsForTab,
} from '../apps/vacation-client/src/lib/listTabModel.mjs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const patchSrc = readFileSync(
  new URL('../src/vacation/trek-shared-tab-cross-filter-patch.mjs', import.meta.url),
  'utf8',
);

assert.match(patchSrc, /QN_STALE_PATCH/);
assert.match(patchSrc, /GN_STALE_PATCH/);
assert.match(patchSrc, /CI_CHIP_PATCH/);
assert.match(patchSrc, /STORE_CHIP_PATCH/);
assert.match(bundle, /Qn=tsPad\(Oc\.filter\(G=>\{const za=ze\.filter\(Re=>Oa\.includes\(Re\)\)/);
assert.match(bundle, /Gn=tsPad\(Fs\.filter\(G=>\{const za=ze\.filter\(Re=>Oa\.includes\(Re\)\)/);
assert.match(
  bundle,
  /ci=\[\.\.\.new Set\(Oc\.filter\(G=>!G\.__tsLiveFill&&\(!ze\.length\|\|ze\.includes\(En\(G\)\)\)&&\(!Te\.length\|\|Te\.every\(Re=>or\(G\)\.includes\(Re\)\)\)\)/,
);
assert.match(
  bundle,
  /\$n=\[\.\.\.new Set\(Fs\.filter\(G=>!G\.__tsLiveFill&&\(!ze\.length\|\|ze\.includes\(En\(G\)\)\)&&\(!Je\.length\|\|Je\.every\(Re=>vn\(G\)\.includes\(Re\)\)\)\)/,
);

const trip = {
  places: [
    { id: 1, name: 'North seafood', neighborhood: 'North', metadata: { tags: 'Seafood' } },
    { id: 2, name: 'South italian', neighborhood: 'South', metadata: { tags: 'Italian' } },
    { id: 3, name: 'Unused neighborhood', neighborhood: 'Ghost', metadata: { tags: 'GhostTag' } },
  ],
};

const restaurants = trip.places;
assert.deepEqual(
  typeChipsForTab(restaurants, trip, 'restaurants', { area: 'North' }),
  ['All types', 'Seafood'],
  'restaurant type chips follow active area filter',
);
assert.deepEqual(
  areaChipsForTab(restaurants, trip, 'restaurants', { type: 'Italian' }),
  ['All areas', 'South'],
  'restaurant area chips follow active type filter',
);
assert.deepEqual(
  reconcileListFilters({ area: 'Ghost', type: 'All types' }, ['All areas', 'North', 'South'], ['All types', 'Seafood', 'Italian']),
  { area: 'All areas', type: 'All types' },
  'stale area selection resets',
);
assert.deepEqual(
  reconcileListFilters({ area: 'North', type: 'Italian' }, ['All areas', 'North'], ['All types', 'Seafood']),
  { area: 'North', type: 'All types' },
  'stale type selection resets while valid area stays selected',
);

assert.equal(
  filterPlaces(restaurants, trip, 'restaurants', { area: 'North', type: 'Italian' }).length,
  0,
);
assert.equal(
  filterPlaces(restaurants, trip, 'restaurants', { area: 'North', type: 'Seafood' }).length,
  1,
);

const Oc = [
  { id: 'a', neighborhood: 'North', tags: ['Seafood'], __tsLiveFill: false },
  { id: 'b', neighborhood: 'South', tags: ['Italian'], __tsLiveFill: false },
];
const ze = ['Ghost'];
const Te = ['Seafood'];
const En = (G) => G.neighborhood || '';
const or = (G) => G.tags || [];
const Oa = ['North', 'South'];
const ci = [...new Set(Oc.filter((G) => !G.__tsLiveFill && (!ze.length || ze.includes(En(G))) && (!Te.length || Te.every((Re) => or(G).includes(Re)))).flatMap((Re) => or(Re)))];
const reconciled = Oc.filter((G) => {
  const za = ze.filter((Re) => Oa.includes(Re));
  const tp = Te.filter((Re) => ci.includes(Re));
  return (!za.length || za.includes(En(G))) && (!tp.length || tp.every((Re) => or(G).includes(Re)));
});
assert.ok(reconciled.length >= 1, 'stale restaurant area drops and list recovers');

let probe = bundle;
const legacyQn = 'Qn=tsPad(Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re)))),';
assert.equal(probe.includes(legacyQn), false, 'committed bundle must include restaurant stale reconcile');
assert.equal(patchSharedTabCrossFilters(probe), probe, 'bundle already carries #983 cross-filter patches');

console.log('issue #983 tab filter chips OK');