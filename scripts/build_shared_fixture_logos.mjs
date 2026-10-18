#!/usr/bin/env node
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { isPlaceWebsite } from '../src/vacation/page-icon-discovery.mjs';
import { reenrichTripLogos } from '../src/vacation/logo-reenrichment.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function searchProductCategoryFromPlace(place = {}) {
  const cat = text(place.category, 80).toLowerCase();
  if (cat === 'lodging' || cat === 'accommodation') return 'hotel';
  if (cat === 'grocery' || cat === 'market' || cat === 'shopping' || cat === 'shop') return 'store';
  if (['activity', 'attraction', 'tour', 'music', 'theatre', 'bar'].includes(cat)) return 'event';
  return cat;
}
const category = (place) => searchProductCategoryFromPlace({ category: productThingCategory(place) });
const key = (place) => `${normalize(place.name)}\t${category(place)}`;

function assertShared(shared) {
  if (!shared?.trip?.id || !Array.isArray(shared.places) || !shared.places.length) {
    throw new Error('Shared response requires a trip and nonempty places');
  }
  const ids = shared.places.map((place) => text(place.id));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Place ids must be unique and nonempty');
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? match[1] ?? match[2] ?? match[3] ?? '' : '';
}

function declaredIconFetch(fetchImpl) {
  const allowed = new Set();
  return async (url, options) => {
    if (options?.headers?.accept === 'image/*' && !allowed.has(String(url))) throw new Error('undeclared_icon_rejected');
    const response = await fetchImpl(url, options);
    if (options?.headers?.accept !== 'text/html') return response;
    const html = await response.text();
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
      if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(attribute(tag, 'rel'))) continue;
      const href = attribute(tag, 'href');
      if (!href) continue;
      try { allowed.add(new URL(href, response.url || url).href); } catch { continue; }
    }
    return { ok: response.ok, status: response.status, url: response.url, text: async () => html };
  };
}

const dnsFailures = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'EAI_FAIL']);

async function hostUnresolvable(url, fetchImpl) {
  try {
    await fetchImpl(url, { headers: { accept: 'text/html' } });
    return false;
  } catch (error) {
    return dnsFailures.has(text(error?.cause?.code || error?.code || error?.message));
  }
}

function fixtureStore(rows) {
  const audit = [];
  const db = async (parts, ...values) => {
    const sql = parts.join(' ');
    if (/select id, trip_id, title, metadata/.test(sql)) {
      return rows.filter((row) => row.trip_id === values[0] && values[1].includes(row.id));
    }
    if (/update trip_things/.test(sql)) {
      const [metadata, id, tripId] = values;
      const row = rows.find((row) => row.id === id && row.trip_id === tripId);
      if (!row || row.metadata.logoUrl || row.metadata.sourceRecord?.logoUrl) return [];
      row.metadata = JSON.parse(metadata);
      return [{ id }];
    }
    if (/insert into trip_thing_logo_audit/.test(sql)) {
      const [tripId, id, actor, old, logo, sourceUrl, outcome, at] = values;
      audit.push({ tripId, id, actor, old, logo, sourceUrl, outcome, at });
      return [];
    }
    throw new Error('Unexpected fixture-store operation');
  };
  return { db, audit };
}

export async function buildFixture({ fixture, staging, sourceUrl, asOf, fetchImpl = globalThis.fetch }) {
  assertShared(fixture);
  assertShared(staging);
  if (!sourceUrl || !asOf || !Number.isFinite(Date.parse(asOf))) throw new Error('sourceUrl and valid asOf are required');
  const output = structuredClone(fixture);
  const matches = [];
  const rows = [];
  const sameTrip = text(fixture.trip.id) === text(staging.trip.id);
  for (const place of output.places) {
    const override = output.thingOverrides?.[`place:${place.id}`] || {};
    const candidates = sameTrip
      ? staging.places.filter((candidate) => text(candidate.id) === text(place.id))
      : staging.places.filter((candidate) => key(candidate) === key(place));
    const matched = candidates.length === 1 ? candidates[0] : null;
    const logoUrl = text(place.logoUrl || place.image_url || override.logoUrl || override.sourceRecord?.logoUrl);
    const unmatched = candidates.length > 1 ? 'ambiguous_name_category' : !matched ? 'no_exact_match'
      : key(matched) !== key(place) ? 'stable_id_identity_conflict'
        : !text(matched.website) ? 'matched_website_empty'
          : !isPlaceWebsite(text(matched.website)) ? 'matched_website_not_own_site' : '';
    const unresolvable = !unmatched && !logoUrl && await hostUnresolvable(text(matched.website), fetchImpl);
    const reason = unresolvable ? 'website_host_unresolvable' : unmatched;
    const website = reason ? '' : text(matched.website);
    const entry = {
      id: place.id, name: place.name, category: category(place),
      method: sameTrip ? 'shared_trip_stable_id' : 'normalized_name_category',
      stagingId: matched?.id ?? null, candidateIds: candidates.map((candidate) => candidate.id),
      provider: 'staging_shared_website', sourceUrl, website, reason,
    };
    if (!text(place.website)) place.website = unresolvable ? null : website;
    else if (place.website !== website) throw new Error(`Existing website conflicts for place ${place.id}`);
    if (unresolvable) delete place.websiteCapture;
    else place.websiteCapture = entry;
    rows.push({
      id: text(place.id), trip_id: text(output.trip.id), title: place.name,
      metadata: { ...(logoUrl ? { logoUrl } : {}), ...(unresolvable ? {} : { sourceRecord: { website } }) },
    });
    matches.push(entry);
  }
  const store = fixtureStore(rows);
  const discoverFetch = declaredIconFetch(fetchImpl);
  const args = {
    db: store.db, tripId: text(output.trip.id), thingIds: rows.map((row) => row.id),
    actor: 'shared-fixture-builder', fetchImpl: discoverFetch, now: () => asOf,
  };
  const dryRun = await reenrichTripLogos(args);
  const applied = await reenrichTripLogos({ ...args, apply: true });
  for (let index = 0; index < output.places.length; index += 1) {
    const place = output.places[index];
    const row = rows[index];
    const result = applied.report[index];
    if (encode(dryRun.report[index]) !== encode(result)) throw new Error(`Discovery changed between dry run and apply for ${place.id}`);
    if (result.outcome === 'skipped_has_logo') continue;
    place.logoUrl = row.metadata.logoUrl || '';
    place.logoCaptureReason = row.metadata.logoCaptureReason || '';
    place.logoProvenance = row.metadata.sourceRecord?.logoProvenance || null;
    const overrides = output.thingOverrides ||= {};
    overrides[`place:${place.id}`] = { ...(overrides[`place:${place.id}`] || {}), ...row.metadata };
  }
  return { fixture: output, matches, dryRun, applied, audit: store.audit };
}

