#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';

import { compareColumnRows, nextColumnSort, rowPriceAmount, LIST_SORT_PRESENTATION } from '../src/vacation/list-column-sort.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildNycPr225SharedTrip } from './fixtures/nyc-pr225-shared-trip.mjs';

const payload = finalizeServedSharedTripPayload(buildNycPr225SharedTrip());

const hotelPlaces = (payload.places || []).filter((place) => {
  const override = payload.thingOverrides?.[`place:${place.id}`] || {};
  return productThingCategory(place, override) === 'hotel';
});
const carPlaces = (payload.places || []).filter((place) => {
  const override = payload.thingOverrides?.[`place:${place.id}`] || {};
  return productThingCategory(place, override) === 'car';
});
const flightPlaces = (payload.places || []).filter((place) => {
  const override = payload.thingOverrides?.[`place:${place.id}`] || {};
  return productThingCategory(place, override) === 'flight';
});
assert.ok(hotelPlaces.length > 0, 'hotels in places');
assert.ok(carPlaces.length > 0, 'cars in places');
assert.ok(flightPlaces.length > 0, 'flights in places');
assert.match(String(hotelPlaces[0].name || ''), /Midtown sample hotel/i);
assert.match(String(carPlaces[0].name || ''), /Priceline opaque/i);
assert.equal(payload.thingOverrides[`place:${carPlaces[0].id}`]?.rentalCompany, 'Priceline opaque');
assert.equal(payload.thingOverrides[`place:${flightPlaces[0].id}`]?.fareDirection, 'one-way');
assert.equal(payload.thingOverrides[`place:${carPlaces[0].id}`]?.price, 172);
assert.match(String(payload.thingOverrides[`place:${hotelPlaces[0].id}`]?.summary || ''), /transit access/i);

const flightId = flightPlaces[0].id;
const hotelId = hotelPlaces[0].id;
const carId = carPlaces[0].id;
assert.equal(payload.thingOverrides[`place:${flightId}`]?.timeline, true);
assert.equal(payload.thingOverrides[`place:${hotelId}`]?.timeline, true);
assert.equal(payload.thingOverrides[`place:${carId}`]?.timeline, true);
assert.equal(payload.thingOverrides[`place:${flightId}`]?.dayIds?.length, 1);
assert.equal(payload.thingOverrides[`place:${hotelId}`]?.stayDays, 4);
assert.ok((payload.thingOverrides[`place:${carId}`]?.perDaySchedule || {}));

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(LIST_SORT_PRESENTATION, 'pills');
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"flights"\}\)/);
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"hotels"\}\)/);
assert.match(bundle, /n\.jsx\(Wr,\{listKey:"cars"\}\)/);
assert.match(bundle, /Wr=\(\{listKey:G\}\)=>\{const Re=K\[G\]\|\|\{key:"name",dir:"asc"\}/);
assert.doesNotMatch(bundle, /function tsListColumnSort\(/);
assert.doesNotMatch(bundle, /data-ts-list-sort-header":"1"/);
assert.match(bundle, /vi\(kn,"hotels"\)\.map\(\(G,Re\)=>Oe\(G,"hotel",Re===0\)\)/);
assert.match(bundle, /vi\(bc,"cars"\)\.map\(G=>Oe\(G\)\)/);
assert.doesNotMatch(bundle, /tsSharedLiveTabListMount/);
assert.match(bundle, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\)/);
assert.doesNotMatch(bundle, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\|\|vr\(G\)/);
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
