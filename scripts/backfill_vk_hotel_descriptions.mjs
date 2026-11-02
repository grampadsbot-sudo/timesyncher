#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { upgradeTripThingInPlace } from '../src/vacation/chat-intake-place-persist.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
import { isGenericDescription } from '../src/vacation/trip-thing-enrichment.mjs';
import { tripThingRow } from '../src/vacation/trip-things.mjs';
import { enrichSearchPlaceHotelSourceRecord } from '../src/vacation/xai-sourced-hotel-description.mjs';

function clean(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return clean(value, 4000).split(/\s+/).filter(Boolean).length;
}

function databaseUrl(env = process.env) {
  return String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim();
}

function assertStagingBackfillAllowed(env = process.env) {
  const url = databaseUrl(env).toLowerCase();
  if (!url) throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');
  if (env.TIMESYNCHER_ALLOW_VK_HOTEL_DESCRIPTION_BACKFILL === '1') return;
  if ((/\bprod\b|production/.test(url) || url.includes('-prod.') || url.includes('_prod_')) && !url.includes('staging')) {
    throw new Error('backfill refused on production database');
  }
  if (!url.includes('staging') && env.TIMESYNCHER_ENV !== 'staging') {
    throw new Error('backfill requires staging DATABASE_URL or TIMESYNCHER_ENV=staging');
  }
}

function isHotelTripThingCategory(category = '') {
  const cat = clean(category, 80).toLowerCase();
  return cat === 'hotel' || cat === 'lodging';
}

export function hotelTripThingNeedsDescriptionBackfill(description = '', title = '') {
  const body = clean(description, 4000);
  if (!body) return true;
  if (isGenericDescription(body)) return true;
  if (!descriptionPassesDetailJudge(body, title)) return true;
  return false;
}

function hotelSourceRecordHasSourcedFields(record = {}) {
  if (!record || typeof record !== 'object') return false;
  const existing = clean(record.longDetails || record.details || record.description || record.summary, 4000);
  if (existing && !isGenericDescription(existing) && wordCount(existing) >= 10) return true;
  if (clean(record.websiteFlavour, 800)) return true;
  if (clean(record.neighborhood || record.area, 160)) return true;
  const themes = record.reviewThemes && typeof record.reviewThemes === 'object' ? record.reviewThemes : {};
  if (Array.isArray(themes.praise) && themes.praise.some((row) => clean(row, 240))) return true;
  if (clean(record.googleRating) || clean(record.yelpRating) || clean(record.thirdPartyRating)) return true;
  return false;
}

function locationAddress(row = {}) {
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  return clean(loc.address, 240);
}

function preserveSourceRecordPrices(next = {}, prior = {}) {
  const out = { ...next };
  if (Object.prototype.hasOwnProperty.call(prior, 'price')) out.price = prior.price;
  if (Object.prototype.hasOwnProperty.call(prior, 'nightlyRate')) out.nightlyRate = prior.nightlyRate;
  if (Object.prototype.hasOwnProperty.call(prior, 'rate')) out.rate = prior.rate;
  return out;
}

export function planVkHotelDescriptionBackfill(row = {}) {
  const title = clean(row.title, 240);
  if (!title || !isHotelTripThingCategory(row.category)) {
    return { action: 'skip', title, reason: 'not_hotel' };
  }
  const priorDescription = clean(row.description, 4000);
  if (!hotelTripThingNeedsDescriptionBackfill(priorDescription, title)) {
    return { action: 'unchanged', title };
  }
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const priorRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  if (!hotelSourceRecordHasSourcedFields(priorRecord)) {
    return { action: 'no_source', title };
  }
  const address = locationAddress(row) || clean(priorRecord.address, 240);
  const enrichedRecord = enrichSearchPlaceHotelSourceRecord({ ...priorRecord }, {
    title,
    category: row.category,
    address,
  });
  const nextRecord = preserveSourceRecordPrices(enrichedRecord, priorRecord);
  const nextDescription = clean(nextRecord.description || nextRecord.longDetails, 4000);
  if (
    !nextDescription
    || !descriptionPassesDetailJudge(nextDescription, title)
    || nextDescription === priorDescription
  ) {
    return { action: 'no_source', title };
  }
  const nextMeta = {
    ...meta,
    sourceRecord: nextRecord,
  };
  if (Object.prototype.hasOwnProperty.call(meta, 'price')) {
    nextMeta.price = meta.price;
  }
  const thing = tripThingRow({
    category: row.category,
    title,
    description: nextDescription,
    location: row.location || {},
    metadata: nextMeta,
    source: row.source,
    starts_at: row.starts_at,
  });
  if (!thing) return { action: 'no_source', title };
  return {
    action: 'write',
    title,
    thing,
    priorDescription,
    nextDescription,
  };
}

export async function runVkHotelDescriptionBackfill({
  db,
  tripId,
  env = process.env,
  dryRun = true,
  limit = 500,
} = {}) {
  assertStagingBackfillAllowed(env);
  const normalizedTripId = clean(tripId, 80);
  if (!normalizedTripId) throw new Error('tripId is required');
  const rows = await db`
    select id, trip_id, category, title, description, location, metadata, source, starts_at
    from trip_things
    where trip_id = ${normalizedTripId}::uuid
      and lower(category) in ('hotel', 'lodging')
    order by created_at asc
    limit ${Number(limit) || 500}
  `;
  const counts = {
    scanned: 0,
    unchanged: 0,
    skipped: 0,
    wouldWrite: 0,
    written: 0,
    noSource: 0,
    dryRun: dryRun === true,
  };
  const noSourceTitles = [];
  for (const row of rows) {
    counts.scanned += 1;
    const plan = planVkHotelDescriptionBackfill(row);
    if (plan.action === 'skip') {
      counts.skipped += 1;
      continue;
    }
    if (plan.action === 'unchanged') {
      counts.unchanged += 1;
      continue;
    }
    if (plan.action === 'no_source') {
      counts.noSource += 1;
      noSourceTitles.push(plan.title);
      continue;
    }
    counts.wouldWrite += 1;
    if (dryRun) continue;
    await upgradeTripThingInPlace(db, row.trip_id, row.id, null, plan.thing, env);
    counts.written += 1;
  }
  return { counts, noSourceTitles };
}

function tripIdFromArgv(argv = process.argv) {
  for (const arg of argv) {
    if (arg.startsWith('--trip-id=')) return arg.slice('--trip-id='.length).trim();
  }
  return clean(process.env.TRIP_ID || process.env.TIMESYNCHER_TRIP_ID, 80);
}

async function main() {
  if (!process.argv.includes('--backfill-vk-hotel-descriptions')) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'pass --backfill-vk-hotel-descriptions and --trip-id=<uuid> to run staging backfill',
    }));
    return;
  }
  const tripId = tripIdFromArgv();
  if (!tripId) throw new Error('--trip-id=<uuid> is required');
  const dryRun = !process.argv.includes('--apply');
  const url = databaseUrl();
  const db = neon(url);
  const result = await runVkHotelDescriptionBackfill({
    db,
    tripId,
    env: process.env,
    dryRun,
  });
  console.log(JSON.stringify({ ok: true, tripId, ...result }));
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
}
