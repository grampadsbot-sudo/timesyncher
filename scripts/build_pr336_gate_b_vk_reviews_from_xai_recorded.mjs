#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PR336_GATE_B_XAI_PLACE_TARGETS } from './fixtures/pr336-gate-b-xai-place-targets.mjs';
import {
  buildReviewOverlayFromRecorded,
  listRecordedXaiResponses,
  readRecordedXaiResponse,
} from './lib/pr336-gate-b-xai-recorded-lib.mjs';

const BASE_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OVERLAY_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-gate-b-ccab-overlay.json', import.meta.url), 'utf8'),
);

function latestRecordingByCcabKey(recordings = []) {
  const byKey = new Map();
  for (const fileName of recordings) {
    const recorded = readRecordedXaiResponse(fileName);
    const ccabKey = recorded.ccabKey;
    if (!ccabKey) continue;
    const prev = byKey.get(ccabKey);
    if (!prev || String(recorded.fetchedAt || '') >= String(prev.fetchedAt || '')) {
      byKey.set(ccabKey, { fileName, recorded });
    }
  }
  return byKey;
}

function main() {
  const recordings = listRecordedXaiResponses();
  const byKey = latestRecordingByCcabKey(recordings);
  const overlay = {};
  const sources = [];

  for (const target of PR336_GATE_B_XAI_PLACE_TARGETS) {
    const hit = byKey.get(target.ccabKey);
    const baseRecord = {
      ...(BASE_ENRICHMENT[target.ccabKey] || {}),
      ...(OVERLAY_ENRICHMENT[target.ccabKey] || {}),
    };
    if (!hit) {
      overlay[target.ccabKey] = buildReviewOverlayFromRecorded({
        baseRecord,
        recorded: { structuredText: JSON.stringify({
          google: { notPublished: true },
          yelp: { notPublished: true },
          otherSites: [],
          reviewThemes: { praise: [], complaints: [] },
          websiteFlavour: '',
        }) },
        title: target.title,
      });
      sources.push({ rowId: target.rowId, ccabKey: target.ccabKey, source: 'empty+flagged', file: null });
      continue;
    }
    overlay[target.ccabKey] = buildReviewOverlayFromRecorded({
      baseRecord,
      recorded: hit.recorded,
      title: target.title,
    });
    sources.push({
      rowId: target.rowId,
      ccabKey: target.ccabKey,
      source: hit.fileName,
      xaiRatingsFetched: overlay[target.ccabKey].xaiRatingsFetched,
      missingFields: overlay[target.ccabKey].missingFields || [],
    });
  }

  const outPath = fileURLToPath(new URL('./fixtures/pr336-gate-b-vk-reviews.json', import.meta.url));
  writeFileSync(outPath, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, wrote: outPath, recordings: recordings.length, sources }, null, 2));
}

main();
