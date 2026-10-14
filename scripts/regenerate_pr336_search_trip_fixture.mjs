#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  assertGateBRowProvenance,
  buildPr336VkSearchPlacesByRowId,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { applyPr336GateBEventLogosFromRecorded } from './lib/pr336-gate-b-event-logo-recorded-lib.mjs';

const GATE_B_ROWS = [
  { day: 1, time: '10:30', name: 'JetBlue LAS → JFK', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Standard sedan', cat: 'car', id: 609, listOnly: true },
];

let placesById = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, placesById);

const eventLogoBinding = await applyPr336GateBEventLogosFromRecorded(placesById);
placesById = eventLogoBinding.placesById;

const outPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(placesById, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  wrote: outPath,
  places: Object.keys(placesById).length,
  eventLogoSources: eventLogoBinding.sources,
}, null, 2));
