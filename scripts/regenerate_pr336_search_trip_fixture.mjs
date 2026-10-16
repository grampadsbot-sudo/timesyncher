#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertSearchPlaceOutputContract } from '../src/vacation/search-place-output.mjs';
import {
  buildPr336VkSearchPlacesByRowId,
  buildVkSearchContractSamplePlaces,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import {
  NYC_VK_ISSUE_429_LIST_ROWS,
  resolveNycCcabKey,
} from './fixtures/nyc-vk-list-tab-rows.mjs';

const TIMELINE_ROWS = [
  { day: 1, time: '10:30', name: 'Flight option: JetBlue LAS-JFK 2026-06-23 07:22-15:31', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Toyota Corolla', cat: 'car', id: 609, listOnly: true },
];

function buildGateBRows() {
  const rows = [...TIMELINE_ROWS];
  const rowIdentity = (row) => `${row.ccabKey || resolveNycCcabKey(row.name)}\0${row.name}`;
  const seenRowIdentities = new Set(rows.map(rowIdentity));
  let nextListId = 612;
  for (const listRow of NYC_VK_ISSUE_429_LIST_ROWS) {
    const identity = `${listRow.ccabKey}\0${listRow.name}`;
    if (seenRowIdentities.has(identity)) continue;
    seenRowIdentities.add(identity);
    rows.push({
      day: 1,
      time: '11:00',
      name: listRow.name,
      cat: listRow.cat,
      id: nextListId,
      ccabKey: listRow.ccabKey,
      listOnly: true,
    });
    nextListId += 1;
  }
  return rows;
}

const GATE_B_ROWS = buildGateBRows();
const placesById = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertSearchPlaceOutputContract(buildVkSearchContractSamplePlaces());

const outPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(placesById, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, wrote: outPath, places: Object.keys(placesById).length }));
