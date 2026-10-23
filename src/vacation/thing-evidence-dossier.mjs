import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractTavily } from './poi-search.mjs';
import { braveLocalEvidence, runBraveQueries } from './dossier-brave.mjs';
import { braveDossierQueryStages, stageQueriesForFields, topUpQueriesForField } from './dossier-brave-queries.mjs';
import {
  computeDossierFieldCounts,
  fieldsNeedingCapture,
  recordFieldShortcoming,
} from './thing-evidence-dossier-field-counts.mjs';

function publicAddress(address) {
  if (isIP(address) === 6) return /^2[0-9a-f]{3}:/i.test(address);
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts[0] > 0 && parts[0] < 224
    && ![10, 127].includes(parts[0])
    && !(parts[0] === 169 && parts[1] === 254)
    && !(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    && !(parts[0] === 192 && parts[1] === 168)
    && !(parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

async function pageResponse(url, { fetchImpl, resolveImpl }, hops = 0) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
    || (parsed.port && !['80', '443'].includes(parsed.port))) throw new Error('evidence_url_rejected');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await resolveImpl(host, { all: true });
  if (!addresses.length || addresses.some((row) => !publicAddress(row.address))) throw new Error('evidence_address_rejected');
  const response = await fetchImpl(parsed.href, {
    redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { accept: 'text/html,application/ld+json,text/plain' },
  });
  if (response.status >= 300 && response.status < 400) {
    if (hops >= 5) throw new Error('evidence_redirect_limit');
    return pageResponse(new URL(response.headers.get('location'), parsed).href, { fetchImpl, resolveImpl }, hops + 1);
  }
  if (!response.ok) throw new Error(`evidence_page_http_${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/|application\/(?:ld\+)?json/i.test(type)) throw new Error('evidence_page_content_type');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) throw new Error('evidence_page_size_limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return { url: parsed.href, body: Buffer.concat(chunks).toString('utf8'), type };
}

function pageText(body, type) {
  if (!/html/i.test(type)) return body.trim();
  const structured = [...body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  return [body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'), ...structured]
    .join('\n').replace(/[ \t]+/g, ' ').trim();
}

export const DOSSIER_MAX_PAGES = 40;
export const DOSSIER_PAGE_CHARS = 12000;
const REVIEW_PAGE_CHARS = 40000;

const REVIEW_HOST_RE = /yelp\.|tripadvisor\.|google\.|opentable\.|booking\.com/i;

export function reviewSourceHost(url = '') {
  try { return new URL(url).hostname.replace(/^(www|m|en)\./, ''); } catch { return ''; }
}

function isReviewUrl(url = '') {
  return REVIEW_HOST_RE.test(reviewSourceHost(url));
}

function pageCharLimit(url = '') {
  return isReviewUrl(url) ? REVIEW_PAGE_CHARS : DOSSIER_PAGE_CHARS;
}

function blockedPageText(text = '') {
  const n = String(text || '').replace(/\s+/g, ' ').trim();
  if (!n || n.length < 40) return true;
  return /captcha|access denied|enable javascript|bot detection|verify you are human/i.test(n);
}

export const DEFAULT_DOSSIER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function dossierPagesVerified(dossier = {}) {
  return Array.isArray(dossier.pages) && dossier.pages.length > 0 && dossier.pages.every((page) =>
    /^https?:\/\//.test(page.url || '') && Number.isFinite(Date.parse(page.fetchedAt)) && page.text?.trim()
    && createHash('sha256').update(page.text).digest('hex') === page.sha256);
}

export function dossierNeedsRefresh(dossier = {}, maxAgeMs = DEFAULT_DOSSIER_MAX_AGE_MS, nowMs = Date.now()) {
  if (!dossierPagesVerified(dossier)) return true;
  const fetched = dossier.pages.map((page) => Date.parse(page.fetchedAt)).filter(Number.isFinite);
  if (!fetched.length) return true;
  const oldest = Math.min(...fetched);
  return nowMs - oldest > Math.max(Number(maxAgeMs) || 0, 1);
}

export function mergeDossierPages(persisted = {}, gathered = {}) {
  const byUrl = new Map((persisted.pages || []).map((page) => [page.url, page]));
  for (const page of gathered.pages || []) byUrl.set(page.url, page);
  const braveResults = [...(persisted.braveResults || [])];
  const seenBrave = new Set(braveResults.map((r) => r.url));
  for (const row of gathered.braveResults || []) {
    if (!seenBrave.has(row.url)) {
      seenBrave.add(row.url);
      braveResults.push(row);
    }
  }
  return {
    ...persisted,
    ...gathered,
    thing: gathered.thing || persisted.thing,
    pages: [...byUrl.values()],
    attempts: [...(persisted.attempts || []), ...(gathered.attempts || [])],
    braveResults,
    fieldCounts: gathered.fieldCounts || persisted.fieldCounts,
    shortcomings: gathered.shortcomings || persisted.shortcomings,
  };
}

export function changedDossierPageUrls(before = [], after = []) {
  const beforeByUrl = new Map(before.map((page) => [page.url, page.sha256]));
  const changed = [];
  for (const page of after) {
    if (beforeByUrl.get(page.url) !== page.sha256) changed.push(page.url);
  }
  return changed;
}

async function fetchEvidencePage(url, {
  fetchImpl, resolveImpl, extractImpl, env, attempts, existingUrls,
}) {
  if (existingUrls.has(url)) return null;
  let via = 'direct';
  let text = '';
  let finalUrl = url;
  try {
    const response = await pageResponse(url, { fetchImpl, resolveImpl });
    text = pageText(response.body, response.type);
    finalUrl = response.url;
    if (!text || blockedPageText(text)) throw new Error('evidence_page_empty');
    attempts.push({ kind: 'page', url, status: 'ok', via: 'direct', method: 'direct' });
  } catch (error) {
    attempts.push({ kind: 'page', url, status: 'failed', via: 'direct', method: 'direct', error: String(error?.message || '').slice(0, 40) });
    try {
      const rows = await extractImpl([url], { env, fetchImpl });
      const row = rows?.[0];
      text = String(row?.rawContent || '').replace(/\s+/g, ' ').trim();
      if (!text || blockedPageText(text)) throw new Error('tavily_empty');
      via = 'tavily-extract';
      finalUrl = row.url || url;
      attempts.push({ kind: 'page', url, status: 'ok', via: 'tavily-extract', method: 'tavily-extract' });
    } catch (extractError) {
      attempts.push({ kind: 'page', url, status: 'failed', via: 'tavily-extract', method: 'tavily-extract', error: String(extractError?.message || '').slice(0, 40) });
      return null;
    }
  }
  const limit = pageCharLimit(finalUrl);
  const clipped = text.slice(0, limit);
  return {
    url: finalUrl,
    fetchedAt: new Date().toISOString(),
    text: clipped,
    via,
    sha256: createHash('sha256').update(clipped).digest('hex'),
  };
}

async function materializeBraveHits(braveBundle = {}, options = {}) {
  const dossier = { pages: [...(braveBundle.pages || [])], attempts: [...(braveBundle.attempts || [])], braveResults: [...(braveBundle.braveResults || [])] };
  const urls = new Set();
  for (const row of dossier.braveResults) if (row.url) urls.add(row.url);
  const existing = new Set(dossier.pages.map((p) => p.url));
  for (const url of urls) {
    if (dossier.pages.length >= DOSSIER_MAX_PAGES) break;
    if (existing.has(url)) continue;
    const page = await fetchEvidencePage(url, { ...options, attempts: dossier.attempts, existingUrls: existing });
    if (page) {
      dossier.pages.push(page);
      existing.add(page.url);
    }
  }
  return dossier;
}

function stageQueries(place, destination) {
  const flat = [];
  for (const stage of braveDossierQueryStages(place, destination)) {
    for (const query of stage.queries) flat.push({ query, stage: stage.stage, review: stage.review === true });
  }
  return flat;
}

export async function gatherBraveEvidenceForQueries(queries = [], place = {}, options = {}) {
  const braveBundle = await runBraveQueries(queries.map((q) => q.query || q), options);
  return materializeBraveHits(braveBundle, options);
}

export async function topUpDossierFields(dossier = {}, place = {}, {
  destination = '', env = process.env, fetchImpl = globalThis.fetch,
  resolveImpl = lookup, extractImpl = extractTavily, braveImpl = braveLocalEvidence, center = null,
} = {}) {
  const options = { env, fetchImpl, resolveImpl, extractImpl };
  let merged = { ...dossier };
  merged.fieldCounts = computeDossierFieldCounts(merged, place);
  const needs = fieldsNeedingCapture(merged.fieldCounts, place);
  let shortcomings = Array.isArray(merged.shortcomings) ? [...merged.shortcomings] : [];
  for (const field of needs) {
    let filled = false;
    for (let attempt = 0; attempt < 3 && !filled; attempt += 1) {
      const queries = topUpQueriesForField(field, place, destination, attempt);
      if (!queries.length) break;
      const gathered = await gatherBraveEvidenceForQueries(queries, place, options);
      merged = mergeDossierPages(merged, gathered);
      merged.fieldCounts = computeDossierFieldCounts(merged, place);
      const status = merged.fieldCounts[field]?.status;
      filled = status === 'ok';
      const att = gathered.attempts?.[gathered.attempts.length - 1] || {};
      if (!filled) {
        shortcomings = recordFieldShortcoming(
          { shortcomings },
          field,
          field === 'reviews' && merged.fieldCounts.reviews?.status === 'short'
            ? 'limited number of reviews'
            : 'still missing after brave top-up',
          { query: queries[0].query, via: att.via || 'brave', result: att.status || 'no_change' },
        );
      }
    }
    if (!filled && field === 'reviews' && (merged.fieldCounts.reviews?.count || 0) > 0) {
      shortcomings = recordFieldShortcoming(
        { shortcomings },
        field,
        'limited number of reviews',
        { query: '', via: 'code-count', result: String(merged.fieldCounts.reviews.count) },
      );
    }
  }
  merged.shortcomings = shortcomings;
  merged.missingFields = shortcomings.map((s) => s.field);
  return merged;
}

export async function gatherThingEvidence(place = {}, {
  destination = '', center = null, env = process.env, fetchImpl = globalThis.fetch,
  resolveImpl = lookup, extractImpl = extractTavily, braveImpl = braveLocalEvidence,
} = {}) {
  const name = String(place.title || place.name || '').trim();
  if (!name) throw new Error('evidence_thing_name_required');
  const options = { env, fetchImpl, resolveImpl, extractImpl };
  const queries = stageQueries(place, destination);
  let dossier = await gatherBraveEvidenceForQueries(queries, place, options);
  dossier.thing = name;
  dossier.knownFor = dossier.knownFor || [];
  dossier.reviewsRead = 0;

  const official = place.website || place.url || place.sourceRecord?.website || place.sourceRecord?.url;
  if (official && dossier.pages.length < DOSSIER_MAX_PAGES) {
    const page = await fetchEvidencePage(String(official), {
      ...options, attempts: dossier.attempts, existingUrls: new Set(dossier.pages.map((p) => p.url)),
    });
    if (page) dossier.pages.push(page);
  }

  if (braveImpl) {
    try {
      const brave = await braveImpl(place, { destination, center, env, fetchImpl });
      dossier.attempts.push(...(brave.attempts || []));
      for (const page of brave.pages || []) {
        if (!dossier.pages.some((p) => p.url === page.url)) dossier.pages.push(page);
      }
    } catch {
      dossier.attempts.push({ kind: 'brave', step: 'local', status: 'failed' });
    }
  }

  dossier.fieldCounts = computeDossierFieldCounts(dossier, place);
  dossier.missingFields = fieldsNeedingCapture(dossier.fieldCounts, place);
  dossier.shortcomings = [];
  return dossier;
}
