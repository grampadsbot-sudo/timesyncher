#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildFixture, encode, effectiveFixtureLogoUrl } from './build_shared_fixture_logos.mjs';
import { mergeBindingsIntoShared } from '../src/vacation/thing-media-bind.mjs';
import {
  buildNycCraigKimDaybydaySharedDraft,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const text = (value) => String(value ?? '').trim();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const AS_OF = '2026-10-18T03:32:48Z';
const SOURCE = 'https://vacation-staging.timesyncher.com/api/shared/offline-470';
const SNAPSHOT_PATH = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const NYC_TRIP_PATH = fileURLToPath(new URL('./fixtures/nyc-craig-kim-daybyday-trip.mjs', import.meta.url));
const MEDIA_PREFIX = '/ts-thing-media/nyc-craig-kim-june-2026';
const VIDEO_URL = 'https://example.com/nyc-day1-walk.mp4';
const NYC_OVERRIDE_PATCH_IDS = [630, 631, 632, 633, 634, 612, 613, 614, 615, 616];

function sharedFromSnapshot(snapshot) {
  const places = Object.entries(snapshot).map(([id, row]) => ({
    ...structuredClone(row),
    id,
    name: row.title,
    category_name: row.category,
    website: text(row.url || row.sourceRecord?.website),
  }));
  return { trip: { id: '470-snapshot-regen' }, places, thingOverrides: {} };
}

function setLogoField(target, key, logoUrl) {
  if (logoUrl) target[key] = logoUrl;
  else delete target[key];
}

function applyBuiltPlaceToSearchRow(row, place) {
  const logoUrl = text(place.logoUrl);
  setLogoField(row, 'logoUrl', logoUrl);
  if (place.logoCaptureReason) row.logoCaptureReason = place.logoCaptureReason;
  else delete row.logoCaptureReason;
  if (place.logoProvenance) row.logoProvenance = place.logoProvenance;
  else delete row.logoProvenance;
  if (place.airlineLogo) row.airlineLogo = place.airlineLogo;
  else delete row.airlineLogo;
  if (row.sourceRecord && typeof row.sourceRecord === 'object') {
    setLogoField(row.sourceRecord, 'logoUrl', logoUrl);
    if (place.logoProvenance) row.sourceRecord.logoProvenance = place.logoProvenance;
    else delete row.sourceRecord.logoProvenance;
    const evidence = row.sourceRecord.logoSearchEvidence;
    if (evidence && typeof evidence === 'object') {
      if (logoUrl) row.sourceRecord.logoSearchEvidence = { ...evidence, logoUrl };
      else delete row.sourceRecord.logoSearchEvidence;
    }
  }
}

function logoLines(override) {
  const lines = [];
  if (override.logoUrl) lines.push(`      override.logoUrl = '${override.logoUrl}';`);
  if (override.logoCaptureReason) lines.push(`      override.logoCaptureReason = '${override.logoCaptureReason}';`);
  if (override.logoProvenance) lines.push(`      override.logoProvenance = ${JSON.stringify(override.logoProvenance)};`);
  if (override.airlineLogo) lines.push(`      override.airlineLogo = ${JSON.stringify(override.airlineLogo)};`);
  return lines.join('\n');
}

function patchNycTripOverrideBlocks(source, built) {
  let out = source;
  for (const id of NYC_OVERRIDE_PATCH_IDS) {
    const place = built.places.find((row) => String(row.id) === String(id)) || {};
    const override = {
      ...(built.thingOverrides[`place:${id}`] || {}),
      logoProvenance: built.thingOverrides[`place:${id}`]?.logoProvenance || place.logoProvenance,
      logoUrl: built.thingOverrides[`place:${id}`]?.logoUrl || place.logoUrl,
    };
    const re = new RegExp(`(if \\(row\\.id === ${id}\\) \\{)([\\s\\S]*?)(\\n    \\})`, 'm');
    out = out.replace(re, (_, open, body, close) => {
      let next = body.replace(/\n\s*override\.logoUrl = '[^']*';/g, '');
      next = next.replace(/\n\s*override\.logoCaptureReason = '[^']*';/g, '');
      next = next.replace(/\n\s*override\.logoProvenance = [\s\S]*?;\n/g, '');
      next = next.replace(/\n\s*override\.airlineLogo = [\s\S]*?;\n/g, '');
      next = next.replace(/override\.airline = '[^']*';\s*override\.airlineLogo/g, "override.airline = 'Southwest';\n      override.airlineLogo");
      const extra = logoLines(override);
      return `${open}${next}${extra ? `\n${extra}` : ''}${close}`;
    });
  }
  return out;
}

function applyBuiltLogos(shared, built) {
  for (const place of built.places) {
    const target = shared.places.find((row) => String(row.id) === String(place.id));
    const builtOverride = built.thingOverrides[`place:${place.id}`] || {};
    const override = shared.thingOverrides[`place:${place.id}`] ||= {};
    if (!target) continue;
    const logoUrl = text(place.logoUrl);
    setLogoField(target, 'logoUrl', logoUrl);
    setLogoField(override, 'logoUrl', logoUrl);
    for (const key of ['logoCaptureReason', 'logoProvenance', 'airlineLogo']) {
      if (builtOverride[key] || place[key]) {
        const value = builtOverride[key] || place[key];
        target[key] = value;
        override[key] = value;
      } else {
        delete target[key];
        delete override[key];
      }
    }
    if (!effectiveFixtureLogoUrl(target, override)) {
      for (const row of [target, override]) {
        delete row.logoUrl;
        delete row.logoProvenance;
      }
    }
    if (!text(target.logoUrl) && text(override.logoCaptureReason || target.logoCaptureReason)) {
      delete target.logoUrl;
      delete override.logoUrl;
    }
  }
}

function nycDraftWithBindings() {
  const shared = buildNycCraigKimDaybydaySharedDraft();
  const bindings = [];
  const zabars = shared.places.find((p) => p.id === 602);
  const tour = shared.places.find((p) => p.id === 604);
  if (zabars) {
    bindings.push({
      id: 'nyc-bind-photo-day1',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: zabars.id,
      thingName: zabars.name,
      mediaKind: 'photo',
      mimeType: 'image/jpeg',
      originalName: 'uws-street-photo.jpg',
      publicUrl: `${MEDIA_PREFIX}/uws-street-photo.jpg`,
    });
  }
  if (tour) {
    bindings.push({
      id: 'nyc-bind-photo-day2',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: tour.id,
      thingName: tour.name,
      mediaKind: 'photo',
      mimeType: 'image/jpeg',
      originalName: 'lincoln-center-photo.jpg',
      publicUrl: `${MEDIA_PREFIX}/lincoln-center-photo.jpg`,
    });
    bindings.push({
      id: 'nyc-bind-video-day2',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: tour.id,
      thingName: tour.name,
      mediaKind: 'video',
      mimeType: 'video/mp4',
      originalName: 'nyc-day1-walk.mp4',
      publicUrl: VIDEO_URL,
    });
  }
  return mergeBindingsIntoShared(shared, bindings);
}

function curlRequest(url, accept) {
  const args = ['-fsSL', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', '-m', '25', '-H', `accept: ${accept}`];
  if (accept === 'image/*') args.push('-o', '/dev/null', '-w', '%{http_code} %{content_type} %{url_effective}');
  const result = spawnSync('curl', [...args, url], {
    encoding: accept === 'image/*' ? 'utf8' : 'buffer',
    maxBuffer: 12 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`curl_failed:${url}`);
  if (accept === 'image/*') {
    const [status, type, finalUrl] = String(result.stdout || '').trim().split(' ');
    return { ok: status === '200', status: Number(status), url: finalUrl || url, type: type || 'image/png' };
  }
  return { ok: true, status: 200, url, body: result.stdout };
}

async function regenFetch(url, options = {}) {
  const accept = options.headers?.accept || 'text/html';
  let response;
  try {
    response = await globalThis.fetch(url, { ...options, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (response.ok) return response;
    await response.body?.cancel();
  } catch { response = null; }
  if (accept === 'image/*') {
    const answer = curlRequest(url, accept);
    return {
      ok: answer.ok,
      status: answer.status,
      url: answer.url,
      headers: new Headers({ 'content-type': answer.type }),
      text: async () => '',
      body: { cancel: async () => {} },
    };
  }
  const answer = curlRequest(url, accept);
  const body = answer.body.toString('utf8');
  return {
    ok: true,
    status: 200,
    url: answer.url,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => body,
    body: { cancel: async () => {} },
  };
}

async function rebuildShared(shared) {
  const staging = structuredClone(shared);
  for (const place of staging.places) {
    if (!text(place.website) && text(place.url)) place.website = text(place.url);
  }
  const { fixture } = await buildFixture({
    fixture: structuredClone(shared),
    staging,
    sourceUrl: SOURCE,
    asOf: AS_OF,
    fetchImpl: regenFetch,
  });
  return fixture;
}

function reportRow(shared, id) {
  const place = shared.places.find((row) => String(row.id) === String(id));
  const override = shared.thingOverrides?.[`place:${id}`] || {};
  return {
    id,
    name: place?.name || place?.title || id,
    logoUrl: text(place?.logoUrl || override.logoUrl),
    reason: text(override.logoCaptureReason || place?.logoCaptureReason || override.airlineLogo?.reason || place?.airlineLogo?.reason),
  };
}

async function main() {
  const before = {
    snapshot: digest(await readFile(SNAPSHOT_PATH)),
    nycTrip: digest(await readFile(NYC_TRIP_PATH)),
  };
  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
  const nycBefore = nycDraftWithBindings();
  const rebuiltSnapshot = await rebuildShared(sharedFromSnapshot(snapshot));
  for (const place of rebuiltSnapshot.places) {
    const row = snapshot[String(place.id)];
    if (row) applyBuiltPlaceToSearchRow(row, place);
  }
  await writeFile(SNAPSHOT_PATH, encode(snapshot));
  const rebuiltNyc = await rebuildShared(nycBefore);
  applyBuiltLogos(nycBefore, rebuiltNyc);
  for (const place of rebuiltNyc.places) {
    const row = snapshot[String(place.id)];
    if (row) applyBuiltPlaceToSearchRow(row, place);
  }
  await writeFile(SNAPSHOT_PATH, encode(snapshot));
  const nycSource = await readFile(NYC_TRIP_PATH, 'utf8');
  await writeFile(NYC_TRIP_PATH, patchNycTripOverrideBlocks(nycSource, rebuiltNyc));
  const after = {
    snapshot: digest(await readFile(SNAPSHOT_PATH)),
    nycTrip: digest(await readFile(NYC_TRIP_PATH)),
  };
  const ids = [...new Set([...Object.keys(snapshot), ...NYC_OVERRIDE_PATCH_IDS.map(String), '635'])];
  const table = ids.map((id) => {
    const oldRow = reportRow(nycBefore, id);
    const newRow = reportRow(rebuiltNyc, id);
    return {
      id,
      name: newRow.name || oldRow.name,
      oldLogo: oldRow.logoUrl,
      newLogo: newRow.logoUrl,
      reason: newRow.reason,
    };
  }).filter((row) => row.oldLogo || row.newLogo || row.reason);
  console.log(JSON.stringify({ before, after, table }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
