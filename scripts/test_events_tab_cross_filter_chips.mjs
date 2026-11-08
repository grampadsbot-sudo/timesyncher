#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');

const Cc = [
  { id: 1, name: 'Village jazz', area: 'Greenwich Village', __tsLiveFill: false },
  { id: 2, name: 'Midtown family picnic', area: 'Midtown', __tsLiveFill: false },
  { id: 3, name: 'Fill placeholder', __tsLiveFill: true },
];
const ze = ['Greenwich Village'];
const vt = ['family_event'];
const En = (G) => G.area || '';
const Yd = (G) => (G.name.includes('family') ? 'family_event' : 'music');
const or = () => [];
const vn = () => [];
const Te = [];
const Je = [];

const areaChips = [
  ...new Set(
    Cc.filter((G) => !G.__tsLiveFill && (!vt.length || vt.includes(Yd(G))))
      .map((G) => En(G))
      .filter(Boolean),
  ),
].sort();
assert.deepEqual(areaChips, ['Midtown'], 'area chips must follow active type filters, not stale Greenwich Village');

const typeChips = [
  ...new Set(Cc.filter((G) => !G.__tsLiveFill && (!ze.length || ze.includes(En(G)))).map((G) => Yd(G)).filter(Boolean)),
];
assert.deepEqual(typeChips, ['music'], 'only types present under active area filters');

const Oa = ['Midtown'];
const Os = ['family_event', 'music'];
const za = ze.filter((g) => Oa.includes(g));
const tp = vt.filter((g) => Os.includes(g));
assert.deepEqual(za, [], 'stale Greenwich Village drops when opposite-filter areas exclude it');
const staleKi = Cc.filter(
  (g) => {
    return (!za.length || za.includes(En(g))) && (!tp.length || tp.includes(Yd(g)));
  },
);
assert.equal(staleKi.length, 1, 'reconciled stale combo must still list matching rows, not zero-result trap');

assert.match(bundle, /No events match those filters/);
assert.match(bundle, /Os\.map\(G=>n\.jsx\("button",\{onClick:\(\)=>Kn\(G\)/);
const patchSrc = readFileSync(new URL('../src/vacation/trek-shared-tab-cross-filter-patch.mjs', import.meta.url), 'utf8');
assert.match(patchSrc, /OS_BEFORE_OA_NEEDLE/);
assert.match(patchSrc, /Os=\[\.\.\.new Set\(Cc\.filter/);
assert.match(patchSrc, /const za=ze\.filter\(Re=>Oa\.includes\(Re\)\)/);

console.log('events tab cross-filter chip contract OK');
