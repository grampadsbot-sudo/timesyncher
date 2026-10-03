import crypto from 'node:crypto';

import { hasDatabase, sql } from '../src/vacation/db.mjs';
import { newBindingId, neonRawMediaPath, sniffMediaType } from '../src/vacation/thing-media-bind.mjs';
import { saveBinding } from '../src/vacation/thing-media-store.mjs';

const SMOKE_BIND_MEDIA_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function seedEnvWithoutBlob(env = process.env) {
  const next = { ...env };
  delete next.BLOB_READ_WRITE_TOKEN;
  delete next.VERCEL_BLOB_STORE_ID;
  return next;
}

export function buildSmokeBindThingMediaSeed({ base } = {}) {
  const shareToken = `smoke-bind-media-${crypto.randomBytes(8).toString('hex')}`;
  const bindingId = newBindingId();
  const origin = String(base || '').replace(/\/+$/, '');
  const seededUrl = `${origin}${neonRawMediaPath(shareToken, bindingId)}`;
  const originalName = 'smoke-bind-media.png';
  const mimeType = sniffMediaType(SMOKE_BIND_MEDIA_BYTES, originalName, 'image/png');
  return {
    shareToken,
    bindingId,
    seededUrl,
    bytes: SMOKE_BIND_MEDIA_BYTES,
    mimeType,
    originalName,
  };
}

export async function insertSmokeBindThingMediaSeed({ base, env = process.env }) {
  const seedEnv = seedEnvWithoutBlob(env);
  if (!hasDatabase(seedEnv)) {
    return { ok: false, reason: 'bind_thing_media_seed_missing_database_url' };
  }
  const seed = buildSmokeBindThingMediaSeed({ base });
  try {
    const { stored } = await saveBinding({
      id: seed.bindingId,
      shareToken: seed.shareToken,
      trekTripId: null,
      thingId: 0,
      thingName: 'smoke-bind-media',
      caption: 'harness bind-thing-media cache fixture',
      mediaKind: 'photo',
      mimeType: seed.mimeType,
      originalName: seed.originalName,
      fileSizeBytes: seed.bytes.length,
      publicUrl: seed.seededUrl,
      storageProvider: 'neon',
      storagePathname: null,
      trekApplyStatus: 'skipped',
    }, seedEnv, { bytes: seed.bytes });
    if (!stored.neonBytes) {
      return { ok: false, reason: 'bind_thing_media_seed_neon_bytes_not_stored', seed };
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'bind_thing_media_seed_insert_failed',
      error: String(error?.message || error),
      seed,
    };
  }
  return { ok: true, seed };
}

export async function deleteSmokeBindThingMediaSeed(seed, env = process.env) {
  if (!seed?.shareToken || !seed?.bindingId || !hasDatabase(env)) return;
  const db = sql(seedEnvWithoutBlob(env));
  await db`delete from thing_media_bindings where share_token = ${seed.shareToken} and id = ${seed.bindingId}`;
}
