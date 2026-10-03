#!/usr/bin/env node
import assert from 'node:assert/strict';

import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const onboardingSessionId = 'bc4b3aa2-b427-47fd-94ef-83d262dd35cf';
const customerId = '11111111-2222-4333-8444-555555555555';
const tripId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function createDb(state) {
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/from vacation_onboarding_welcomes/i.test(text) && /onboarding_session_id/i.test(text)) {
      return state.claim ? [{ id: 'claim-1', trip_id: state.claim.trip_id }] : [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      if (state.claim) return [];
      state.claim = { id: 'claim-1', trip_id: values[2] ?? null };
      return [{ id: 'claim-1' }];
    }
    if (/update vacation_onboarding_welcomes/i.test(text) && /set trip_id/i.test(text)) {
      if (state.claim) state.claim.trip_id = values[0];
      return [];
    }
    if (/update transcript_turns/i.test(text) && /set trip_id/i.test(text)) {
      for (const row of state.welcomeTurns) {
        if (row.trip_id == null) row.trip_id = values[0];
      }
      return [];
    }
    if (/insert into transcript_turns/i.test(text)) {
      const payload = values.find((v) => v?.welcomeAudience);
      state.welcomeTurns.push({
        id: `welcome-${state.welcomeTurns.length + 1}`,
        trip_id: values.find((v) => v === tripId || v === null) ?? null,
        payload,
      });
      return [{ id: state.welcomeTurns.at(-1).id }];
    }
    if (/from transcript_turns/i.test(text) && /welcomeAudience/i.test(text)) {
      const audience = values.find((v) => v === 'owner' || v === 'collaborator');
      const boundTripId = values.find((v) => v === tripId);
      return state.welcomeTurns.filter((row) => {
        const payloadAudience = row.payload?.welcomeAudience || '';
        const audienceOk = audience === 'owner'
          ? (payloadAudience === 'owner' || payloadAudience === 'owner_no_site')
          : payloadAudience === audience;
        if (!audienceOk) return false;
        if (boundTripId) return row.trip_id === boundTripId || row.trip_id == null;
        return row.trip_id == null;
      }).map((row) => ({ id: row.id }));
    }
    if (/from customers/i.test(text)) return [{ first_name: 'Shepherd', display_name: 'Shepherd' }];
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected query: ${text.slice(0, 160)}`);
  };
}

const session = {
  id: onboardingSessionId,
  customer_id: customerId,
  trip_id: tripId,
  first_name: 'Shepherd',
  display_name: 'Shepherd',
  metadata: {},
};

const trip = {
  id: tripId,
  title: 'March Maui week',
  shareToken: 'intake-aaaabbbbcccc',
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-aaaabbbbcccc/',
};

const state = { claim: null, welcomeTurns: [] };
const db = createDb(state);

await ensureOnboardingOpener(db, session, null, {});
assert.equal(state.welcomeTurns.length, 1);
assert.equal(state.welcomeTurns[0].payload.welcomeAudience, 'owner');

state.claim = { id: 'claim-1', trip_id: tripId };
state.welcomeTurns[0].trip_id = tripId;

await ensureOnboardingOpener(db, session, null, {});
assert.equal(state.welcomeTurns.length, 1, 'lodging-post opener must not insert a second welcome when session trip_id scopes dedupe');

const expected = renderOnboardingWelcome({ audience: 'owner_no_site', firstName: 'Shepherd' });
assert.equal(state.welcomeTurns[0].payload.liveTranscript.text, expected);

console.log('test_welcome_scope_trip_id_lodging_turn passed');
