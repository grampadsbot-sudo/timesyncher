import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { welcomeBeforeFirstTurn } from '../.cursor/skills/verify-timesyncher-vacation/scripts/onboarding-welcome-precheck.mjs';

const api = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(api, /if \(eula\.accepted && !seatFromSession\(session\)\)/);
assert.match(api, /await ensureOnboardingOpener\(db, session, selected \|\| null\)/);
assert.doesNotMatch(api, /ensureOwnerShellTrip/);

const templates = JSON.parse(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'));
const firstName = 'leaabc12';
const welcomeText = renderOnboardingWelcome({ audience: 'owner_no_site', firstName });
assert.equal(welcomeText, templates.owner_no_site.replace('{firstName}', firstName));
assert.match(welcomeText, /hold the mic button/i);
assert.doesNotMatch(welcomeText, /https?:\/\//);

const session = { id: 'session-1', customer_id: 'owner-1', trip_id: null, order_id: 'order-1' };
const state = { turns: [], logs: [] };
const originalLog = console.log;
console.log = (...args) => {
  state.logs.push(args.map((item) => String(item)).join(' '));
};

const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (/insert into transcript_turns/i.test(text)) {
    const payload = values.find((v) => v && typeof v === 'object' && v.liveTranscript);
    state.turns.push(payload);
    return [{ id: 'turn-1' }];
  }
  if (/from transcript_turns/i.test(text) && /select 1/i.test(text)) return state.turns.length ? [1] : [];
  if (/from customers/i.test(text)) return [{ first_name: firstName, display_name: firstName }];
  throw new Error(`unexpected ${text}`);
};

try {
  await ensureOnboardingOpener(db, {
    customer_id: session.customer_id,
    first_name: firstName,
    display_name: firstName,
    metadata: {},
  }, null, {});
  await ensureOnboardingOpener(db, {
    customer_id: session.customer_id,
    first_name: firstName,
    display_name: firstName,
    metadata: {},
  }, null, {});
} finally {
  console.log = originalLog;
}

assert.equal(state.turns.length, 1);
assert.equal(state.turns[0].welcomeAudience, 'owner');
assert.equal(state.turns[0].selectedTripId, null);
assert.equal(state.turns[0].liveTranscript.text, welcomeText);
assert.equal(state.turns[0].liveTranscript.telemetry.kind, 'canned_welcome');

const cannedLog = state.logs.map((line) => JSON.parse(line)).find((row) => row.event === 'canned_welcome');
assert.ok(cannedLog);
assert.equal(cannedLog.tripId, null);
assert.equal(cannedLog.telemetry.kind, 'canned_welcome');

const turns = [{ speaker: 'app', body: welcomeText, at: '2026-10-01T00:00:00.000Z' }];
const order = welcomeBeforeFirstTurn(turns);
assert.equal(order.ok, false);
assert.equal(order.reason, 'no_customer_turn');

console.log('owner welcome on landing passed');
