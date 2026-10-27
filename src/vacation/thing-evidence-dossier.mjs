import { dossierPageFailure } from './dossier-page-integrity.mjs';
import { flightRecordEvidence } from './dossier-flight-record.mjs';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractTavily } from './poi-search.mjs';
import { braveLocalEvidence, runBraveQueries } from './dossier-brave.mjs';
import { braveDossierQueryStages, dossierSearchIdentity, flightEvidenceMatchesTarget, placeSupportsDossierReviews, stageQueriesForFields, topUpQueriesForField } from './dossier-brave-queries.mjs';
import { normalizeDossierEvidence, syncDossierRequiredShortcomings } from './dossier-evidence-hydrate.mjs';
import { descriptionNamesThing } from './thing-dossier-fields.mjs';
import {
  braveTopUpFieldsPending,
  computeDossierFieldCounts,
  fieldsNeedingCapture,
  recordFieldShortcoming,
} from './thing-evidence-dossier-field-counts.mjs';

export function dossierDeadlineFetch(fetchImpl, deadline = 0) {
  if (!deadline) return fetchImpl;
  return (url, options = {}) => {
    const remaining = deadline - Date.now();
    const signal = remaining <= 0
      ? AbortSignal.abort(new DOMException('Dossier request deadline reached', 'TimeoutError'))
      : AbortSignal.timeout(Math.max(1, Math.ceil(remaining)));
    return fetchImpl(url, {
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal,
    });
  };
}

function outOfTime(options = {}) {
  return options.deadline > 0 && Date.now() >= options.deadline;
}

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

