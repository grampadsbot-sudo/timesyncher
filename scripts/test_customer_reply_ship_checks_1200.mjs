#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST_INTAKE_COLLAB_COPY } from '../src/vacation/live-app-turn.mjs';
import {
  customerAskedAccessCollabOrPlan,
  customerReplyShipViolations,
  replyHasCannedHelpDeskOpener,
  stripCannedHelpDeskOpener,
} from '../src/vacation/customer-reply-ship-checks.mjs';
import { ensurePostIntakeCollabCopy, postIntakeCollabCopyMissing } from '../src/vacation/post-intake-collab-copy.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';
import { formatWelcomeDateRange, welcomeNoteText } from '../src/vacation/welcome-note-text.mjs';

const lopezIntake = 'Voice note dump for Orlando parks, April 5 through 9.';
const lopezBadReply = [
  "Hi Sofia, I'm glad you reached out.",
  "I'm building your Orlando theme parks vacation for April 5 through 9, 2027.",
  'Where are you planning to stay in Orlando?',
  POST_INTAKE_COLLAB_COPY,
].join(' ');

assert.deepEqual(customerReplyShipViolations(lopezBadReply, lopezIntake), [
  'canned_help_desk_opener',
  'unasked_post_intake_collab_plan',
]);

const draft = "Hi Sofia, I'm building your Orlando theme parks vacation now. You're going from Monday, April 5 to Friday, April 9, 2027, which is four nights. Where are you planning to stay in Orlando?";
const cleanFirstIntake = finalizeCustomerReplyText(draft);
assert.doesNotMatch(cleanFirstIntake, /glad you reached out/i);
assert.equal(ensurePostIntakeCollabCopy(cleanFirstIntake, lopezIntake), cleanFirstIntake);
assert.equal(postIntakeCollabCopyMissing(cleanFirstIntake), true);
assert.deepEqual(customerReplyShipViolations(cleanFirstIntake, lopezIntake), []);

const accessAsk = 'Can my husband get edit access and how much does that cost?';
const withCollab = ensurePostIntakeCollabCopy(draft, accessAsk);
assert.equal(postIntakeCollabCopyMissing(withCollab), false);
assert.equal(customerAskedAccessCollabOrPlan(accessAsk), true);
assert.deepEqual(customerReplyShipViolations(withCollab, accessAsk), []);

assert.equal(stripCannedHelpDeskOpener("Hi Sofia, I'm glad you reached out. Where are you staying?"), 'Where are you staying?');
assert.equal(replyHasCannedHelpDeskOpener('Where are you staying?'), false);

assert.equal(formatWelcomeDateRange('2027-04-05', '2027-04-09'), 'April 5, 2027 to April 9, 2027');
const welcome = welcomeNoteText(
  { customer_label: 'Sofia Lopez' },
  {
    title: 'Orlando Theme Parks Family Trip',
    destination: 'Orlando theme parks, FL',
    startDate: '2027-04-05',
    endDate: '2027-04-09',
  },
);
assert.match(welcome, /Welcome to Sofia Lopez's vacation\. Orlando Theme Parks Family Trip · April 5, 2027 to April 9, 2027\./);
assert.doesNotMatch(welcome, /2027-04-05|Orlando theme parks, FL/);

const ship = readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.match(ship, /ensurePostIntakeCollabCopy\(produced\.reply, requestText\)/);

console.log('test_customer_reply_ship_checks_1200: ok');