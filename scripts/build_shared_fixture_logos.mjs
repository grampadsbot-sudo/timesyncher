#!/usr/bin/env node
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { isPlaceWebsite } from '../src/vacation/page-icon-discovery.mjs';
import { reenrichTripLogos } from '../src/vacation/logo-reenrichment.mjs';
import { AIRLINE_SITES, resolveAirlineLogo } from './fixture_airline_logos.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const category = (place) => {
  const cat = productThingCategory(place).replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
  if (cat === 'lodging' || cat === 'accommodation') return 'hotel';
  if (cat === 'grocery' || cat === 'market' || cat === 'shopping' || cat === 'shop') return 'store';
  if (['activity', 'attraction', 'tour', 'music', 'theatre', 'bar'].includes(cat)) return 'event';
  return cat;
};
const key = (place) => `${normalize(place.name)}\t${category(place)}`;
const suffixes = ['com', 'org', 'net', 'edu', 'gov', 'test', 'example', 'co.uk', 'org.uk', 'com.au', 'github.io'];
const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u : null;
  } catch { return null; }
};
const pathname = (value) => {
  try { return decodeURIComponent(safeUrl(value)?.pathname || ''); } catch { return ''; }
};
const registrable = (value) => {
  const host = safeUrl(value)?.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  const suffix = suffixes.filter((s) => host.endsWith(`.${s}`)).sort((a, b) => b.length - a.length)[0];
  if (!suffix) return '';
  return host.split('.').slice(-(suffix.split('.').length + 1)).join('.');
};
const onHost = (host, root) => host === root || host.endsWith(`.${root}`);
const guesser = (value) => {
  const u = safeUrl(value);
  if (!u) return false;
  return (onHost(u.hostname, 'google.com') && /^\/s2\/favicons(?:\/|$)/i.test(u.pathname))
    || (onHost(u.hostname, 'gstatic.com') && (/^\/faviconV2(?:\/|$)/i.test(u.pathname) || /^t[^.]*\.gstatic\.com$/i.test(u.hostname)))
    || ['duckduckgo.com', 'clearbit.com', 'icon.horse', 'faviconkit.com', 'favicongrabber.com', 'favicon.io'].some((h) => onHost(u.hostname, h));
};
const logoContexts = (place, override = {}) => [place, place.metadata, place.sourceRecord, place.metadata?.sourceRecord,
  override, override.sourceRecord, override.metadata, override.metadata?.sourceRecord].filter(Boolean);
function logoHasDeclaringDocument(place, logo, website, override = {}) {
  for (const context of logoContexts(place, override)) {
    for (const p of [context.logoProvenance, context.airlineLogo, context]) {
      if (!p || text(p.iconUrl ?? p.logo) !== logo) continue;
      const source = safeUrl(p.pageUrl ?? p.source);
      if (!source || source.href === safeUrl(logo)?.href || /\.(?:ico|png|jpe?g|gif|svg|webp)$/i.test(source.pathname)
        || guesser(source.href) || !registrable(website) || registrable(source.href) !== registrable(website)) continue;
      if (p.verified === false) continue;
      return true;
    }
  }
  return false;
}
function effectiveFixtureLogoUrl(place, override = {}) {
  const website = text(place.website || override.website || override.sourceRecord?.website || place.url);
  for (const logo of [place.logoUrl, place.image_url, override.logoUrl, override.sourceRecord?.logoUrl]) {
    const value = text(logo);
    if (!value || guesser(value)) continue;
    if (/\/favicon\.ico$/i.test(pathname(value)) && !logoHasDeclaringDocument(place, value, website, override)) continue;
    return value;
  }
  return '';
}

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

const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decodeHref = (value) => value.replace(/&amp;/gi, '&').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,
  (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));

