#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIST_SORT_PRESENTATION,
  compareColumnRows,
  listColumnSortBundleExpr,
  nextColumnSort,
  rowPriceAmount,
} from '../src/vacation/list-column-sort.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/intake-435a4d049b1d.json', import.meta.url), 'utf8'));
const payload = finalizeServedSharedTripPayload(fixture);

for (const tab of ['hotels', 'cars']) {
  const rows = payload.liveTabLists[tab];
  assert.ok(rows.length > 0, `${tab} has rows`);
  for (const row of rows) {
    assert.match(row, /data-place-id="/);
    assert.doesNotMatch(row, /ts-nyc-card|data-thing-card="1"/);
  }
}

assert.match(payload.liveTabLists.cars.join(''), /Hertz/);
assert.match(payload.liveTabLists.hotels.join(''), /Hyatt/);

assert.equal(LIST_SORT_PRESENTATION, 'columns');
assert.deepEqual(nextColumnSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });
assert.equal(rowPriceAmount('Suite $1,250'), 1250);
assert.ok(compareColumnRows({ name: 'A', price: 10 }, { name: 'B', price: 20 }, 'price', 'asc') < 0);

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundle, /data-ts-list-sort-header/);
assert.match(bundle, /tsListColumnSort=/);
assert.doesNotMatch(bundle, /Wr=\(\)=>null/);
assert.doesNotMatch(bundle, /borderRadius:999,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer"\}\),Wr=/);
assert.match(bundle, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\|\|vr\(G\)\|\|Zr\(G\)\)/);
assert.match(bundle, /flexWrap:"wrap",justifyContent:"center"/);
assert.doesNotMatch(bundle, /marginLeft:-8,marginRight:-8,width:"calc\(100% \+ 16px\)"/);
assert.doesNotMatch(bundle, /data-day-itinerary-mount/);

const sortExpr = listColumnSortBundleExpr();
assert.equal(bundle.includes(sortExpr), true);
assert.doesNotMatch(sortExpr, /pills|pillStyle|borderRadius:999/);
const ul = { children: [], appendChild(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); this.children.push(node); } };
const row = (name, price) => ({ textContent: `${name} ${price}`, querySelector: (sel) => (String(sel).includes('strong') ? { textContent: name } : null) });
const fill = () => { ul.children = [row('Zeta', '$20'), row('Alpha', '$5'), row('Mid', '$100')]; };
globalThis.document = { querySelector: () => ul };
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
const draw = new Function('n', `let tsListColumnSort;${sortExpr};return tsListColumnSort`)({ jsxs: (_type, props) => props });
const hit = (sort, index) => { fill(); draw({ listKey: 'hotels', sort, onSort() {} }).children[index].onClick(); return ul.children.map((item) => item.querySelector('strong').textContent); };
assert.deepEqual(hit({ key: 'price', dir: 'asc' }, 0), ['Alpha', 'Mid', 'Zeta']);
assert.deepEqual(hit({ key: 'name', dir: 'asc' }, 0), ['Zeta', 'Mid', 'Alpha']);
assert.deepEqual(hit({ key: 'name', dir: 'asc' }, 1), ['Alpha', 'Zeta', 'Mid']);
const header = draw({ listKey: 'hotels', sort: { key: 'name', dir: 'asc' }, onSort() {} });
assert.equal(header['data-ts-list-sort-header'], '1');
assert.deepEqual(header.children.map((button) => button.children[0]), ['Name', 'Price']);
assert.ok(header.children.every((button) => button.type === 'button' && button.style.borderRadius === 0));

console.log('shared tab list summary tests passed');
