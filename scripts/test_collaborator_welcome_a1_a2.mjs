#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { onboardingWelcomeTranscriptCustomerId } from '../src/vacation/onboarding-welcome-turn.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const ownerCustomerId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const collabCustomerId = '5c930191-3c60-4bd1-bc00-eb4b401ea407';
const ownerSessionId = 'bc4b3aa2-b427-47fd-94ef-83d262dd35cf';
const collabSessionId = 'cd351b2f-1dff-4681-b25b-0d107c05e194';
const tripId = '716d3a1f-60be-4bca-8993-dbe8bcb3196a';

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function createDb(state) {
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/from vacation_onboarding_welcomes/i.test(text) && /where onboarding_session_id =/i.test(text)) {
      const sessionId = values.find((v) => state.claims.has(`${v}:`));
      const welcomeFor = values.find((v) => typeof v === 'string' && sessionId && state.claims.has(`${sessionId}:${v}`));
      return sessionId && welcomeFor ? [{ id: 'claim-1' }] : [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      const key = `${values[0]}:${values[1]}`;
      if (state.claims.has(key)) return [];
      state.claims.add(key);
      return [{ id: `claim-${state.claims.size}` }];
    }
    if (/delete from vacation_onboarding_welcomes/i.test(text)) {
      const key = `${values.find((v) => v === ownerSessionId || v === collabSessionId)}:${values.find((v) => v === 'owner' || v === collabCustomerId)}`;
      state.claims.delete(key);
      return [];
    }
    if (/from customers/i.test(text) && /where id =/i.test(text)) {
      return [{ first_name: 'Owner', display_name: 'Owner Ada' }];
    }
    if (/insert into transcript_turns/i.test(text)) {
      const payload = values.find((v) => v?.welcomeAudience);
      const body = values.find((v) => typeof v === 'string' && v.length > 20) || '';
      state.turns.push({
        customer_id: values[0],
        trip_id: values[1],
        payload,
        body,
        speaker: 'app',
        direction: 'outbound',
      });
      return [{ id: `turn-${state.turns.length}` }];
    }
    if (/from transcript_turns/i.test(text) && /welcomeAudience/i.test(text)) {
      const customerId = values.find((v) => v === ownerCustomerId || v === collabCustomerId);
      const matched = state.turns.filter((row) => row.customer_id === customerId && row.speaker === 'app');
      return matched.length ? [{ id: 'welcome-turn' }] : [];
    }
    if (/update vacation_onboarding_welcomes/i.test(text)) return [];
    if (/update transcript_turns/i.test(text)) return [];
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected query: ${text.slice(0, 160)}`);
  };
}

const trip = {
  id: tripId,
  title: 'Maui March 10-17 2027 with my wife',
  shareToken: 'intake-716d3a1f60be',
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-716d3a1f60be/',
};

const collabSeat = {
  role: 'collaborator',
  payer: 'owner',
  displayName: 'Sam Collab',
  ownerCustomerId,
  ownerTripId: tripId,
  inviteId: crypto.randomUUID(),
};

const ownerSession = {
  id: ownerSessionId,
  customer_id: ownerCustomerId,
  first_name: 'Owner',
  display_name: 'Owner Ada',
  metadata: {},
};

const collabSession = {
  id: collabSessionId,
  customer_id: collabCustomerId,
  first_name: 'Sam',
  display_name: 'Sam Collab',
  metadata: { seat: collabSeat },
};

assert.equal(onboardingWelcomeTranscriptCustomerId(collabSession, collabSeat), collabCustomerId);
assert.equal(onboardingWelcomeTranscriptCustomerId(ownerSession, null), ownerCustomerId);

async function runScenario({ label, session, tripArg, audience }) {
  const state = { claims: new Set(), turns: [] };
  const db = createDb(state);
  await ensureOnboardingOpener(db, session, tripArg, {});
  await ensureOnboardingOpener(db, session, tripArg, {});
  const welcomeFor = session.metadata?.seat ? collabCustomerId : 'owner';
  const welcomeTurns = state.turns.filter((row) => row.payload?.welcomeFor === welcomeFor);
  assert.equal(welcomeTurns.length, 1, `${label} welcome turn count`);
  assert.equal(welcomeTurns[0].customer_id, onboardingWelcomeTranscriptCustomerId(session, session.metadata?.seat || null), `${label} transcript customer`);
  const expected = renderOnboardingWelcome({
    audience,
    collabFirstName: 'Sam',
    ownerFirstName: 'Owner',
    tripTitle: audience === 'collaborator_no_site' ? 'this vacation' : trip.title,
    ...(audience === 'collaborator' ? { tripSiteUrl: trip.publicUrl } : {}),
    ...(audience === 'owner' ? { firstName: 'Owner', tripSiteUrl: trip.publicUrl } : {}),
    ...(audience === 'owner_no_site' ? { firstName: 'Owner' } : {}),
  });
  assert.equal(welcomeTurns[0].payload.liveTranscript.text, expected, `${label} welcome body`);
}

await runScenario({
  label: 'A1',
  session: {
    ...collabSession,
    metadata: {
      seat: {
        ...collabSeat,
        ownerTripId: null,
        ownerOnboardingSessionId: ownerSessionId,
      },
    },
  },
  tripArg: null,
  audience: 'collaborator_no_site',
});

await runScenario({
  label: 'A2',
  session: collabSession,
  tripArg: trip,
  audience: 'collaborator',
});

const ownerState = { claims: new Set(), turns: [] };
const ownerDb = createDb(ownerState);
await ensureOnboardingOpener(ownerDb, ownerSession, trip, {});
await ensureOnboardingOpener(ownerDb, ownerSession, trip, {});
assert.equal(ownerState.turns.filter((row) => row.payload?.welcomeFor === 'owner').length, 1, 'owner welcome');

console.log('collaborator welcome a1/a2 passed');
