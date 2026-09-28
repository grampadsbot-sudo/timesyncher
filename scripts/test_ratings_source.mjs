import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ratingsFromThingRecord, sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';

const RATING_KEYS = ['googleRating', 'yelpRating', 'thirdPartyRating', 'review1', 'review2', 'review3'];
const trip = {
  id: 'eab1cbb1-5144-4be4-b856-92f0a3769db3',
  title: 'Trip',
  destination: 'Coast',
  start_date: '2026-04-03',
  end_date: '2026-04-05',
};

function fixtureThing(ratings, title = 'Dinner', metadata = {}) {
  return thingRecordFromTripRow({
    id: title,
    category: 'activity',
    title,
    description: '',
    metadata,
    ratings,
  });
}

function intakeOf(ratings, title = 'Dinner', metadata = {}) {
  const shared = sharedTripFromIntake({ trip, things: [fixtureThing(ratings, title, metadata)] });
  assert.equal(shared.places.length, 1);
  const place = shared.places[0];
  assert.equal(place.name, title);
  const assigned = Object.values(shared.assignments || {})
    .flat()
    .map((row) => row.place)
    .filter((row) => row && row.name === title);
  assert.equal(assigned.length > 0, true);
  return { place, assigned };
}

function assertNoRatingValues(rows) {
  for (const row of rows) {
    for (const key of RATING_KEYS) assert.equal(row[key], undefined, key);
    if (row.ratings) {
      for (const key of RATING_KEYS) assert.equal(row.ratings[key], undefined, key);
    }
  }
}

function test(name, fn) {
  fn();
  process.stdout.write(`ok ${name}\n`);
}

test('D2 google-places rows rejected', () => {
  const quote = 'A Google Places quote that must not ship';
  for (const source of ['google-places', 'Google-Places', 'google_places', 'Google Places']) {
    const record = { source, googleRating: '4.9', yelpRating: '4.1', thirdPartyRating: '4.7', review1: quote, review2: quote, review3: quote };
    const direct = ratingsFromThingRecord({ ratings: record });
    assert.equal(direct.ratingsSourceState, 'rejected: google-places');
    assert.equal(direct.ratingsSource, undefined);
    assertNoRatingValues([direct]);
    const { place, assigned } = intakeOf(record);
    assert.equal(place.ratings.source, 'google-places');
    assert.equal(place.ratings.ratingsSourceState, 'rejected: google-places');
    assertNoRatingValues([place, place.ratings, ...assigned, ...assigned.map((row) => row.ratings)]);
    assert.equal(JSON.stringify(place).includes(quote), false);
    assert.equal(JSON.stringify(place).includes('4.9'), false);
  }
});

test('D2 missing ratings source is loud', () => {
  const unsourced = 'unsourced quote that must not ship';
  const cases = [
    undefined,
    null,
    {},
    { source: '' },
    { source: '   ' },
    { googleRating: '4.8', yelpRating: '3.2', review1: unsourced },
  ];
  for (const ratings of cases) {
    const direct = ratingsFromThingRecord(ratings && typeof ratings === 'object' ? { ratings } : {});
    assert.equal(direct.ratingsSourceState, 'no ratings source', JSON.stringify(ratings));
    assertNoRatingValues([direct]);
    const { place, assigned } = intakeOf(ratings, 'Dinner', { source: 'long-intake' });
    assert.equal(place.ratings.ratingsSourceState, 'no ratings source');
    assert.equal(place.ratings.source, undefined);
    assert.notEqual(place.ratings.googleRating, '');
    assertNoRatingValues([place, place.ratings, ...assigned]);
    assert.equal(JSON.stringify(place).includes(unsourced), false);
    assert.equal(JSON.stringify(place).includes('4.8'), false);
  }
});

