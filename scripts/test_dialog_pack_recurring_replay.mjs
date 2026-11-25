#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDialogPack, loadBarTerms } from './dialog-bars.mjs';
import { ensurePostIntakeCollabCopy } from '../src/vacation/post-intake-collab-copy.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/dialog-wording-replay/recurring-turns.redacted.json', import.meta.url), 'utf8'),
);
const terms = loadBarTerms();

function shipRecordedReply({ firstIntake, modelReply }) {
  let reply = finalizeCustomerReplyText(modelReply);
  if (firstIntake) reply = ensurePostIntakeCollabCopy(reply);
  else reply = finalizeCustomerReplyText(reply);
  return reply;
}

const pack = [];
let turn = 1;
for (const fixture of fixtures) {
  pack.push({
    n: turn,
    speaker: 'guest',
    speaker_id: 'guest',
    channel: 'customer',
    text: fixture.customerTurn,
  });
  turn += 1;
  const shipped = shipRecordedReply(fixture);
  assert.doesNotMatch(shipped, /\bunlimited\b[^\n]{0,40}\bvacations?\b/i, fixture.id);
  assert.doesNotMatch(shipped, /\bcheckout\b/i, fixture.id);
  pack.push({
    n: turn,
    speaker: 'app',
    speaker_id: 'app',
    channel: 'app',
    text: shipped,
  });
  turn += 1;
}

const checked = checkDialogPack(pack, terms);
assert.equal(checked.ok, true, JSON.stringify(checked.hits, null, 2));

console.log('test_dialog_pack_recurring_replay: ok');