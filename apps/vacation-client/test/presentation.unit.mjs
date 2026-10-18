import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDayTimeline } from '../src/lib/dayTimelineModel.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scratch = await mkdtemp(path.join(testDir, '.presentation-'));
try {
  const outfile = path.join(scratch, 'components.mjs');
  await build({
    stdin: {
      contents: [
        "export { DayTimeline } from '../src/components/DayTimeline';",
        "export { ListRow } from '../src/components/ListRow';",
        "export { ThingDetailPanel } from '../src/components/ThingDetailPanel';",
        "export { CategoryTabScreen } from '../src/screens/CategoryTabScreen';",
      ].join('\n'),
      resolveDir: testDir,
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    jsx: 'automatic',
  });
  const { DayTimeline, ListRow, ThingDetailPanel, CategoryTabScreen } = await import(pathToFileURL(outfile));
  const render = (component, props) => renderToStaticMarkup(createElement(component, props));
  const onOpen = () => {};
  const flight = { id: 11, name: 'Flight option: Southwest LAS-LGA 05:05-15:45', category_name: 'Flight' };
  const flightTrip = {
    days: [{ id: 51, day_number: 1 }],
    places: [flight],
    thingOverrides: { 'place:11': { category: 'flight', timeline: true, dayIds: [51] } },
  };
  const flightRow = render(ListRow, { place: flight, trip: flightTrip, tab: 'flights', onOpen });
  assert.doesNotMatch(flightRow, /Flight option:/);
  assert.match(flightRow, /Southwest LAS-LGA 05:05-15:45/);
  assert.match(flightRow, /aria-label="Open thing details"/);
  const transferRows = render(DayTimeline, {
    trip: flightTrip, entries: buildDayTimeline(flightTrip, flightTrip.days[0]), onOpen,
  });
  for (const value of ['Travel to airport', 'Travel from airport', '3:35 am', '5:05 am', '3:45 pm', '5:15 pm']) {
    assert.ok(transferRows.includes(value), `transfer time/title is visible: ${value}`);
  }

  const place = { id: 12, name: 'Neighborhood museum', category_name: 'Event' };
  const summary = 'The exhibition features rotating collections from the city archives.';
  const timeline = render(DayTimeline, {
    trip: {}, onOpen,
    entries: [
      { id: 'ordinary', kind: 'thing', title: place.name, place, summary },
      { id: 'flight', kind: 'flight', title: 'Flight', place: flight, summary },
      { id: 'typed-flight', kind: 'thing', title: 'Flight', place: flight, summary },
      { id: 'travel', kind: 'travel', title: 'Travel to museum', place, summary },
      { id: 'travel-title', kind: 'thing', title: 'Travel from museum', place, summary },
    ],
  });
  assert.equal(timeline.split(summary).length - 1, 1, 'flight/travel rows do not repeat the summary');
  assert.match(timeline, /data-row-summary="1" data-summary-stored="1" data-summary-src="thing"/);

  const sparseDetail = render(ThingDetailPanel, { place, trip: {}, onClose: onOpen });
  assert.match(sparseDetail, /data-description-missing="1"/);
  assert.match(sparseDetail, /data-reviews-missing="1"/);
  const sourcedTrip = { thingOverrides: { 'place:12': {
    websiteFlavour: summary, googleRating: '4.6', googleReviewCount: 42,
  } } };
  const sourcedDetail = render(ThingDetailPanel, { place, trip: sourcedTrip, onClose: onOpen });
  assert.ok(sourcedDetail.includes(summary));
  assert.doesNotMatch(sourcedDetail, /data-description-missing="1"|data-reviews-missing="1"/);

  const category = render(CategoryTabScreen, {
    tab: 'events', onOpen, timelineChecked: () => false,
    trip: { places: [
      { id: 13, name: 'Unpriced event', category_name: 'Event' },
      { id: 14, name: 'Higher price event', category_name: 'Event', price: 95 },
      { id: 15, name: 'Lower price event', category_name: 'Event', price: 25 },
    ] },
  });
  assert.match(category, /data-ts-sort-active="price"/);
  assert.ok(category.indexOf('Lower price event') < category.indexOf('Higher price event'));
  assert.ok(category.indexOf('Higher price event') < category.indexOf('Unpriced event'));
  assert.match(category, /data-ts-event-price="1">\$25/);
  assert.match(category, /data-ts-event-price="1">\$95/);
  assert.doesNotMatch(category, /\$0/);
  console.log('vacation-client presentation content unit checks passed');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
