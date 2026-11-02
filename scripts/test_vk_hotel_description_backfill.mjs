import assert from 'node:assert/strict';

import {
  hotelTripThingNeedsDescriptionBackfill,
  planVkHotelDescriptionBackfill,
  runVkHotelDescriptionBackfill,
} from './backfill_vk_hotel_descriptions.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
import { isGenericDescription } from '../src/vacation/trip-thing-enrichment.mjs';

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const sourcedHotelRecord = {
  price: 289,
  googleRating: '4.2',
  googleReviewCount: '4100',
  websiteFlavour: 'The Roger Smith sits on East 47th Street with a literary club feel, vintage decor, and a popular rooftop bar overlooking Midtown.',
  reviewThemes: { praise: ['cozy lobby bar', 'walkable to Grand Central'] },
  neighborhood: 'Midtown East',
};

function mockDb(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const updates = [];
  const db = async (strings, ...values) => {
    const sql = String(strings.raw ? strings.join('?') : strings);
    if (/from trip_things/i.test(sql) && /lower\(category\)/i.test(sql)) {
      return rows.map((row) => ({ ...row }));
    }
    if (/update trip_things/i.test(sql)) {
      updates.push({ sql, values });
      const rowId = values[values.length - 2];
      const target = rows.find((row) => row.id === rowId);
      if (target) {
        const item = values[0];
        target.category = item;
        target.title = values[1];
        target.description = values[2];
        target.location = JSON.parse(values[4]);
        target.metadata = JSON.parse(values[7]);
        target.source = values[8];
      }
      return [];
    }
    return [];
  };
  return { db, rows, updates };
}

const placeholderRow = {
  id: 'hotel-placeholder',
  trip_id: TRIP_ID,
  category: 'hotel',
  title: 'Roger Smith Hotel',
  description: 'Documented NYC option (hotel)',
  location: { address: 'Midtown East, New York, NY', lat: 40.754, lng: -73.972 },
  metadata: { price: 289, sourceRecord: { ...sourcedHotelRecord, description: 'Documented NYC option (hotel)' } },
  source: 'brave',
  starts_at: null,
};

const emptyRow = {
  id: 'hotel-empty',
  trip_id: TRIP_ID,
  category: 'hotel',
  title: 'Library Hotel',
  description: '',
  location: { address: 'Murray Hill, New York, NY' },
  metadata: {
    price: 315,
    sourceRecord: {
      ...sourcedHotelRecord,
      price: 315,
      websiteFlavour: 'Library Hotel stacks themed floors around literature with a rooftop bar and intimate Murray Hill rooms.',
    },
  },
  source: 'brave',
  starts_at: null,
};

const goodDescription = [
  'Library Hotel is a boutique Murray Hill stay themed around literature with intimate rooms,',
  'a rooftop bar, and a quiet residential feel a few blocks from Grand Central.',
  'Guests praise the themed floors and personalized service while noting that standard rooms can feel compact.',
].join(' ');

const goodRow = {
  id: 'hotel-good',
  trip_id: TRIP_ID,
  category: 'hotel',
  title: 'Library Hotel',
  description: goodDescription,
  location: { address: 'Murray Hill, New York, NY' },
  metadata: { price: 315, sourceRecord: { description: goodDescription, price: 315 } },
  source: 'brave',
  starts_at: null,
};

const noSourceRow = {
  id: 'hotel-no-source',
  trip_id: TRIP_ID,
  category: 'hotel',
  title: 'Mystery Inn',
  description: '',
  location: { address: 'New York, NY' },
  metadata: { sourceRecord: {} },
  source: 'brave',
  starts_at: null,
};

assert.equal(hotelTripThingNeedsDescriptionBackfill(placeholderRow.description, placeholderRow.title), true);
assert.equal(hotelTripThingNeedsDescriptionBackfill(goodRow.description, goodRow.title), false);

const placeholderPlan = planVkHotelDescriptionBackfill(placeholderRow);
assert.equal(placeholderPlan.action, 'write');
assert.ok(placeholderPlan.nextDescription.length >= 40);
assert.equal(isGenericDescription(placeholderPlan.nextDescription), false);
assert.equal(descriptionPassesDetailJudge(placeholderPlan.nextDescription, placeholderRow.title), true);
assert.equal(placeholderPlan.thing.metadata.sourceRecord.price, 289);
assert.equal(placeholderPlan.thing.metadata.price, 289);

const emptyPlan = planVkHotelDescriptionBackfill(emptyRow);
assert.equal(emptyPlan.action, 'write');
assert.ok(emptyPlan.nextDescription.length >= 40);

const goodPlan = planVkHotelDescriptionBackfill(goodRow);
assert.equal(goodPlan.action, 'unchanged');

const noSourcePlan = planVkHotelDescriptionBackfill(noSourceRow);
assert.equal(noSourcePlan.action, 'no_source');

const { db, rows, updates } = mockDb([placeholderRow, emptyRow, goodRow, noSourceRow]);

const dryRun = await runVkHotelDescriptionBackfill({
  db,
  tripId: TRIP_ID,
  env: { DATABASE_URL: 'postgres://staging.example/db' },
  dryRun: true,
});
assert.equal(dryRun.counts.scanned, 4);
assert.equal(dryRun.counts.wouldWrite, 2);
assert.equal(dryRun.counts.written, 0);
assert.equal(dryRun.counts.unchanged, 1);
assert.equal(dryRun.counts.noSource, 1);
assert.deepEqual(dryRun.noSourceTitles, ['Mystery Inn']);
assert.equal(updates.length, 0);

const applied = await runVkHotelDescriptionBackfill({
  db,
  tripId: TRIP_ID,
  env: { DATABASE_URL: 'postgres://staging.example/db' },
  dryRun: false,
});
assert.equal(applied.counts.written, 2);
assert.equal(updates.length, 2);

const storedPlaceholder = rows.find((row) => row.id === 'hotel-placeholder');
assert.ok(storedPlaceholder.description.length >= 40);
assert.equal(isGenericDescription(storedPlaceholder.description), false);
assert.equal(storedPlaceholder.metadata.sourceRecord.price, 289);

const secondPass = await runVkHotelDescriptionBackfill({
  db,
  tripId: TRIP_ID,
  env: { DATABASE_URL: 'postgres://staging.example/db' },
  dryRun: false,
});
assert.equal(secondPass.counts.written, 0);
assert.equal(secondPass.counts.wouldWrite, 0);
assert.equal(secondPass.counts.unchanged, 3);
assert.equal(secondPass.counts.noSource, 1);
assert.equal(updates.length, 2);

console.log(JSON.stringify({
  ok: true,
  checked: 'vk-hotel-description-backfill',
  assertions: [
    'placeholder_row_composed',
    'empty_row_composed',
    'good_row_unchanged',
    'no_source_reported',
    'dry_run_no_writes',
    'apply_writes_preserve_price',
    'second_run_idempotent',
  ],
}));