function declaredIconFetch(fetchImpl, sleep) {
  const allowed = new Set();
  const cache = new Map();
  const checks = [];
  const safeUrl = (href, base) => {
    try {
      const url = new URL(decodeHref(href), base);
      if (!href || !isPlaceWebsite(url.href) || url.username || url.password
        || /(^|\.)(gstatic\.com|vacation-staging\.timesyncher\.com)$/.test(url.hostname)) return '';
      return url.href;
    } catch { return ''; }
  };
  const request = (url, options, kind) => {
    const key = `${options.headers.accept} ${url}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const headers = { ...options.headers, ...(attempt ? { 'user-agent': browserUserAgent } : {}) };
        let response;
        try { response = await fetchImpl(url, { ...options, headers }); }
        catch (error) {
          checks.push({ url: String(url), kind, attempt: attempt + 1, status: null, type: '', reason: text(error.cause?.code || error.code || error.message) });
          throw error;
        }
        const type = response.headers?.get?.('content-type') || '';
        checks.push({ url: String(url), finalUrl: response.url || String(url), kind, attempt: attempt + 1,
          status: response.status, type });
        if (attempt === 0 && [403, 429].includes(response.status)) {
          const retryAfter = response.headers?.get?.('retry-after');
          const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter)
            : retryAfter ? (Date.parse(retryAfter) - Date.now()) / 1000 : 1;
          await response.body?.cancel?.();
          await sleep(Math.max(1000, Math.min(5000, (Number.isFinite(seconds) ? seconds : 1) * 1000)));
          continue;
        }
        const body = kind === 'icon' ? '' : await response.text();
        if (kind === 'icon') await response.body?.cancel?.();
        return { ok: response.status === 200, status: response.status, url: response.url || String(url),
          headers: new Headers({ 'content-type': type }), text: async () => body };
      }
    })());
    return cache.get(key);
  };
  const structuredLogos = (html, base) => {
    const found = [];
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      for (const logo of [node.logo].flat()) {
        const href = safeUrl(typeof logo === 'string' ? logo : typeof logo?.url === 'string' ? logo.url : '', base);
        if (href) found.push(href);
      }
      Object.values(node).forEach(walk);
    };
    for (const [, body] of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { walk(JSON.parse(body)); } catch { continue; }
    }
    return [...new Set(found)];
  };
  const pages = new Map();
  const page = (url, options, nested) => {
    const key = `${nested ? 'root' : 'page'} ${url}`;
    if (!pages.has(key)) pages.set(key, (async () => {
      const response = await request(url, options, 'page');
      if (!response.ok || !isPlaceWebsite(response.url)) return response;
      let html = await response.text();
      const manifests = [];
      let declared = 0;
      for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const rel = attribute(tag, 'rel');
        const href = safeUrl(attribute(tag, 'href'), response.url);
        if (!href) continue;
        if (/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(rel)) { allowed.add(href); declared += 1; }
        if (/(^|\s)manifest(\s|$)/i.test(rel)) manifests.push(href);
      }
      for (const manifest of new Set(manifests)) {
        try {
          const answer = await request(manifest, { headers: { accept: 'application/manifest+json, application/json' } }, 'manifest');
          if (!answer.ok || !safeUrl(answer.url, manifest)) continue;
          const data = JSON.parse(await answer.text());
          for (const icon of Array.isArray(data?.icons) ? data.icons : []) {
            const href = safeUrl(typeof icon?.src === 'string' ? icon.src : '', answer.url);
            if (!href) continue;
            allowed.add(href);
            declared += 1;
            html += `<link rel="icon" href="${href.replace(/&/g, '&amp;').replace(/"/g, '&#34;')}">`;
          }
        } catch { continue; }
      }
      if (!declared) {
        let fallback = structuredLogos(html, response.url);
        const root = new URL('/', response.url);
        if (!fallback.length && !nested && root.href !== response.url) fallback = await rootIcons(root, options);
        for (const href of fallback) {
          allowed.add(href);
          html += `<link rel="icon" href="${href.replace(/&/g, '&amp;').replace(/"/g, '&#34;')}">`;
        }
      }
      html = html.replace(/<link\b[^>]*>/gi, (tag) => {
        const href = safeUrl(attribute(tag, 'href'), response.url);
        const iconRel = /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(attribute(tag, 'rel'));
        return iconRel && href && allowed.has(href) ? `<link rel="icon" href="${href}" sizes="${attribute(tag, 'sizes').replace(/[^0-9xa-z ]/gi, '')}">` : '';
      });
      return { ...response, text: async () => html };
    })());
    return pages.get(key);
  };
  const rootIcons = async (root, options) => {
    try {
      const answer = await page(root.href, options, true);
      if (!answer.ok || !isPlaceWebsite(answer.url) || new URL(answer.url).origin !== root.origin) return [];
      return ((await answer.text()).match(/<link\b[^>]*>/gi) || []).map((tag) => attribute(tag, 'href')).filter((href) => allowed.has(href));
    } catch { return []; }
  };
  const fetch = async (url, options) => {
    if (options?.headers?.accept === 'image/*') {
      if (!allowed.has(String(url))) throw new Error('undeclared_icon_rejected');
      const response = await request(url, options, 'icon');
      return { ...response, ok: response.ok && Boolean(safeUrl(response.url, url)) };
    }
    return page(String(url), options, false);
  };
  return { fetch, checks };
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

function airlineOf(place, override) {
  const said = `${override.airline || ''} ${place.name || ''} ${override.title || ''}`;
  const name = Object.keys(AIRLINE_SITES).find((airline) => new RegExp(`\\b${airline}\\b`, 'i').test(said));
  return name || text(place.website || override.website);
}

