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

const GATE_B_ROWS = buildPr336GateBRegenerateRows();
let placesById = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, placesById);

const eventLogoBinding = await applyPr336GateBEventLogosFromRecorded(placesById);
placesById = eventLogoBinding.placesById;

placesById = materializePr336GateBSnapshotPlaces(placesById);
assertPr336GateBSnapshotWriteAllowed(placesById, GATE_B_ROWS);

const outPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(placesById, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  wrote: outPath,
  places: Object.keys(placesById).length,
  eventLogoSources: eventLogoBinding.sources,
}, null, 2));
