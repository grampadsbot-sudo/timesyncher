#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';
import {
  buildPr336VkSearchPlacesByRowId,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { NYC_GATE_B_TRIP_ID } from '../src/vacation/shared-trip-dossier-keys.mjs';
import {
  loadTripPlaceDossiersFromDisk,
  tripPlaceDossierKey,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { searchPlaceOutputViolations } from '../src/vacation/search-place-output.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const jobDir = process.env.PASSB_687_JOB_DIR
  || '/home/ubishere9995/tsv-work/passb-687-20261026T0445-job';

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    return `unknown:${String(error?.message || error)}`;
  }
}

function normCategory(cat) {
  const c = String(cat || '').toLowerCase();
  if (c === 'activity' || c === 'event' || c === 'attraction') return 'attraction';
  return c;
}

function inventoryFromRows(rows) {
  const byType = {};
  for (const row of rows) {
    const t = normCategory(row.cat);
    byType[t] = (byType[t] || 0) + 1;
  }
  return { total: rows.length, byType };
}

function dossierPresent(dossier) {
  return Boolean(
    dossier
    && Array.isArray(dossier.pages)
    && dossier.pages.length > 0
    && Array.isArray(dossier.attempts)
    && dossier.attempts.length > 0,
  );
}

function dossierPresented(dossier, place) {
  if (!dossierPresent(dossier)) return false;
  const counts = computeDossierFieldCounts(dossier, place);
  const summaryOk = counts.summary?.status === 'ok';
  const descOk = counts.description?.status === 'ok';
  const placeViolations = searchPlaceOutputViolations({
    ...place,
    title: place.title || place.name,
    category: place.category || place.cat,
  });
  const hardPresented = placeViolations.length === 0;
  return summaryOk && descOk && hardPresented;
}

function localDossierDir() {
  return process.env.TIMESYNCHER_THING_EVIDENCE_DOSSIER_DIR
    || join(repoRoot, 'runtime', 'thing-evidence-dossiers');
}

function countDossiersWithPages() {
  const dir = localDossierDir();
  if (!existsSync(dir)) return { dir, count: 0, withPages: 0 };
  let withPages = 0;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const row = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const payload = row.payload || row;
      if (payload?.pages?.length) withPages += 1;
    } catch {
      continue;
    }
  }
  return { dir, count: files.length, withPages };
}

function scoreByType(rows, placesById, dossiersByPlaceId) {
  const buckets = {};
  for (const row of rows) {
    const t = normCategory(row.cat);
    if (!buckets[t]) buckets[t] = { present: 0, presented: 0, total: 0 };
    buckets[t].total += 1;
    const place = placesById[String(row.id)] || { title: row.name, category: row.cat };
    const dossier = dossiersByPlaceId[row.id];
    if (dossierPresent(dossier)) buckets[t].present += 1;
    if (dossierPresented(dossier, place)) buckets[t].presented += 1;
  }
  const out = {};
  for (const [type, bucket] of Object.entries(buckets)) {
    out[type] = {
      total: bucket.total,
      present: bucket.present,
      presented: bucket.presented,
      presentPct: bucket.total ? Math.round((100 * bucket.present) / bucket.total) : 0,
      presentedPct: bucket.total ? Math.round((100 * bucket.presented) / bucket.total) : 0,
    };
  }
  return out;
}

const rows = buildNycCraigKimDaybydayFixtureRows();
const placesById = buildPr336VkSearchPlacesByRowId(rows);
const placeIds = rows.map((r) => r.id);
const dossiersByPlaceId = loadTripPlaceDossiersFromDisk(placeIds, NYC_GATE_B_TRIP_ID);
const dossierStore = countDossiersWithPages();

const metrics = {
  job: 'passb-687-20261026T0445',
  lane: 'cursor-ubuntu',
  startingHead: process.env.PASSB_START_HEAD || 'dfe1df457c12d433c4f7ba38f97698cbdd28b6d9',
  resultingHead: gitHead(),
  generatedAt: new Date().toISOString(),
  inventory: inventoryFromRows(rows),
  targets: {
    total: 94,
    byType: {
      hotel: 22,
      flight: 16,
      store: 15,
      attraction: 15,
      restaurant: 25,
      car: 1,
    },
    source: 'bot-admin/messages/time-syncher/eggbot-thing-dossier-central-db-nyc-20261025',
  },
  dossierStore,
  byType: scoreByType(rows, placesById, dossiersByPlaceId),
  errors: [],
};

if (!process.env.XAI_API_KEY) {
  metrics.errors.push({
    code: 'missing_xai_api_key',
    message: 'XAI_API_KEY unset in worker shell; host must run build_nyc_thing_evidence_dossiers.mjs with sanctioned creds',
  });
}
if (!process.env.BRAVE_API_KEY) {
  metrics.errors.push({
    code: 'missing_brave_api_key',
    message: 'BRAVE_API_KEY unset in worker shell; gap capture requires host credential loader',
  });
}

const outPath = join(jobDir, 'PASSB-METRICS.json');
writeFileSync(outPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outPath, restaurantCount: metrics.inventory.byType.restaurant || 0 }, null, 2));
