#!/usr/bin/env node
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from './fixtures/pr336-gate-b-xai-place-targets.mjs';
import {
  slugifyRecordedName,
  writeRecordedXaiResponse,
} from './lib/pr336-gate-b-xai-recorded-lib.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OVERLAY_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-gate-b-ccab-overlay.json', import.meta.url), 'utf8'),
);

function isoTimestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '').replace('Z', 'Z');
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const stamp = isoTimestampForFilename();
  const results = [];

  for (const target of PR336_GATE_B_XAI_PLACE_TARGETS) {
    const ccabRecord = {
      ...(BASE_ENRICHMENT[target.ccabKey] || {}),
      ...(OVERLAY_ENRICHMENT[target.ccabKey] || {}),
    };
    const place = {
      title: target.title,
      category: target.category,
      address: ccabRecord.address,
      url: ccabRecord.website,
      sourceRecord: ccabRecord,
    };
    const { payload, structuredText, parsed } = await fetchXaiPlaceRatings(place, {
      destination: target.destination,
    });
    const fileName = `${stamp}-${slugifyRecordedName(target.ccabKey)}.json`;
    const path = writeRecordedXaiResponse({
      fileName,
      body: {
        fetchedAt,
        rowId: target.rowId,
        ccabKey: target.ccabKey,
        title: target.title,
        structuredText,
        payload,
      },
    });
    results.push({
      rowId: target.rowId,
      ccabKey: target.ccabKey,
      fileName,
      path,
      hasAggregate: Boolean(
        parsed.google?.average != null
        || parsed.yelp?.average != null
        || (parsed.otherSites?.length && parsed.otherSites[0]?.average != null),
      ),
      themeCount: (parsed.reviewThemes?.praise?.length || 0) + (parsed.reviewThemes?.complaints?.length || 0),
    });
  }

  console.log(JSON.stringify({ ok: true, fetchedAt, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error?.code || 'fetch_failed',
    message: String(error?.message || error),
  }));
  process.exit(1);
});
