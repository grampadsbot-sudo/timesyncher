#!/usr/bin/env node
import assert from 'node:assert/strict';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { applySavedJobDatesToReplyFacts } from '../src/vacation/reply-trip-context-facts.mjs';

const base = draftingFacts([], 'Can we add a luau?', {
  things: [{ title: 'Luau' }],
  span: null,
  start: '',
  end: '',
});

assert.equal(base.start, undefined);
assert.equal(base.end, undefined);

const withDates = applySavedJobDatesToReplyFacts(base, {
  savedStart: '2032-06-10',
  savedEnd: '2032-06-17',
});

assert.equal(withDates.start, '2032-06-10');
assert.equal(withDates.end, '2032-06-17');
assert.equal(withDates.when, '2032-06-10 to 2032-06-17');
assert.match(String(withDates.dates || ''), /2032-06-10/);
assert.match(String(withDates.dates || ''), /2032-06-17/);

console.log('test_reply_facts_saved_dates: ok');
