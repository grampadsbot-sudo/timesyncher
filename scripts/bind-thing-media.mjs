#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  FILENAME_THING_HINTS,
  THINGS_NOT_ON_VACATION3,
  TREK_SHARED_API_BASE,
  VACATION3_SHARE_TOKEN,
  guessThingNameFromFilename,
  mediaKindFromMime,
  mimeFromName,
  newBindingId,
  proofPngBuffer,
  resolveThingFromShared,
  toPublicBinding,
} from '../src/vacation/thing-media-bind.mjs';

function arg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function clean(value, max = 400) {
  return String(value || '').trim().slice(0, max);
}

async function fetchShared(shareToken, apiBase) {
  const url = `${apiBase.replace(/\/+$/, '')}/api/shared/${encodeURIComponent(shareToken)}/?_=${Date.now()}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Shared trip lookup failed (${response.status})`);
  return json;
}

function publicBindingsPath() {
  return path.join(process.cwd(), 'public', 'ts-thing-media', 'bindings.json');
}

function readPublicBindings() {
  const file = publicBindingsPath();
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function writePublicBindings(rows) {
  const file = publicBindingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
  return file;
}

function writePublicFile(shareToken, filename, bytes) {
  const dest = path.join(process.cwd(), 'public', 'ts-thing-media', shareToken, filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
  return {
    diskPath: dest,
    publicUrl: `/ts-thing-media/${encodeURIComponent(shareToken)}/${encodeURIComponent(filename)}`,
  };
}

function applyTrek(binding, bytes, filename) {
  const runtimeDir = process.env.TIMESYNCHER_TREK_RUNTIME_DIR || '/home/timesyncher-agent/trek/runtime';
  const container = process.env.TIMESYNCHER_TREK_CONTAINER || 'trek';
  const owner = process.env.TIMESYNCHER_TREK_DB_OWNER || 'ubishere9995';
  const destination = path.join(runtimeDir, 'uploads', 'photos', filename);
  const tmpPath = path.join('/tmp', `${process.pid}-${filename}`);
  fs.writeFileSync(tmpPath, bytes);
  fs.chmodSync(tmpPath, 0o644);
  const copy = spawnSync('sudo', ['-n', '-u', owner, 'cp', tmpPath, destination], { encoding: 'utf8' });
  if (copy.status !== 0) {
    throw new Error(`TREK copy failed: ${clean(copy.stderr || copy.stdout || 'sudo cp', 400)}`);
  }
  spawnSync('sudo', ['-n', '-u', owner, 'chmod', '644', destination], { encoding: 'utf8' });
  fs.rmSync(tmpPath, { force: true });

  const script = `
const Database = require('better-sqlite3');
const input = JSON.parse(process.env.ATTACH_JSON || '{}');
const db = new Database('/app/data/travel.db');
db.pragma('foreign_keys = ON');
const trip = db.prepare('SELECT t.id FROM trips t JOIN share_tokens st ON st.trip_id = t.id WHERE st.token = ?').get(input.token);
if (!trip) throw new Error('Trip token not found');
const place = db.prepare('SELECT id FROM places WHERE id = ? AND trip_id = ?').get(input.placeId, trip.id);
if (!place) throw new Error('Target Thing not found on trip');
const existing = db.prepare('SELECT * FROM photos WHERE filename = ?').get(input.filename);
if (!existing) {
  db.prepare('INSERT INTO photos (trip_id, day_id, place_id, filename, original_name, file_size, mime_type, caption, taken_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(trip.id, input.dayId || null, input.placeId, input.filename, input.originalName, input.fileSizeBytes, input.mimeType, input.caption, null);
}
console.log(JSON.stringify(db.prepare('SELECT * FROM photos WHERE filename = ?').get(input.filename)));
`;
  const insert = spawnSync('docker', [
    'exec',
    '-e',
    `ATTACH_JSON=${JSON.stringify({
      token: binding.shareToken,
      dayId: binding.dayId,
      placeId: binding.thingId,
      filename,
      originalName: binding.originalName,
      fileSizeBytes: binding.fileSizeBytes,
      mimeType: binding.mimeType,
      caption: binding.caption,
    })}`,
    '-u',
    'node',
    container,
    'node',
    '-e',
    script,
  ], { encoding: 'utf8' });
  if (insert.status !== 0) {
    throw new Error(`TREK sqlite insert failed: ${clean(insert.stderr || insert.stdout || 'docker exec', 400)}`);
  }
  return { destination, row: JSON.parse(insert.stdout.trim() || '{}') };
}

async function postApi(apiBase, token, payload, filePath) {
  const url = `${apiBase.replace(/\/+$/, '')}/api/bind-thing-media`;
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (filePath) {
    const bytes = fs.readFileSync(filePath);
    const form = new FormData();
    form.set('shareToken', payload.shareToken);
    if (payload.thingId) form.set('thingId', String(payload.thingId));
    if (payload.thingName) form.set('thingName', payload.thingName);
    if (payload.caption) form.set('caption', payload.caption);
    if (payload.sourceUrl) form.set('sourceUrl', payload.sourceUrl);
    form.set('file', new Blob([bytes], { type: payload.mimeType || mimeFromName(filePath) }), path.basename(filePath));
    const response = await fetch(url, { method: 'POST', headers, body: form });
    return { status: response.status, json: await response.json().catch(() => ({})) };
  }
  headers['content-type'] = 'application/json';
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

function collectFiles(fileArg, dirArg) {
  if (fileArg) return [path.resolve(fileArg)];
  if (dirArg) {
    const dir = path.resolve(dirArg);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => /\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i.test(name))
      .map((name) => path.join(dir, name));
  }
  return [];
}

async function bindOne({ shareToken, shared, thingName, thingId, filePath, sourceUrl, caption, writePublic, applyTrekHost, apiBase, apiToken }) {
  const thing = resolveThingFromShared(shared, { thingName, thingId });
  let bytes = null;
  let fileName = '';
  let mimeType = '';
  if (filePath) {
    bytes = fs.readFileSync(filePath);
    fileName = path.basename(filePath);
    mimeType = mimeFromName(fileName);
  } else if (sourceUrl) {
    fileName = decodeURIComponent(sourceUrl.split('/').pop() || 'remote-media');
    mimeType = mimeFromName(fileName);
  } else {
    throw new Error('Provide --file or --url');
  }

  const result = {
    thing,
    binding: null,
    publicWrite: null,
    api: null,
    trek: null,
  };

  if (writePublic && bytes) {
    const saved = writePublicFile(shareToken, fileName, bytes);
    const binding = toPublicBinding({
      id: newBindingId(),
      shareToken,
      trekTripId: thing.trekTripId,
      thingId: thing.thingId,
      dayId: thing.dayId,
      dayNumber: thing.dayNumber,
      thingName: thing.name,
      caption: caption || thing.name,
      mediaKind: mediaKindFromMime(mimeType),
      mimeType,
      originalName: fileName,
      fileSizeBytes: bytes.length,
      publicUrl: saved.publicUrl,
      storageProvider: 'public-repo',
      trekApplyStatus: applyTrekHost ? 'applied' : 'pending',
      createdAt: new Date().toISOString(),
    });
    const rows = [binding, ...readPublicBindings().filter((row) => !(row.shareToken === shareToken && row.thingId === thing.thingId && row.originalName === fileName))];
    writePublicBindings(rows);
    result.binding = binding;
    result.publicWrite = saved;
  }

  if (apiBase) {
    result.api = await postApi(apiBase, apiToken, {
      shareToken,
      thingId: thing.thingId,
      thingName: thing.name,
      sourceUrl,
      caption: caption || thing.name,
      mimeType,
    }, filePath || '');
    result.binding = result.api.json?.binding || result.binding;
  }

  if (applyTrekHost) {
    if (!bytes) throw new Error('--apply-trek requires a local --file');
    const filename = `${String(thing.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-${Date.now()}${path.extname(fileName) || '.jpg'}`;
    result.trek = applyTrek({
      shareToken,
      thingId: thing.thingId,
      dayId: thing.dayId,
      originalName: fileName,
      fileSizeBytes: bytes.length,
      mimeType,
      caption: caption || thing.name,
    }, bytes, filename);
    if (result.binding) result.binding.trekApplyStatus = 'applied';
  }

  return result;
}

async function main() {
  const shareToken = clean(arg('--share-token', arg('--token', VACATION3_SHARE_TOKEN)), 180);
  const thingName = clean(arg('--thing', arg('--thing-name')), 200);
  const thingId = clean(arg('--thing-id', arg('--place-id')), 20);
  const fileArg = arg('--file');
  const urlArg = arg('--url', arg('--source-url'));
  const dirArg = arg('--dir', arg('--media-dir'));
  const caption = clean(arg('--caption'), 400);
  const apiBase = arg('--api');
  const apiToken = arg('--bind-token', process.env.TIMESYNCHER_MEDIA_BIND_TOKEN || process.env.TIMESYNCHER_ADMIN_TOKEN || process.env.TIMESYNCHER_WORKER_TOKEN || '');
  const writePublic = hasFlag('--write-public') || (!apiBase && !hasFlag('--apply-trek'));
  const applyTrekHost = hasFlag('--apply-trek');
  const makeProof = hasFlag('--proof');
  const sharedBase = arg('--shared-api', process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || TREK_SHARED_API_BASE);

  const defaultMediaDir = '/workspace/sct-runs/story-draft-20260907/media';
  const files = collectFiles(fileArg, dirArg || (!fileArg && !urlArg && !makeProof && fs.existsSync(defaultMediaDir) ? defaultMediaDir : ''));

  if (makeProof && !files.length && !urlArg) {
    const proofName = 'carbone-bind-proof.png';
    const proofPath = path.join(process.cwd(), 'public', 'ts-thing-media', shareToken, proofName);
    fs.mkdirSync(path.dirname(proofPath), { recursive: true });
    fs.writeFileSync(proofPath, proofPngBuffer({ label: 'Carbone bind proof' }));
    files.push(proofPath);
  }

  if (!files.length && !urlArg) {
    const missing = THINGS_NOT_ON_VACATION3.map((item) => item.name).join(', ');
    throw new Error(`No media files found. Looked at --file/--dir and ${defaultMediaDir}. Filename hints: ${FILENAME_THING_HINTS.map((row) => row[1]).join(', ')}. Not on this trip yet (note only): ${missing}.`);
  }

  const shared = await fetchShared(shareToken, sharedBase);
  const outputs = [];
  const skipped = [];

  if (urlArg && !files.length) {
    outputs.push(await bindOne({
      shareToken,
      shared,
      thingName,
      thingId,
      filePath: '',
      sourceUrl: urlArg,
      caption,
      writePublic: false,
      applyTrekHost,
      apiBase,
      apiToken,
    }));
  }

  for (const filePath of files) {
    const guessed = guessThingNameFromFilename(filePath);
    if (guessed.missing && !thingName && !thingId) {
      skipped.push({ filePath, reason: `${guessed.thingName} is not on vacation-3 yet` });
      continue;
    }
    outputs.push(await bindOne({
      shareToken,
      shared,
      thingName: thingName || guessed.thingName,
      thingId,
      filePath,
      sourceUrl: urlArg,
      caption,
      writePublic,
      applyTrekHost,
      apiBase,
      apiToken,
    }));
  }

  console.log(JSON.stringify({
    ok: true,
    shareToken,
    count: outputs.length,
    skipped,
    results: outputs.map((row) => ({
      thingId: row.thing.thingId,
      thingName: row.thing.name,
      publicUrl: row.binding?.publicUrl || row.publicWrite?.publicUrl || null,
      apiStatus: row.api?.status || null,
      apiError: row.api?.json?.error || null,
      trekFilename: row.trek?.row?.filename || null,
    })),
    journeyBookPath: `/shared/${shareToken}/journey`,
    list: `/api/bind-thing-media?shareToken=${encodeURIComponent(shareToken)}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
