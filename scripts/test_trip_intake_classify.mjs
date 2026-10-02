import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  classifyTripIntake,
  intakeExtractionDatesError,
  mergeWantedThings,
  resolveIntakePlace,
  thingsFromIntake,
  tripIntakeJobFields,
} from '../src/vacation/trip-intake-classify.mjs';
import { TRIP_INTAKE_PLACE_ANCHOR_CASES } from './fixtures/trip-intake-place-anchor-cases.mjs';
import {
  STAGING_HYATT_INTAKE_EXTRACTION,
  STAGING_HYATT_INTAKE_SENTENCE,
} from './fixtures/trip-intake-hyatt-staging.mjs';

const turnSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const classifySource = fs.readFileSync(new URL('../src/vacation/trip-intake-classify.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(turnSource, /function isLongIntake|function intakeFacts|add\('Gardens'|add\('Kailua-Kona house'/);
assert.doesNotMatch(`${turnSource}\n${routeSource}\n${classifySource}`, /\b(?:isLongIntake|intakeFacts|postIntakeUpsellTurn|ensureNamedThings)\b/);
assert.doesNotMatch(turnSource, /later in the week|laterFridayLabel|function whoIn|'Marcus', 'Aunt'/);
assert.match(classifySource, /"roster"/);
assert.match(classifySource, /turnKind/);
assert.match(routeSource, /thingsFromIntake/);
assert.match(routeSource, /wantedThings/);
assert.match(routeSource, /intakeEvent/);

assert.deepEqual(thingsFromIntake('gardens swim groceries dinner town walk house'), []);
assert.deepEqual(mergeWantedThings([{ title: 'Existing', category: 'activity' }], 'swim').map((thing) => thing.title), ['Existing']);

const extracted = thingsFromIntake([
  { name: 'North Market Hall', kind: 'restaurant', who: 'Ana', when: 'Tuesday' },
  { name: 'North Market Hall', kind: 'restaurant', who: 'Ana', when: 'Tuesday' },
  { name: 'mid-range options', kind: 'hotel', who: '', when: '' },
  { name: '', kind: 'activity' },
]);
assert.deepEqual(extracted.map((thing) => thing.title), ['North Market Hall']);
assert.equal(extracted[0].who, 'Ana');
assert.equal(extracted[0].whenLabel, 'Tuesday');
assert.equal(extracted[0].source, 'chat_extraction');
const merged = mergeWantedThings([{ title: 'North Market Hall', category: 'activity' }], [
  { name: 'North Market Hall', kind: 'restaurant', who: 'Ana', when: 'Tuesday' },
  { name: 'Zephyr Pavilion', kind: 'hotel', who: '', when: '' },
]);
assert.deepEqual(merged.map((thing) => thing.title), ['North Market Hall', 'Zephyr Pavilion']);

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function mockFetch({ score, things, roster = [], destination = '', hasDates = false, startDate = '2032-09-23', endDate = '2032-09-30', title = '', failOn, chatText }) {
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
      choices: [{
        message: {
          content: chatText || JSON.stringify({
            turnKind: score >= 0.5 ? 'trip_intake' : 'other',
            target: '',
            anchor: '',
            anchorIsLodging: false,
            question: '',
            things,
            roster,
            destination,
            hasDates,
            startDate: hasDates ? startDate : '',
            endDate: hasDates ? endDate : '',
            title,
          }),
        },
      }],
    });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const env = { OPENROUTER_API_KEY: 'test-key' };
const lisbon = 'We want a week in Lisbon. Ana wants North Market Hall and Zephyr Pavilion.';
const intakeFetch = mockFetch({
  score: 0.91,
  things: [
    { name: 'North Market Hall', kind: 'restaurant', who: 'Ana', when: '' },
    { name: 'Zephyr Pavilion', kind: 'hotel', who: '', when: 'the last night' },
  ],
  roster: [
    { name: 'Ana', role: 'collaborator', age: null },
    { name: 'Ana', role: 'collaborator', age: null },
    { name: '', role: 'collaborator' },
    { name: 'Sam', role: 'guest' },
  ],
  destination: 'Lisbon',
  hasDates: true,
  title: 'Lisbon week',
});
const intake = await classifyTripIntake({ text: lisbon, env, fetchImpl: intakeFetch });
assert.equal(intake.ok, true);
assert.equal(intake.intake, true);
assert.deepEqual(intake.things.map((thing) => thing.name), ['North Market Hall', 'Zephyr Pavilion']);
assert.equal(intake.things[0].who, 'Ana');
assert.equal(intake.things[1].when, 'the last night');
assert.deepEqual(intake.roster, [{ name: 'Ana', role: 'collaborator', age: null }]);
assert.equal(intake.destination, 'Lisbon');
assert.equal(intake.hasDates, true);
assert.equal(intake.title, 'Lisbon week');
assert.equal(intake.error, null);
assert.equal(intakeFetch.calls.length, 2);

const followUp = await classifyTripIntake({
  text: 'What time is the museum?',
  env,
  fetchImpl: mockFetch({
    score: 0.12,
    things: [{ name: 'North Market Hall', kind: 'restaurant', who: '', when: '' }],
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
assert.deepEqual(fields.roster, intake.roster);
assert.equal(fields.rosterError, null);
assert.equal(fields.destination, 'Lisbon');
assert.equal(fields.hasDates, true);
assert.equal(fields.title, 'Lisbon week');
assert.equal(fields.destinationError, null);
assert.equal(fields.titleError, null);
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
assert.equal(notFirst.title, '');
assert.equal(notFirst.destinationError, 'trip place was not in the extraction');
assert.equal(notFirst.titleError, 'trip title was not in the extraction');
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
assert.deepEqual(failedFields.roster, []);
assert.equal(failedFields.destination, '');
assert.equal(failedFields.hasDates, false);
assert.equal(failedFields.title, '');
assert.match(failedFields.rosterError, /classifier down/);
assert.match(failedFields.destinationError, /classifier down/);
assert.match(failedFields.titleError, /classifier down/);
assert.match(failedFields.intakeError, /classifier down/);

const badJson = await classifyTripIntake({
  text: lisbon,
  env,
  fetchImpl: mockFetch({ score: 0.8, chatText: 'I would add gardens, swim, and groceries.' }),
});
assert.equal(badJson.ok, false);
assert.deepEqual(badJson.things, []);
assert.deepEqual(badJson.roster, []);
assert.equal(badJson.destination, '');
assert.equal(badJson.title, '');
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
assert.equal(blank.ok, true);
assert.equal(blank.intake, false);
assert.equal(blank.turnKind, 'other');
assert.deepEqual(blank.things, []);
assert.equal(blank.error, null);
assert.doesNotMatch(routeSource, /TimeSyncher Vacation Admin Test|placeTitle/);
assert.doesNotMatch(turnSource, /function thingPattern|placeTitle/);
assert.match(routeSource, /resolveIntakePlace/);
assert.match(classifySource, /runPublicResearch/);
assert.doesNotMatch(classifySource, /places\.googleapis|maps\.googleapis|google places/i);
const adminSource = fs.readFileSync(new URL('../routes/admin-onboardings.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(adminSource, /TimeSyncher Vacation Admin Test/);

const confirmed = await resolveIntakePlace({
  destination: 'Lisbon',
  title: 'Lisbon week',
  searchImpl: async () => ({ ok: true, error: null }),
});
assert.equal(confirmed.destination, 'Lisbon');
assert.equal(confirmed.title, 'Lisbon week');
assert.equal(confirmed.destinationError, null);
assert.equal(confirmed.titleError, null);

let searches = 0;
const missed = await resolveIntakePlace({
  destination: 'Lisbon',
  title: 'Lisbon week',
  searchImpl: async () => {
    searches += 1;
    return { ok: false, error: 'live search returned no place' };
  },
});
assert.equal(searches, 1);
assert.equal(missed.destination, '');
assert.equal(missed.title, '');
assert.match(missed.destinationError, /no place/);
assert.match(missed.titleError, /no place/);

const unnamed = await resolveIntakePlace({
  destination: '',
  title: '',
  destinationError: 'classifier down',
  titleError: 'classifier down',
  searchImpl: async () => { throw new Error('search should not run'); },
});
assert.equal(unnamed.destination, '');
assert.equal(unnamed.title, '');
assert.match(unnamed.destinationError, /classifier down/);
assert.match(unnamed.titleError, /classifier down/);

assert.match(classifySource, /anchorIsLodging true when that reference is their hotel/);
assert.match(classifySource, /exactly one things entry with kind hotel/);

const hyattStaging = await classifyTripIntake({
  text: STAGING_HYATT_INTAKE_SENTENCE,
  env,
  fetchImpl: mockFetch({
    score: 0.91,
    things: STAGING_HYATT_INTAKE_EXTRACTION.things,
    destination: STAGING_HYATT_INTAKE_EXTRACTION.destination,
    chatText: JSON.stringify(STAGING_HYATT_INTAKE_EXTRACTION),
  }),
});
assert.equal(hyattStaging.ok, true);
assert.equal(hyattStaging.turnKind, 'trip_intake');
assert.equal(hyattStaging.things.length, 1);
assert.equal(hyattStaging.things[0].name, 'Hyatt Regency Maui');
assert.equal(hyattStaging.things[0].kind, 'hotel');

for (const caseRow of TRIP_INTAKE_PLACE_ANCHOR_CASES) {
  const classified = await classifyTripIntake({
    text: caseRow.text,
    env,
    fetchImpl: mockFetch({
      score: 0.1,
      things: [],
      chatText: JSON.stringify(caseRow.extraction),
    }),
  });
  assert.equal(classified.ok, true, caseRow.name);
  assert.equal(classified.turnKind, 'place_search', caseRow.name);
  assert.equal(classified.anchorIsLodging, caseRow.expectAnchorIsLodging, caseRow.name);
}

assert.equal(intakeExtractionDatesError({ hasDates: false }), '');
assert.match(intakeExtractionDatesError({ hasDates: true, startDate: '', endDate: '' }), /required/);
const badOrder = await classifyTripIntake({
  text: lisbon,
  env,
  requireExtractedTripDates: true,
  fetchImpl: mockFetch({
    score: 0.91,
    things: [],
    destination: 'Lisbon',
    hasDates: true,
    startDate: '2032-09-30',
    endDate: '2032-09-23',
    title: 'Lisbon week',
  }),
});
assert.equal(badOrder.ok, false);
assert.match(badOrder.error, /endDate before startDate/);
const missingDates = await classifyTripIntake({
  text: lisbon,
  env,
  requireExtractedTripDates: true,
  fetchImpl: mockFetch({
    score: 0.91,
    things: [],
    destination: 'Lisbon',
    hasDates: true,
    startDate: '',
    endDate: '',
    title: 'Lisbon week',
  }),
});
assert.equal(missingDates.ok, false);
assert.match(missingDates.error, /dates required/);

process.stdout.write('trip intake classify tests passed\n');
