#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { applyDossierFields } from '../src/vacation/thing-dossier-fields.mjs';

const FLIGHT_IDS = [651, 652, 658];
const PRESENTATION_FIELDS = ['summary', 'description', 'itineraryNote'];
const FLIGHT_OPTION_STUB = /\bFlight option:\s*/i;
const DOCUMENTED_OPTION_STUB = /^Documented .+ option\b/i;

const EXPECTED_AFTER = {
  651: {
    description:
      "Delta's early-morning nonstop, Delta LAS-JFK 2026-06-23 07:05-15:13, runs from Las Vegas Harry Reid to New York JFK. FlightMapper lists it as Delta Air Lines DL 510 Non-stop, flown on an Airbus A321neo (32Q), with about five hours and twelve minutes in the air. It is A domestic route departing from the Las Vegas Harry Reid airport (LAS) and arriving at New York John F. Kennedy airport (JFK). Taking Delta LAS-JFK 2026-06-23 07:05-15:13 puts you in New York by mid-afternoon, with time to reach the hotel before dinner.",
    summary:
      'FlightMapper lists Delta Air Lines DL 510 Non-stop at 07:05 from Las Vegas, the departure behind Delta LAS-JFK 2026-06-23 07:05-15:13 into New York JFK. The route is a nonstop on an Airbus A321neo, and the 15:13 Eastern arrival leaves time to check in before dinner.',
    itineraryNote:
      'Delta LAS-JFK 2026-06-23 07:05-15:13: an early nonstop on Delta Air Lines DL 510 Non-stop; land by mid-afternoon.',
  },
  652: {
    description:
      "FlightMapper's JetBlue schedule for the red-eye JetBlue LAS-JFK 2026-06-23 23:59-08:04+1 covers JetBlue flights from Las Vegas Harry Reid (LAS) to New York John F. Kennedy (JFK). A domestic route departing from the Las Vegas Harry Reid airport (LAS) and arriving at New York John F. Kennedy airport (JFK). The flight arrives 1 day after departure. The flight distance is 2241 miles, or 3607 km. For direct flights, the flight time varies between 4:44 and 5:15.",
    summary:
      "JetBlue's overnight JetBlue LAS-JFK 2026-06-23 23:59-08:04+1 is a red-eye, and FlightMapper notes for late JetBlue departures that the flight arrives 1 day after departure. The direct flight time runs between 4:44 and 5:15.",
    itineraryNote:
      'JetBlue LAS-JFK 2026-06-23 23:59-08:04+1: the red-eye; sleep aboard and arrive for breakfast, since The flight arrives 1 day after departure.',
  },
  658: {
    description:
      "FlightMapper's United schedule behind United LAS-EWR 2026-06-23 07:00-15:00 lists United Airlines UA 394 Non-stop Boeing 737-900 (739) from Las Vegas Harry Reid (LAS) to Newark Liberty, New York (EWR). A domestic route departing from the Las Vegas Harry Reid airport (LAS) and arriving at Newark Liberty, New York airport (EWR). The flight distance is 2220 miles, or 3573 km. For direct flights, the flight time varies between 4:38 and 5:08.",
    summary:
      "United's 07:00 Newark departure United LAS-EWR 2026-06-23 07:00-15:00 matches FlightMapper's United Airlines UA 394 Non-stop from Las Vegas Harry Reid to Newark Liberty. The 737-900 nonstop covers 2220 miles in about five hours.",
    itineraryNote:
      'United LAS-EWR 2026-06-23 07:00-15:00: an early nonstop into Newark on United Airlines UA 394 Non-stop.',
  },
};

const STUBBED_BEFORE_ROWS = [
  {
    record: 651,
    field: 'description',
    before:
      "Delta's early-morning nonstop, Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13, runs from Las Vegas Harry Reid to New York JFK. FlightMapper lists it as Delta Air Lines DL 510 Non-stop, flown on an Airbus A321neo (32Q), with about five hours and twelve minutes in the air. It is A domestic route departing from the Las Vegas Harry Reid airport (LAS) and arriving at New York John F. Kennedy airport (JFK). Taking Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13 puts you in New York by mid-afternoon, with time to reach the hotel before dinner.",
  },
  { record: 651, field: 'summary', before: 'FlightMapper lists Delta Air Lines DL 510 Non-stop at 07:05 from Las Vegas, the departure behind Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13 into New York JFK. The route is a nonstop on an Airbus A321neo, and the 15:13 Eastern arrival leaves time to check in before dinner.' },
  { record: 651, field: 'itineraryNote', before: 'Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13: an early nonstop on Delta Air Lines DL 510 Non-stop; land by mid-afternoon.' },
  { record: 652, field: 'description', before: "FlightMapper's JetBlue schedule for the red-eye Flight option: JetBlue LAS-JFK 2026-06-23 23:59-08:04+1 covers JetBlue flights from Las Vegas Harry Reid (LAS) to New York John F. Kennedy (JFK). A domestic route departing from the Las Vegas Harry Reid airport (LAS) and arriving at New York John F. Kennedy airport (JFK). The flight arrives 1 day after departure. The flight distance is 2241 miles, or 3607 km. For direct flights, the flight time varies between 4:44 and 5:15." },
  { record: 652, field: 'summary', before: "JetBlue's overnight Flight option: JetBlue LAS-JFK 2026-06-23 23:59-08:04+1 is a red-eye, and FlightMapper notes for late JetBlue departures that the flight arrives 1 day after departure. The direct flight time runs between 4:44 and 5:15." },
  { record: 652, field: 'itineraryNote', before: 'Flight option: JetBlue LAS-JFK 2026-06-23 23:59-08:04+1: the red-eye; sleep aboard and arrive for breakfast, since The flight arrives 1 day after departure.' },
  { record: 658, field: 'description', before: "FlightMapper's United schedule behind Flight option: United LAS-EWR 2026-06-23 07:00-15:00 lists United Airlines UA 394 Non-stop Boeing 737-900 (739) from Las Vegas Harry Reid (LAS) to Newark Liberty, New York (EWR). A domestic route departing from the Las Vegas Harry Reid airport (LAS) and arriving at Newark Liberty, New York airport (EWR). The flight distance is 2220 miles, or 3573 km. For direct flights, the flight time varies between 4:38 and 5:08." },
  { record: 658, field: 'summary', before: "United's 07:00 Newark departure Flight option: United LAS-EWR 2026-06-23 07:00-15:00 matches FlightMapper's United Airlines UA 394 Non-stop from Las Vegas Harry Reid to Newark Liberty. The 737-900 nonstop covers 2220 miles in about five hours." },
  { record: 658, field: 'itineraryNote', before: 'Flight option: United LAS-EWR 2026-06-23 07:00-15:00: an early nonstop into Newark on United Airlines UA 394 Non-stop.' },
];

