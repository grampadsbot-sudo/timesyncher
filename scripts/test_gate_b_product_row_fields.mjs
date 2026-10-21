#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { rowNeedsDetailBackfill } from '../src/vacation/chat-intake-place-persist.mjs';
import {
  gateBThingDetailCompleteness,
  thingDetailCompletenessForPlace,
} from '../src/vacation/gate-b-thing-detail-completeness.mjs';
import { gateBBudgetPriceCompleteness } from '../src/vacation/gate-b-budget-price-completeness.mjs';
import { categoryFor } from '../src/vacation/intake-shared-trip-category.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import {
  descriptionPassesDetailJudge,
  resolvedPresentationCategory,
} from '../src/vacation/thing-detail-fields.mjs';
import { extractDetailFromSearchResults } from '../src/vacation/place-detail-extract.mjs';
import { isGenericDescription } from '../src/vacation/trip-thing-enrichment.mjs';
import { resolveThingLogoUrl, NAMED_THING_LOGOS } from '../src/vacation/thing-logo-capture.mjs';
import { patchLiveProductDetailBundle } from '../src/vacation/trek-thing-detail-patches.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  VK_SEARCH_SNAPSHOT_COPY_ROW_IDS,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  buildNycCraigKimDaybydayTripPositiveV1,
  NYC_POSITIVE_FIXTURE_VERSION,
} from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import { buildNycPr225SharedTrip } from './fixtures/nyc-pr225-shared-trip.mjs';
import {
  assessGateBNycFixtureContract,
  gateBNycFixturePayloadSha256,
  renderedPrice,
  renderedSummary,
  wordCount,
} from './lib/gate-b-nyc-fixture-contract.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstreamRaw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 20 * 1024 * 1024,
}).toString('utf8');
const servedBundle = renderServedTrekBundle(upstreamRaw);
assert.match(servedBundle, /tsDetailCapturePayload=Dt=>/);
assert.doesNotMatch(servedBundle, /function tsDetailCapturePayload\(/);

function extractDetailCaptureRunner(bundle) {
  const marker = 'tsDetailCapturePayload=Dt=>{';
  const start = bundle.indexOf(marker);
  assert.ok(start >= 0, 'scoped tsDetailCapturePayload');
  const end = bundle.indexOf('},Sn=', start);
  assert.ok(end >= 0, 'tsDetailCapturePayload must close before Sn=');
  const expr = bundle.slice(start, end + 1);
  return new Function(
    'Dt',
    'ha',
    'It',
    'mr',
    `return (${expr})(Dt)`,
  );
}

const runDetailCapture = extractDetailCaptureRunner(servedBundle);
const captureDt = { id: 42, name: 'Sample Cocktail Bar', category: 'bar' };
const captureHa = () => ({
  address: 'Midtown, New York, NY',
  review1: 'The negroni is perfectly balanced and the bartenders know their classics without leaning too sweet.',
  review1Rating: '5',
  review1Source: 'Google',
  summary: 'A serious cocktail bar with a reliable happy hour and strong martini program for Midtown regulars.',
  summarySourceUrls: ['https://example-bar.test/'],
});
assert.doesNotThrow(() => {
  const payload = runDetailCapture(captureDt, captureHa, () => 'bar', () => 'Sample Cocktail Bar');
  const parsed = JSON.parse(payload);
  assert.equal(parsed.category, 'bar');
  assert.equal(parsed.title, 'Sample Cocktail Bar');
  assert.equal(parsed.reviews.length, 1);
}, 'detail capture payload must not throw ReferenceError when ha is in scope');

assert.equal(
  resolveThingLogoUrl({ name: 'Hertz', category_name: 'Car' }, { category: 'car' }),
  '',
);
assert.equal(
  resolveThingLogoUrl(
    { name: 'Hertz', category_name: 'Car', url: 'https://www.hertz.com/' },
    { category: 'car' },
  ),
  NAMED_THING_LOGOS.hertz,
);
assert.equal(
  resolveThingLogoUrl(
    { name: 'Alamo rental car', category_name: 'Car', url: 'https://www.alamo.com/' },
    { category: 'car' },
  ),
  NAMED_THING_LOGOS.alamo,
);

const payload = finalizeServedSharedTripPayload(buildNycPr225SharedTrip());
const car = (payload.places || []).find((place) => /priceline/i.test(place.name || ''));
assert.ok(car, 'car place');
const carOverride = payload.thingOverrides[`place:${car.id}`] || {};
assert.equal(carOverride.price, 172);
assert.match(String(carOverride.summary || ''), /JFK AirTrain/i);
assert.equal(carOverride.rentalCompany, 'Priceline opaque');

const hotel = (payload.places || []).find((place) => /midtown sample hotel/i.test(place.name || ''));
assert.ok(hotel, 'hotel place');
const hotelOverride = payload.thingOverrides[`place:${hotel.id}`] || {};
assert.match(String(hotelOverride.summary || ''), /transit access/i);
assert.equal(hotelOverride.price, 389);
assert.equal(rowNeedsDetailBackfill({ category: 'bar', location: { lat: 40.7, lng: -74 } }), true);
assert.equal(thingDetailCompletenessForPlace(hotel, hotelOverride).category, 'hotel');

const detailTrip = {
  id: 'detail-trip-1',
  title: 'Detail trip',
  destination: 'New York',
  start_date: '2026-06-10',
  end_date: '2026-06-14',
};
const reviewBody = 'The negroni is perfectly balanced and the bartenders know their classics without leaning too sweet or bitter even when the room is packed with after-work crowds waiting for bar seats.';
const enrichedBar = thingRecordFromTripRow({
  id: 'bar-1',
  category: 'bar',
  title: 'Sample Cocktail Bar',
  description: 'Near Grand Central with a strong martini list and small plates that regulars praise for balanced flavors and quick service.',
  source: 'brave',
  location: { lat: 40.752, lng: -73.977, address: 'Midtown, New York, NY' },
  metadata: {
    categoryName: 'bar',
    thingDetail: {
      itineraryNote: 'Cocktails at Sample Cocktail Bar — arrive early for bar seats.',
      phone: '(212) 555-0101',
      hours: 'Mon–Sat 4pm–2am',
      website: 'https://example-bar.test/',
      priceLevel: '$$',
      googleRating: '4.6',
      googleReviewCount: '820',
      yelpRating: '4.4',
      yelpReviewCount: '410',
      lat: 40.752,
      lng: -73.977,
      review1: reviewBody,
      review1Source: 'Google',
      review1Rating: '5',
      review2: 'Happy hour oysters are a steal before the dinner rush and the shucking station keeps pace even when every bar seat is taken and the patio fills up with regulars.',
      review2Source: 'Yelp',
      review2Rating: '4.5',
      review3: 'Best martini in Midtown without the tourist markup and the bar team remembers regular garnishes without being asked twice even on nights when the wait stretches down the block.',
      review3Source: 'Google',
      review3Rating: '4.8',
      review4: 'TripAdvisor regulars praise the old fashioned program, the ice quality, and the bartenders who explain spirits without talking down to newcomers while still moving the line quickly on busy Fridays.',
      review4Source: 'TripAdvisor',
      review4Rating: '4.7',
      summary: 'Sample Cocktail Bar combines a serious martini and negroni program with a reliable happy hour, strong Midtown foot traffic, and bartenders who know classic specs. Reviews highlight oyster deals, fair pricing for the neighborhood, and a lively room that still feels like a locals bar.',
      summarySourceUrls: ['https://example-bar.test/', 'https://www.nytimes.com/example-bar-review'],
      happyHour: true,
      happyHourDays: 'Mon–Fri',
      happyHourTimes: '4–7pm',
      happyHourDeals: '$8 cocktails and $1 oysters',
      happyHourDetails: 'Mon–Fri 4–7pm: $8 cocktails and $1 oysters.',
      longDetails: 'Sample Cocktail Bar earns repeat visits for its classic cocktails, knowledgeable bartenders, and reliable happy hour. Regulars mention the negroni and martini program, oyster deals before dinner service, and a lively but not chaotic Midtown room.',
    },
  },
});
const shared = finalizeServedSharedTripPayload(sharedTripFromIntake({ trip: detailTrip, things: [enrichedBar] }));
const barPlace = shared.places[0];
const barOverride = shared.thingOverrides[`place:${barPlace.id}`];
assert.equal(resolvedPresentationCategory({ category: 'activity', title: 'Top of the Rock', description: 'Views near JFK signage' }), 'activity');
assert.equal(resolvedPresentationCategory({ category: 'attraction', title: 'Top of the Rock' }), 'attraction');
assert.equal(categoryFor({ category: 'activity', title: 'Cafe', source: { category: 'restaurant' } }).category_name, 'Restaurant');
assert.equal(thingDetailCompletenessForPlace(barPlace, barOverride).pass, true);
assert.equal(barOverride.category, 'bar');
assert.match(String(barOverride.itineraryNote || ''), /Sample Cocktail Bar/i);
assert.match(String(barOverride.happyHourDetails || ''), /oyster/i);
assert.equal(descriptionPassesDetailJudge(barOverride.longDetails, barPlace.name), true);
assert.equal(gateBThingDetailCompleteness(shared).pass, true);

const thing = placeToTripThing({
  source: 'brave',
  title: 'Harbor Cafe',
  category: 'restaurant',
  lat: 40.7,
  lng: -74.0,
  address: '123 Main St, New York, NY',
  url: 'https://example-cafe.test/',
  rating: 4.5,
  ratingCount: 120,
  sourceRecord: { source: 'brave', rating: 4.5, count: 120 },
});
assert.match(String(thing.metadata?.thingDetail?.itineraryNote || ''), /Harbor Cafe/i);
assert.equal(thing.metadata?.thingDetail?.thirdPartyRating, '4.5');

const bundle = patchLiveProductDetailBundle(
  readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8'),
);
assert.match(bundle, /"data-list-summary":"1","data-summary-src":"thing"/);
assert.match(bundle, /children:n\.jsx\("strong",\{children:J\(G\)\|\|"Rental"\}\)/);
assert.match(bundle, /children:n\.jsx\("strong",\{children:Re\}\)/);
assert.doesNotMatch(bundle, /Open details for summary/);
assert.match(bundle, /Itinerary note/);
assert.match(bundle, /ha\(G\)\.itineraryNote/);
assert.match(bundle, /It\(Dt\)==="bar"\)&&n\.jsxs\("label",\{style:Hn,children:\["Happy hour details"/);
assert.match(bundle, /data-ts-detail-capture":"1"/);
assert.match(bundle, /tsDetailCapturePayload=Dt=>/);
assert.doesNotMatch(bundle, /function tsDetailCapturePayload\(/);
assert.match(bundle, /\[1,2,3,4\]\.filter\(G=>String\(Ps\(Dt,G\)\|\|""\)\.trim\(\)\)/);

const extracted = extractDetailFromSearchResults({
  title: 'Harbor Room',
  category: 'restaurant',
  website: 'https://example-harbor.test/',
  results: [
    {
      url: 'https://www.yelp.com/biz/harbor-room',
      title: 'Harbor Room Yelp',
      content: 'Google users mention Harbor Room for its crudo and pasta. "The crudo is pristine and the kitchen keeps pasta al dente even on busy Saturday nights with a full bar and walk-ins waiting." 4.5 stars.',
    },
    {
      url: 'https://www.tripadvisor.com/harbor-room',
      title: 'Harbor Room TripAdvisor',
      content: 'TripAdvisor reviewers praise Harbor Room for seafood, pricing, and service. "We booked Harbor Room for a celebration and left impressed by the scallops, the wine list, and staff pacing for a long dinner."',
    },
    {
      url: 'https://example-harbor.test/menu',
      title: 'Official menu',
      content: 'Harbor Room serves seasonal seafood, handmade pasta, and a raw bar with daily oysters. The dining room targets date-night guests who want a splurge without formal dress codes.',
    },
    {
      url: 'https://example.com/harbor-room-review',
      title: 'Local review',
      content: 'Google rating 4.6 (900 reviews). Hours: Tue-Sun 5pm-11pm. Phone (212) 555-0199. Happy hour Mon-Thu 5-7pm with $10 oysters.',
    },
  ],
});
assert.ok(['Google', 'Yelp', 'TripAdvisor'].includes(extracted.review1Source));
assert.ok(String(extracted.review1 || '').split(/\s+/).length >= 25);
assert.ok(String(extracted.summary || '').split(/\s+/).length >= 30);
assert.ok(Array.isArray(extracted.summarySourceUrls) && extracted.summarySourceUrls.length >= 2);

const nycEnrichment = JSON.parse(
  readFileSync(new URL('./fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const nycNames = Object.keys(nycEnrichment);
assert.equal(nycNames.length, 65, 'NYC ccab fixture should document 65 places');
const nycDescriptions = nycNames.map((name) => String(nycEnrichment[name]?.description || '').trim());
assert.equal(nycDescriptions.length, new Set(nycDescriptions).size, 'each NYC fixture place needs a unique description');
for (const [name, record] of Object.entries(nycEnrichment)) {
  const description = String(record?.description || '').trim();
  assert.ok(description, `missing description for ${name}`);
  assert.equal(isGenericDescription(description), false, `generic description for ${name}`);
  if (record?.website) {
    assert.ok(record.logoUrl, `logo expected when website exists: ${name}`);
  }
  if (record?.price != null) {
    assert.ok(Number(record.price) > 0, `price must be positive for ${name}`);
  }
}

const negativeFixture = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
assert.equal(gateBBudgetPriceCompleteness(negativeFixture).pass, true);
const negativeFixtureReport = assessGateBNycFixtureContract(negativeFixture, { profile: 'negative' });
assert.equal(negativeFixtureReport.pass, false, 'short-copy PR340 fixture must fail the positive contract');
assert.ok(negativeFixtureReport.violations.length >= 10, `expected many violations, got ${negativeFixtureReport.violations.length}`);

const positiveFixtureOnce = buildNycCraigKimDaybydayTripPositiveV1();
const positiveFixtureTwice = finalizeServedSharedTripPayload(structuredClone(positiveFixtureOnce));
const positiveFixtureReport = assessGateBNycFixtureContract(positiveFixtureOnce, { profile: 'positive' });
assert.equal(positiveFixtureReport.pass, true, positiveFixtureReport.violations.join('\n'));

const positiveDigestA = gateBNycFixturePayloadSha256(positiveFixtureOnce);
const positiveDigestB = gateBNycFixturePayloadSha256(positiveFixtureTwice);
assert.equal(positiveDigestA, positiveDigestB, 'candidate and base paths must hash the same finalized payload');
assert.equal(positiveFixtureOnce.trip.metadata.gateBNycFixtureVersion, NYC_POSITIVE_FIXTURE_VERSION);

for (const place of positiveFixtureOnce.places || []) {
  const summary = renderedSummary(positiveFixtureOnce, place);
  assert.ok(wordCount(summary) >= 30, `${place.name} summary must survive finalization (${wordCount(summary)} words)`);
  const price = renderedPrice(positiveFixtureOnce, place);
  assert.ok(price !== null, `${place.name} must expose a price after finalization`);
}

const opaqueCar = positiveFixtureOnce.places.find((row) => row.id === 609);
assert.ok(opaqueCar, 'car list row 609 must remain in fixture');
const opaqueCarOverride = positiveFixtureOnce.thingOverrides['place:609'] || {};
assert.equal(opaqueCarOverride.timeline, false, 'opaque car stays list-only / unselected');
assert.match(String(opaqueCarOverride.pickupLocation || ''), /JFK/i);
assert.match(String(opaqueCarOverride.returnLocation || ''), /JFK/i);

const pr336SearchSnapshot = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);
const vkSnapshotBindingTrip = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
function vkBindingText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function vkBindingDescription(shared, place) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  return vkBindingText(override.longDetails || place.description);
}
function vkBindingSummary(shared, place) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  return vkBindingText(override.summary || place.summary);
}
for (const rowId of VK_SEARCH_SNAPSHOT_COPY_ROW_IDS) {
  const snapshot = pr336SearchSnapshot[String(rowId)];
  assert.ok(snapshot, `missing pr336 snapshot row ${rowId}`);
  const place = vkSnapshotBindingTrip.places.find((p) => p.id === rowId);
  assert.ok(place, `built trip missing place ${rowId}`);
  assert.equal(vkBindingText(place.name), vkBindingText(snapshot.title), `${rowId} identity (place.name)`);
  assert.equal(vkBindingSummary(vkSnapshotBindingTrip, place), vkBindingText(snapshot.summary), `${rowId} summary`);
  assert.equal(
    vkBindingDescription(vkSnapshotBindingTrip, place),
    vkBindingText(snapshot.description),
    `${rowId} description`,
  );
}
for (const rowId of VK_SEARCH_SNAPSHOT_COPY_ROW_IDS) {
  const snapshot = pr336SearchSnapshot[String(rowId)];
  const override = vkSnapshotBindingTrip.thingOverrides[`place:${rowId}`] || {};
  if (snapshot.price != null) {
    assert.equal(override.price, snapshot.price, `${rowId} price must match pr336 snapshot`);
  }
  if (snapshot.logoUrl) {
    assert.equal(override.logoUrl, snapshot.logoUrl, `${rowId} logoUrl must match pr336 snapshot`);
  }
}
assert.equal(vkSnapshotBindingTrip.places.find((p) => p.id === 601)?.lat, 36.084, '601 keeps fixture coordinates');

{
  const root = fileURLToPath(new URL('..', import.meta.url));
  const guardTests = fileURLToPath(new URL('../tests/test_tsv_guard.py', import.meta.url));
  const guardRun = spawnSync('python3', [guardTests], { cwd: root, stdio: 'inherit' });
  assert.equal(guardRun.status, 0, 'tsv guard data-fault resolution tests must pass');
}

console.log('gate b product row field tests passed');
