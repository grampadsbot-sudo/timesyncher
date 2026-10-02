#!/usr/bin/env node
import assert from 'node:assert/strict';

import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const onboardingSessionId = 'bc4b3aa2-b427-47fd-94ef-83d262dd35cf';
const welcomeFor = '5c930191-3c60-4bd1-bc00-eb4b401ea407';
const ownerCustomerId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const tripId = '716d3a1f-60be-4bca-8993-dbe8bcb3196a';
const collabCustomerId = welcomeFor;

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function createDb(state) {
  const claimKey = `${onboardingSessionId}|${welcomeFor}`;
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/from vacation_onboarding_welcomes/i.test(text) && /where onboarding_session_id =/i.test(text)) {
      return state.claimed.has(claimKey) ? [{ id: '78f9aaf4-589b-4aed-8ba0-50a969e5adb3' }] : [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      if (state.claimed.has(claimKey)) return [];
      state.claimed.add(claimKey);
      return [{ id: '78f9aaf4-589b-4aed-8ba0-50a969e5adb3' }];
    }
    if (/from customers/i.test(text) && /where id =/i.test(text)) {
      return [{ first_name: 'Owner', display_name: 'Owner Ada' }];
    }
    if (/insert into transcript_turns/i.test(text)) {
      state.turns.push({ payload: values.find((v) => v?.welcomeAudience) });
      return [{ id: `welcome-turn-${state.turns.length}` }];
    }
    if (/from transcript_turns/i.test(text) && /welcomeAudience/i.test(text)) {
      return state.turns.length ? [{ id: 'welcome-turn-1' }] : [];
    }
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected query: ${text.slice(0, 160)}`);
  };
}

const session = {
  id: onboardingSessionId,
  customer_id: collabCustomerId,
  first_name: 'Sam',
  display_name: 'Sam Collab',
  metadata: {
    seat: {
      role: 'collaborator',
      payer: 'owner',
      displayName: 'Sam Collab',
      ownerCustomerId,
      ownerTripId: tripId,
      inviteId: 'a36fdef3-ee73-4524-baf8-561b7b65b3ad',
    },
  },
};

const trip = {
  id: tripId,
  title: 'Maui March 10-17 2027 with my wife',
  shareToken: 'intake-716d3a1f60be',
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-716d3a1f60be/',
};

const state = { claimed: new Set([`${onboardingSessionId}|${welcomeFor}`]), turns: [] };
const db = createDb(state);

await ensureOnboardingOpener(db, session, trip, {});
assert.equal(state.turns.length, 1);
assert.equal(state.turns[0].payload.welcomeAudience, 'collaborator');
const expected = renderOnboardingWelcome({
  audience: 'collaborator',
  collabFirstName: 'Sam',
  ownerFirstName: 'Owner',
  tripTitle: trip.title,
  tripSiteUrl: trip.publicUrl,
});
assert.equal(state.turns[0].payload.liveTranscript.text, expected);

console.log('welcome claim without turn recovery passed');
