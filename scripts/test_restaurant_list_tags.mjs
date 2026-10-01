import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const SAVED_TAG_CHIPS = 'ci=[...new Set(tsListThings(Oc).flatMap(Re=>or(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))]';
const LIST_FILTER = 'Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re)))';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});
const js = renderServedTrekBundle(raw.toString('utf8'));

assert.ok(js.includes(SAVED_TAG_CHIPS), 'restaurant list chips must be the tags saved on listed restaurants');
assert.equal(js.includes('ci=ot.filter('), false);

const restaurantsAt = js.indexOf('q==="restaurants"&&');
assert.ok(restaurantsAt > 0);
const restaurantsBlock = js.slice(restaurantsAt, restaurantsAt + 1100);
assert.match(restaurantsBlock, /children:\[ci\.length>0&&/);
assert.match(restaurantsBlock, /onClick:\(\)=>qt\(\[\]\)/);
assert.match(restaurantsBlock, /children:"All tags"/);
assert.match(restaurantsBlock, /ci\.map\(G=>n\.jsx\("button",\{onClick:\(\)=>Wa\(G\)/);
assert.ok(js.includes(`Qn=tsPad(${LIST_FILTER})`));

function runSavedTags(expression, { rows, tagsFor, areas = [], areaFor = () => '', selected = [] }) {
  const fn = new Function('Oc', 'ze', 'En', 'or', 'Te', `
    const tsListThings = (rows) => rows.filter((Re) => !Re.__tsLiveFill && (!ze.length || ze.includes(En(Re))));
    const ot = ['Seafood', 'Italian'];
    return ${expression};
  `);
  return fn(rows, areas, areaFor, tagsFor, selected);
}

const north = { id: 'north' };
const south = { id: 'south' };
const blank = { id: 'blank' };
const filler = { id: 'filler', __tsLiveFill: true };
const tags = new Map([
  [north, ['Alpha', ' Beta ']],
  [south, ['Beta']],
  [blank, []],
  [filler, ['Gamma']],
]);
const tagsFor = (row) => tags.get(row) || [];

const chips = runSavedTags(SAVED_TAG_CHIPS.slice(3), {
  rows: [north, south, blank, filler],
  tagsFor,
  selected: ['Alpha'],
});
assert.deepEqual(chips, ['Alpha', 'Beta']);

const northOnly = runSavedTags(SAVED_TAG_CHIPS.slice(3), {
  rows: [north, south],
  tagsFor,
  areas: ['north'],
  areaFor: (row) => (row.id === 'north' ? 'north' : 'south'),
});
assert.deepEqual(northOnly, ['Alpha', 'Beta']);

const none = runSavedTags(SAVED_TAG_CHIPS.slice(3), {
  rows: [blank, filler],
  tagsFor,
});
assert.deepEqual(none, []);

const filtered = runSavedTags(LIST_FILTER, {
  rows: [north, south, blank],
  tagsFor,
  selected: ['Alpha'],
});
assert.deepEqual(filtered, [north]);

const cleared = runSavedTags(LIST_FILTER, {
  rows: [north, south, blank],
  tagsFor,
  selected: [],
});
assert.deepEqual(cleared, [north, south, blank]);

console.log('restaurant list tags ok');
