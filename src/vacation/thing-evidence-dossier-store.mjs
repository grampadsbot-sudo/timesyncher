import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hasDatabase, sql } from './db.mjs';
import { computeDossierFieldHashes } from './thing-dossier-fields.mjs';
import { dossierPagesVerified } from './thing-evidence-dossier.mjs';

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

export async function loadThingEvidenceDossier(dossierKey, { env = process.env, storeImpl } = {}) {
  const key = String(dossierKey || '').trim();
  if (!key) return null;
  const store = storeImpl || getThingEvidenceDossierStore(env);
  const dossier = await store.getDossier(key);
  if (!dossier || !dossierPagesVerified(dossier)) return dossier;
  return dossier;
}

export async function saveThingEvidenceDossier(dossierKey, dossier, { env = process.env, storeImpl } = {}) {
  const key = String(dossierKey || '').trim();
  if (!key || !dossier || typeof dossier !== 'object') return;
  const store = storeImpl || getThingEvidenceDossierStore(env);
  await store.putDossier(key, dossier);
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
  return readLocalThingEvidenceDossier(dossierKey, env);
}

export async function loadDossiersByKeys(keyByPlaceId = {}, { env = process.env, storeImpl } = {}) {
  const out = {};
  for (const [placeId, dossierKey] of Object.entries(keyByPlaceId)) {
    const dossier = await loadThingEvidenceDossier(dossierKey, { env, storeImpl });
    if (dossier) out[placeId] = dossier;
  }
  return out;
}

