#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDialogPack, loadBarTerms } from './dialog-bars.mjs';
import { POST_INTAKE_COLLAB_COPY } from '../src/vacation/live-app-turn.mjs';
import { ensurePostIntakeCollabCopy } from '../src/vacation/post-intake-collab-copy.mjs';
import { HOUSEHOLD_PLAN_YEAR_LINE } from '../src/vacation/household-plan-year-copy.mjs';

const terms = loadBarTerms();
const oldSentence = 'The household plan is unlimited vacations for the whole year.';
const oldPack = [
  { n: 1, speaker: 'guest', speaker_id: 'guest', channel: 'customer', text: 'We are planning Orlando.' },
  { n: 2, speaker: 'app', speaker_id: 'app', channel: 'app', text: oldSentence },
];
assert.equal(checkDialogPack(oldPack, terms).ok, false, 'old plan sentence must still fail BAR-UNLIMITED-WORDING');

assert.doesNotMatch(POST_INTAKE_COLLAB_COPY, /\bunlimited\b/i);
assert.match(POST_INTAKE_COLLAB_COPY, new RegExp(HOUSEHOLD_PLAN_YEAR_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const intakeBody = ensurePostIntakeCollabCopy('Thanks for the details. Where are you staying in Orlando?');
const intakePack = [
  { n: 1, speaker: 'guest', speaker_id: 'guest', channel: 'customer', text: 'Voice note dump for Orlando parks.' },
  { n: 2, speaker: 'app', speaker_id: 'app', channel: 'app', text: intakeBody },
];
const intakeChecked = checkDialogPack(intakePack, terms);
assert.equal(intakeChecked.ok, true, JSON.stringify(intakeChecked.hits));

const rules = readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(rules, /\bafter checkout\b/i);

console.log('test_dialog_plan_wording: ok');