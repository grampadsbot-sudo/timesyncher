#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { completeRosterParty, draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { planFactsForReply } from '../src/vacation/reply-plan-entitlement.mjs';
import { welcomeNoteText, formatWelcomeDateRange } from '../src/vacation/welcome-note-text.mjs';
import { customerChallengesPriorReply, selfCorrectionGrade } from '../src/vacation/reply-self-correction-grade.mjs';
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
const party = completeRosterParty({
  customerName: 'Sofia Lopez',
  party: {
    primary: { name: 'Sofia Lopez', role: 'Owner' },
    collaborators: [{ name: 'Mateo Lopez', payer: 'owner' }],
    preference_subjects: [
      { name: 'Leo Lopez', age: 6 },
      { name: 'Lily Lopez', age: 9 },
    ],
    viewers: [],
    editors: [],
  },
  turns: [{ role: 'customer', text: lopezCorpus }],
});
assert.equal(party.primary?.name, 'Sofia Lopez');
assert.deepEqual(party.collaborators, []);
assert.deepEqual(party.preference_subjects, []);
const roster = draftingFacts([], lopezCorpus, { party, things: [] }).roster || '';
assert.doesNotMatch(roster, /Mateo|Lily|Leo/i);

const planFacts = planFactsForReply({ postIntake: true, purchasedPlan: 'unlimited', planOwned: true });
assert.equal(planFacts.collaborator_access?.view_access?.includes('View access'), true);
assert.equal(planFacts.collaborator_access?.edit_access?.includes('Edit access'), true);

assert.match(formatWelcomeDateRange('2027-04-05', '2027-04-09'), /April 5, 2027 to April 9, 2027/);
assert.match(
  welcomeNoteText({ customer_label: 'Sofia Lopez' }, { title: 'Orlando family vacation', startDate: '2027-04-05', endDate: '2027-04-09' }),
  /April 5, 2027 to April 9, 2027/,
);

const challenge = "You called my husband Mateo — I never said that name.";
assert.equal(customerChallengesPriorReply(challenge), true);
assert.equal(selfCorrectionGrade(challenge, "You're right — I shouldn't have used Mateo. You said your husband, and your two kids who are six and nine.", { priorSnippet: 'Mateo' }).pass, true);
assert.equal(selfCorrectionGrade(challenge, 'Pop Century is a great mid-range option near the parks.', { priorSnippet: 'Mateo' }).pass, false);

console.log('test_issue_1200_no_injectors_context: ok');