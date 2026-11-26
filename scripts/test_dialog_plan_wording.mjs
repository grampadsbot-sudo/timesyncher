#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDialogPack, loadBarTerms } from './dialog-bars.mjs';
import { POST_INTAKE_COLLAB_COPY } from '../src/vacation/live-app-turn.mjs';
import { ensurePostIntakeCollabCopy, postIntakeCollabCopyMissing } from '../src/vacation/post-intake-collab-copy.mjs';
import { HOUSEHOLD_PLAN_YEAR_LINE, HOUSEHOLD_PLAN_YEAR_PATTERN } from '../src/vacation/household-plan-year-copy.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';

const terms = loadBarTerms();
const OLD_SENTENCE = 'The household plan is unlimited vacations for the whole year.';

function hitsFor(text) {
  return checkDialogPack([
    { n: 1, speaker: 'Sofia Lopez', speaker_id: 'guest', channel: 'customer', text: 'Voice note dump for Orlando parks, April 5 through 9.' },
    { n: 2, speaker: 'app', speaker_id: 'app', channel: 'app', text, in_reply_to: 1 },
  ], terms).hits;
}

const oldHits = hitsFor(OLD_SENTENCE);
assert.equal(oldHits.some((hit) => hit.bar === 'BAR-UNLIMITED-WORDING'), true, 'old plan sentence must still fail BAR-UNLIMITED-WORDING');
assert.equal(hitsFor(`Welcome them onto this vacation as collaborators. ${OLD_SENTENCE}`).some((hit) => hit.bar === 'BAR-UNLIMITED-WORDING'), true);

assert.equal(HOUSEHOLD_PLAN_YEAR_LINE, "The household plan covers the family's vacations for the whole year.");
assert.match(HOUSEHOLD_PLAN_YEAR_LINE, HOUSEHOLD_PLAN_YEAR_PATTERN);
assert.deepEqual(hitsFor(HOUSEHOLD_PLAN_YEAR_LINE), []);
assert.equal(POST_INTAKE_COLLAB_COPY.endsWith(HOUSEHOLD_PLAN_YEAR_LINE), true);
assert.doesNotMatch(POST_INTAKE_COLLAB_COPY, /\bunlimited\b|\bmultiple\b|\bseveral\b|\ball vacations\b/i);
assert.deepEqual(hitsFor(POST_INTAKE_COLLAB_COPY), []);

const draft = "Hi Sofia, I'm building your Orlando theme parks vacation now. You're going from Monday, April 5 to Friday, April 9, 2027, which is four nights. Where are you planning to stay in Orlando?";
assert.equal(postIntakeCollabCopyMissing(draft), true);
assert.equal(ensurePostIntakeCollabCopy(draft), draft, 'unasked intake must not append collab/plan copy');
assert.deepEqual(hitsFor(draft), []);
const askedIntake = ensurePostIntakeCollabCopy(draft, 'What is edit access vs view access for collaborators?');
assert.equal(askedIntake.endsWith(POST_INTAKE_COLLAB_COPY), true);
assert.equal(postIntakeCollabCopyMissing(askedIntake), false);
assert.deepEqual(hitsFor(askedIntake), []);

const echoed = ensurePostIntakeCollabCopy(`${draft} I am building the itinerary from what you told me. View access lets family and friends see the days. Edit access lets them add notes after you approve an email invite. Welcome them onto this vacation as collaborators. ${OLD_SENTENCE}`);
assert.equal(echoed.includes(OLD_SENTENCE), false);
assert.equal(echoed.split(HOUSEHOLD_PLAN_YEAR_LINE).length, 2, 'old sentence is upgraded, not duplicated');
assert.deepEqual(hitsFor(echoed), []);
assert.deepEqual(hitsFor(finalizeCustomerReplyText(`Thursday is a town walk. Welcome the family with unlimited vacations for the whole year.`)), []);

const readers = [
  'src/vacation/live-app-turn.mjs',
  'src/vacation/post-intake-collab-copy.mjs',
  'scripts/live-transcript-dialog-pdf.mjs',
];
for (const file of readers) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /unlimited vacations for the whole year/i, file);
}

console.log('test_dialog_plan_wording: ok');
