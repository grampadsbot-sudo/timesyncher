import assert from 'node:assert/strict';

import {
  buildKeepsakeViewModel,
  isKeepsakeJourneyLocation,
  resolveKeepsakePrintFlags,
  savedStories,
  tripSummaryText,
} from '../src/lib/keepsakeModel.mjs';

assert.equal(isKeepsakeJourneyLocation('/shared/sample/journey', new URLSearchParams()), true);
assert.equal(isKeepsakeJourneyLocation('/vacation-app-next.html', new URLSearchParams('printMode=report')), true);
assert.equal(isKeepsakeJourneyLocation('/vacation-app-next.html', new URLSearchParams('token=x')), false);

const sparseTrip = {
  trip: { title: 'Sparse', description: '' },
  places: [{ id: 1, name: 'Only hotel', category_name: 'Hotel' }],
  days: [{ id: 10, day_number: 1, title: 'Day 1' }],
  assignments: { 10: [{ place_id: 1 }] },
  thingOverrides: {
    'place:1': { category: 'hotel', timeline: true },
    __keepsakePrintSettings: {
      summary: false,
      stories: true,
      maps: { 1: false },
    },
  },
};

assert.equal(tripSummaryText(sparseTrip), '');

const flags = resolveKeepsakePrintFlags(
  sparseTrip,
  new URLSearchParams('ksEventSummary=0'),
);
assert.equal(flags.summary, false);
assert.equal(flags.eventSummary, false);
assert.equal(flags.dayMapEnabled(1), false);

const model = buildKeepsakeViewModel(sparseTrip, new URLSearchParams('style=1&printMode=report'));
assert.ok(model.sections.some((s) => s.kind === 'daily-itinerary'));
assert.ok(!model.sections.some((s) => s.kind === 'summary'));
assert.ok(!model.sections.some((s) => s.kind === 'daily-maps'));

const probeTrip = {
  trip: { title: 'Probe' },
  places: [
    {
      id: 99,
      name: 'Flagged bar',
      bound_media: [
        {
          publicUrl: 'https://example.test/photo.jpg',
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        },
      ],
    },
  ],
  thingOverrides: {
    'place:99': { story: true, category: 'restaurant' },
  },
};

const probeStories = savedStories(probeTrip);
assert.equal(probeStories.length, 1);
assert.equal(probeStories[0].photos.length, 1);
assert.match(String(probeStories[0].photos[0].publicUrl || ''), /photo\.jpg/);

const richTrip = {
  trip: {
    title: 'NYC',
    description: 'A focused long weekend with real reservations and neighborhood time.',
  },
  places: [
    { id: 1, name: 'Sample Bar', category_name: 'Bar', story: 'Great negronis.', lat: 40.75, lng: -73.98 },
    { id: 2, name: 'Broadway show', category_name: 'Attraction', lat: 40.76, lng: -73.99 },
    { id: 3, name: 'Corner store', category_name: 'Store' },
  ],
  days: [{ id: 5, day_number: 1, title: 'Arrival' }],
  assignments: {
    5: [{ place_id: 1 }, { place_id: 2 }],
  },
  media: [{ thing_id: 1, publicUrl: 'https://example.test/photo.jpg' }],
  thingOverrides: {
    'place:1': { category: 'restaurant', timeline: true, lat: 40.75, lng: -73.98 },
    'place:2': { category: 'other', timeline: true },
    'place:3': { category: 'store' },
  },
};

const rich = buildKeepsakeViewModel(richTrip, new URLSearchParams('printMode=report&style=2'));
assert.equal(rich.style, 2);
assert.ok(rich.sections.some((s) => s.kind === 'summary'));
assert.ok(rich.sections.some((s) => s.kind === 'stories'));
assert.ok(rich.sections.some((s) => s.kind === 'directory' && s.label === 'Restaurants'));
assert.ok(rich.sections.some((s) => s.kind === 'directory' && s.label === 'Shows, Tours and the Rest'));
assert.ok(rich.sections.some((s) => s.kind === 'directory' && s.label === 'Stores'));
assert.ok(rich.sections.some((s) => s.kind === 'daily-maps'));

console.log('vacation-client keepsake unit tests passed');
