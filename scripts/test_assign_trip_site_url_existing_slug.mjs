#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assignTripSiteUrl } from '../src/vacation/onboarding.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { sharedTripWebsiteUrl } from '../src/vacation/web-access.mjs';

const env = { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' };

function mockDb(tripId, { metadata = {}, updateStores = true } = {}) {
  let meta = { ...metadata };
  return async (strings, ...values) => {
    const text = strings.join(' ');
    if (text.includes('select metadata') && text.includes('from trips')) {
      return [{ metadata: { ...meta } }];
    }
    if (text.includes('update trips')) {
      if (!updateStores) return [];
      const patch = values.find((v) => typeof v === 'string' && v.includes('publicSlug'));
      if (patch) {
        const next = JSON.parse(patch);
        meta = { ...meta, ...next };
      }
      return [{ public_slug: meta.publicSlug || '' }];
    }
    throw new Error(`unexpected sql: ${text}`);
  };
}

const tripId = 'cebfc7ee-3216-4758-9e73-3d919d2d0543';
const intakeSlug = intakeShareSlug(tripId);
const qaSlug = 'qa-copy-nyc-share-slug';

{
  const kept = await assignTripSiteUrl(mockDb(tripId, {
    metadata: {
      publicSlug: qaSlug,
      publicUrl: `https://vacation-staging.timesyncher.com/shared/${qaSlug}/`,
    },
  }), tripId, env);
  assert.equal(kept.publicSlug, qaSlug);
  assert.match(kept.publicUrl, new RegExp(`/shared/${qaSlug}/$`));
}

{
  const kept = await assignTripSiteUrl(mockDb(tripId, {
    metadata: { shareToken: qaSlug },
  }), tripId, env);
  assert.equal(kept.publicSlug, qaSlug);
  assert.match(kept.publicUrl, new RegExp(`/shared/${qaSlug}/$`));
}

{
  const db = mockDb(tripId, { metadata: {}, updateStores: true });
  const minted = await assignTripSiteUrl(db, tripId, env);
  assert.equal(minted.publicSlug, intakeSlug);
  assert.equal(minted.publicUrl, sharedTripWebsiteUrl(intakeSlug, env));
}

{
  const kept = await assignTripSiteUrl(mockDb(tripId, {
    metadata: {
      publicSlug: intakeSlug,
      shareToken: intakeSlug,
      publicUrl: sharedTripWebsiteUrl(intakeSlug, env),
    },
  }), tripId, env);
  assert.equal(kept.publicSlug, intakeSlug);
}

console.log('test_assign_trip_site_url_existing_slug: ok');
