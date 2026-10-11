#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { assignTripSiteUrl } from '../src/vacation/onboarding.mjs';
import { sharedTripWebsiteUrl } from '../src/vacation/web-access.mjs';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import { pickVacationAppTrip } from '../src/vacation/vacation-app-trip-select.mjs';

const ownerCustomerId = crypto.randomUUID();
const collabCustomerId = crypto.randomUUID();
const tripId = crypto.randomUUID();
const ownerSessionId = crypto.randomUUID();
const ownerToken = 'owner-token-getapp';
const collabToken = 'collab-token-getapp';
const inviteId = crypto.randomUUID();

process.env.TIMESYNCHER_SITE_BASE_URL = 'https://vacation-staging.timesyncher.com/';

const publicSlug = intakeShareSlug(tripId);
const publicUrl = sharedTripWebsiteUrl(publicSlug, process.env);

const state = {
  trips: [{
    id: tripId,
    customer_id: ownerCustomerId,
    title: 'Harbor week',
    destination: 'Neutral Bay',
    metadata: {},
    status: 'planning',
  }],
  tripThings: [],
  invites: [{
    id: inviteId,
    owner_customer_id: ownerCustomerId,
    trip_id: tripId,
    plan_code: 'telegram_collaborators_single_trip',
    scope: 'single_trip',
    requested_for: 'Sam',
    status: 'paid',
    metadata: { payer: 'owner', email: 'sam@example.com', displayName: 'Sam', channel: 'vacation-app' },
  }],
  customers: {
    [ownerCustomerId]: { id: ownerCustomerId, first_name: 'Owner', display_name: 'Owner Ada', email: 'owner@example.com' },
    [collabCustomerId]: { id: collabCustomerId, first_name: 'Sam', display_name: 'Sam', email: 'sam@example.com' },
  },
  ownerSession: {
    id: ownerSessionId,
    token: ownerToken,
    customer_id: ownerCustomerId,
    trip_id: tripId,
    status: 'purchase_confirmed',
    metadata: {},
    display_name: 'Owner Ada',
    first_name: 'Owner',
    email: 'owner@example.com',
  },
  collabSession: {
    id: crypto.randomUUID(),
    token: collabToken,
    customer_id: collabCustomerId,
    trip_id: tripId,
    status: 'purchase_confirmed',
    metadata: {
      seat: {
        role: 'collaborator',
        payer: 'owner',
        displayName: 'Sam',
        ownerCustomerId,
        ownerTripId: tripId,
        inviteId,
      },
    },
    display_name: 'Sam',
    first_name: 'Sam',
    email: 'sam@example.com',
  },
  welcomes: new Set(),
  transcript: [],
};

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function vacationAppTripSummary(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const slug = String(metadata.sharedToken || metadata.shareToken || metadata.publicSlug || '').trim();
  const explicit = String(metadata.publicUrl || '').trim();
  const url = explicit || (slug ? sharedTripWebsiteUrl(slug, process.env) : '');
  return {
    id: row.id,
    title: row.title || '',
    publicUrl: url,
    shareToken: slug || null,
  };
}

const db = async (strings, ...values) => {
  const text = sqlText(strings);
  if (/select metadata/i.test(text) && /from trips/i.test(text) && !/customer_id/i.test(text)) {
    const trip = state.trips.find((row) => row.id === tripId) || state.trips[0];
    return [{ metadata: trip?.metadata || {} }];
  }
  if (/update trips/i.test(text) && /metadata = coalesce/i.test(text)) {
    const trip = state.trips[0];
    const patchJson = values.find((v) => typeof v === 'string' && v.includes('publicSlug'));
    if (trip && patchJson) trip.metadata = { ...trip.metadata, ...JSON.parse(patchJson) };
    const patch = values.find((v) => v && typeof v === 'object' && (v.publicUrl || v.publicSlug));
    if (trip && patch) trip.metadata = { ...trip.metadata, ...patch };
    return [{ public_slug: trip?.metadata?.publicSlug || publicSlug }];
  }
  if (/from trips/i.test(text) && /where trips\.customer_id/i.test(text)) {
    const customerId = values[0];
    const ownerTripId = values[1];
    return state.trips.filter((trip) => trip.customer_id === customerId || trip.id === ownerTripId)
      .map(vacationAppTripSummary);
  }
  if (/select count\(\*\)::int as n from trip_things/i.test(text)) {
    return [{ n: state.tripThings.length }];
  }
  if (/insert into trip_things/i.test(text)) {
    state.tripThings.push({ id: crypto.randomUUID(), trip_id: tripId, category: 'hotel', title: 'Lodging place' });
    return [{ id: state.tripThings[0].id }];
  }
  if (/from onboarding_sessions/i.test(text) && /where onboarding_sessions\.token =/i.test(text)) {
    const token = values[0];
    if (token === ownerToken) return [state.ownerSession];
    if (token === collabToken) return [state.collabSession];
    return [];
  }
  if (/from customers/i.test(text) && /where id =/i.test(text)) {
    const id = values.find((v) => state.customers[v]);
    return id ? [state.customers[id]] : [];
  }
  if (/from vacation_onboarding_welcomes/i.test(text)) return [];
  if (/insert into vacation_onboarding_welcomes/i.test(text)) return [{ id: 'welcome-claim' }];
  if (/insert into transcript_turns/i.test(text)) return [{ id: 'turn-1' }];
  if (/from transcript_turns/i.test(text)) return [];
  if (/from vacation_collaborators/i.test(text)) return [];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected query: ${text.slice(0, 120)}`);
};

await insertTripThing(db, {
  tripId,
  requestId: null,
  thing: {
    category: 'hotel',
    title: 'Customer lodging',
    source: 'customer_stated',
    location: { lat: 20.9, lng: -156.6, address: 'Kaanapali' },
    metadata: { customerStatedLodging: true },
  },
  env: process.env,
});

await assignTripSiteUrl(db, tripId, process.env);
assert.equal(state.trips[0].metadata.publicUrl, publicUrl);

const ownerVacations = await db`
  select trips.id, trips.title, trips.metadata
  from trips
  where trips.customer_id = ${ownerCustomerId}
    or (${null}::uuid is not null and trips.id = ${null})
`;
const ownerTrip = pickVacationAppTrip(ownerVacations, state.ownerSession, '');
assert.equal(ownerTrip.publicUrl, publicUrl);

const collabVacations = await db`
  select trips.id, trips.title, trips.metadata
  from trips
  where trips.customer_id = ${collabCustomerId}
    or (${tripId}::uuid is not null and trips.id = ${tripId})
`;
const collabTrip = pickVacationAppTrip(collabVacations, state.collabSession, '');
assert.equal(collabTrip.publicUrl, publicUrl, 'collaborator sees owner trip site url');

console.log('collaborator getApp trip site url tests passed');