async function applyAirlineLogo(place, overrides, fetchImpl, sleep) {
  const override = overrides[`place:${place.id}`] || {};
  const airline = airlineOf(place, override);
  const result = await resolveAirlineLogo(airline, { fetchImpl, sleepImpl: sleep });
  const fields = { logoUrl: result.logo, logoCaptureReason: result.reason, airlineLogo: result };
  Object.assign(place, fields);
  overrides[`place:${place.id}`] = { ...override, ...fields };
  return { id: place.id, name: place.name, airline, ...result };
}

export async function buildFixture({ fixture, staging, sourceUrl, asOf, fetchImpl = globalThis.fetch, sleep = pause, categories = null }) {
  assertShared(fixture);
  assertShared(staging);
  if (!sourceUrl || !asOf || !Number.isFinite(Date.parse(asOf))) throw new Error('sourceUrl and valid asOf are required');
  const output = structuredClone(fixture);
  const discovery = declaredIconFetch(fetchImpl, sleep);
  const matches = [];
  const rows = [];
  const sameTrip = text(fixture.trip.id) === text(staging.trip.id);
  const flights = [];
  for (const place of output.places) {
    if (categories && !categories.includes(category(place))) continue;
    if (category(place) === 'flight') { flights.push(place); continue; }
    const override = output.thingOverrides?.[`place:${place.id}`] || {};
    const candidates = sameTrip
      ? staging.places.filter((candidate) => text(candidate.id) === text(place.id))
      : staging.places.filter((candidate) => key(candidate) === key(place));
    const matched = candidates.length === 1 ? candidates[0] : null;
    const logoUrl = effectiveFixtureLogoUrl(place, override);
    const unmatched = candidates.length > 1 ? 'ambiguous_name_category' : !matched ? 'no_exact_match'
      : key(matched) !== key(place) ? 'stable_id_identity_conflict'
        : !text(matched.website) ? 'matched_website_empty'
          : !isPlaceWebsite(text(matched.website)) ? 'matched_website_not_own_site' : '';
    const unresolvable = !unmatched && !logoUrl && await hostUnresolvable(text(matched.website), discovery.fetch);
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
  const args = {
    db: store.db, tripId: text(output.trip.id), thingIds: rows.map((row) => row.id),
    actor: 'shared-fixture-builder', fetchImpl: discovery.fetch, now: () => asOf,
  };
  const dryRun = rows.length ? await reenrichTripLogos(args) : { dryRun: true, report: [] };
  const applied = rows.length ? await reenrichTripLogos({ ...args, apply: true }) : { dryRun: false, report: [] };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const place = output.places.find((place) => text(place.id) === row.id);
    const result = applied.report[index];
    if (encode(dryRun.report[index]) !== encode(result)) throw new Error(`Discovery changed between dry run and apply for ${place.id}`);
    if (result.outcome === 'skipped_has_logo') continue;
    place.logoUrl = row.metadata.logoUrl || '';
    place.logoCaptureReason = row.metadata.logoCaptureReason || '';
    place.logoProvenance = row.metadata.sourceRecord?.logoProvenance || null;
    const overrides = output.thingOverrides ||= {};
    overrides[`place:${place.id}`] = { ...(overrides[`place:${place.id}`] || {}), ...row.metadata };
  }
  const airlineLogos = [];
  for (const place of flights) airlineLogos.push(await applyAirlineLogo(place, output.thingOverrides ||= {}, fetchImpl, sleep));
  return { fixture: output, matches, dryRun, applied, audit: store.audit, logoChecks: discovery.checks, airlineLogos };
}

export function recordedFetch({ records = [], replay = false, fetchImpl = globalThis.fetch } = {}) {
  const byKey = new Map(records.map((row) => [row.key, row]));
  const missing = [];
  return {
    records,
    missing,
    fetch: async (url, options = {}) => {
      const requestKey = `${options.headers?.accept || ''} ${url}${options.headers?.['user-agent'] ? ' [browser-retry]' : ''}`;
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
  const result = await buildFixture({ fixture: JSON.parse(input), staging: await response.json(), sourceUrl: source.href, asOf: args['as-of'], fetchImpl: transport.fetch, categories: args.categories ? args.categories.split(',') : null });
  if (transport.missing.length) throw new Error(`Incomplete replay: ${transport.missing.join(', ')}`);
  const bytes = encode(result.fixture);
  const evidence = { sourceUrl: source.href, asOf: args['as-of'], inputHash: digest(input), outputHash: digest(bytes),
    matches: result.matches, dryRun: result.dryRun, applied: result.applied, audit: result.audit, logoChecks: result.logoChecks, airlineLogos: result.airlineLogos, archive };
  await writeFile(args.audit, encode(evidence), { flag: 'wx' });
  await writeFile(outputPath, bytes, { flag: 'wx' });
  console.log(encode({ inputHash: evidence.inputHash, outputHash: evidence.outputHash, places: result.matches.length,
    matched: result.matches.filter((row) => row.website).length, filled: result.applied.report.filter((row) => row.outcome === 'filled').length }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
