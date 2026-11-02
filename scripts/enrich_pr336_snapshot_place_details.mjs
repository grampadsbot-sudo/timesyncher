#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  assertGateBRowProvenance,
  assertPr336GateBSnapshotWriteAllowed,
  buildPr336GateBRegenerateRows,
  buildPr336VkSearchPlacesByRowId,
  materializePr336GateBSnapshotPlaces,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { applyPr336GateBEventLogosFromRecorded } from './lib/pr336-gate-b-event-logo-recorded-lib.mjs';
import { enrichSearchPlacesWithWebDetails } from '../src/vacation/search-place-detail-enrichment.mjs';
import { finalizeSearchPlaces } from '../src/vacation/search-place-output.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';

const DESTINATION = 'New York City';
const GATE_B_ROWS = buildPr336GateBRegenerateRows();
let placesById = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, placesById);

const eventLogoBinding = await applyPr336GateBEventLogosFromRecorded(placesById);
placesById = eventLogoBinding.placesById;

const rowIds = Object.keys(placesById);
const enrichedList = await enrichSearchPlacesWithWebDetails(rowIds.map((id) => placesById[id]), {
  destination: DESTINATION,
  env: process.env,
});
placesById = Object.fromEntries(rowIds.map((id, index) => [
  id,
  finalizeSearchPlaces([enrichedList[index]])[0],
]));

placesById = materializePr336GateBSnapshotPlaces(placesById);
assertPr336GateBSnapshotWriteAllowed(placesById, GATE_B_ROWS);

const hotels = GATE_B_ROWS.filter((row) => row.cat === 'hotel');
const hotelJudgePass = hotels.filter((row) => {
  const place = placesById[row.id];
  const body = place?.sourceRecord?.longDetails || place?.description || '';
  return descriptionPassesDetailJudge(body, place?.title);
});

const outPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(placesById, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  wrote: outPath,
  places: Object.keys(placesById).length,
  hotels: hotels.length,
  hotelsPassingDetailJudge: hotelJudgePass.length,
  eventLogoSources: eventLogoBinding.sources,
}, null, 2));
