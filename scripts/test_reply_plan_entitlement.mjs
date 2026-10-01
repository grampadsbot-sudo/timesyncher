import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firstIntakeReplyFacts, firstIntakeReplyPrompt } from '../src/vacation/first-intake-reply.mjs';
import {
  ReplyIdCitationBlockedError,
  assertCustomerReplyShippable,
  failReplyIdCitation,
} from '../src/vacation/reply-id-citation.mjs';
import {
  ReplyPlanEntitlementMissingError,
  failReplyPlanEntitlement,
  loadTripOwnerReplyPlan,
  replyPlanFactsFromEntitlementRow,
} from '../src/vacation/reply-plan-entitlement.mjs';

const root = new URL('../', import.meta.url);
import { loadTestSingleOwnerPlan, testPlanEnv, testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';

const env = testPlanEnv;

const singleRow = {
  plan: 'single',
  status: 'active',
  metadata: { product: 'timesyncher_vacation_single' },
};

const singlePlan = testSingleOwnerPlan;
assert.equal(singlePlan.plan_id, 'timesyncher_vacation_single');
assert.equal(singlePlan.plan_name, 'TimeSyncher Vacation Single');
assert.equal(singlePlan.order_bump_owned, false);

const voiceNote = 'Bristol and Calvin are coming to the coast for the dates in the facts. We have a house and a swim planned. '.repeat(3);

const voiceInput = {
  customerTurn: voiceNote,
  extractedDestination: 'the coast',
  wantedThings: [
    { name: 'swim', kind: 'activity', who: 'Bristol' },
    { name: 'house on the coast', kind: 'hotel' },
  ],
  roster: [
    { name: 'Bristol', role: 'collaborator' },
    { name: 'Calvin', role: 'collaborator' },
  ],
  savedStart: '2032-09-23',
  savedEnd: '2032-09-30',
  ownerPlan: singlePlan,
  tripId: 'trip-single',
};

const facts = firstIntakeReplyFacts(voiceInput);
const prompt = firstIntakeReplyPrompt(voiceInput);
const blob = `${JSON.stringify(facts)}\n${prompt}`;

assert.equal(facts.plan.plan_id, 'timesyncher_vacation_single');
assert.equal(facts.plan.plan_name, 'TimeSyncher Vacation Single');
assert.equal(facts.plan.purchased_plan, 'single');
assert.equal(facts.plan.plan_owned, true);
assert.doesNotMatch(blob, /unlimited/i);
assert.doesNotMatch(blob, /yearly/i);
assert.doesNotMatch(prompt, /plan they already purchased/i);
assert.doesNotMatch(prompt, /Pitch the yearly/i);

assert.throws(
  () => assertCustomerReplyShippable('Thanks for the note (id: abc)', 'trip-cite'),
  (error) => error instanceof ReplyIdCitationBlockedError && error.name === 'reply_id_citation_blocked',
);

let citeLogged = '';
const priorCiteLog = console.error;
console.error = (line) => {
  citeLogged = String(line);
};
try {
  assert.throws(
    () => failReplyIdCitation('parenthetical_id_citation', 'trip-cite'),
    (error) => error instanceof ReplyIdCitationBlockedError,
  );
  assert.equal(JSON.parse(citeLogged).reason, 'parenthetical_id_citation');
  assert.equal(JSON.parse(citeLogged).tripId, 'trip-cite');
} finally {
  console.error = priorCiteLog;
}

assert.throws(
  () => firstIntakeReplyFacts({ ...voiceInput, ownerPlan: null }),
  (error) => error instanceof ReplyPlanEntitlementMissingError && error.name === 'reply_plan_entitlement_missing',
);

let logged = '';
const priorLog = console.error;
console.error = (line) => {
  logged = String(line);
};
try {
  assert.throws(
    () => failReplyPlanEntitlement('entitlement_row_missing', 'trip-missing'),
    (error) => error instanceof ReplyPlanEntitlementMissingError,
  );
  assert.equal(JSON.parse(logged).reason, 'entitlement_row_missing');
  assert.equal(JSON.parse(logged).tripId, 'trip-missing');
} finally {
  console.error = priorLog;
}

const db = async () => [{ plan: 'single', status: 'active', metadata: { product: 'timesyncher_vacation_single' } }];
const loaded = await loadTripOwnerReplyPlan({ tripId: 'trip-db', env, db });
assert.equal(loaded.plan_id, 'timesyncher_vacation_single');

const emptyDb = async () => [];
await assert.rejects(
  () => loadTripOwnerReplyPlan({ tripId: 'trip-empty', env, db: emptyDb }),
  (error) => error instanceof ReplyPlanEntitlementMissingError,
);

const replyFiles = [
  'src/vacation/first-intake-reply.mjs',
  'scripts/vacation-app-reply-rules.mjs',
  'content/plans.json',
];
for (const file of replyFiles) {
  const text = await readFile(new URL(file, root), 'utf8');
  assert.doesNotMatch(text, /unlimited/i, `${file} must not contain unlimited`);
}

console.log('reply plan entitlement passed');
