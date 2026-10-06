#!/usr/bin/env node
/**
 * Gate B check H / INV-CLAIM lodging turn: trip_intake gap answer must not run first-intake
 * collaborator quality gates (missingCollaborators) or surface bogus titleError when the trip
 * already has a saved title. After lodging, the shipped reply must use inviteContactAsk and
 * ask for the companion name and/or email.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hardQualityFlags, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { tripIntakeJobFields } from '../src/vacation/trip-intake-classify.mjs';
import {
  STAGING_HYATT_INTAKE_EXTRACTION,
  STAGING_HYATT_INTAKE_SENTENCE,
} from './fixtures/trip-intake-hyatt-staging.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

const HYATT = STAGING_HYATT_INTAKE_SENTENCE;
const INVITE_REPLY = 'Kaanapali is a great base. I have Hyatt Regency Maui noted. What is your wife name and email so I can send her the trip invite?';

const queueSource = readFileSync(
  fileURLToPath(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url)),
  'utf8',
);
assert.match(queueSource, /intake:\s*firstIntake,/);

const gapFlagsIntake = hardQualityFlags(
  INVITE_REPLY,
  { text: HYATT, intake: true },
  '',
  [],
  null,
);
const gapFlagsPostIntake = hardQualityFlags(
  INVITE_REPLY,
  { text: HYATT, intake: false },
  '',
  [],
  null,
);
assert.equal(gapFlagsIntake.missingCollaborators, true);
assert.equal(gapFlagsPostIntake.missingCollaborators, false);

const classification = {
  ok: true,
  intake: true,
  turnKind: STAGING_HYATT_INTAKE_EXTRACTION.turnKind,
  things: STAGING_HYATT_INTAKE_EXTRACTION.things,
  destination: STAGING_HYATT_INTAKE_EXTRACTION.destination,
  title: '',
  hasDates: false,
  startDate: '',
  endDate: '',
  roster: [],
};
const followUpFields = tripIntakeJobFields({
  requestText: HYATT,
  receivedAt: '2026-10-06T00:00:00.000Z',
  classification,
  firstIntake: false,
  jobKind: 'trip_intake',
  savedTripTitle: 'Maui Mar 10–17 2027',
  savedTripDestination: 'Maui',
});
assert.equal(followUpFields.title, 'Maui Mar 10–17 2027');
assert.equal(followUpFields.titleError, null);
assert.equal(followUpFields.destination, 'Kaanapali');

const savedTripRow = {
  start: '2027-03-10',
  end: '2027-03-17',
  destination: 'Maui',
  things: [],
  party: {
    primary: { name: 'Inv Claim', role: 'Owner' },
    collaborators: [{ name: 'my wife', role: 'collaborator' }],
  },
  lastAskedGap: 'lodging',
  invite_contact_needed: true,
  lodgingAsk: true,
  needsCustomerInput: ['lodging'],
};

const env = {
  ...testPlanEnv,
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: 'https://jev.example/api/alpha/decisions',
};
const TIER_MODEL = 'deepseek/deepseek-v3.2';
const HOLDING_MODEL = 'google/gemini-2.5-flash-lite';

const originalFetch = globalThis.fetch;
let capturedSystem = '';

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  if (href.includes('/api/alpha/decisions')) {
    if (body.questions?.model_tier) {
      return { ok: true, json: async () => ({ answers: { model_tier: { score: 2 }, route_type: { choice: 'general' } } }) };
    }
    return {
      ok: true,
      json: async () => ({
        answers: {
          overall_quality: { score: 4 },
          disposition: { choice: 'ship' },
        },
      }),
    };
  }
  if (href.includes('/chat/completions')) {
    const model = body.model;
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    if (model === HOLDING_MODEL && /Do not write a customer reply/.test(system)) {
      return { ok: true, json: async () => ({ model, choices: [{ message: { content: '{"asksPrice":false,"asksAccess":false,"pullsAccess":false,"seats":[],"ask":false}' } }] }) };
    }
    if (model === TIER_MODEL || model === env.TIMESYNCHER_REPLY_TIER2_MODEL) {
      capturedSystem = system;
      return { ok: true, json: async () => ({ model, choices: [{ message: { content: INVITE_REPLY } }] }) };
    }
    return { ok: true, json: async () => ({ model, choices: [{ message: { content: INVITE_REPLY } }] }) };
  }
  return { ok: false, status: 404, json: async () => ({ error: 'unexpected' }) };
};

try {
  const produced = await produceLiveAppReply({
    customerTurn: HYATT,
    session: { token: 'sess-gap', trip_id: 'trip-gap', display_name: 'Inv Claim' },
    priorTurns: [
      { role: 'customer', text: 'Maui March 10-17 2027 with my wife', intake: true },
      { role: 'app', text: 'What hotel are you staying at?' },
    ],
    tripTitle: 'Maui Mar 10–17 2027',
    env,
    intake: false,
    wantedThings: [{ name: 'Hyatt Regency Maui', kind: 'hotel', source: 'chat_extraction' }],
    roster: [],
    extractedDestination: 'Kaanapali',
    titleError: null,
    savedStart: '2027-03-10',
    savedEnd: '2027-03-17',
    loadSavedTripRecordFn: async () => savedTripRow,
  });
  assert.equal(produced.reason, null, `expected shippable reply, got reason=${produced.reason}`);
  assert.match(produced.reply, /Hyatt/i);
  assert.match(produced.reply, /email/i);
  assert.match(capturedSystem, /inviteContactAsk/);
  assert.match(capturedSystem, /includes inviteContactAsk\. Ask for the collaborator name and email/);
  assert.doesNotMatch(capturedSystem, /"lodgingAsk":true/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('test_inv_claim_hyatt_gap_reply_route: ok');
