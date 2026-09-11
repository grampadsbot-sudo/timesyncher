import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hasDatabase, sql } from './db.mjs';
import {
  newBindingId,
  sniffMediaType,
  toPublicBinding,
} from './thing-media-bind.mjs';

const BLOB_PREFIX = 'thing-media-bindings';

function localIndexPath(env = process.env) {
  return env.TIMESYNCHER_THING_MEDIA_INDEX || join(process.cwd(), 'runtime', 'thing-media-bindings.json');
}

function publicIndexPath() {
  return join(process.cwd(), 'public', 'ts-thing-media', 'bindings.json');
}

function readJsonFile(path) {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.bindings) ? parsed.bindings : []);
  } catch {
    return [];
  }
}

async function ensureNeonSchema(db) {
  await db`
    create table if not exists thing_media_bindings (
      id uuid primary key default gen_random_uuid(),
      share_token text not null,
      trek_trip_id integer,
      trek_place_id integer not null,
      trek_day_id integer,
      day_number integer,
      thing_name text,
      caption text,
      media_kind text not null default 'photo',
      mime_type text,
      original_name text,
      file_size_bytes bigint,
      public_url text not null,
      storage_provider text not null default 'url',
      storage_pathname text,
      trek_apply_status text not null default 'pending',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await db`alter table thing_media_bindings add column if not exists file_bytes bytea`;
}

function hasBlob(env = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN || env.VERCEL_BLOB_STORE_ID);
}

export async function putMediaBlob(buffer, { pathname, contentType, env = process.env }) {
  if (!hasBlob(env)) return null;
  try {
    const { put } = await import('@vercel/blob');
    return await put(pathname, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });
  } catch {
    return null;
  }
}

async function readBlobIndex(shareToken, env = process.env) {
  if (!hasBlob(env)) return [];
  try {
    const { get } = await import('@vercel/blob');
    const result = await get(`${BLOB_PREFIX}/${shareToken}.json`, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const parsed = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBlobIndex(shareToken, bindings, env = process.env) {
  if (!hasBlob(env)) return null;
  const { put } = await import('@vercel/blob');
  return await put(`${BLOB_PREFIX}/${shareToken}.json`, `${JSON.stringify(bindings, null, 2)}\n`, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

function writeLocalIndex(bindings, env = process.env) {
  const path = localIndexPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(bindings, null, 2)}\n`);
  return path;
}

export function loadPublicBindings(shareToken) {
  return readJsonFile(publicIndexPath())
    .map(toPublicBinding)
    .filter((row) => row.shareToken === shareToken);
}

export async function listBindings(shareToken, env = process.env) {
  const token = String(shareToken || '').trim();
  const collected = [];
  const seen = new Set();
  const push = (row) => {
    const binding = toPublicBinding(row);
    const key = binding.id || `${binding.thingId}:${binding.publicUrl}`;
    if (!binding.publicUrl || seen.has(key)) return;
    seen.add(key);
    collected.push(binding);
  };

  if (hasDatabase(env)) {
    try {
      const db = sql(env);
      await ensureNeonSchema(db);
      const rows = await db`
        select * from thing_media_bindings
        where share_token = ${token}
        order by created_at desc
      `;
      rows.forEach(push);
    } catch {
      // fall through to blob/public
    }
  }

  (await readBlobIndex(token, env)).forEach(push);
  readJsonFile(localIndexPath(env)).forEach((row) => {
    if (toPublicBinding(row).shareToken === token) push(row);
  });
  loadPublicBindings(token).forEach(push);
  return collected;
}

export async function saveBinding(binding, env = process.env, { bytes = null } = {}) {
  const row = {
    id: binding.id || newBindingId(),
    shareToken: binding.shareToken,
    trekTripId: binding.trekTripId,
    thingId: binding.thingId,
    dayId: binding.dayId,
    dayNumber: binding.dayNumber,
    thingName: binding.thingName,
    caption: binding.caption,
    mediaKind: binding.mediaKind || 'photo',
    mimeType: binding.mimeType,
    originalName: binding.originalName,
    fileSizeBytes: binding.fileSizeBytes,
    publicUrl: binding.publicUrl,
    storageProvider: binding.storageProvider,
    storagePathname: binding.storagePathname || null,
    trekApplyStatus: binding.trekApplyStatus || 'pending',
    createdAt: binding.createdAt || new Date().toISOString(),
  };

  const stored = { neon: false, neonBytes: false, blob: false, local: false };
  const fileBytes = bytes && bytes.length ? bytes : null;

  if (hasDatabase(env)) {
    const db = sql(env);
    await ensureNeonSchema(db);
    await db`
      insert into thing_media_bindings (
        id, share_token, trek_trip_id, trek_place_id, trek_day_id, day_number,
        thing_name, caption, media_kind, mime_type, original_name, file_size_bytes,
        public_url, storage_provider, storage_pathname, trek_apply_status, metadata, file_bytes
      ) values (
        ${row.id}, ${row.shareToken}, ${row.trekTripId}, ${row.thingId}, ${row.dayId}, ${row.dayNumber},
        ${row.thingName}, ${row.caption}, ${row.mediaKind}, ${row.mimeType}, ${row.originalName}, ${row.fileSizeBytes},
        ${row.publicUrl}, ${row.storageProvider}, ${row.storagePathname}, ${row.trekApplyStatus}, ${{ source: 'bind-thing-media' }},
        ${fileBytes}
      )
      on conflict (id) do update set
        public_url = excluded.public_url,
        file_bytes = coalesce(excluded.file_bytes, thing_media_bindings.file_bytes),
        trek_apply_status = excluded.trek_apply_status,
        updated_at = now()
    `;
    stored.neon = true;
    stored.neonBytes = Boolean(fileBytes);
  }

  if (hasBlob(env)) {
    try {
      const existing = await readBlobIndex(row.shareToken, env);
      const next = [row, ...existing.filter((item) => item.id !== row.id)];
      await writeBlobIndex(row.shareToken, next, env);
      stored.blob = true;
    } catch {
      stored.blob = false;
    }
  }

  try {
    const local = [row, ...readJsonFile(localIndexPath(env)).filter((item) => item.id !== row.id)];
    writeLocalIndex(local, env);
    stored.local = true;
  } catch {
    stored.local = false;
  }

  return { binding: toPublicBinding(row), stored };
}

function bytesFromNeon(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') {
    const hex = value.startsWith('\\x') ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) return Buffer.from(hex, 'hex');
    return Buffer.from(value, 'base64');
  }
  return null;
}

export async function getBindingMedia(shareToken, id, env = process.env) {
  if (!hasDatabase(env) || !shareToken || !id) return null;
  const db = sql(env);
  await ensureNeonSchema(db);
  const rows = await db`
    select mime_type, original_name, file_bytes
    from thing_media_bindings
    where share_token = ${shareToken} and id = ${id}
    limit 1
  `;
  const row = rows[0];
  const bytes = bytesFromNeon(row?.file_bytes);
  if (!row || !bytes) return null;
  const originalName = row.original_name || 'media';
  return {
    bytes,
    mimeType: sniffMediaType(bytes, originalName, row.mime_type || ''),
    originalName,
  };
}
