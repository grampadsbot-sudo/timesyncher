#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  persistChatIntakePlaceThing,
  rowEligibleForChatPlaceBackfill,
} from '../src/vacation/chat-intake-place-persist.mjs';
import { searchPlaces } from '../src/vacation/place-search.mjs';

function databaseUrl(env = process.env) {
  return String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim();
}

function assertStagingBackfillAllowed(env = process.env) {
  const url = databaseUrl(env).toLowerCase();
  if (!url) throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');
  if (env.TIMESYNCHER_ALLOW_CHAT_PLACE_BACKFILL === '1') return;
  if ((/\bprod\b|production/.test(url) || url.includes('-prod.') || url.includes('_prod_')) && !url.includes('staging')) {
    throw new Error('backfill refused on production database');
  }
  if (!url.includes('staging') && env.TIMESYNCHER_ENV !== 'staging') {
    throw new Error('backfill requires staging DATABASE_URL or TIMESYNCHER_ENV=staging');
  }
}

export async function runChatIntakePlaceBackfill({
  db,
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
  limit = 5000,
} = {}) {
  assertStagingBackfillAllowed(env);
  const rows = await db`
    select tt.id, tt.trip_id, tt.category, tt.title, tt.description, tt.location, tt.metadata, tt.source, tt.starts_at,
           t.destination
    from trip_things tt
    join trips t on t.id = tt.trip_id
    order by tt.created_at asc
    limit ${Number(limit) || 5000}
  `;
  const counts = { scanned: 0, searched: 0, found: 0, unresolved: 0, skipped: 0 };
  for (const row of rows) {
    counts.scanned += 1;
    if (!rowEligibleForChatPlaceBackfill(row)) {
      counts.skipped += 1;
      continue;
    }
    counts.searched += 1;
    const saved = await persistChatIntakePlaceThing(db, {
      tripId: row.trip_id,
      requestId: null,
      category: row.category,
      title: row.title,
      description: row.description || '',
      metadata: row.metadata || {},
      startsAt: row.starts_at || null,
      destinationHint: row.destination || '',
      env,
      fetchImpl,
      searchImpl,
    });
    const loc = saved?.location && typeof saved.location === 'object' ? saved.location : {};
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) counts.found += 1;
    else counts.unresolved += 1;
  }
  return counts;
}

async function main() {
  if (!process.argv.includes('--backfill-chat-places')) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'pass --backfill-chat-places to run staging backfill',
    }));
    return;
  }
  const url = databaseUrl();
  const db = neon(url);
  const counts = await runChatIntakePlaceBackfill({ db, env: process.env });
  console.log(JSON.stringify({ ok: true, counts }));
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
}
