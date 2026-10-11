import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const vocabulary = ['Seafood', 'Italian', 'Unused tag', 'Jewelry', 'Pharmacy / Essentials'];

function listed(rows, areas, areaFor) {
  return rows.filter((row) => !row.__tsLiveFill && (!areas.length || areas.includes(areaFor(row))));
}

function chipsFrom(rows, tagsFor, areas = [], areaFor = () => '') {
  return [...new Set(listed(rows, areas, areaFor).flatMap((row) => tagsFor(row).map((tag) => String(tag || '').trim()).filter(Boolean)))];
}

function areasFrom(rows, areaFor) {
  return [...new Set(rows.map(areaFor).filter(Boolean))].sort();
}

function assertUsed(chips, rows, tagsFor, label) {
  for (const chip of chips) {
    assert.ok(rows.some((row) => tagsFor(row).includes(chip)), `${label} chip ${chip} is unused`);
    assert.equal(vocabulary.includes(chip) && !rows.some((row) => tagsFor(row).includes(chip)), false);
  }
  for (const unused of vocabulary) {
    if (!rows.some((row) => tagsFor(row).includes(unused))) assert.equal(chips.includes(unused), false, `${label} shows unused ${unused}`);
  }
}

const restaurant = { id: 'r1', name: 'Cafe' };
const store = { id: 's1', name: 'Bergdorf' };
const show = { id: 'e1', name: 'Show' };
const hotel = { id: 'h1', name: 'Hotel' };
const filler = { id: 'fill', __tsLiveFill: true };
const tags = new Map([
  [restaurant, ['Seafood']],
  [store, ['Jewelry']],
  [show, ['event']],
  [filler, ['Unused tag', 'Pharmacy / Essentials']],
]);
const tagsFor = (row) => tags.get(row) || [];

const restaurantChips = chipsFrom([restaurant, filler], tagsFor);
assert.deepEqual(restaurantChips, ['Seafood']);
assertUsed(restaurantChips, [restaurant], tagsFor, 'Restaurants');

const storeChips = chipsFrom([store, filler], tagsFor);
assert.deepEqual(storeChips, ['Jewelry']);
assertUsed(storeChips, [store], tagsFor, 'Stores');

const restChips = chipsFrom([show], tagsFor);
assert.deepEqual(restChips, ['event']);
assertUsed(restChips, [show], tagsFor, 'The Rest');

const hotelAreas = areasFrom([hotel, { id: 'h2', name: 'Other' }], (row) => (row.id === 'h1' ? 'Midtown' : ''));
assert.deepEqual(hotelAreas, ['Midtown']);
assert.equal(hotelAreas.includes('Unused area'), false);

assert.match(bundle, /\$n=\[\.\.\.new Set\(tsListThings\(Fs\)\.flatMap\(Re=>vn\(Re\)/);
assert.match(bundle, /ci=\[\.\.\.new Set\(tsListThings\(Oc\)\.flatMap\(Re=>or\(Re\)/);
assert.match(bundle, /Os\.map\(G=>n\.jsx\("button",\{onClick:\(\)=>Kn\(G\)/);
assert.doesNotMatch(bundle, /\[\.\.\.new Set\(tsListThings\(Cc\)\.map\(Re=>Yd\(Re\)\)\.filter\(Boolean\)\)\]/);
assert.match(bundle, /Oa=Array\.from\(new Set\(tn\.map\(G=>En\(G\)\)\.filter\(a=>a&&a!=="Airport \/ Transit"\)\)\)\.sort\(\)/);
assert.doesNotMatch(bundle, /\$n=gt\.filter\(/);
assert.doesNotMatch(bundle, /ci=ot\.filter\(/);

const flight = { id: 1, name: 'Jet' };
const hotelRow = { id: 2, name: 'Inn' };
const car = { id: 3, name: 'Hertz' };
const cafe = { id: 4, name: 'Cafe' };
const shop = { id: 5, name: 'Tiffany' };
const rest = { id: 6, name: 'Museum' };
const offTimeline = [flight, hotelRow, car, cafe, shop, rest];
const Qt = (item) => `place:${item.id}`;
const budgetIds = [...new Map([].concat([flight], [hotelRow], [car], [cafe], [shop], [rest]).filter(Boolean).map((item) => [Qt(item), item])).keys()];
assert.deepEqual(budgetIds.sort(), offTimeline.map(Qt).sort());
assert.match(bundle, /Mo=Array\.from\(new Map\(\[\]\.concat\(rs,Po,bc,Oc,Fs,Cc\)\.filter\(Boolean\)\.map\(Xi=>/);
assert.doesNotMatch(bundle, /\[\]\.concat\(\(function\(\)\{const tsSeen=new Set,tsOut=\[\];for\(const Xi of \[\]\.concat\(\(Gt\|\|\[\]\)\.filter\(bn\)/);
assert.match(bundle, /Xi==="car"\?"Cars"/);
assert.doesNotMatch(bundle, /\(Gt\|\|\[\]\)\.filter\(Xi=>Xi&&Ds\(Xi\)&&!Mi\(Xi\)\)/);
assert.match(bundle, /data-logo-src":Xr/);
assert.match(bundle, /data-ts-timeline-icon":"1"/);

console.log('shared tab filter chips and budget union ok');
