import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { persistChatIntakePlaceThing } from '../src/vacation/chat-intake-place-persist.mjs';
import { insertIntakeTripThingRow } from '../src/vacation/trip-things.mjs';
import { enrichSearchPlace } from '../src/vacation/trip-thing-enrichment.mjs';
import { useThingEvidenceDossierStore } from '../src/vacation/thing-evidence-dossier-store.mjs';

function jsonb(value) {
  const parsed = JSON.parse(value);
  function validate(row) {
    if (typeof row === 'string') {
      if (!row.isWellFormed() || row.includes('\0')) {
        throw new Error('unsupported Unicode escape sequence');
      }
    } else if (row && typeof row === 'object') {
      for (const [key, item] of Object.entries(row)) {
        validate(key);
        validate(item);
      }
    }
  }
  validate(parsed);
  return parsed;
}

function throwawayTrip() {
  const tripId = randomUUID();
  const rows = [];
  let metadata = {};
  const db = async (strings, ...values) => {
    const query = strings.join(' ? ');
    if (/insert into trip_things/i.test(query)) {
      assert.equal(values[0], tripId);
      const row = {
        id: randomUUID(), trip_id: tripId, category: values[2], title: values[4], description: values[5],
        location: jsonb(values[10]), links: jsonb(values[11]), ratings: jsonb(values[12]),
        metadata: jsonb(values[13]), source: values[14],
      };
      rows.push(row);
      return [{ id: row.id }];
    }
    if (/update trip_things/i.test(query)) {
      assert.equal(values[11], tripId);
      const row = rows.find((item) => item.id === values[10]);
      assert.ok(row);
      Object.assign(row, {
        category: values[0], title: values[1], description: values[2],
        location: jsonb(values[4]), links: jsonb(values[5]), ratings: jsonb(values[6]),
        metadata: jsonb(values[7]), source: values[8],
      });
      return [];
    }
    if (/from trip_things/i.test(query)) {
      assert.equal(values[0], tripId);
      return /count\(\*\)/i.test(query) ? [{ n: rows.length }] : structuredClone(rows);
    }
    if (/select metadata\s+from trips/i.test(query)) {
      assert.equal(values[0], tripId);
      return [{ metadata: structuredClone(metadata) }];
    }
    if (/update trips/i.test(query)) {
      assert.equal(values[1], tripId);
      metadata = { ...metadata, ...jsonb(values[0]) };
      return [{ public_slug: metadata.publicSlug }];
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  return { tripId, rows, db };
}

const inputs = [
  'Dinner at Carbone 🍝',
  'Café Sabarsky',
  'Zürich',
  'He said “book Café Sabarsky”',
  String.raw`code \u0041 literal`,
  String.raw`code \u0000 \ud83c \uZZZZ literal`,
];
const errors = [];
const env = { TIMESYNCHER_TRAVEL_BASE_URL: 'https://example.test' };
const originalError = console.error;
let searchCalls = 0;
let networkCalls = 0;
const dossiers = new Map();
useThingEvidenceDossierStore({
  getDossier: async (key) => structuredClone(dossiers.get(key) || null),
  putDossier: async (key, dossier) => { dossiers.set(key, structuredClone(dossier)); },
});
console.error = (...args) => { errors.push(args.join(' ')); };
try {
  for (const input of [...inputs, `${'a'.repeat(239)}🍝`]) {
    const { tripId, db, rows } = throwawayTrip();
    const summary = `${'s'.repeat(499)}🍝`;
    const itineraryNote = `${'i'.repeat(279)}🍝`;
    const longDetails = `${'detail '.repeat(428)}abc🍝`;
    const options = {
      tripId, title: input, category: 'restaurant', description: input, destinationHint: 'Zürich',
      metadata: { input, nested: { values: [input] } },
      env,
      fetchImpl: async () => { networkCalls += 1; throw new Error('Unexpected network request'); },
      searchImpl: async () => {
        searchCalls += 1;
        return { places: [{
          title: input, category: 'restaurant', source: 'brave', lat: 47.37, lng: 8.54,
          address: input,
          sourceRecord: { evidenceDossier: {}, summary, itineraryNote, longDetails },
        }] };
      },
    };
    let result;
    await assert.doesNotReject(async () => { result = await persistChatIntakePlaceThing(db, options); });
    assert.equal(rows.length, 1);
    assert.equal(result.id, rows[0].id);
    assert.equal(rows[0].title, input);
    assert.equal(rows[0].metadata.input, input);
    assert.deepEqual(rows[0].metadata.nested.values, [input]);
    assert.equal(rows[0].metadata.thingDetail.summary, summary);
    assert.equal(rows[0].metadata.thingDetail.itineraryNote, itineraryNote);
    assert.equal(rows[0].metadata.thingDetail.longDetails, longDetails);
    rows[0].metadata.needsDetails = true;
    await assert.doesNotReject(() => persistChatIntakePlaceThing(db, options));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, input);
    assert.equal(rows[0].metadata.input, input);
    assert.equal(rows[0].metadata.thingDetail.summary, summary);
    assert.equal(rows[0].metadata.thingDetail.itineraryNote, itineraryNote);
  }
  for (const input of [...inputs, `${'a'.repeat(239)}🍝`]) {
    const { tripId, db, rows } = throwawayTrip();
    await insertIntakeTripThingRow(db, {
      tripId, title: input, category: 'restaurant', description: input, metadata: { input }, env,
    });
    assert.equal(rows[0].title, input);
    assert.equal(rows[0].description, input);
    assert.equal(rows[0].metadata.input, input);
  }
  const description = `${'Café Sabarsky serves seasonal plates. '.repeat(100).padEnd(3999, 'x')}🍝`;
  const enriched = enrichSearchPlace({
    title: 'Café Sabarsky', category: 'restaurant', source: 'brave', sourceRecord: { longDetails: description },
  });
  assert.equal(jsonb(JSON.stringify(enriched)).description, description);
  const { tripId, db, rows } = throwawayTrip();
  await insertIntakeTripThingRow(db, {
    tripId, title: `${'a'.repeat(239)}🍝tail`, category: 'restaurant', description: `${description}tail`, env,
  });
  assert.equal(rows[0].title, `${'a'.repeat(239)}🍝`);
  assert.equal(rows[0].description, description);
  assert.equal(searchCalls, 14);
  assert.equal(networkCalls, 0);
  assert.deepEqual(errors, []);
} finally {
  console.error = originalError;
  useThingEvidenceDossierStore(null);
}
console.log('test_acceptance_974_chat_intake_unicode: ok (throwaway trips; enriched insert, upgrade, unresolved insert)');
