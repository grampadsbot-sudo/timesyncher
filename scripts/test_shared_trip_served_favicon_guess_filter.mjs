#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import {
  NAMED_THING_LOGOS,
  resolveThingLogoUrl,
} from '../src/vacation/thing-logo-capture.mjs';

assert.equal(
  resolveThingLogoUrl(
    { name: "Zabar's", logoUrl: 'https://www.zabars.com/favicon.ico', website: 'https://www.zabars.com/' },
    { logoUrl: 'https://www.zabars.com/favicon.ico', website: 'https://www.zabars.com/' },
  ),
  '',
);

assert.equal(
  resolveThingLogoUrl(
    { name: 'JetBlue LAS-JFK', logoUrl: NAMED_THING_LOGOS.jetblue, website: 'https://www.jetblue.com/' },
    { logoUrl: NAMED_THING_LOGOS.jetblue },
  ),
  NAMED_THING_LOGOS.jetblue,
);

const arthouseLogo = 'https://www.arthousehotelnyc.com/favicon.ico';
const arthouseSite = 'https://www.arthousehotelnyc.com/';
assert.equal(
  resolveThingLogoUrl(
    {
      name: 'Arthouse Hotel',
      logoUrl: arthouseLogo,
      website: arthouseSite,
      sourceRecord: { logoUrl: arthouseLogo, website: arthouseSite, url: arthouseSite, price: 508 },
    },
    {
      logoUrl: arthouseLogo,
      website: arthouseSite,
      price: 508,
      sourceRecord: { logoUrl: arthouseLogo, website: arthouseSite, url: arthouseSite, price: 508 },
    },
  ),
  arthouseLogo,
);

const served = finalizeServedSharedTripPayload({
  places: [{
    id: 602,
    name: "Zabar's",
    category_name: 'Store',
    logoUrl: 'https://www.zabars.com/favicon.ico',
    website: 'https://www.zabars.com/',
  }],
  thingOverrides: {
    'place:602': {
      logoUrl: 'https://www.zabars.com/favicon.ico',
      website: 'https://www.zabars.com/',
      url: 'https://www.zabars.com/',
    },
  },
});

assert.equal(served.places[0].logoUrl, undefined);
assert.equal(served.thingOverrides['place:602'].logoUrl, undefined);

const wrongHost = finalizeServedSharedTripPayload({
  places: [{
    id: 701,
    name: 'Carbone',
    category_name: 'Restaurant',
    logoUrl: 'https://juicegeneration.com/favicon.ico',
    website: 'https://juicegeneration.com/',
  }],
  thingOverrides: {
    'place:701': {
      logoUrl: 'https://juicegeneration.com/favicon.ico',
      website: 'https://juicegeneration.com/',
    },
  },
});

assert.equal(wrongHost.places[0].logoUrl, undefined);

const nycTrip = buildNycCraigKimDaybydayTrip();
const arthouse = nycTrip.places.find((place) => place.name === 'Arthouse Hotel');
assert.ok(arthouse, 'NYC fixture should include Arthouse Hotel');
const arthouseOverride = nycTrip.thingOverrides[`place:${arthouse.id}`] || {};
assert.ok(arthouseOverride.logoUrl || arthouse.logoUrl, 'Arthouse Hotel served logo must survive favicon guess filter');

console.log('shared trip served favicon guess filter tests passed');
