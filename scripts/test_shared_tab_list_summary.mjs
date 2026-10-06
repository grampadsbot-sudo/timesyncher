#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';

import { compareColumnRows, nextColumnSort, rowPriceAmount, LIST_SORT_PRESENTATION } from '../src/vacation/list-column-sort.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/intake-435a4d049b1d.json', import.meta.url), 'utf8'));
const payload = finalizeServedSharedTripPayload(fixture);

const hotelPlaces = (payload.places || []).filter((place) => {
  const override = payload.thingOverrides?.[`place:${place.id}`] || {};
  return productThingCategory(place, override) === 'hotel';
});
const carPlaces = (payload.places || []).filter((place) => {
  const override = payload.thingOverrides?.[`place:${place.id}`] || {};
  return productThingCategory(place, override) === 'car';
});
assert.ok(hotelPlaces.length > 0, 'hotels in places');
assert.ok(carPlaces.length > 0, 'cars in places');
assert.match(String(hotelPlaces[0].name || ''), /Resort|Hyatt|Westin/i);
assert.match(String(carPlaces[0].address || carPlaces[0].name || ''), /101 Airport Rd|Rental/i);

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(LIST_SORT_PRESENTATION, 'columns');
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"flights"\}\)/);
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"hotels"\}\)/);
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"cars"\}\)/);
assert.match(bundle, /data-ts-list-sort-header":"1"/);
assert.match(bundle, /function tsListColumnSort\(/);
assert.doesNotMatch(bundle, /Wr=\(\{listKey:G\}\)=>\{const Re=K\[G\]/);
assert.match(bundle, /vi\(kn,"hotels"\)\.map\(\(G,Re\)=>Oe\(G,"hotel",Re===0\)\)/);
assert.match(bundle, /vi\(bc,"cars"\)\.map\(G=>Oe\(G\)\)/);
assert.doesNotMatch(bundle, /tsSharedLiveTabListMount/);
assert.doesNotMatch(bundle, /tsListColumnSort[\s\S]{0,1200}appendChild\(li\)/);
assert.match(bundle, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\|\|vr\(G\)\|\|Zr\(G\)\)/);
assert.match(bundle, /flexWrap:"wrap",justifyContent:"center"/);
assert.doesNotMatch(bundle, /marginLeft:-8,marginRight:-8,width:"calc\(100% \+ 16px\)"/);
assert.doesNotMatch(bundle, /data-day-itinerary-mount|data-trek-list/);

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
