#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compareColumnRows, nextColumnSort, rowPriceAmount, LIST_SORT_PRESENTATION } from '../src/vacation/list-column-sort.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/intake-435a4d049b1d.json', import.meta.url), 'utf8'));
const payload = finalizeServedSharedTripPayload(fixture);

for (const tab of ['hotels', 'cars']) {
  const rows = payload.liveTabLists[tab];
  assert.ok(rows.length > 0, `${tab} has rows`);
  for (const row of rows) {
    assert.match(row, /display:flex;align-items:center;gap:8px/);
    assert.match(row, /data-ts-logo-chip="1"/);
    const summary = row.match(/data-list-summary="1"[^>]*>([^<]+)</);
    assert.ok(summary && summary[1].trim(), `${tab} summary`);
  }
}

assert.match(payload.liveTabLists.cars.join(''), /101 Airport Rd/);
assert.match(payload.liveTabLists.hotels.join(''), /Resort Hotel/);

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(LIST_SORT_PRESENTATION, 'columns');
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"flights"\}\)/);
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"hotels"\}\)/);
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"cars"\}\)/);
assert.match(bundle, /data-ts-list-sort-header":"1"/);
assert.doesNotMatch(bundle, /Wr=\(\{listKey:G\}\)=>\{const Re=K\[G\]/);
assert.match(bundle, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\|\|vr\(G\)\|\|Zr\(G\)\)/);
assert.match(bundle, /flexWrap:"wrap",justifyContent:"center"/);
assert.doesNotMatch(bundle, /marginLeft:-8,marginRight:-8,width:"calc\(100% \+ 16px\)"/);

const named = [{ name: 'North' }, { name: 'south' }, { name: 'East' }];
assert.deepEqual([...named].sort((a, b) => compareColumnRows(a, b, 'name', 'asc')).map((row) => row.name), ['East', 'North', 'south']);
assert.deepEqual([...named].sort((a, b) => compareColumnRows(a, b, 'name', 'desc')).map((row) => row.name), ['south', 'North', 'East']);
const priced = [{ name: 'Plain', price: null }, { name: 'High', price: 40 }, { name: 'Low', price: 10 }];
assert.deepEqual([...priced].sort((a, b) => compareColumnRows(a, b, 'price', 'asc')).map((row) => row.name), ['Plain', 'Low', 'High']);
assert.equal(rowPriceAmount('Stay $1,250.50'), 1250.5);
assert.equal(rowPriceAmount('no amount'), null);
assert.deepEqual(nextColumnSort({ key: 'price', dir: 'asc' }, 'name'), { key: 'name', dir: 'asc' });
assert.deepEqual(nextColumnSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });

console.log('shared tab list summary tests passed');
