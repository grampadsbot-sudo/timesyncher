import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractTavily, searchTavily } from './poi-search.mjs';

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
  return {
    ...persisted,
    ...gathered,
    thing: gathered.thing || persisted.thing,
    pages: [...byUrl.values()],
    attempts: [...(persisted.attempts || []), ...(gathered.attempts || [])],
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

export async function gatherThingEvidence(place = {}, {
  destination = '', env = process.env, fetchImpl = globalThis.fetch,
  searchImpl = searchTavily, resolveImpl = lookup, extractImpl = extractTavily,
} = {}) {
  const name = String(place.title || place.name || '').trim();
  if (!name) throw new Error('evidence_thing_name_required');
  const dossier = { thing: name, pages: [], attempts: [], reviewsRead: 0, knownFor: [] };
  const urls = new Set();
  const raw = new Map();
  const addPage = (url, text, via) => {
    if (!text || dossier.pages.some((page) => page.url === url)) return;
    dossier.pages.push({ url, fetchedAt: new Date().toISOString(), text, via,
      sha256: createHash('sha256').update(text).digest('hex') });
  };
  const official = place.website || place.url || place.sourceRecord?.website || place.sourceRecord?.url;
  if (official) urls.add(official);
  for (const topic of ['official website menu prices opening hours happy hour', 'ratings reviews', 'articles known for']) {
    try {
      const result = await searchImpl(`${name} ${destination} ${topic}`, { env, fetchImpl, maxResults: 10, searchDepth: 'advanced', includeRawContent: true });
      for (const row of result.results || []) {
        if (!row.url) continue;
        urls.add(row.url);
        if (row.rawContent && !raw.has(row.url)) raw.set(row.url, row.rawContent);
      }
      dossier.attempts.push({ kind: 'search', topic, status: 'ok' });
    } catch {
      dossier.attempts.push({ kind: 'search', topic, status: 'failed' });
    }
  }
  const missing = [...urls].filter((url) => !raw.has(url));
  if (missing.length) {
    try {
      for (const row of await extractImpl(missing, { env, fetchImpl })) if (!raw.has(row.url)) raw.set(row.url, row.rawContent);
      dossier.attempts.push({ kind: 'extract', status: 'ok', urls: missing.length });
    } catch {
      dossier.attempts.push({ kind: 'extract', status: 'failed', urls: missing.length });
    }
  }
  for (const url of urls) {
    const text = String(raw.get(url) || '').replace(/\s+/g, ' ').trim();
    if (text) {
      addPage(url, text, 'tavily');
      dossier.attempts.push({ kind: 'page', url, status: 'ok', via: 'tavily' });
      continue;
    }
    try {
      const response = await pageResponse(url, { fetchImpl, resolveImpl });
      const text = pageText(response.body, response.type);
      if (!text) throw new Error('evidence_page_empty');
      if (!dossier.pages.some((page) => page.url === response.url)) dossier.pages.push({
        url: response.url, fetchedAt: new Date().toISOString(), text,
        sha256: createHash('sha256').update(text).digest('hex'),
      });
      dossier.attempts.push({ kind: 'page', url, status: 'ok' });
    } catch {
      dossier.attempts.push({ kind: 'page', url, status: 'failed' });
    }
  }
  return dossier;
}
