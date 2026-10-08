import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bakeoffTierModels, replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { cannedWelcomeLiveTurn } from '../src/vacation/onboarding-welcome.mjs';
import { appReplyTelemetry } from '../src/vacation/reply-telemetry.mjs';
import { completeRosterParty, draftFactErrors, liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { customerInputState } from '../src/vacation/intake-shared-trip.mjs';
import {
  markWorkerJobLiveHandled,
  outboundAppReplyForRequest,
} from '../src/vacation/reply-ship.mjs';

const tiers = bakeoffTierModels();
assert.deepEqual(Object.values(tiers), [
  'google/gemini-2.5-flash-lite',
  'qwen/qwen3-235b-a22b-2507',
  'deepseek/deepseek-v3.2',
  'qwen/qwen3-max',
]);
for (const id of Object.values(tiers)) assert.doesNotMatch(id, /gpt-.*mini/i);

const jev = { jevRan: true, modelTier: 2, jevLatencyMs: 12, jevBeforeModel: true };
const model = { called: true, responseModel: tiers[3], modelTier: 3, genLatencyMs: 480 };
const live = liveTurnRecord({
  turnIndex: 2,
  role: 'app',
  modality: 'text',
  text: 'Tuesday works for the gardens.',
  at: new Date().toISOString(),
  latencyMs: 500,
  sessionE2eMs: 900,
  jev,
  model,
});
assert.equal(live.jevLatencyMs, 12);
assert.equal(live.tier, 3);
assert.equal(live.modelId, tiers[3]);
assert.equal(live.generationMs, 480);
const telemetry = appReplyTelemetry(live);
assert.equal(telemetry.jevLatencyMs, 12);
assert.equal(telemetry.tier, 3);
assert.equal(telemetry.modelId, tiers[3]);
assert.equal(telemetry.generationMs, 480);

const welcome = cannedWelcomeLiveTurn({ text: 'Welcome, Ada!', latencyMs: 1, sessionE2eMs: 1 });
assert.equal(welcome.jevLatencyMs, null);
assert.equal(welcome.generationMs, null);
assert.deepEqual(welcome.jev, { jevRan: false, reason: 'fixed_onboarding_opener' });

const system = replyRulesSystem({}, '', 'forbidden', false, 'hello', { purchasedPlan: 'single' });
assert.match(system, /"purchased_plan":"single"/);

const party = completeRosterParty({
  roster: [
    { name: 'Sam', role: 'child' },
    { name: 'Nico', role: 'collaborator' },
  ],
});
assert.ok(party.preference_subjects.some((kid) => kid.name === 'Sam'));
assert.equal(party.collaborators.some((person) => person.name === 'Nico'), false);

let shipped = null;
const requestId = 'req-duplicate-test';
const db = async (strings, ...values) => {
  const text = String(strings.join(' '));
  if (/from transcript_turns/i.test(text) && /request_id/i.test(text)) {
    return shipped ? [{ id: 'turn-app-1', body: shipped }] : [];
  }
  if (/update worker_jobs/i.test(text)) return [];
  throw new Error(`unexpected sql: ${text}`);
};

assert.equal(await outboundAppReplyForRequest(db, requestId), null);
shipped = 'Only one reply.';
const row = await outboundAppReplyForRequest(db, requestId);
assert.equal(row.body, 'Only one reply.');
await markWorkerJobLiveHandled(db, 'job-1');

assert.deepEqual(
  customerInputState([
    { category_name: 'Hotel', name: 'Kona house' },
    { category_name: 'Car', name: 'Rental' },
    { category_name: 'Flight', name: 'United to KOA' },
  ]),
  {},
);

assert.ok(
  draftFactErrors('Sam, you, Nico are set for the week.', {}).some((line) => /formulaic roster opener/.test(line)),
);
assert.ok(
  draftFactErrors('Harbor Cafe is a 12-minute walk from the house.', {}).some((line) => /walk time is not/.test(line)),
);

const itinerary = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const replyShip = await readFile(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.match(itinerary, /persistVacationAppOutboundReply\(/);
assert.match(replyShip, /outboundAppReplyForRequest\(db, requestId\)/);
assert.match(replyShip, /logVacationAppReplyTelemetry\(appLive\)/);
assert.match(replyShip, /duplicateSuppressed: true/);
assert.match(replyShip, /markWorkerJobLiveHandled\(db, jobId\)/);

const welcomeTemplates = JSON.parse(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'));
assert.ok(welcomeTemplates.owner_no_site && welcomeTemplates.collaborator_no_site);

console.log('reply live path qa passed');
