#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const onboardingSessionId = '4ec4faee-2a03-4ba8-944a-8078fb53c0ab';
const ownerCustomerId = 'owner-customer-964b88b';
const tripId = '716d3a1f-60be-4bca-8993-dbe8bcb3196a';
const firstName = 'Shepherd';

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function createDb(state) {
  const claimKey = `${onboardingSessionId}|owner`;
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/from vacation_onboarding_welcomes/i.test(text) && /where onboarding_session_id =/i.test(text)) {
      return state.claim ? [{ id: state.claim.id, trip_id: state.claim.trip_id }] : [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      if (state.claim) return [];
      const tripIdValue = values[2] ?? null;
      state.claim = { id: '66887a2d-fd5d-4cc2-a4b7-08c7a8daece4', trip_id: tripIdValue };
      return [{ id: state.claim.id }];
    }
    if (/update vacation_onboarding_welcomes/i.test(text) && /set trip_id =/i.test(text)) {
      const nextTripId = values[0];
      if (state.claim) state.claim.trip_id = nextTripId;
      return [];
    }
    if (/update transcript_turns/i.test(text) && /set trip_id =/i.test(text)) {
      const nextTripId = values[0];
      for (const turn of state.welcomeTurns) turn.trip_id = nextTripId;
      return [];
    }
    if (/insert into transcript_turns/i.test(text)) {
      const payload = values.find((v) => v?.welcomeAudience);
      const tripIdValue = values.find((v) => v === tripId || v === null);
      state.welcomeTurns.push({
        id: `ceb2a956-98f0-4db5-8cb5-b9f1e59e8c35`,
        trip_id: tripIdValue ?? null,
        payload,
      });
      return [{ id: state.welcomeTurns[0].id }];
    }
    if (/from transcript_turns/i.test(text) && /welcomeAudience/i.test(text)) {
      const audience = values.find((v) => v === 'owner' || v === 'collaborator');
      const boundTripId = values.find((v) => typeof v === 'string' && v.length === 36);
      return state.welcomeTurns.filter((row) => {
        if (row.payload?.welcomeAudience !== audience) return false;
        if (!boundTripId) return row.trip_id === null;
        return row.trip_id === boundTripId || row.trip_id === null;
      }).map((row) => ({ id: row.id }));
    }
    if (/from customers/i.test(text)) return [{ first_name: firstName, display_name: firstName }];
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected query: ${text.slice(0, 180)}`);
  };
}

const session = {
  id: onboardingSessionId,
  customer_id: ownerCustomerId,
  first_name: firstName,
  display_name: firstName,
  metadata: {},
};

const trip = {
  id: tripId,
  title: 'Maui March 10-17 2027 with my wife',
  shareToken: 'intake-716d3a1f60be',
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-716d3a1f60be/',
};

const state = { claim: null, welcomeTurns: [] };
const db = createDb(state);

// terms GET equivalent: EULA accepted, no trip yet
await ensureOnboardingOpener(db, session, null, {});
// hi / first chat turn
await ensureOnboardingOpener(db, session, null, {});
// trip create
await ensureOnboardingOpener(db, session, trip, {});
// second GET after trip exists
await ensureOnboardingOpener(db, session, trip, {});

assert.equal(state.welcomeTurns.length, 1, 'expected exactly one owner welcome turn');
assert.equal(state.claim.trip_id, tripId, 'welcome claim should bind to trip');
assert.equal(state.welcomeTurns[0].trip_id, tripId, 'welcome turn should bind to trip');
const expected = renderOnboardingWelcome({
  audience: 'owner_no_site',
  firstName,
});
assert.equal(state.welcomeTurns[0].payload.liveTranscript.text, expected);

console.log('owner welcome single after trip create passed');
