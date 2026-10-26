import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import { hasDatabase, sql } from './db.mjs';
import { NYC_GATE_B_TRIP_ID } from './shared-trip-dossier-keys.mjs';
import { computeDossierFieldHashes } from './thing-dossier-fields.mjs';
import { dossierPagesVerified, mergeDossierPages } from './thing-evidence-dossier.mjs';

let storeOverride = null;
let postgresStoreClient = null;

export function useThingEvidenceDossierStore(store) {
  storeOverride = store || null;
  if (!store) postgresStoreClient = null;
}

function localIndexDir(env = process.env) {
  return env.TIMESYNCHER_THING_EVIDENCE_DOSSIER_DIR
    || join(process.cwd(), 'runtime', 'thing-evidence-dossiers');
}

function localDossierPath(key, env = process.env) {
  const safe = String(key || '').replace(/[^a-zA-Z0-9._:-]+/g, '_');
  return join(localIndexDir(env), `${safe}.json`);
}

function readLocalDossier(key, env = process.env) {
  const path = localDossierPath(key, env);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalDossier(key, row, env = process.env) {
  const path = localDossierPath(key, env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(row, null, 2)}\n`, 'utf8');
}

async function ensurePostgresSchema(db) {
  await db`
    create table if not exists thing_evidence_dossiers (
      dossier_key text primary key,
      thing_name text not null default '',
      payload jsonb not null,
      field_hashes jsonb not null default '{}'::jsonb,
      field_sources jsonb not null default '{}'::jsonb,
      refreshed_at timestamptz not null default now()
    )
  `;
}

function createPostgresDossierStore(env) {
  const db = sql(env);
  let schemaReady = false;
  async function ready() {
    if (!schemaReady) {
      await ensurePostgresSchema(db);
      schemaReady = true;
    }
  }
  return {
    async getDossier(dossierKey) {
      const key = String(dossierKey || '').trim();
      if (!key) return null;
      await ready();
      const rows = await db`
        select payload, field_hashes, field_sources, refreshed_at
        from thing_evidence_dossiers
        where dossier_key = ${key}
        limit 1
      `;
      const row = rows?.[0];
      if (!row?.payload) return null;
      const dossier = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      dossier.fieldHashes = row.field_hashes && typeof row.field_hashes === 'object' ? row.field_hashes : {};
      dossier.fieldSources = row.field_sources && typeof row.field_sources === 'object' ? row.field_sources : {};
      dossier.refreshedAt = row.refreshed_at;
      return dossier;
    },
    async putDossier(dossierKey, dossier) {
      const key = String(dossierKey || '').trim();
      if (!key || !dossier || typeof dossier !== 'object') return;
      await ready();
      const { hashes, sources } = computeDossierFieldHashes(dossier);
      const payload = { ...dossier };
      delete payload.fieldHashes;
      delete payload.fieldSources;
      delete payload.refreshedAt;
      await db`
        insert into thing_evidence_dossiers (dossier_key, thing_name, payload, field_hashes, field_sources, refreshed_at)
        values (
          ${key},
          ${String(dossier.thing || '')},
          ${JSON.stringify(payload)}::jsonb,
          ${JSON.stringify(hashes)}::jsonb,
          ${JSON.stringify(sources)}::jsonb,
          now()
        )
        on conflict (dossier_key) do update
        set thing_name = excluded.thing_name,
            payload = excluded.payload,
            field_hashes = excluded.field_hashes,
            field_sources = excluded.field_sources,
            refreshed_at = now()
      `;
    },
  };
}

function createLocalDossierStore(env) {
  return {
    async getDossier(dossierKey) {
      const key = String(dossierKey || '').trim();
      if (!key) return null;
      const row = readLocalDossier(key, env);
      if (!row?.payload) return null;
      const dossier = row.payload;
      dossier.fieldHashes = row.fieldHashes || {};
      dossier.fieldSources = row.fieldSources || {};
      dossier.refreshedAt = row.refreshedAt || null;
      return dossier;
    },
    async putDossier(dossierKey, dossier) {
      const key = String(dossierKey || '').trim();
      if (!key || !dossier || typeof dossier !== 'object') return;
      const { hashes, sources } = computeDossierFieldHashes(dossier);
      const payload = { ...dossier };
      delete payload.fieldHashes;
      delete payload.fieldSources;
      delete payload.refreshedAt;
      writeLocalDossier(key, {
        payload,
        fieldHashes: hashes,
        fieldSources: sources,
        refreshedAt: new Date().toISOString(),
      }, env);
    },
  };
}

function getThingEvidenceDossierStore(env = process.env) {
  if (storeOverride) return storeOverride;
  if (hasDatabase(env)) {
    if (!postgresStoreClient) postgresStoreClient = createPostgresDossierStore(env);
    return postgresStoreClient;
  }
  return createLocalDossierStore(env);
}

export function thingEvidenceDossierKey(place = {}) {
  const tripId = place.trip_id ?? place.tripId;
  const placeId = place.id ?? place.placeId;
  if (tripId != null && placeId != null) return `trip:${tripId}:place:${placeId}`;
  const name = String(place.title || place.name || '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return '';
}

function nycDaybydayDossierKey(rowId) {
  const id = Number(rowId);
  if (!Number.isInteger(id) || id <= 0) return '';
  return `nyc-daybyday:${id}`;
}

export function tripPlaceDossierKey(tripId, placeId) {
  return thingEvidenceDossierKey({ trip_id: tripId, id: placeId });
}

export async function bindSharedThingEvidenceDossier(place = {}, { env = process.env, storeImpl } = {}) {
  const tripKey = thingEvidenceDossierKey(place);
  const rawCategory = place.category?.name || place.category || place.category_name;
  const category = ['event', 'activity', 'attraction'].includes(rawCategory) ? 'attraction' : rawCategory;
  if (!['hotel', 'restaurant', 'store', 'attraction'].includes(category)) return tripKey;
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const title = normalize(place.title || place.name);
  const address = normalize(place.address || place.sourceRecord?.address);
  const website = normalize(place.url || place.website || place.sourceRecord?.website);
  const tripId = place.trip_id ?? place.tripId;
  if (!title || (!address && !website) || tripId == null || (place.id ?? place.placeId) == null) return tripKey;
  const identity = JSON.stringify({ category, title, address, website });
  const sharedKey = `shared:${category}:${createHash('sha256').update(identity).digest('hex')}`;
  const store = storeImpl || getThingEvidenceDossierStore(env);
  const current = await store.getDossier(sharedKey);
  const attached = await loadThingEvidenceDossierResolved(tripKey, { env, storeImpl: store, placeId: place.id ?? place.placeId });
  let dossier = current || attached.dossier || { thing: place.title || place.name, pages: [], attempts: [] };
  if (current && attached.dossier && attached.dossierKey !== sharedKey) {
    const urls = new Set((current.pages || []).map((page) => page.url));
    dossier = mergeDossierPages(current, {
      pages: (attached.dossier.pages || []).filter((page) => !urls.has(page.url)),
      attempts: attached.dossier.attempts || [],
      braveResults: attached.dossier.braveResults || [],
    });
  }
  const tripIds = [...new Set([...(dossier.tripIds || []), String(tripId)])];
  await store.putDossier(sharedKey, { ...dossier, tripIds, tripUseCount: tripIds.length });
  await store.putDossier(tripKey, { sharedDossierKey: sharedKey });
  return sharedKey;
}

export async function loadThingEvidenceDossier(dossierKey, { env = process.env, storeImpl } = {}) {
  const key = String(dossierKey || '').trim();
  if (!key) return null;
  const store = storeImpl || getThingEvidenceDossierStore(env);
  let dossier = await store.getDossier(key);
  if (dossier?.sharedDossierKey?.startsWith('shared:')) dossier = await store.getDossier(dossier.sharedDossierKey);
  if (!dossier || !dossierPagesVerified(dossier)) return dossier;
  return dossier;
}

export async function loadThingEvidenceDossierResolved(key, { env = process.env, storeImpl, placeId = null } = {}) {
  const store = storeImpl || getThingEvidenceDossierStore(env);
  const attached = await store.getDossier(key);
  const primary = await loadThingEvidenceDossier(key, { env, storeImpl });
  if (primary?.pages?.length) return { dossier: primary, dossierKey: attached?.sharedDossierKey || key };
  const id = Number(placeId);
  if (Number.isInteger(id) && id > 0) {
    const legacyKey = nycDaybydayDossierKey(id);
    if (legacyKey && legacyKey !== key) {
      const legacy = await loadThingEvidenceDossier(legacyKey, { env, storeImpl });
      if (legacy?.pages?.length) return { dossier: legacy, dossierKey: key, legacyKey };
    }
  }
  return { dossier: primary, dossierKey: attached?.sharedDossierKey || key };
}

export async function saveThingEvidenceDossier(dossierKey, dossier, { env = process.env, storeImpl } = {}) {
  const key = String(dossierKey || '').trim();
  if (!key || !dossier || typeof dossier !== 'object') return;
  const store = storeImpl || getThingEvidenceDossierStore(env);
  const attached = await store.getDossier(key);
  await store.putDossier(attached?.sharedDossierKey?.startsWith('shared:') ? attached.sharedDossierKey : key, dossier);
}

function readLocalThingEvidenceDossier(dossierKey, env = process.env) {
  const key = String(dossierKey || '').trim();
  if (!key) return null;
  const row = readLocalDossier(key, env);
  if (!row?.payload) return null;
  const dossier = row.payload;
  dossier.fieldHashes = row.fieldHashes || {};
  dossier.fieldSources = row.fieldSources || {};
  dossier.refreshedAt = row.refreshedAt || null;
  return dossier;
}

function readStoredDossierSync(dossierKey, env = process.env) {
  const dossier = readLocalThingEvidenceDossier(dossierKey, env);
  return dossier?.sharedDossierKey?.startsWith('shared:')
    ? readLocalThingEvidenceDossier(dossier.sharedDossierKey, env)
    : dossier;
}

export async function loadDossiersByKeys(keyByPlaceId = {}, { env = process.env, storeImpl } = {}) {
  const out = {};
  for (const [placeId, dossierKey] of Object.entries(keyByPlaceId)) {
    const { dossier } = await loadThingEvidenceDossierResolved(dossierKey, { env, storeImpl, placeId });
    if (dossier?.pages?.length) out[placeId] = dossier;
  }
  return out;
}

export function loadTripPlaceDossiersFromDisk(placeIds = [], tripId = NYC_GATE_B_TRIP_ID, env = process.env) {
  const out = {};
  for (const placeId of placeIds) {
    let dossier = readStoredDossierSync(tripPlaceDossierKey(tripId, placeId), env);
    if (!dossier?.pages?.length) {
      dossier = readStoredDossierSync(nycDaybydayDossierKey(placeId), env);
    }
    if (dossier?.pages?.length) out[placeId] = dossier;
  }
  return out;
}

export async function loadTripPlaceDossiersFromStore(placeIds = [], {
  tripId = NYC_GATE_B_TRIP_ID,
  env = process.env,
  storeImpl,
} = {}) {
  const out = {};
  for (const placeId of placeIds) {
    const key = tripPlaceDossierKey(tripId, placeId);
    const { dossier } = await loadThingEvidenceDossierResolved(key, { env, storeImpl, placeId });
    if (dossier?.pages?.length) out[placeId] = dossier;
  }
  return out;
}
