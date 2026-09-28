import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { writeRatings } from '../src/vacation/write-ratings.mjs';

const trip = {
  id: 'eab1cbb1-5144-4be4-b856-92f0a3769db3',
  title: 'Trip',
  destination: 'Coast',
  start_date: '2026-04-03',
  end_date: '2026-04-05',
};

const UI_RATING_KEYS = ['googleRating', 'yelpRating', 'thirdPartyRating'];

function test(name, fn) {
  fn();
  process.stdout.write(`ok ${name}\n`);
}

function intakeOf(thing) {
  const shared = sharedTripFromIntake({ trip, things: [thing] });
  assert.equal(shared.places.length, 1);
  const place = shared.places[0];
  const override = shared.thingOverrides[`place:${place.id}`];
  assert.equal(place.name, thing.title);
  assert.ok(override);
  return { place, override };
}

function rowThing(title, metadata, ratings) {
  return thingRecordFromTripRow({
    id: title,
    category: 'activity',
    title,
    description: '',
    metadata,
    ratings,
  });
}

function uiShowsRating(record) {
  return UI_RATING_KEYS.some((key) => /\d/.test(String(record?.[key] || '')));
}

test('writeRatings stores a source rating', () => {
  const payload = {
    source: 'brave',
    rating: 4.6,
    count: 18,
    url: 'https://example.test/harbor-cafe',
  };
  const thing = rowThing('Harbor Cafe', { sourceRecord: payload }, {});
  const written = writeRatings(thing);
  assert.equal(written.rating, '4.6');
  assert.equal(written.count, 18);
  assert.equal(written.sourceUrl, 'https://example.test/harbor-cafe');
  assert.equal(written.thirdPartyRating, '4.6');
  assert.equal(written.googleRating, undefined);
  assert.equal(written.yelpRating, undefined);
  const { place, override } = intakeOf(thing);
  assert.equal(place.ratings.rating, '4.6');
  assert.equal(place.ratings.count, 18);
  assert.equal(place.ratings.sourceUrl, 'https://example.test/harbor-cafe');
  assert.equal(override.thirdPartyRating, '4.6');
  assert.equal(uiShowsRating(override), true);
  assert.equal(override.googleRating, undefined);
  assert.equal(override.yelpRating, undefined);
});

test('writeRatings leaves a missing rating absent', () => {
  const payload = {
    source: 'osm',
    count: 9,
    url: 'https://example.test/north-trail',
  };
  const thing = rowThing('North Trail', { sourceRecord: payload }, {});
  const written = writeRatings(thing);
  assert.equal(written.rating, undefined);
  assert.equal(written.thirdPartyRating, undefined);
  assert.equal(written.count, 9);
  assert.equal(written.sourceUrl, 'https://example.test/north-trail');
  assert.equal(written.ratingsSourceState, undefined);
  const { place, override } = intakeOf(thing);
  assert.equal(place.ratings.rating, undefined);
  assert.equal(place.ratings.thirdPartyRating, undefined);
  assert.equal(override.rating, undefined);
  assert.equal(uiShowsRating(override), false);
  assert.equal(JSON.stringify(place).includes('no ratings source'), false);
  assert.notEqual(place.ratings.rating, '');
  assert.notEqual(place.ratings.rating, 0);

  const bare = writeRatings(rowThing('Market Hall', { source: 'long-intake' }, {}));
  assert.deepEqual(bare, {});
  assert.equal(uiShowsRating(bare), false);
  const emptyRating = writeRatings({
    title: 'Market Hall',
    source: 'brave',
    rating: '   ',
    count: '',
    url: 'https://example.test/market-hall',
  });
  assert.equal(emptyRating.source, 'brave');
  assert.equal(emptyRating.rating, undefined);
  assert.equal(emptyRating.count, undefined);
  assert.equal(uiShowsRating(emptyRating), false);
});

