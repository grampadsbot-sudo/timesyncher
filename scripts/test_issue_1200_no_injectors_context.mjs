#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { completeRosterParty, draftingFacts, liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { planFactsForReply } from '../src/vacation/reply-plan-entitlement.mjs';
import { customerChallengesPriorReply } from '../src/vacation/reply-self-correction-grade.mjs';
import { DEFAULT_JEV_DECISIONS_URL, jevQualityRewrite, replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { customerAskFromEnv, personaSeed, speakCustomer } from './harness/customer-live.mjs';
import { provisionThrowaway } from './harness/live-provision.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';
import { listNotes } from '../src/vacation/vk-admin-review-storage.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';

const shipSource = fs.readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(shipSource, /ensurePostIntakeCollabCopy/);
assert.doesNotMatch(fs.readFileSync(new URL('../src/vacation/reply-customer-wording.mjs', import.meta.url), 'utf8'), /stripCannedHelpDeskOpener/);
assert.equal(fs.existsSync(new URL('../src/vacation/customer-reply-ship-checks.mjs', import.meta.url)), false);
assert.equal(fs.existsSync(new URL('../src/vacation/reply-canned-opener.mjs', import.meta.url)), false);

const modelDraft = "Thanks Sofia — Orlando from April 5 through April 9 looks great. Where are you planning to stay?";
const shipped = finalizeCustomerReplyText(modelDraft);
assert.equal(shipped, modelDraft);

const lopezCorpus = [
  "Hello! I'm Sofia Lopez, and my husband and I are putting together an Orlando theme park getaway for our family from April 5 to April 9, 2027. We're bringing our two kids, who are six and nine.",
].join('\n');
const fixtureParty = {
  primary: { name: 'Sofia Lopez', role: 'Owner' },
  collaborators: [{ name: 'Mateo Lopez', payer: 'owner' }],
  preference_subjects: [{ name: 'Leo Lopez', age: 6 }, { name: 'Lily Lopez', age: 9 }],
  viewers: [],
  editors: [],
};
const assumed = 'I have Mateo Lopez, Leo Lopez (six), and Lily Lopez (nine) coming.';
const challenge = 'I didn’t tell you who’s coming. How do you know Mateo Lopez?';
const party = completeRosterParty({
  transcriptOnly: true,
  party: fixtureParty,
  roster: [{ name: 'Mateo Lopez', role: 'owner' }, { name: 'Lily Lopez', role: 'child', age: 9 }],
  turns: [{ role: 'customer', text: lopezCorpus }, { role: 'app', text: assumed }, { role: 'customer', text: challenge }],
});
assert.equal(party.primary?.name, 'Sofia Lopez');
assert.deepEqual(party.collaborators, []);
assert.deepEqual(party.preference_subjects, []);
const roster = draftingFacts([], lopezCorpus, { party, things: [] }).roster || '';
assert.doesNotMatch(roster, /Mateo|Lily|Leo|payer/i);

const planFacts = planFactsForReply({ postIntake: true, purchasedPlan: 'unlimited', planOwned: true });
assert.equal(planFacts.collaborator_access?.view_access?.includes('View access'), true);
assert.equal(planFacts.collaborator_access?.edit_access?.includes('Edit access'), true);

const noDisclosure = completeRosterParty({ transcriptOnly: true, party: fixtureParty, turns: [] });
assert.equal(noDisclosure.primary, null);
const later = completeRosterParty({
  transcriptOnly: true, party: fixtureParty,
  turns: [{ role: 'customer', text: 'My husband is Mateo Lopez. My son Leo Lopez is six. Lily Lopez is my daughter. We have dinner at nine.' }],
});
assert.deepEqual(later.collaborators, [{ name: 'Mateo Lopez' }]);
assert.deepEqual(later.preference_subjects, [{ name: 'Leo Lopez', age: 6 }, { name: 'Lily Lopez' }]);

for (const postIntake of [true, false]) {
  const prompt = replyRulesSystem({}, 'Orlando', 'forbidden', postIntake, lopezCorpus, { tripContext: { roster } });
  assert.ok(prompt.includes('can save itinerary placements'));
  assert.ok(prompt.includes('can invite collaborators in chat by name and email'));
  assert.doesNotMatch(prompt, /Mateo|Lily|Leo/);
}

const story = {
  story_id: 'lopez-test', customer: { name: 'Sofia Lopez', email_alias: 'lopez-test' },
  destination: 'Orlando', dates: { start: '2027-04-05', end: '2027-04-09' },
  party: { ...fixtureParty, kids: fixtureParty.preference_subjects },
  turns: [{ text: 'Ask about itinerary plans for Mateo, Leo, and Lily.' }],
};
const tripWrites = [];
const db = async (strings, ...values) => {
  const statement = strings.join('?').trim();
  if (statement.startsWith('insert into trips')) tripWrites.push({ statement, values });
  if (statement.startsWith('insert into')) return [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }];
  if (statement.startsWith('update trips')) return [{ public_slug: values[2] }];
  return [];
};
await provisionThrowaway(db, story, { tag: 'harness:test:lopez', runId: 'test', env: { TIMESYNCHER_TRAVEL_BASE_URL: 'https://example.test' } });
assert.equal(tripWrites.length, 1);
assert.doesNotMatch(JSON.stringify(tripWrites[0]), /dialogParty|Mateo|Lily|Leo|\bparty\b/);

