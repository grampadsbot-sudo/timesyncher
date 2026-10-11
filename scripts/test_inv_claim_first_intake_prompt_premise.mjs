#!/usr/bin/env node
/**
 * INV-CLAIM (a) at 3dbfda7, staging 68c0020.
 * First intake reply after "Maui March 10-17 2027 with my wife".
 * Travelers: roster collaborator "my wife", no contact. Zero things. No lodging.
 *
 * Rebuilds the system and user messages produceLiveAppReply sends on that
 * first-intake path (intakeReplyTurn: systemExtra is the intake instruction
 * plus intake facts; the user message is those same facts). replyRulesSystem,
 * replyRequestBody, the bundled reply-rules page, and content/onboarding-welcome.json
 * are not on this path. This test fails if any of them leak into the messages.
 *
 * The only open ask in the messages is lodging. Nothing may mention inviting,
 * sharing, adding a collaborator, or a next-step ask.
 */
import assert from 'node:assert/strict';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { testPlanEnv, testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';

const customerTurn = 'Maui March 10-17 2027 with my wife';
const roster = [{ name: 'my wife', role: 'collaborator' }];

function jevOk() {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
    }),
  };
}

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (target.includes('/api/alpha/decisions')) return jevOk();
  if (target.includes('/chat/completions')) {
    calls.push(body);
    return {
      ok: true,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: 'Where are you staying?' } }],
      }),
    };
  }
  throw new Error(`unexpected ${target}`);
};

let produced;
try {
  produced = await produceLiveAppReply({
    customerTurn,
    intake: true,
    priorTurns: [],
    session: { first_name: 'Inv', display_name: 'Inv Claim', trip_id: 'trip-inv-claim', token: 'sess' },
    tripTitle: customerTurn,
    wantedThings: [],
    roster,
    extractedDestination: 'Maui',
    savedStart: '2027-03-10',
    savedEnd: '2027-03-17',
    env: { OPENROUTER_API_KEY: 'test-key', ...testPlanEnv },
    loadOwnerPlan: async () => testSingleOwnerPlan,
  });
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(produced.reason, null);
assert.equal(calls.length, 1);
const messages = calls[0].messages;
const system = messages.find((message) => message.role === 'system')?.content || '';
const user = messages.find((message) => message.role === 'user')?.content || '';
const stored = `${system}\n${user}`;
const facts = JSON.parse(user);

const violations = [];
function hit(name, pattern) {
  if (pattern.test(stored)) violations.push(name);
}

hit('inviting', /\binvite/i);
hit('sharing', /\bshares?\b|\bsharing\b/i);
hit('adding a collaborator', /\badd(?:ing|ed)?\b[^\n.]{0,48}\bcollaborator/i);
hit('offer to add', /\boffer to add\b/i);
hit('will add them', /\b(?:will add|added|adding) them\b/i);
hit('next-step ask', /\b(?:what they still left undecided|what happens next|next step|move on to)\b/i);
hit('planned activities', /\bplanned activities\b/i);
hit('invite_contact field', /invite_contact/);
hit('plans gap', /"plans"/);
hit('reply rules pack', /Item34 ban|shared-reply-smoke|Write at least four sentences/);
hit('onboarding welcome pack', /hold the mic button|You're all set/);

if (!/ask where they are staying/i.test(system)) violations.push('missing lodging ask');
if (facts.lodgingAsk !== true) violations.push(`lodgingAsk=${String(facts.lodgingAsk)}`);
if (JSON.stringify(facts.needsCustomerInput) !== '["lodging"]') {
  violations.push(`needsCustomerInput=${JSON.stringify(facts.needsCustomerInput)}`);
}
if (JSON.stringify(facts.gaps) !== '["lodging"]') violations.push(`gaps=${JSON.stringify(facts.gaps)}`);
if (facts.who?.join(',') !== 'my wife') violations.push(`who=${JSON.stringify(facts.who)}`);
if (!Array.isArray(facts.things) && facts.lodging) violations.push(`lodging fact=${JSON.stringify(facts.lodging)}`);
if (Array.isArray(facts.activities) && facts.activities.length) violations.push('activities present');
const factStart = system.indexOf('Intake facts: ');
const systemFacts = factStart >= 0 ? JSON.parse(system.slice(factStart + 'Intake facts: '.length)) : null;
if (JSON.stringify(systemFacts) !== JSON.stringify(facts)) violations.push('system facts differ from user facts');

if (violations.length) {
  console.error(JSON.stringify({ violations, system, user }, null, 2));
}
assert.deepEqual(violations, []);
console.log('test_inv_claim_first_intake_prompt_premise: ok');
