import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyTripIntake, mergeWantedThings, thingsFromIntake, tripIntakeJobFields } from '../src/vacation/trip-intake-classify.mjs';

const turnSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const classifySource = fs.readFileSync(new URL('../src/vacation/trip-intake-classify.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(turnSource, /function isLongIntake|function intakeFacts|add\('Gardens'|add\('Kailua-Kona house'/);
assert.doesNotMatch(`${turnSource}\n${routeSource}\n${classifySource}`, /\b(?:isLongIntake|intakeFacts|postIntakeUpsellTurn|ensureNamedThings)\b/);
assert.match(routeSource, /thingsFromIntake/);
assert.match(routeSource, /wantedThings/);
assert.match(routeSource, /intakeEvent/);

assert.deepEqual(thingsFromIntake('gardens swim groceries dinner town walk house'), []);
assert.deepEqual(mergeWantedThings([{ title: 'Existing', category: 'activity' }], 'swim').map((thing) => thing.title), ['Existing']);

const extracted = thingsFromIntake([
  { name: 'museum morning', kind: 'activity', who: 'Ana', when: 'Tuesday' },
  { name: 'museum morning', kind: 'activity', who: 'Ana', when: 'Tuesday' },
  { name: 'long dinner', kind: 'restaurant', who: '', when: '' },
  { name: '', kind: 'activity' },
]);
assert.deepEqual(extracted.map((thing) => thing.title), ['museum morning', 'long dinner']);
assert.equal(extracted[0].who, 'Ana');
assert.equal(extracted[0].whenLabel, 'Tuesday');
assert.equal(extracted[0].source, 'chat_extraction');
assert.equal(extracted[1].category, 'restaurant');
const merged = mergeWantedThings([{ title: 'museum morning', category: 'activity' }], extracted);
assert.deepEqual(merged.map((thing) => thing.title), ['museum morning', 'long dinner']);

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function mockFetch({ score, things, failOn, chatText }) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (failOn && String(url).includes(failOn)) {
      return jsonResponse({ error: { message: 'classifier down' } }, false, 503);
    }
    if (String(url).includes('/decisions')) {
      return jsonResponse({ answers: { trip_intake: { noul: score } } });
    }
    return jsonResponse({
      choices: [{ message: { content: chatText || JSON.stringify({ things }) } }],
    });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const env = { OPENROUTER_API_KEY: 'test-key' };
const lisbon = 'We want a week in Lisbon. Ana wants a museum morning and a long dinner.';
const intakeFetch = mockFetch({
  score: 0.91,
  things: [
    { name: 'museum morning', kind: 'activity', who: 'Ana', when: '' },
    { name: 'long dinner', kind: 'restaurant', who: '', when: 'the last night' },
  ],
});
const intake = await classifyTripIntake({ text: lisbon, env, fetchImpl: intakeFetch });
assert.equal(intake.ok, true);
assert.equal(intake.intake, true);
assert.deepEqual(intake.things.map((thing) => thing.name), ['museum morning', 'long dinner']);
assert.equal(intake.things[0].who, 'Ana');
assert.equal(intake.things[1].when, 'the last night');
assert.equal(intake.error, null);
assert.equal(intakeFetch.calls.length, 2);

const followUp = await classifyTripIntake({
  text: 'What time is the museum?',
  env,
  fetchImpl: mockFetch({
    score: 0.12,
    things: [{ name: 'museum morning', kind: 'activity', who: '', when: '' }],
  }),
});
assert.equal(followUp.ok, true);
assert.equal(followUp.intake, false);
assert.equal(followUp.things.length, 1);

const fields = tripIntakeJobFields({
  requestText: lisbon,
  receivedAt: '2026-09-27T12:00:00.000Z',
  classification: intake,
  firstIntake: true,
  jobKind: 'trip_intake',
});
assert.equal(fields.intakeEvent.kind, 'trip_intake');
assert.equal(fields.intakeEvent.firstIntake, true);
assert.equal(fields.intakeEvent.requestText, lisbon);
assert.deepEqual(fields.wantedThings, intake.things);
assert.equal(fields.intakeError, null);

const notFirst = tripIntakeJobFields({
  requestText: 'What time is the museum?',
  receivedAt: '2026-09-27T12:05:00.000Z',
  classification: followUp,
  firstIntake: false,
  jobKind: 'trip_intake',
});
assert.equal(notFirst.intakeEvent, null);
assert.equal(notFirst.wantedThings.length, 1);
assert.equal(notFirst.intakeError, null);

const failed = await classifyTripIntake({
  text: lisbon,
  env,
  fetchImpl: mockFetch({ score: 0.9, things: [], failOn: '/decisions' }),
});
assert.equal(failed.ok, false);
assert.equal(failed.intake, false);
assert.deepEqual(failed.things, []);
assert.match(failed.error, /classifier down/);
const failedFields = tripIntakeJobFields({
  requestText: lisbon,
  receivedAt: '2026-09-27T12:00:00.000Z',
  classification: failed,
  firstIntake: false,
  jobKind: 'trip_intake',
});
assert.equal(failedFields.intakeEvent, null);
assert.deepEqual(failedFields.wantedThings, []);
assert.match(failedFields.intakeError, /classifier down/);

const badJson = await classifyTripIntake({
  text: lisbon,
  env,
  fetchImpl: mockFetch({ score: 0.8, chatText: 'I would add gardens, swim, and groceries.' }),
});
assert.equal(badJson.ok, false);
assert.deepEqual(badJson.things, []);
assert.match(badJson.error, /not JSON/);

const missingKey = await classifyTripIntake({
  text: lisbon,
  env: {},
  fetchImpl: () => { throw new Error('fetch should not run'); },
});
assert.equal(missingKey.ok, false);
assert.match(missingKey.error, /OpenRouter key/);
assert.deepEqual(missingKey.things, []);

const blank = await classifyTripIntake({ text: '   ', env, fetchImpl: () => { throw new Error('fetch should not run'); } });
assert.deepEqual(blank, { ok: true, intake: false, things: [], error: null });

process.stdout.write('trip intake classify tests passed\n');
