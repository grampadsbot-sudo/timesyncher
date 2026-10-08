#!/usr/bin/env node
import assert from 'node:assert/strict';

import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
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
assert.match(bundle, /onError:Rn=>\{Rn\.currentTarget\.style\.display="none"\}/);

console.log('trip thing logo metadata tests passed');
