import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyThingPresentation, ratingsFromThingRecord, sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { padKeepsakeSharedPlaces } from '../src/vacation/keepsake-list-minimums.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';

const RATING_KEYS = ['googleRating', 'yelpRating', 'thirdPartyRating', 'review1', 'review2', 'review3'];
const trip = {
  id: 'eab1cbb1-5144-4be4-b856-92f0a3769db3',
  title: 'Trip',
  destination: 'Coast',
  start_date: '2026-04-03',
  end_date: '2026-04-05',
};

function presentThing(ratings, title = 'Dinner', metadata = {}) {
  const thing = thingRecordFromTripRow({
    id: title,
    category: 'activity',
    title,
    description: '',
    metadata,
    ratings,
  });
  const shared = padKeepsakeSharedPlaces(sharedTripFromIntake({ trip, things: [thing] }));
  return applyCapturedLogos(applyThingPresentation(shared, { windBackup: '' }));
}

function dinnerOf(presented) {
  const place = presented.places.find((row) => row.name === 'Dinner');
  assert.ok(place, 'Dinner place');
  const extra = presented.thingOverrides[`place:${place.id}`];
  assert.ok(extra, 'Dinner override');
  const assigned = Object.values(presented.assignments || {})
    .flat()
    .map((row) => row.place)
    .filter((row) => row && row.name === 'Dinner');
  return { place, extra, assigned };
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
    const presented = presentThing({
      source,
      googleRating: '4.9',
      yelpRating: '4.1',
      thirdPartyRating: '4.7',
      review1: quote,
      review2: quote,
      review3: quote,
    });
    const { place, extra, assigned } = dinnerOf(presented);
    assert.equal(extra.ratingsSourceState, 'rejected: google-places');
    assert.equal(place.ratings.source, 'google-places');
    assert.equal(place.ratings.ratingsSourceState, 'rejected: google-places');
    assert.equal(extra.ratingsSource, undefined);
    assertNoRatingValues([extra, place, ...assigned]);
    assert.equal(JSON.stringify(presented).includes(quote), false);
    assert.equal(JSON.stringify(presented).includes('4.9'), false);
  }
  const direct = ratingsFromThingRecord({ source: 'google-places', googleRating: '4.9', review1: quote });
  assert.equal(direct.ratingsSourceState, 'rejected: google-places');
  assert.equal(direct.googleRating, undefined);
  assert.equal(direct.review1, undefined);
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
    const presented = presentThing(ratings, 'Dinner', { source: 'long-intake' });
    const { place, extra, assigned } = dinnerOf(presented);
    assert.equal(extra.ratingsSourceState, 'no ratings source', JSON.stringify(ratings));
    assert.equal(place.ratings.ratingsSourceState, 'no ratings source');
    assert.equal(place.ratings.source, undefined);
    assert.equal(extra.googleRating, undefined);
    assert.notEqual(extra.googleRating, '');
    assertNoRatingValues([extra, place, ...assigned]);
    assert.equal(JSON.stringify(presented).includes(unsourced), false);
    assert.equal(JSON.stringify(presented).includes('4.8'), false);
  }
  const direct = ratingsFromThingRecord({ googleRating: '4.8', review1: unsourced });
  assert.equal(direct.ratingsSourceState, 'no ratings source');
  assert.equal(direct.googleRating, undefined);
  const shuttle = presentThing({ source: 'tavily', review1: 'kept' });
  const invented = shuttle.places.find((row) => row.name === 'SpeediShuttle');
  const inventedExtra = shuttle.thingOverrides[`place:${invented.id}`];
  assert.equal(inventedExtra.ratingsSourceState, 'no ratings source');
  assertNoRatingValues([inventedExtra, invented]);
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
    const presented = presentThing(row.ratings);
    const { place, extra, assigned } = dinnerOf(presented);
    assert.equal(extra.ratingsSource, row.source);
    assert.equal(extra.ratingsSourceState, undefined);
    assert.equal(place.ratings.source, row.source);
    for (const [key, value] of Object.entries(row.expect)) {
      assert.equal(extra[key], value, `${row.source} ${key}`);
      assert.equal(place.ratings[key], value, `${row.source} place ${key}`);
      for (const assignedPlace of assigned) assert.equal(assignedPlace.ratings[key], value);
    }
    for (const key of row.absent) {
      assert.equal(extra[key], undefined, `${row.source} absent ${key}`);
      assert.equal(place.ratings[key], undefined);
    }
    const direct = ratingsFromThingRecord({ ratings: row.ratings });
    assert.equal(direct.ratingsSource, row.source);
    for (const [key, value] of Object.entries(row.expect)) assert.equal(direct[key], value);
  }
  const bare = dinnerOf(presentThing({ source: 'brave' }));
  assert.equal(bare.extra.ratingsSource, 'brave');
  assert.equal(bare.extra.ratingsSourceState, undefined);
  assertNoRatingValues([bare.extra, bare.place, ...bare.assigned]);
});

test('D2 side map is not a ratings source', () => {
  const thing = thingRecordFromTripRow({
    id: 'Dinner',
    category: 'activity',
    title: 'Dinner',
    description: '',
    metadata: { source: 'long-intake' },
    ratings: {},
  });
  const shared = sharedTripFromIntake({ trip, things: [thing] });
  const presented = applyThingPresentation(shared, {
    sourcedRatings: { Dinner: { source: 'brave', googleRating: '5.0', review1: 'from the side map' } },
  });
  const { extra, place } = dinnerOf(presented);
  assert.equal(extra.ratingsSourceState, 'no ratings source');
  assert.equal(extra.googleRating, undefined);
  assert.equal(place.ratings.googleRating, undefined);
  assert.equal(JSON.stringify(presented).includes('from the side map'), false);
  assert.equal(JSON.stringify(presented).includes('5.0'), false);
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
});

process.stdout.write('ratings source tests passed\n');
