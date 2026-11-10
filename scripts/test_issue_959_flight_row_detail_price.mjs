#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { naturalFlightSummary } from '../src/vacation/flight-summary-prose.mjs';
import { ISSUE_888_SERVED_LAYOUT_CSS } from '../src/vacation/shared-trip-oe-list-row-patch.mjs';
import { dossierBuilderPrompt } from '../src/vacation/xai-grok-place-ratings.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const rendered = renderServedTrekBundle(raw);
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(committed, rendered, 'committed served bundle must match renderServedTrekBundle');

const CLOCK = /\b\d{2}:\d{2}\b|\b\d{1,2}:\d{2}\s*[ap]\.?m\b/i;
const robotic = 'Skyline QRS → TUV 07:25–16:35 covers Alpha Field (QRS) to Beta Harbor (TUV), leaving mid-morning and arriving at 16:35 Eastern. The flight covers 2242 miles, a long morning in the air that still leaves the evening free downtown.';
const prose = naturalFlightSummary(robotic);
assert.equal(prose, 'Skyline flies from Alpha Field (QRS) to Beta Harbor (TUV), leaving mid-morning and arriving in the late afternoon. It is a 2,242-mile trip, a long morning in the air that still leaves the evening free downtown.');
assert.doesNotMatch(prose, CLOCK);
assert.doesNotMatch(prose, /\bcovers\b/);
assert.doesNotMatch(prose, /QRS → TUV/);

const cases = [
  ['The 22:25 Eastern arrival means a late night.', 'The late-night arrival means a late night.'],
  ["Skyline's 07:00 departure Skyline QRS-TUV 2026-06-23 07:00-15:00 matches the timetable. The nonstop covers 2220 miles.", "Skyline's early-morning departure Skyline QRS-TUV matches the timetable. The nonstop flies 2,220 miles."],
  ['A red-eye QRS-TUV 2026-06-23 23:59-08:04+1 that lands at 08:04 local time.', 'A red-eye QRS-TUV that lands in the early morning.'],
  ['Departs at 6:05 am PT and lands around 2:40 p.m. local time.', 'Departs in the early morning and lands in the early afternoon.'],
  ['An 08:15 departure and a 07:00 hop.', 'An early-morning departure and an early-morning hop.'],
];
for (const [input, expected] of cases) {
  const out = naturalFlightSummary(input);
  assert.equal(out, expected, input);
  assert.doesNotMatch(out, CLOCK, input);
}
for (const unchanged of [
  'Airline: Skyline; Route: QRS-TUV; Stops: nonstop;',
  'The direct flight time runs between 4:44 and 5:15.',
  'Plan to arrive at least 2 hours before domestic flights.',
  '  Full\n stored description.  ',
]) {
  assert.equal(naturalFlightSummary(unchanged), unchanged);
}
assert.equal(naturalFlightSummary(''), '');

const start = rendered.indexOf('tsListRowDescription=function(G){');
const end = rendered.indexOf(',Oe=', start);
assert.ok(start >= 0 && end > start);
const places = {
  1: { category: 'flight', summary: robotic },
  2: { category: 'restaurant', summary: 'Opens at 17:30 with a 4.5 rating.' },
};
const describe = new Function('ha', 'It', `let ${rendered.slice(start, end)};return tsListRowDescription;`)(
  (place) => places[place.id],
  (place) => places[place.id].category,
);
assert.equal(describe({ id: 1 }), prose, 'served flight list row shows natural prose');
assert.equal(describe({ id: 2 }), 'Opens at 17:30 with a 4.5 rating.', 'non-flight list rows stay as stored');

const prompt = dossierBuilderPrompt({ thing: 'Skyline QRS → TUV', pages: [{ id: 'p1', text: 'route' }] }, { includeReviews: false });
assert.match(String(prompt), /Flight summary is natural prose: no clock times/);

assert.match(rendered, /QoRest=\(\{item:G\}\)=>\{const parts=eu\(G\);[\s\S]{0,400}?children:\[n\.jsx\("span",\{"data-ts-flight-price":"1",style:\{whiteSpace:"nowrap",flexShrink:0,color:"#0f766e",fontWeight:900\},children:parts\[1\]\|\|""\}\)/);
const phone = ISSUE_888_SERVED_LAYOUT_CSS.slice(ISSUE_888_SERVED_LAYOUT_CSS.indexOf('@media (max-width:480px){'));
assert.ok(phone.includes('[data-ts-thing-header="1"]>span:has(>[data-ts-flight-qo-rest="1"]){display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;'));
assert.ok(phone.includes('[data-ts-thing-header="1"]>span:has(>[data-ts-flight-qo-rest="1"])>[data-ts-logo-name-pair="1"]{grid-column:1/3!important;grid-row:1!important;'));
assert.ok(phone.includes('[data-ts-flight-qo-rest="1"]{display:contents!important}'));
assert.ok(phone.includes('[data-ts-flight-qo-rest="1"]>[data-ts-flight-price="1"]{grid-column:3!important;grid-row:1!important;justify-self:end!important;align-self:center!important}'));
assert.ok(!phone.includes('[data-ts-flight-qo-rest="1"]>span:nth-child(1){grid-column:1/-1'), 'flight price no longer floats above the name');
const servedCss = readFileSync(new URL('../public/assets/index-CbEHlMj6.css', import.meta.url), 'utf8');
assert.ok(servedCss.includes(ISSUE_888_SERVED_LAYOUT_CSS), 'served CSS carries the flight price layout');

const ratingRow = rendered.indexOf('"data-ts-detail-rating-row":"1"');
assert.ok(ratingRow > 0);
const priceField = rendered.indexOf('"data-ts-detail-field":"price"');
assert.ok(priceField > ratingRow && priceField - ratingRow < 900, 'detail price lives in the rating row');
assert.ok(rendered.indexOf('"data-ts-detail-header-stars":"1"', ratingRow) < priceField);
const rowStart = rendered.lastIndexOf('(()=>{const tsHeadStars=', ratingRow);
const rowEnd = rendered.indexOf('})()', priceField) + 4;
const jsx = (type, props) => ({ type, props });
const renderRow = new Function('n', 'Dt', 'ha', 'tsRenderStarRatingHtml', 'tsPrimaryPlaceStarRating', `return ${rendered.slice(rowStart, rowEnd)}`);
const textOf = (node) => (node == null || node === false ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node.props?.children));
for (const [price, label] of [[48, 'Price: $48'], ['$48', 'Price: $48'], [1250, 'Price: $1,250'], ['48.4', 'Price: $48']]) {
  const row = renderRow({ jsx, jsxs: jsx }, {}, () => ({ price }), () => '<svg></svg>', () => 4);
  assert.equal(row.props['data-ts-detail-rating-row'], '1');
  assert.equal(row.props.style.display, 'flex');
  const [stars, priceSpan] = row.props.children;
  assert.equal(stars.props['data-ts-detail-header-stars'], '1');
  assert.equal(priceSpan.props['data-ts-detail-field'], 'price');
  assert.equal(priceSpan.props.style.whiteSpace, 'nowrap');
  assert.equal(textOf(priceSpan), label);
}
const noPrice = renderRow({ jsx, jsxs: jsx }, {}, () => ({}), () => '<svg></svg>', () => 4);
assert.equal(noPrice.props.children[1], null);
assert.equal(renderRow({ jsx, jsxs: jsx }, {}, () => ({}), () => '', () => null), null);
assert.doesNotMatch(rendered, /Price per person/);

console.log('issue #959 flight prose, flight price row and detail price checks passed');
