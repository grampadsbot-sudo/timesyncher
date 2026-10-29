#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { pickFlightListRowSummaryText, STORED_SUMMARY_LIST_ROW_PICK_BUNDLE } from '../src/vacation/flight-list-row-summary.mjs';

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
assert.match(bundle, /Rn=Bs\(rr\(G\)\)/);
assert.doesNotMatch(bundle, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\)/);
assert.match(bundle, /data-summary-stored":"1"/);
assert.match(bundle, /flexWrap:"wrap",justifyContent:"center"/);
assert.doesNotMatch(bundle, /marginLeft:-8,marginRight:-8,width:"calc\(100% \+ 16px\)"/);
assert.doesNotMatch(bundle, /data-day-itinerary-mount|data-trek-list/);
assert.match(bundle, /"data-ts-list-row-name":"1",style:\{minWidth:0,maxWidth:"100%",width:"100%",whiteSpace:"normal",overflowWrap:"anywhere"\}/);
assert.match(bundle, /"data-list-summary":"1","data-summary-src":"thing",style:\{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,whiteSpace:"normal",overflowWrap:"anywhere"/);
assert.match(bundle, /color:"#0f766e",fontWeight:900,flexShrink:0\},children:ie\(G\)/);

const headerStart = bundle.indexOf('be=({item:G})=>');
const rowEnd = bundle.indexOf(',tt=G=>', headerStart);
assert.ok(headerStart > 0 && rowEnd > headerStart);
const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
function renderedRow(place, expanded) {
  const env = { n: { jsx, jsxs: jsx }, J: (p) => p.name, ie: (p) => p.price, uc: () => 'Car', Bs: String,
    mr: (p) => p.name, rr: (p) => p.summary, Mi: (p) => p.category === 'car', Zi: (p) => p.category === 'hotel', bn: () => false,
    tsPrimaryPlaceStarRating: () => '', tsRenderStarRatingHtml: () => '', tsThingReviewLines: () => '', ha: (p) => p, fo: () => [], _l: (p) => p.logoUrl,
    Qt: (p) => p.id, It: (p) => p.category, Sa: expanded, xt: null, kl: () => null, Ce: false, Ds: () => false, Nr: () => null, dc: () => null };
  return new Function(...Object.keys(env), `const ${bundle.slice(headerStart, rowEnd)};return Oe`)(...Object.values(env))(place);
}
function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
}
for (const expanded of [false, true]) {
  const name = 'A long hotel name with enough words to wrap on a phone';
  const summary = 'A stored description that should remain readable in full at phone width.';
  const row = renderedRow({ id: 44, category: 'hotel', name, summary, price: '$1,234' }, expanded);
  const nodes = descendants(row);
  const nameNode = nodes.find((v) => v.props['data-ts-list-row-name']);
  const summaryNode = nodes.find((v) => v.props['data-list-summary']);
  assert.equal(nameNode.props.style.whiteSpace, 'normal');
  assert.equal(summaryNode.props.children, summary);
  assert.equal(summaryNode.props.style.whiteSpace, 'normal');
  assert.equal(nodes.find((v) => v.type === 'strong').props.children, name);
  const priceNode = nodes.find((v) => v.props.children === '$1,234');
  assert.equal(priceNode.props.style.flexShrink, 0);
  assert.equal(priceNode.props.style.whiteSpace, 'nowrap');
}

const named = [{ name: 'North' }, { name: 'south' }, { name: 'East' }];
assert.deepEqual([...named].sort((a, b) => compareColumnRows(a, b, 'name', 'asc')).map((row) => row.name), ['East', 'North', 'south']);
assert.deepEqual([...named].sort((a, b) => compareColumnRows(a, b, 'name', 'desc')).map((row) => row.name), ['south', 'North', 'East']);
const priced = [{ name: 'Plain', price: null }, { name: 'High', price: 40 }, { name: 'Low', price: 10 }];
assert.deepEqual([...priced].sort((a, b) => compareColumnRows(a, b, 'price', 'asc')).map((row) => row.name), ['Plain', 'Low', 'High']);
assert.equal(rowPriceAmount('Stay $1,250.50'), 1250.5);
assert.equal(rowPriceAmount('no amount'), null);
assert.deepEqual(nextColumnSort({ key: 'price', dir: 'asc' }, 'name'), { key: 'name', dir: 'asc' });
assert.deepEqual(nextColumnSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });

const bundledFlightPick = Function(`return (${STORED_SUMMARY_LIST_ROW_PICK_BUNDLE})`)();
const flightSummaryCases = [
  {
    name: 'Southwest one stop base f7be729',
    input: 'Airline: Southwest; Route: LAS-LGA; Stops: 1 stop;',
    expected: 'Airline: Southwest; Route: LAS-LGA; Stops: 1 stop;',
  },
  {
    name: 'Southwest via DAL base f7be729',
    input: 'Airline: Southwest; Route: LAS-LGA; Stops: 1 stop via DAL;',
    expected: 'Airline: Southwest; Route: LAS-LGA; Stops: 1 stop via DAL;',
  },
  {
    name: 'long Airline semicolon base f7be729',
    input: 'Airline: Southwest; Route: LAS-LGA; Stops: 1 stop; Outbound travel departs in the morning and arrives later that same afternoon with fares listed separately.',
    expected: 'Airline: Southwest;  Route: LAS-LGA;  Stops: 1 stop;',
  },
  {
    name: 'long Airline period base f7be729',
    input: 'Airline: Southwest; Route: LAS-LGA; Stops: 1 stop. Outbound travel departs in the morning and arrives later that same afternoon with fares listed separately.',
    expected: 'Airline: Southwest;  Route: LAS-LGA;  Stops: 1 stop.',
  },
  {
    name: 'non-Airline base f7be729',
    input: 'Neighborhood bistro with a short wine list and late seating. Book ahead on weekends for the dining room and outdoor tables.',
    expected: 'Neighborhood bistro with a short wine list and late seating.',
  },
  {
    name: 'Documented option base f7be729',
    input: 'Documented flight option with Airline: Southwest; Route: LAS-LGA; Stops: 1 stop; Outbound travel departs in the morning and arrives later that afternoon.',
    expected: 'Documented flight option with Airline: Southwest; Route: LAS-LGA; Stops: 1 stop; Outbound travel departs in the morning and arrives later that afternoon.',
  },
  {
    name: 'whitespace base f7be729',
    input: '  Airline: Southwest;  Route: LAS-LGA;\tStops: 1 stop;  ',
    expected: 'Airline: Southwest;  Route: LAS-LGA;\tStops: 1 stop;',
  },
  ...[';', '.'].map((terminator) => ({
    name: `Airline fallback preserves ${terminator}`,
    input: `Airline: Example Air has a route; Route: AAA-BBB; Stops: no stops; Out: at dawn; Back: at dusk${terminator}`,
    expected: `Airline: Example Air has a route; Route: AAA-BBB; Stops: no stops; Out: at dawn; Back: at dusk${terminator}`,
  })),
  { name: 'short non-Airline', input: 'No saved flight details', expected: 'No saved flight details' },
  { name: 'empty', input: '', expected: '' },
  { name: 'null', input: null, expected: '' },
  { name: 'zero', input: 0, expected: '0' },
];
for (const { name, input, expected } of flightSummaryCases) {
  const picked = pickFlightListRowSummaryText(input);
  assert.equal(picked, expected, name);
  assert.equal(bundledFlightPick(input), picked, `${name} bundle parity`);
}

console.log(`shared tab list summary tests passed (${flightSummaryCases.length} flight picker expectations and bundle parity cases)`);
