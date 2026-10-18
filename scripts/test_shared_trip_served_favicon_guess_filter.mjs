#!/usr/bin/env node
import assert from 'node:assert/strict';

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

console.log('shared trip served favicon guess filter tests passed');