test('writeRatings keeps the source on a written rating', () => {
  const payload = {
    source: 'tavily',
    rating: '4.1',
    count: '12',
    sourceUrl: 'https://example.test/market-hall',
  };
  const written = writeRatings({ title: 'Market Hall', sourceRecord: payload });
  assert.equal(written.rating, '4.1');
  assert.equal(written.source, 'tavily');
  assert.equal(written.count, '12');
  assert.equal(written.sourceUrl, 'https://example.test/market-hall');
  const { place, override } = intakeOf({
    id: 'market-hall',
    title: 'Market Hall',
    sourceRecord: payload,
  });
  assert.equal(place.ratings.source, 'tavily');
  assert.equal(place.ratings.rating, '4.1');
  assert.equal(override.source, 'tavily');
  assert.equal(override.rating, '4.1');
  assert.equal(override.thirdPartyRating, '4.1');
});

test('writeRatings reads the producing source record', () => {
  const thing = rowThing('Harbor Cafe', {
    source: 'long-intake',
    sourceRecord: {
      source: 'brave',
      rating: 4.2,
      count: 7,
      url: 'https://example.test/harbor-cafe',
    },
  }, {
    source: 'tavily',
    rating: 1,
    count: 1,
    url: 'https://example.test/other',
  });
  const written = writeRatings(thing);
  assert.equal(written.source, 'brave');
  assert.equal(written.rating, '4.2');
  assert.equal(written.count, 7);
  assert.equal(thing.ratings.source, 'tavily');
  const fromColumn = writeRatings(rowThing('North Trail', {}, {
    source: 'osm',
    rating: 3,
    count: 4,
    url: 'https://example.test/north-trail',
  }));
  assert.equal(fromColumn.source, 'osm');
  assert.equal(fromColumn.rating, '3');
  assert.equal(fromColumn.sourceUrl, 'https://example.test/north-trail');
});

test('writeRatings does not copy a Google Places number', () => {
  const quote = 'A places quote that must not ship';
  for (const source of ['google-places', 'Google-Places', 'google_places', 'Google Places']) {
    const written = writeRatings({
      title: 'Harbor Cafe',
      sourceRecord: {
        source,
        rating: 4.9,
        count: 40,
        url: 'https://example.test/places',
        review1: quote,
      },
    });
    assert.deepEqual(written, {});
    const { place, override } = intakeOf(rowThing('Harbor Cafe', {
      sourceRecord: { source, rating: 4.9, count: 40, review1: quote },
    }, {}));
    assert.deepEqual(place.ratings, {});
    assert.equal(uiShowsRating(override), false);
    assert.equal(JSON.stringify(place).includes('4.9'), false);
    assert.equal(JSON.stringify(place).includes(quote), false);
  }
  const laundered = writeRatings({
    source: 'brave',
    googleRating: '4.8',
    url: 'https://example.test/harbor-cafe',
  });
  assert.equal(laundered.rating, undefined);
  assert.equal(laundered.googleRating, undefined);
  assert.equal(uiShowsRating(laundered), false);
});

test('writeRatings is the only intake call', () => {
  const intake = readFileSync(new URL('../src/vacation/intake-shared-trip.mjs', import.meta.url), 'utf8');
  const writer = readFileSync(new URL('../src/vacation/write-ratings.mjs', import.meta.url), 'utf8');
  const handler = readFileSync(new URL('../src/vacation/shared-trip-handler.mjs', import.meta.url), 'utf8');
  assert.deepEqual(intake.match(/writeRatings\s*\(/g), ['writeRatings(']);
  assert.doesNotMatch(intake, /blankRatings|sourcedRatings|ratingsFromThingRecord|safeRatings/);
  assert.doesNotMatch(writer, /blankRatings|sourcedRatings|googleRating|yelpRating|user_ratings_total/);
  assert.doesNotMatch(writer, /\.split\s*\(|\.join\s*\(|fromCharCode|atob|btoa/);
  assert.doesNotMatch(intake, /api\.search\.brave\.com|api\.tavily\.com/i);
  assert.doesNotMatch(writer, /api\.search\.brave\.com|api\.tavily\.com/i);
  assert.match(handler, /thingRecordFromTripRow/);
  assert.match(handler, /select id, category, title, description, metadata, ratings/);
});

process.stdout.write('ratings source tests passed\n');
