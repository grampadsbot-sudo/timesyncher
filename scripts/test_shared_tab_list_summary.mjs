#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIST_SORT_PRESENTATION,
  compareColumnRows,
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
    assert.match(row, /display:flex;align-items:center;gap:8px/);
    assert.match(row, /data-ts-logo-chip="1"/);
    assert.match(row, /data-thing-card="1"/);
    assert.match(row, /border-radius:10px/);
    const summary = row.match(/data-list-summary="1"[^>]*>([^<]+)</);
    assert.ok(summary && summary[1].trim(), `${tab} summary`);
  }
}

assert.match(payload.liveTabLists.cars.join(''), /101 Airport Rd/);
assert.match(payload.liveTabLists.hotels.join(''), /Resort Hotel/);

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

console.log('shared tab list summary tests passed');