const notes = await listNotes({
  listJson: async () => [
    { kind: 'welcome', id: 'welcome', at: '2026-11-25', text: 'Old welcome stub', attachments: [] },
    { id: 'note', at: '2026-11-26', text: 'Admin note', attachments: [] },
  ],
}, 'customer', 'vacation', []);
assert.deepEqual(notes.map((note) => note.text), ['Admin note']);

const requests = [];
const ask = customerAskFromEnv({ HARNESS_CUSTOMER_MODEL_URL: 'http://127.0.0.1:1' }, [], async (_url, { body }) => {
  requests.push(JSON.parse(body));
  return Response.json({ text: challenge });
});
const persona = personaSeed(story);
const response = await speakCustomer({
  persona, index: 1, ask, appReply: assumed,
  transcript: [{ role: 'customer', text: lopezCorpus }, { role: 'app', text: assumed }],
  env: { VK_TEST_NO_ODD: '1' },
});
assert.equal(response.text, challenge);
assert.equal(customerChallengesPriorReply(response.text), true);
const [request] = requests;
assert.deepEqual(request.disclosure.customerTurns, [lopezCorpus]);
assert.match(request.disclosure.instructions, /in your own words/);
assert.match(request.persona?.party?.collaborators?.[0]?.name, /Mateo/);
assert.doesNotMatch(JSON.stringify({ goal: request.goal, disclosure: request.disclosure }), /Mateo|Lily|Leo/);

const priorExchange = { appReply: assumed, customerTurns: [lopezCorpus] };
let decision = 'uncorrected';
const decisions = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (_url, { body }) => {
  decisions.push(JSON.parse(body));
  return Response.json({
    answers: { overall_quality: { score: 3 }, disposition: { choice: 'keep' }, self_correction: { choice: decision } },
  });
};
try {
  const grade = (draft) => jevQualityRewrite({
    customerTurn: response.text, draft, tripContext: { roster, priorExchange },
    env: { OPENROUTER_API_KEY: 'fixture-only', TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL },
  });
  const failed = await grade('I still have Mateo Lopez coming.');
  assert.equal(failed.selfCorrection, 'uncorrected');
  assert.equal(failed.wantsRewrite, true);
  decision = 'corrected';
  const draft = 'I guessed those names. You told me you’re bringing your husband and two kids, ages six and nine.';
  const corrected = await grade(draft);
  assert.equal(corrected.selfCorrection, 'corrected');
  assert.equal(corrected.wantsRewrite, false);
  const turn = liveTurnRecord({ role: 'app', turnIndex: 4, text: draft, model: { quality: corrected } });
  assert.equal(confirmStoredTurns({ turns: [turn] }).rows[0].self_correction, 'corrected');
  assert.equal(decisions[0].state.previous_app_reply, assumed);
  assert.deepEqual(decisions[0].state.previous_customer_turns, [lopezCorpus]);
  assert.ok(decisions[0].questions.self_correction.criteria.uncorrected);
} finally {
  globalThis.fetch = realFetch;
}

console.log('test_issue_1200_no_injectors_context: ok');
