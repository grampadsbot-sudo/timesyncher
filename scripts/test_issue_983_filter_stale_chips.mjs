#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const patchSrc = readFileSync(new URL('../src/vacation/trek-shared-tab-cross-filter-patch.mjs', import.meta.url), 'utf8');

const Oc = [
  { id: 1, name: 'UWS seafood', area: 'Upper West Side', __tsLiveFill: false },
  { id: 2, name: 'Midtown Italian', area: 'Midtown', __tsLiveFill: false },
  { id: 3, name: 'Fill placeholder', __tsLiveFill: true, area: 'Midtown' },
];
const ze = ['Upper West Side'];
const Te = ['Italian'];
const En = (G) => G.area || '';
const or = (G) => (G.name.includes('seafood') ? ['Seafood'] : G.name.includes('Italian') ? ['Italian'] : []);

const Oa = [
  ...new Set(
    Oc.filter((G) => !G.__tsLiveFill && (!Te.length || Te.every((Re) => or(G).includes(Re))))
      .map((G) => En(G))
      .filter(Boolean),
  ),
].sort();
assert.deepEqual(Oa, ['Midtown'], 'restaurant area chips must follow active tag filters');

const ci = [
  ...new Set(
    Oc.filter((G) => !G.__tsLiveFill && (!ze.length || ze.includes(En(G))))
      .flatMap((G) => or(G))
      .filter(Boolean),
  ),
];
assert.deepEqual(ci, ['Seafood'], 'restaurant tag chips must follow active area filters');

const za = ze.filter((g) => Oa.includes(g));
const tp = Te.filter((g) => ci.includes(g));
assert.deepEqual(za, [], 'stale Upper West Side drops when opposite-filter areas exclude it');
assert.deepEqual(tp, [], 'stale Italian drops when tag chip is absent under area filter');

const Qn = Oc.filter((G) => {
  const areaPick = ze.filter((Re) => Oa.includes(Re));
  const tagPick = Te.filter((Re) => ci.includes(Re));
  return (!areaPick.length || areaPick.includes(En(G))) && (!tagPick.length || tagPick.every((Re) => or(G).includes(Re)));
});
assert.equal(
  Qn.filter((G) => !G.__tsLiveFill).length,
  2,
  'reconciled stale combo still lists real rows, not zero-result trap',
);
assert.equal(
  Oc.filter(
    (G) =>
      !G.__tsLiveFill &&
      (!ze.length || ze.includes(En(G))) &&
      (!Te.length || Te.every((Re) => or(G).includes(Re))),
  ).length,
  0,
  'unreconciled stale selection would empty the list',
);

assert.match(patchSrc, /QN_STALE_PATCH/);
const listDates = readFileSync(new URL('../src/vacation/list-row-dates.mjs', import.meta.url), 'utf8');
assert.match(listDates, /FILTER_CHIP_STALE_RESET_MARKER/);
assert.match(bundle, /Qn=tsPad\(Oc\.filter\(G=>\{const za=ze\.filter\(Re=>Oa\.includes\(Re\)\)/);
assert.match(bundle, /Te\.filter\(Re=>ci\.includes\(Re\)\)/);
assert.match(bundle, /pl=G=>G==="family_event"\?"Family Event":G\.replace\(\/_\/g," "\),Yd=G=>/);
assert.doesNotMatch(bundle, /pl=G=>I\.useEffect/, 'stale-reset effect must not splice into pl= arrow initializer');
assert.match(bundle, /I\.useEffect\(\(\)=>\{if\(!\["restaurants","stores","events"\]\.includes\(q\)\)return;const Os=/);
assert.match(bundle, /vp\.length!==vt\.length&&qe\(vp\);\},\[q,ze,Te,Je,vt\]\)/);
assert.match(bundle, /za\.length!==ze\.length&&Le\(za\)/);
assert.match(bundle, /vp\.length!==vt\.length&&qe\(vp\)/);

console.log('issue 983 restaurant/events filter stale chip contract OK');
