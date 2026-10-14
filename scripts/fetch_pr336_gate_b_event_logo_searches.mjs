#!/usr/bin/env node
import { searchTavily } from '../src/vacation/poi-search.mjs';
import { eventLogoSearchQuery } from '../src/vacation/search-event-logo.mjs';
import { PR336_GATE_B_EVENT_LOGO_TARGETS } from './fixtures/pr336-gate-b-event-logo-targets.mjs';
import {
  slugifyEventLogoRecordedName,
  writeRecordedEventLogoResponse,
} from './lib/pr336-gate-b-event-logo-recorded-lib.mjs';

function isoTimestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '').replace('Z', 'Z');
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const stamp = isoTimestampForFilename();
  const results = [];

  for (const target of PR336_GATE_B_EVENT_LOGO_TARGETS) {
    const destination = 'New York';
    const query = eventLogoSearchQuery(target.title, destination);
    const tavilyResponse = await searchTavily(query, { maxResults: 6 });
    const fileName = `${stamp}-${slugifyEventLogoRecordedName(target.ccabKey)}.json`;
    const path = writeRecordedEventLogoResponse({
      fileName,
      body: {
        fetchedAt,
        rowId: target.rowId,
        ccabKey: target.ccabKey,
        title: target.title,
        query,
        tavilyResponse,
      },
    });
    results.push({
      rowId: target.rowId,
      ccabKey: target.ccabKey,
      query,
      fileName,
      path,
      resultCount: tavilyResponse?.results?.length || 0,
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