const loadCensus = (id) => JSON.parse(
  readFileSync(new URL(`./fixtures/vk-search-census/results/${id}.json`, import.meta.url), 'utf8'),
);

const storedPresentationValue = (raw, field) => {
  if (field === 'itineraryNote') {
    return raw.fields?.itineraryNote?.value ?? raw.itineraryNote ?? '';
  }
  return raw.fields?.[field]?.value ?? '';
};

const assertPresentationFieldClean = (value, label) => {
  assert.ok(!FLIGHT_OPTION_STUB.test(value), `${label} must not contain literal Flight option:`);
  const trimmed = String(value || '').trim();
  assert.ok(!DOCUMENTED_OPTION_STUB.test(trimmed), `${label} must not be a Documented … option stub`);
};

const assertStoredPresentation = (id, raw) => {
  const expected = EXPECTED_AFTER[id];
  assert.doesNotMatch(String(raw.thingName || ''), /^Flight option:/i, `${id} thingName must not carry Flight option:`);
  for (const field of PRESENTATION_FIELDS) {
    const value = storedPresentationValue(raw, field);
    assert.equal(value, expected[field], `${id} stored fields.${field}`);
    assertPresentationFieldClean(value, `${id} stored ${field}`);
  }
  assert.match(
    String(raw.itineraryNoteCandidate || ''),
    FLIGHT_OPTION_STUB,
    `${id} itineraryNoteCandidate is historical inventory and may retain Flight option:`,
  );
};

const hydrateFlightRecord = (raw) => {
  const dossier = vkSearchResultToDossier(raw, {
    title: raw.thingName,
    name: raw.thingName,
    category: 'flight',
  });
  return applyDossierFields({
    category: 'flight',
    name: raw.thingName,
    title: raw.thingName,
  }, dossier);
};

const assertHydratedPresentation = (id, record) => {
  const expected = EXPECTED_AFTER[id];
  assert.equal(record.summary, expected.summary, `${id} hydrated summary`);
  assert.equal(record.description, expected.description, `${id} hydrated description`);
  assert.equal(record.longDetails, expected.description, `${id} hydrated longDetails mirrors description`);
  assert.equal(record.itineraryNote, expected.itineraryNote, `${id} hydrated itineraryNote`);
  for (const [field, value] of Object.entries({
    summary: record.summary,
    description: record.description,
    longDetails: record.longDetails,
    itineraryNote: record.itineraryNote,
  })) {
    assertPresentationFieldClean(value, `${id} hydrated ${field}`);
  }
};

const applyBeforeValue = (raw, field, before) => {
  const next = structuredClone(raw);
  if (field === 'itineraryNote') {
    next.fields.itineraryNote.value = before;
    next.itineraryNote = before;
    return next;
  }
  next.fields[field].value = before;
  return next;
};

for (const id of FLIGHT_IDS) {
  const raw = loadCensus(id);
  assertStoredPresentation(id, raw);
  const hydrated = hydrateFlightRecord(raw);
  assertHydratedPresentation(id, hydrated);
}

for (const row of STUBBED_BEFORE_ROWS) {
  const raw = applyBeforeValue(loadCensus(row.record), row.field, row.before);
  assert.throws(
    () => assertStoredPresentation(row.record, raw),
    (err) => /Flight option:|must match patched|must not contain/i.test(String(err?.message || err)),
    `in-memory ${row.record} ${row.field} before-value must be rejected`,
  );
  const hydrated = hydrateFlightRecord(raw);
  assert.throws(
    () => assertHydratedPresentation(row.record, hydrated),
    (err) => /Flight option:|hydrated|must not contain/i.test(String(err?.message || err)),
    `hydrated ${row.record} ${row.field} before-value must be rejected`,
  );
}

console.log('issue #832 vk-search census flight presentation fixture regression passed');
