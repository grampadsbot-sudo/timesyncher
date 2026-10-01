import assert from 'node:assert/strict';

delete process.env.TIMESYNCHER_XAI_API_KEY;
delete process.env.XAI_API_KEY;
delete process.env.DATABASE_URL;
delete process.env.NEON_DATABASE_URL;
delete process.env.TIMESYNCHER_GBRAIN_HTTP_BASE;
delete process.env.TIMESYNCHER_GBRAIN_GET_PAGE_URL;
delete process.env.OPENROUTER_API_KEY;

const networkCalls = [];
globalThis.fetch = async (url) => {
  networkCalls.push(String(url));
  throw new Error(`offline test refused a network call to ${url}`);
};

const { INITIAL_BUILD_CUE } = await import('../src/vacation/tg-intake-gbrain.mjs');
const {
  hasTripPlanningDetails,
  missingSummaryQuestions,
  parseVacationIdentity,
  vacationIdentityAck,
} = await import('../routes/vacation-telegram-turn.mjs');

const richText = [
  'I will call it Coastal Weekend and what would make it unforgettable is a relaxed anniversary with local food and beach time.',
  'We are going to the coast for seven nights with my wife on a moderate budget.',
  'Details live at https://example.test/trip.',
].join(' ');

const parsed = parseVacationIdentity(richText);
assert.equal(parsed.vacationName, 'Coastal Weekend');
assert.match(parsed.unforgettableGoal, /anniversary/i);
const richExtraction = { ok: true, destination: 'the coast', hasDates: true };
assert.equal(hasTripPlanningDetails(richText, richExtraction), true);
assert.deepEqual(missingSummaryQuestions(richText, richExtraction), []);

const ack = vacationIdentityAck({
  vacationName: parsed.vacationName,
  text: richText,
  queued: { id: 'req_example' },
  extraction: richExtraction,
});
assert.equal(ack.ask, 'identity_ack');
assert.equal(ack.vacationName, 'Coastal Weekend');
assert.match(ack.customerText, /seven nights/i);
assert.equal(ack.buildCue, INITIAL_BUILD_CUE);
assert.equal(ack.destination, 'the coast');
assert.equal(ack.hasDates, true);

const thinText = 'Plan a vacation.';
assert.equal(hasTripPlanningDetails(thinText), false);
const missing = missingSummaryQuestions(thinText);
assert.equal(missing.includes('where you want to go'), true);
assert.equal(missing.includes('rough dates or trip length'), true);
assert.equal(missing.length >= 3, true);
assert.deepEqual(networkCalls, []);

console.log('trip summary intake regression passed');