export function recordedFetch({ records = [], replay = false, fetchImpl = globalThis.fetch } = {}) {
  const byKey = new Map(records.map((row) => [row.key, row]));
  const missing = [];
  return {
    records,
    missing,
    fetch: async (url, options = {}) => {
      const requestKey = `${options.headers?.accept || ''} ${url}`;
      let record = byKey.get(requestKey);
      if (!record) {
        if (replay) {
          missing.push(requestKey);
          throw new Error(`Missing recorded response: ${requestKey}`);
        }
        try {
          const response = await fetchImpl(url, { ...options, method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
          const type = response.headers.get('content-type') || '';
          record = { key: requestKey, status: response.status, url: response.url || String(url), type,
            body: options.headers?.accept === 'image/*' ? '' : await response.text() };
          if (options.headers?.accept === 'image/*') await response.body?.cancel?.();
        } catch (error) { record = { key: requestKey, error: text(error.cause?.code || error.message) }; }
        records.push(record);
        byKey.set(requestKey, record);
      }
      if (record.error) throw new Error(record.error);
      return { ok: record.status === 200, status: record.status, url: record.url,
        headers: new Headers({ 'content-type': record.type }), text: async () => record.body,
        json: async () => JSON.parse(record.body) };
    },
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => {
    if (value.startsWith('--')) list.push([value.slice(2), all[index + 1]]);
    return list;
  }, []));
  for (const required of ['input', 'output', 'source', 'as-of', 'audit']) if (!args[required]) throw new Error(`--${required} required`);
  const inputPath = await realpath(args.input);
  const outputPath = await realpath(args.output).catch(() => resolve(args.output));
  if (inputPath === outputPath) throw new Error('Output must be a sibling; never overwrite the input fixture');
  const source = new URL(args.source);
  if (source.origin !== 'https://vacation-staging.timesyncher.com' || !/^\/api\/shared\/[A-Za-z0-9-]+$/.test(source.pathname) || source.search || source.username || source.password) {
    throw new Error('Source must be the public staging shared-trip GET URL');
  }
  const input = await readFile(inputPath, 'utf8');
  const recorded = args.replay ? JSON.parse(await readFile(args.replay, 'utf8')) : null;
  const archive = recorded ? recorded.archive || recorded : { inputHash: digest(input), records: [] };
  if (archive.inputHash !== digest(input)) throw new Error('Replay input fixture hash mismatch');
  const transport = recordedFetch({ records: archive.records, replay: Boolean(args.replay) });
  const response = await transport.fetch(source.href, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Staging shared GET failed HTTP ${response.status}`);
  const result = await buildFixture({ fixture: JSON.parse(input), staging: await response.json(), sourceUrl: source.href, asOf: args['as-of'], fetchImpl: transport.fetch });
  if (transport.missing.length) throw new Error(`Incomplete replay: ${transport.missing.join(', ')}`);
  const bytes = encode(result.fixture);
  const evidence = { sourceUrl: source.href, asOf: args['as-of'], inputHash: digest(input), outputHash: digest(bytes),
    matches: result.matches, dryRun: result.dryRun, applied: result.applied, audit: result.audit, archive };
  await writeFile(args.audit, encode(evidence), { flag: 'wx' });
  await writeFile(outputPath, bytes, { flag: 'wx' });
  console.log(encode({ inputHash: evidence.inputHash, outputHash: evidence.outputHash, places: result.matches.length,
    matched: result.matches.filter((row) => row.website).length, filled: result.applied.report.filter((row) => row.outcome === 'filled').length }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
