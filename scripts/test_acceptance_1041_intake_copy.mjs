#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensurePostIntakeCollabCopy, postIntakeCollabCopyMissing } from '../src/vacation/post-intake-collab-copy.mjs';

const renderer = readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /post_intake_itinerary_collab_upsell/);
assert.match(renderer, /build\(\?:ing\)\? \(\?:the\|your\) itinerary/);
const ship = readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.match(ship, /firstIntake && produced\?\.reply\) produced\.reply = ensurePostIntakeCollabCopy/);

function intakeOk(text) {
  return /build(?:ing)? (?:the|your) itinerary/i.test(text)
    && !/you also have unlimited/i.test(text)
    && /\bview access\b/i.test(text)
    && /\bedit access\b/i.test(text)
    && /email invite/i.test(text)
    && /unlimited vacations for the whole year/i.test(text);
}

const hilo = 'Hilo from March 4 to March 8 can stay light. Where are you staying?';
const stamped = ensurePostIntakeCollabCopy(hilo);
assert.equal(intakeOk(stamped), true);
assert.equal(postIntakeCollabCopyMissing(stamped), false);
assert.equal(ensurePostIntakeCollabCopy(stamped), stamped);
assert.equal(stamped.startsWith(hilo), true);
const banned = ensurePostIntakeCollabCopy(`${hilo} You also have unlimited time.`);
assert.equal(/you also have unlimited/i.test(banned), false);
assert.equal(intakeOk(banned), true);

console.log('test_acceptance_1041_intake_copy: ok');