test('D2 sourced rows pass through', () => {
  const cases = [
    {
      source: 'brave',
      ratings: { source: 'brave', yelpRating: '4.2', review2: 'Brave result quote', googleRating: '' },
      expect: { yelpRating: '4.2', review2: 'Brave result quote' },
      absent: ['googleRating', 'review1', 'review3', 'thirdPartyRating'],
    },
    {
      source: 'tavily',
      ratings: { source: 'tavily', thirdPartyRating: 4.5, review1: 'Tavily result quote' },
      expect: { thirdPartyRating: '4.5', review1: 'Tavily result quote' },
      absent: ['googleRating', 'yelpRating', 'review2', 'review3'],
    },
    {
      source: 'prior-things',
      ratings: { source: 'prior-things', googleRating: '4.0', review3: 'Prior Things quote' },
      expect: { googleRating: '4.0', review3: 'Prior Things quote' },
      absent: ['yelpRating', 'thirdPartyRating', 'review1', 'review2'],
    },
  ];
  for (const row of cases) {
    const direct = ratingsFromThingRecord({ ratings: row.ratings });
    const { place, assigned } = intakeOf(row.ratings);
    assert.equal(direct.ratingsSource, row.source);
    assert.equal(direct.ratingsSourceState, undefined);
    assert.equal(place.ratings.source, row.source);
    for (const [key, value] of Object.entries(row.expect)) {
      assert.equal(direct[key], value, `${row.source} ${key}`);
      assert.equal(place.ratings[key], value, `${row.source} place ${key}`);
      for (const assignedPlace of assigned) assert.equal(assignedPlace.ratings[key], value);
    }
    for (const key of row.absent) {
      assert.equal(direct[key], undefined, `${row.source} absent ${key}`);
      assert.equal(place.ratings[key], undefined);
    }
  }
  const bare = ratingsFromThingRecord({ ratings: { source: 'brave' } });
  const barePlace = intakeOf({ source: 'brave' });
  assert.equal(bare.ratingsSource, 'brave');
  assert.equal(bare.ratingsSourceState, undefined);
  assert.equal(barePlace.place.ratings.source, 'brave');
  assertNoRatingValues([bare, barePlace.place, barePlace.place.ratings, ...barePlace.assigned]);
});

test('D2 side map is not a ratings source', () => {
  const { place } = intakeOf({}, 'Dinner', { source: 'long-intake' });
  assert.equal(place.ratings.ratingsSourceState, 'no ratings source');
  assert.equal(place.ratings.googleRating, undefined);
  assert.equal(JSON.stringify(place).includes('from the side map'), false);
  assert.equal(JSON.stringify(place).includes('5.0'), false);
  const intake = readFileSync(new URL('../src/vacation/intake-shared-trip.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(intake, /sourcedRatings/);
  assert.doesNotMatch(intake, /options\.sourcedRatings/);
});

test('D2 blank ratings cannot return', () => {
  const intake = readFileSync(new URL('../src/vacation/intake-shared-trip.mjs', import.meta.url), 'utf8');
  const handler = readFileSync(new URL('../src/vacation/shared-trip-handler.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(intake, /blankRatings/);
  assert.doesNotMatch(intake, /sourcedRatings/);
  assert.doesNotMatch(intake, /googleRating:\s*['"]['"]/);
  assert.doesNotMatch(intake, /api\.search\.brave\.com|api\.tavily\.com/i);
  assert.match(handler, /select id, category, title, description, metadata, ratings/);
  assert.match(handler, /thingRecordFromTripRow/);
  assert.doesNotMatch(handler, /sourcedRatings/);
  assert.doesNotMatch(handler, /api\.search\.brave\.com|api\.tavily\.com/i);
  const mapped = thingRecordFromTripRow({
    id: 'Dinner',
    category: 'activity',
    title: 'Dinner',
    description: 'From the row',
    metadata: { source: 'customer-turn', who: 'Ada', notes: ['window'] },
    ratings: { source: 'brave', review1: 'Row quote' },
  });
  assert.equal(mapped.who, 'Ada');
  assert.deepEqual(mapped.notes, ['window']);
  assert.equal(mapped.ratings.source, 'brave');
  assert.equal(mapped.ratings.review1, 'Row quote');
  assert.equal(mapped.source, undefined);
  assert.equal(mapped.description, 'From the row');
});

process.stdout.write('ratings source tests passed\n');
