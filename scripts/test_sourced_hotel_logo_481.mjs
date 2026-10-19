#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';

const ARTHOUSE_SITE = 'https://www.arthousehotelnyc.com/';
const ARTHOUSE_LOGO = 'https://www.arthousehotelnyc.com/favicon.ico';

assert.equal(
  resolveThingLogoUrl(
    { name: 'Arthouse Hotel', website: ARTHOUSE_SITE, logoUrl: ARTHOUSE_LOGO },
    { category: 'hotel', website: ARTHOUSE_SITE, logoUrl: ARTHOUSE_LOGO },
  ),
  ARTHOUSE_LOGO,
  'provider-sourced own-site favicon survives served-logo filtering',
);

assert.equal(
  resolveThingLogoUrl(
    { name: 'Arthouse Hotel', website: ARTHOUSE_SITE, sourceRecord: { website: ARTHOUSE_SITE, logoUrl: ARTHOUSE_LOGO, source: 'brave' } },
    { category: 'hotel' },
  ),
  ARTHOUSE_LOGO,
  'explicit sourceRecord logoUrl favicon is preserved',
);

assert.equal(
  resolveThingLogoUrl(
    { name: 'Mystery venue', website: 'https://venue.example/', logoUrl: 'https://guessed.example/favicon.ico' },
    { category: 'hotel', website: 'https://venue.example/' },
  ),
  '',
  'cross-domain persisted favicon guesses are rejected',
);

const served = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
const arthouse = (served.places || []).find((place) => place.name === 'Arthouse Hotel');
assert.ok(arthouse, 'Arthouse Hotel row in NYC fixture');
const arthouseOverride = served.thingOverrides[`place:${arthouse.id}`] || {};
assert.equal(
  arthouseOverride.logoUrl || arthouse.logoUrl,
  ARTHOUSE_LOGO,
  'NYC Gate B list row keeps Arthouse sourced logo after served finalize',
);

console.log('sourced hotel logo #481 tests passed');
