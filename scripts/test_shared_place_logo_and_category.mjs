#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { applyCapturedLogos, captureThingLogo, sourceLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { applyProductKeepsakeOverrides, productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { readFile } from 'node:fs/promises';

const tripId = crypto.randomUUID();
const website = 'https://rentals.example/locations/airport';

const thingRow = {
  id: crypto.randomUUID(),
  category: 'car',
  title: 'Summit rental counter',
  description: '',
  source: 'brave',
  location: { lat: 20.89, lng: -156.43, address: 'Airport road' },
  metadata: {
    categoryName: 'Store',
    providerCategories: ['Store', 'Car rental'],
    sourceRecord: { url: website, source: 'brave', categories: [{ name: 'Store' }] },
  },
};

const record = thingRecordFromTripRow(thingRow);
assert.equal(record.category, 'car');
assert.equal(record.categoryName, 'Store');

const shared = applyCapturedLogos(sharedTripFromIntake({
  trip: {
    id: tripId,
    title: 'Logo fixture trip',
    destination: 'Fixture coast',
    start_date: '2026-10-01',
    end_date: '2026-10-03',
  },
  things: [record],
}));

assert.equal(shared.places.length, 1);
const place = shared.places[0];
const override = shared.thingOverrides[`place:${place.id}`];
assert.equal(override.category, 'car');
assert.equal(productThingCategory(place, override), 'car');

const logoUrl = override.logoUrl || place.logoUrl;
assert.equal(logoUrl, 'https://rentals.example/favicon.ico');
assert.equal(sourceLogoUrl({ sourceRecord: { url: website } }), logoUrl);

const productized = applyProductKeepsakeOverrides(shared);
const productPlace = productized.places[0];
const productOverride = productized.thingOverrides[`place:${productPlace.id}`];
assert.equal(productThingCategory(productPlace, productOverride), 'car');
assert.equal(productOverride.category, 'car');

const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundle, /dc=\(\{item:G,size:Re=28\}\)=>\{const zt=_l\(G\),ua=Pc\(G\)/);
assert.match(bundle, /onError:Rn=>\{Rn\.currentTarget\.style\.display="none"\}/);
assert.match(bundle, /data-ts-logo-chip":"1"/);

const logoSrc = 'https://cdn.example/brand-mark.png';
const listProbe = {
  id: 991,
  name: 'Summit rental counter',
  category_name: 'Car',
  logoUrl: logoSrc,
};
const overrideProbe = { category: 'car', logoUrl: logoSrc };
assert.equal(captureThingLogo(listProbe, overrideProbe), logoSrc);

console.log('shared place logo and category tests passed');
