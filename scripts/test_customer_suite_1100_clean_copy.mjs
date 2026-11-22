#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyViolations } from './customer_suite/harness.mjs';
import {
  ensurePostIntakeCollabCopy,
  replaceTripWithVacation,
} from '../src/vacation/post-intake-collab-copy.mjs';
import { intakeReplyBlockReasons } from '../src/vacation/first-intake-gate.mjs';
import { noTripReplyBlock } from '../src/vacation/no-trip-starter-reply.mjs';

// 1. replaceTripWithVacation basic assertions
assert.equal(replaceTripWithVacation(''), '');
assert.equal(replaceTripWithVacation(null), null);
assert.equal(
  replaceTripWithVacation("You're planning a trip to Monterey, California, from July 3 to July 5, 2026, for Avery Hale and Morgan Reed. Where are you staying?"),
  "You're planning a vacation to Monterey, California, from July 3 to July 5, 2026, for Avery Hale and Morgan Reed. Where are you staying?",
);
assert.equal(
  replaceTripWithVacation('All your trips in one place. Start a new Trip today with multiple Trips.'),
  'All your vacations in one place. Start a new Vacation today with multiple Vacations.',
);

// 2. ensure words like strip or triple are untouched
assert.equal(replaceTripWithVacation('strip of land, triple room, stripe shirt'), 'strip of land, triple room, stripe shirt');

// 3. copyViolations verification
const rawAiReply = "Hi Avery, I'm getting your Monterey Summer Escape itinerary started. You're planning a trip to Monterey, California, from July 3 to July 5, 2026, for Avery Hale and Morgan Reed. Where are you staying?";
const dirtyHits = copyViolations(rawAiReply, { requireVacation: false, forbidTrip: true });
assert.ok(dirtyHits.includes('banned-copy:trip'));

const cleanedAiReply = replaceTripWithVacation(rawAiReply);
const cleanHits = copyViolations(cleanedAiReply, { requireVacation: true, forbidTrip: true });
assert.deepEqual(cleanHits, []);

// 4. first intake gate blocks "trip"
const intakeBlocked = intakeReplyBlockReasons('I can help plan your trip to Monterey. Where are you staying?');
assert.ok(intakeBlocked.includes('first_intake_trip_word'));

const intakeClean = intakeReplyBlockReasons('I can help plan your vacation to Monterey. Where are you staying?');
assert.equal(intakeClean.includes('first_intake_trip_word'), false);

// 5. no-trip starter blocks "trip"
const noTripBlocked = noTripReplyBlock('Tell me about your trip: where and when?');
assert.equal(noTripBlocked, 'no_trip_reply_trip_word');

// 6. ensurePostIntakeCollabCopy replaces trip
const postIntakeWithTrip = ensurePostIntakeCollabCopy('We are getting your Monterey trip started. Where are you staying?');
assert.equal(/\btrip\b/i.test(postIntakeWithTrip), false);
assert.ok(/\bvacation\b/i.test(postIntakeWithTrip));

// 7. vacation-app.html has no "Switch trip"
const html = readFileSync(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.equal(html.includes('aria-label="Switch trip"'), false);
assert.ok(html.includes('aria-label="Switch vacation"'));

console.log('test_customer_suite_1100_clean_copy: ok');