async function pageResponse(url, { fetchImpl, resolveImpl, deadline = 0 }, hops = 0) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
    || (parsed.port && !['80', '443'].includes(parsed.port))) throw new Error('evidence_url_rejected');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  let timer;
  let addresses;
  try {
    addresses = isIP(host) ? [{ address: host }] : await Promise.race([
      resolveImpl(host, { all: true }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('evidence_dns_timeout')), deadline ? Math.max(1, Math.min(15000, deadline - Date.now())) : 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (!addresses.length || addresses.some((row) => !publicAddress(row.address))) throw new Error('evidence_address_rejected');
  const response = await fetchImpl(parsed.href, {
    redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { accept: 'text/html,application/ld+json,text/plain' },
  });
  if (response.status >= 300 && response.status < 400) {
    if (hops >= 5) throw new Error('evidence_redirect_limit');
    return pageResponse(new URL(response.headers.get('location'), parsed).href, { fetchImpl, resolveImpl, deadline }, hops + 1);
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
  return { url: parsed.href, body: Buffer.concat(chunks).toString('utf8'), type, status: response.status };
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

function dossierIsSharedPointer(dossier = {}) {
  if (!dossier?.sharedDossierKey?.startsWith('shared:')) return false;
  const keys = Object.keys(dossier);
  return keys.length <= 3 && !(dossier.pages?.length);
}

export function mergeDossierForPersistence(persisted = {}, incoming = {}) {
  if (dossierIsSharedPointer(incoming)) return incoming;
  if (dossierIsSharedPointer(persisted)) return incoming;
  const merged = mergeDossierPages(persisted, incoming);
  const pages = new Map();
  for (const page of [...(persisted.pages || []), ...(incoming.pages || [])]) {
    const identity = JSON.stringify([page.url, page.sha256 || page.text]);
    if (!pages.has(identity) || dossierPageFailure(pages.get(identity)) && !dossierPageFailure(page)) pages.set(identity, page);
  }
  merged.pages = [...pages.values()];
  const attempts = new Map();
  for (const attempt of [...(persisted.attempts || []), ...(incoming.attempts || [])]) {
    const stamp = attempt.startedAt || attempt.at;
    const identity = stamp
      ? JSON.stringify([attempt.kind, attempt.provider, attempt.step, attempt.stage, attempt.field, attempt.attempt, attempt.retry, attempt.retryCount, attempt.url, attempt.query, stamp])
      : JSON.stringify(attempt);
    attempts.set(identity, attempt);
  }
  merged.attempts = [...attempts.values()];
  const persistedFields = persisted.fields && typeof persisted.fields === 'object' ? persisted.fields : {};
  const incomingFields = incoming.fields && typeof incoming.fields === 'object' ? incoming.fields : {};
  const fields = { ...persistedFields };
  for (const [key, value] of Object.entries(incomingFields)) {
    if (value === undefined) continue;
    fields[key] = value;
    if (!['summary', 'description'].includes(key) || !Array.isArray(value?.claims)) continue;
    fields[key] = {
      ...value,
      claims: value.claims.map((claim) => ({
        ...claim,
        pages: (claim.pages || []).map((id) => {
          const match = /^p(\d+)$/.exec(String(id));
          if (!match) return id;
          const source = incoming.pages?.[Number(match[1]) - 1];
          const index = merged.pages.findIndex((page) => source && page.url === source.url
            && (page.sha256 || page.text) === (source.sha256 || source.text));
          return index >= 0 ? `p${index + 1}` : '';
        }),
      })),
    };
  }
  merged.fields = fields;
  for (const key of ['reviews', 'reviewSet', 'reviewExcerpts', 'knownFor', 'xaiUsageRuns', 'xaiUsage']) {
    const inc = incoming[key];
    const empty = inc == null || (Array.isArray(inc) && inc.length === 0);
    if (empty && persisted[key] != null && (!Array.isArray(persisted[key]) || persisted[key].length)) {
      merged[key] = persisted[key];
    }
  }
  if (persisted.rating != null && incoming.rating == null) merged.rating = persisted.rating;
  if (persisted.reviewsAvailable != null && incoming.reviewsAvailable == null) {
    merged.reviewsAvailable = persisted.reviewsAvailable;
  }
  return merged;
}

export function changedDossierPageUrls(before = [], after = []) {
  const beforeByUrl = new Map(before.map((page) => [page.url, page.sha256]));
  const changed = [];
  for (const page of after) {
    if (beforeByUrl.get(page.url) !== page.sha256) changed.push(page.url);
  }
  return changed;
}

async function fetchEvidencePages(url, options) {
  const { fetchImpl, resolveImpl, extractImpl, env, attempts, existingUrls } = options;
  if (existingUrls.has(url) || outOfTime(options)) return [];
  let via = 'direct';
  const startedAt = new Date().toISOString();
  let text = '';
  let finalUrl = url;
  try {
    const response = await pageResponse(url, options);
    text = pageText(response.body, response.type);
    finalUrl = response.url;
    if (!text || blockedPageText(text)) throw new Error('evidence_page_empty');
    attempts.push({ kind: 'page', url, startedAt, status: 'ok', via: 'direct', method: 'direct', httpStatus: response.status || 200 });
  } catch (error) {
    attempts.push({ kind: 'page', url, startedAt, status: 'failed', via: 'direct', method: 'direct', error: String(error?.message || '').slice(0, 40) });
    if (outOfTime(options)) return [];
    try {
      const rows = await extractImpl([url], {
        env, fetchImpl, timeoutMs: options.deadline ? Math.max(1, Math.min(8000, options.deadline - Date.now())) : 60000,
      });
      const row = rows?.[0];
      text = String(row?.rawContent || '').replace(/\s+/g, ' ').trim();
      if (!text || blockedPageText(text)) throw new Error('tavily_empty');
      via = 'tavily-extract';
      finalUrl = row.url || url;
      attempts.push({ kind: 'page', url, startedAt, status: 'ok', via: 'tavily-extract', method: 'tavily-extract', httpStatus: 200 });
    } catch (extractError) {
      attempts.push({ kind: 'page', provider: 'Tavily', stage: 'extract', query: '', url, startedAt, status: 'failed', via: 'tavily-extract', method: 'tavily-extract', httpStatus: Number(extractError?.status) || Number(String(extractError?.message || '').match(/HTTP\s+(\d{3})/i)?.[1]) || undefined, error: String(extractError?.message || '').slice(0, 120) });
      if (outOfTime(options)) return [];
      let target;
      try { target = new URL(url); } catch { return []; }
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return [];
      const queries = [...new Set([
        `site:${target.hostname}${target.pathname === '/' ? '' : target.pathname}`,
        `site:${target.hostname}`,
        dossierSearchIdentity(options.place),
      ].filter(Boolean))];
      let query, pages = [];
      for (query of queries) {
        const fallback = await runBraveQueries([query], { env, fetchImpl, deadline: options.deadline, bravePace: options.bravePace, sleepImpl: options.sleepImpl });
        const host = target.hostname.replace(/^www\./, '');
        pages = fallback.pages.filter((page) => {
          try {
            const found = new URL(page.url).hostname.replace(/^www\./, '');
            return found === host || found.endsWith(`.${host}`)
              || flightEvidenceMatchesTarget(page, options.place)
              || descriptionNamesThing(page.text, options.place?.title || options.place?.name);
          } catch { return false; }
        });
        attempts.push(...fallback.attempts.map((attempt) => ({
          ...attempt, provider: 'Brave', stage: 'extract_fallback', url,
        })));
        if (pages.length || outOfTime(options)) break;
      }
      attempts.push({
        kind: 'page', provider: 'Brave', stage: 'extract_fallback', query, url,
        startedAt: new Date().toISOString(), via: 'brave-snippet',
        status: pages.length ? 'ok' : 'failed',
        error: pages.length ? undefined : 'brave_extract_fallback_no_pages',
        pages: pages.length,
      });
      return pages;
    }
  }
  const limit = pageCharLimit(finalUrl);
  const clipped = text.slice(0, limit);
  return [{
    url: finalUrl,
    fetchedAt: new Date().toISOString(),
    text: clipped,
    via,
    sha256: createHash('sha256').update(clipped).digest('hex'),
  }];
}

async function materializeBraveHits(braveBundle = {}, options = {}) {
  const dossier = { pages: [...(braveBundle.pages || [])], attempts: [...(braveBundle.attempts || [])], braveResults: [...(braveBundle.braveResults || [])] };
  const urls = new Set();
  for (const row of dossier.braveResults) if (row.url) urls.add(row.url);
  const existing = new Set(dossier.pages.map((p) => p.url));
  for (const url of urls) {
    if (outOfTime(options)) break;
    if (dossier.pages.length >= DOSSIER_MAX_PAGES) break;
    if (existing.has(url)) continue;
    const pages = await fetchEvidencePages(url, { ...options, attempts: dossier.attempts, existingUrls: existing });
    for (const page of pages) {
      if (existing.has(page.url) || dossier.pages.length >= DOSSIER_MAX_PAGES) continue;
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
  const braveBundle = await runBraveQueries(queries, options);
  return materializeBraveHits(braveBundle, { ...options, place });
}

export async function gatherDossierWithEscalation(place, gatherImpl, options) {
  options = { ...options, bravePace: options.bravePace || { nextAt: 0 } };
  let gathered = await gatherImpl(place, options);
  if (gathered.pages?.length || outOfTime(options)) return gathered;
  const query = dossierSearchIdentity(place, options.destination);
  const startedAt = new Date().toISOString();
  const escalated = await gatherBraveEvidenceForQueries([query], place, {
    ...options, resolveImpl: options.resolveImpl || lookup, extractImpl: options.extractImpl || extractTavily,
  });
  gathered = mergeDossierPages(gathered, escalated);
  gathered.attempts.push({
    kind: 'brave', provider: 'Brave', stage: 'general', step: 'empty_gather_escalation',
    query, url: '', startedAt, status: escalated.pages?.length ? 'ok' : 'empty',
  });
  return gathered;
}

export async function topUpDossierFields(dossier = {}, place = {}, {
  destination = '', env = process.env, fetchImpl = globalThis.fetch,
  resolveImpl = lookup, extractImpl = extractTavily, braveImpl = braveLocalEvidence, center = null,
  onlyFields = null, onProgress,
  deadline = 0,
} = {}) {
  const options = { env, fetchImpl: dossierDeadlineFetch(fetchImpl, deadline), resolveImpl, extractImpl, deadline };
  let merged = normalizeDossierEvidence({ ...dossier }, place);
  const needs = Array.isArray(onlyFields) && onlyFields.length
    ? onlyFields
    : braveTopUpFieldsPending(merged, place);
  if (!needs.length) return merged;
  let shortcomings = Array.isArray(merged.shortcomings) ? [...merged.shortcomings] : [];
  for (const field of needs) {
    let filled = merged.fieldCounts[field]?.status === 'ok';
    const previous = shortcomings.find((row) => row.field === field)?.attempts?.length || 0;
    const ledger = (merged.attempts || []).filter((row) => row.kind === 'gap_top_up' && row.field === field);
    const logged = Math.max(ledger.length, ...ledger.map((row) => Number(row.attempt) || 0));
    for (let attempt = Math.max(previous, logged); attempt < 3 && !filled; attempt += 1) {
      if (outOfTime(options)) break;
      const queries = topUpQueriesForField(field, place, destination, attempt);
      if (!queries.length) break;
      const entry = { kind: 'gap_top_up', field, attempt: attempt + 1, query: queries[0].query, startedAt: new Date().toISOString(), status: 'started' };
      merged.attempts = [...(merged.attempts || []), entry];
      if (onProgress) await onProgress(merged);
      const gathered = await gatherBraveEvidenceForQueries(queries, place, options);
      merged = mergeDossierPages(merged, gathered);
      merged = normalizeDossierEvidence(merged, place);
      const status = merged.fieldCounts[field]?.status;
      filled = status === 'ok';
      const att = gathered.attempts?.[gathered.attempts.length - 1] || {};
      Object.assign(entry, { status: att.status || 'no_change', finishedAt: new Date().toISOString() });
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
      merged.shortcomings = shortcomings;
      if (onProgress) await onProgress(merged);
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
  merged = syncDossierRequiredShortcomings(merged, place);
  return merged;
}

export async function gatherThingEvidence(place = {}, {
  destination = '', center = null, env = process.env, fetchImpl = globalThis.fetch,
  resolveImpl = lookup, extractImpl = extractTavily, braveImpl = braveLocalEvidence,
  deadline = 0, onProgress, bravePace = { nextAt: 0 }, sleepImpl,
} = {}) {
  const name = String(place.title || place.name || '').trim();
  if (!name) throw new Error('evidence_thing_name_required');
  const options = {
    env, fetchImpl: dossierDeadlineFetch(fetchImpl, deadline), resolveImpl, extractImpl, deadline, place, bravePace, sleepImpl,
    onProgress: onProgress ? (dossier) => onProgress({ ...dossier, thing: name }) : undefined,
  };
  const queries = stageQueries(place, destination);
  let dossier = await gatherBraveEvidenceForQueries(queries, place, options);
  dossier.thing = name;
  dossier.knownFor = dossier.knownFor || [];
  dossier.reviewsRead = 0;

  const official = place.website || place.url || place.sourceRecord?.website || place.sourceRecord?.url;
  if (official && dossier.pages.length < DOSSIER_MAX_PAGES && !outOfTime(options)) {
    const pages = await fetchEvidencePages(String(official), {
      ...options, attempts: dossier.attempts, existingUrls: new Set(dossier.pages.map((p) => p.url)),
    });
    for (const page of pages) {
      if (dossier.pages.length >= DOSSIER_MAX_PAGES) break;
      if (!dossier.pages.some((saved) => saved.url === page.url)) dossier.pages.push(page);
    }
  }

  if (onProgress) await onProgress(dossier);
  if (braveImpl && placeSupportsDossierReviews(place) && !outOfTime(options)) {
    try {
      const brave = await braveImpl(place, { destination, center, env, fetchImpl: options.fetchImpl, deadline, bravePace, sleepImpl });
      dossier.attempts.push(...(brave.attempts || []));
      for (const page of brave.pages || []) {
        if (!dossier.pages.some((p) => p.url === page.url)) dossier.pages.push(page);
      }
    } catch {
      dossier.attempts.push({ kind: 'brave', step: 'local', status: 'failed' });
    }
  }

  const record = dossier.pages.length ? flightRecordEvidence(place) : null;
  if (record && !dossier.pages.some((page) => page.url === record.url)) dossier.pages.push(record);
  dossier.fieldCounts = computeDossierFieldCounts(dossier, place);
  dossier.missingFields = fieldsNeedingCapture(dossier.fieldCounts, place);
  dossier.shortcomings = [];
  return dossier;
}
