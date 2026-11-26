#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST_INTAKE_COLLAB_COPY } from '../src/vacation/live-app-turn.mjs';
import { ensurePostIntakeCollabCopy, postIntakeCollabCopyMissing } from '../src/vacation/post-intake-collab-copy.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';

const renderer = readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /post_intake_itinerary_collab_upsell/);
assert.match(renderer, /build\(\?:ing\)\? \(\?:the\|your\) itinerary/);

const ship = readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(ship, /ensurePostIntakeCollabCopy/, 'first-intake replies must ship as the model wrote them');

const hilo = 'Hilo from March 4 to March 8 can stay light. Where are you staying?';
assert.equal(ensurePostIntakeCollabCopy(hilo), hilo, 'injector is a no-op unless customer asked access/plan');
assert.equal(postIntakeCollabCopyMissing(hilo), true);

const asked = ensurePostIntakeCollabCopy(hilo, 'How does edit access work for my family?');
assert.equal(asked.endsWith(POST_INTAKE_COLLAB_COPY), true);
assert.equal(postIntakeCollabCopyMissing(asked), false);

const banned = ensurePostIntakeCollabCopy(`${hilo} You also have unlimited time.`, 'Tell me about household plan pricing.');
assert.equal(/you also have unlimited/i.test(banned), false);
assert.match(banned, /build(?:ing)? (?:the|your) itinerary/i);

assert.deepEqual(finalizeCustomerReplyText(hilo), hilo);

console.log('test_acceptance_1041_intake_copy: ok');