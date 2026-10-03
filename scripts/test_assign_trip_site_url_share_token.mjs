#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assignTripSiteUrl } from '../src/vacation/onboarding.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';

const tripId = 'cebfc7ee-3216-4758-9e73-3d919d2d0543';
const publicSlug = intakeShareSlug(tripId);
const env = { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' };

const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (text.includes('select metadata') && text.includes('from trips')) {
    return [{
      metadata: {
        shareToken: publicSlug,
        publicUrl: `https://vacation-staging.timesyncher.com/shared/${publicSlug}/`,
      },
    }];
  }
  throw new Error(`unexpected sql: ${text}`);
};

const site = await assignTripSiteUrl(db, tripId, env);
assert.equal(site.publicSlug, publicSlug);
assert.match(site.publicUrl, new RegExp(`/shared/${publicSlug}/$`));

console.log('test_assign_trip_site_url_share_token: ok');
