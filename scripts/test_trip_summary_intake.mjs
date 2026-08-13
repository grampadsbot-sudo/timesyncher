import assert from 'node:assert/strict';

import { buildTripSummary } from './product-gbrain-dispatch.mjs';

delete process.env.TIMESYNCHER_XAI_API_KEY;
delete process.env.XAI_API_KEY;

const richSummary = await buildTripSummary({
  requestText: 'Our Hawaiian Getaway is seven nights in Hawaii with my wife on a moderate budget. We start in Oahu and Waikiki, then Maui and Kona. We want beach energy, great local food, a surf lesson, a sunset sail, manta rays, and a relaxed but special anniversary feel.',
  destination: 'Hawaii: Oahu, Maui, and Kona',
  dates: { startDate: '', endDate: '', dateText: 'seven nights' },
  vacationName: 'Our Hawaiian Getaway',
  unforgettableGoal: 'a relaxed but special anniversary feel with beach energy, food, surf, sunset, and manta rays',
});

assert.equal(richSummary.provider, 'deterministic_summary');
assert.match(richSummary.paragraph, /Our Hawaiian Getaway/);
assert.match(richSummary.paragraph, /Hawaii/i);
assert.match(richSummary.paragraph, /anniversary/i);
assert.equal(richSummary.status, 'draft_ready');
assert.deepEqual(richSummary.followUpQuestions, []);

const thinSummary = await buildTripSummary({
  requestText: 'Plan a vacation.',
  destination: '',
  dates: { startDate: '', endDate: '', dateText: '' },
  vacationName: '',
  unforgettableGoal: '',
});

assert.equal(thinSummary.status, 'needs_followup');
assert(thinSummary.missing.includes('destination or cities'));
assert(thinSummary.missing.includes('dates or trip length'));
assert(thinSummary.followUpQuestions.length >= 3);

console.log('trip summary intake regression passed');
