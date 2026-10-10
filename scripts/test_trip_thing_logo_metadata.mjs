#!/usr/bin/env node
import assert from 'node:assert/strict';

import { placeToTripThing } from '../src/vacation/place-search.mjs';
import {
  buildCategoryDescription,
  enrichSearchPlace,
  enrichTripThing,
  isGenericDescription,
  logoUrlFromSearchPlace,
} from '../src/vacation/trip-thing-enrichment.mjs';
import { applyCapturedLogos, resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { readFile } from 'node:fs/promises';

const website = 'https://lodging.example/properties/west-tower';

const thing = placeToTripThing({
  source: 'brave',
  category: 'hotel',
  title: 'Harbor lodging',
  lat: 20.9,
  lng: -156.6,
  address: 'Shoreline road',
  url: website,
  externalId: 'brave:1',
  categoryName: 'Hotel',
  sourceRecord: { url: website, source: 'brave' },
});

assert.equal(thing.metadata.logoUrl, 'https://lodging.example/favicon.ico');
assert.equal(thing.metadata.logoCaptureReason, undefined);

const row = thingRecordFromTripRow({
  id: 'row-1',
  category: 'hotel',
  title: thing.title,
  description: thing.description,
  metadata: thing.metadata,
  location: thing.location,
  source: 'brave',
});

const shared = applyCapturedLogos(sharedTripFromIntake({
  trip: {
    id: '00000000-0000-4000-8000-000000000099',
    title: 'Persisted logo trip',
    destination: 'Fixture coast',
    start_date: '2026-10-01',
    end_date: '2026-10-03',
  },
  things: [row],
}));

const place = shared.places[0];
const override = shared.thingOverrides[`place:${place.id}`];
assert.equal(place.logoUrl, 'https://lodging.example/favicon.ico');
assert.equal(override.logoUrl, 'https://lodging.example/favicon.ico');

const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundle, /dc=\(\{item:G,size:Re=28\}\)=>\{const zt=_l\(G\),ua=Pc\(G\)/);
assert.match(bundle, /onError:Rn=>\{tsShowChipEmoji\(Rn\.currentTarget\)\}/);

const enrichmentCategories = [
  {
    category: 'hotel',
    place: {
      source: 'brave',
      title: 'Hotel Belleclaire Central Park',
      category: 'hotel',
      lat: 40.78,
      lng: -73.98,
      address: 'Upper West Side, New York, NY',
      url: 'https://www.hotelbelleclaire.com/',
      description: 'Upper West Side; strong UWS fit with breakfast included and free cancellation.',
      sourceRecord: {
        source: 'brave',
        url: 'https://www.hotelbelleclaire.com/',
        rating: '8.4',
        price: 518,
      },
    },
  },
  {
    category: 'restaurant',
    place: {
      source: 'brave',
      title: 'Amelie Bistro & Wine Bar',
      category: 'restaurant',
      lat: 40.73,
      lng: -73.99,
      address: 'Greenwich Village, New York, NY',
      url: 'https://example-restaurant.test/',
      description: 'French bistro with a strong wine list; reservations recommended on Friday nights.',
      sourceRecord: { source: 'brave', url: 'https://example-restaurant.test/', cuisine: 'French' },
    },
  },
  {
    category: 'flight',
    place: {
      source: 'brave',
      title: 'JetBlue LAS → JFK 6:30 am–10:15 am',
      category: 'flight',
      lat: 40.64,
      lng: -73.78,
      address: 'JFK',
      description: 'Nonstop morning option; good if you want to land before lunch.',
      sourceRecord: { source: 'brave', price: 248, airline: 'JetBlue' },
    },
  },
  {
    category: 'car',
    place: {
      source: 'brave',
      title: 'Hertz JFK — Compact SUV',
      category: 'car',
      lat: 40.64,
      lng: -73.78,
      address: 'JFK Airport, Queens, NY',
      url: 'https://www.hertz.com/',
      sourceRecord: {
        source: 'brave',
        url: 'https://www.hertz.com/',
        rentalCompany: 'Hertz',
        carType: 'Compact SUV',
        price: 172,
      },
    },
  },
  {
    category: 'store',
    place: {
      source: 'brave',
      title: "Zabar's",
      category: 'store',
      lat: 40.78,
      lng: -73.97,
      address: 'Broadway, New York, NY',
      url: 'https://www.zabars.com/',
      description: 'Iconic UWS specialty market; useful for breakfast supplies and picnic items.',
      sourceRecord: { source: 'brave', url: 'https://www.zabars.com/' },
    },
  },
  {
    category: 'music',
    place: {
      source: 'brave',
      title: 'Blue Note Jazz Club',
      category: 'music',
      lat: 40.73,
      lng: -74.0,
      address: 'Greenwich Village, New York, NY',
      url: 'https://www.bluenote.net/',
      description: 'Classic Greenwich Village jazz room; book ahead for weekend sets.',
      sourceRecord: { source: 'brave', url: 'https://www.bluenote.net/' },
    },
  },
];

for (const { category, place } of enrichmentCategories) {
  const enriched = enrichSearchPlace(place);
  assert.ok(enriched.description, `${category} description`);
  assert.equal(isGenericDescription(enriched.description), false, `${category} generic`);
  const logo = logoUrlFromSearchPlace(enriched, enriched.sourceRecord);
  assert.ok(logo, `${category} logo`);
  const mapped = placeToTripThing(place);
  assert.equal(isGenericDescription(mapped.description), false, `${category} trip thing description`);
  assert.ok(mapped.metadata?.sourceRecord?.summary, `${category} summary`);
  assert.ok(mapped.metadata?.logoUrl || mapped.metadata?.sourceRecord?.logoUrl, `${category} persisted logo`);
  if (place.sourceRecord?.price != null) {
    assert.equal(mapped.metadata?.price, place.sourceRecord.price, `${category} price`);
    assert.equal(mapped.price, place.sourceRecord.price, `${category} thing price`);
  }
}

assert.equal(
  resolveThingLogoUrl(
    { name: 'JetBlue LAS → JFK', category_name: 'Flight' },
    { category: 'flight', logoUrl: 'https://www.jetblue.com/favicon.ico' },
  ),
  'https://www.jetblue.com/favicon.ico',
);

const backfilled = enrichTripThing({
  category: 'hotel',
  title: 'Hotel Lucerne',
  description: 'Documented NYC option (hotel)',
  metadata: { sourceRecord: { url: 'https://www.thelucernehotel.com/', price: 530 } },
});
assert.equal(isGenericDescription(backfilled.description), false);
assert.equal(backfilled.metadata.price, 530);

const built = buildCategoryDescription({
  category: 'flight',
  title: 'Southwest LGA → LAS',
  sourceRecord: { airline: 'Southwest', price: 312 },
  rawDescription: '',
});
assert.match(built, /Southwest/i);

console.log('trip thing logo metadata tests passed');
