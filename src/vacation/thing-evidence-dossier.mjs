import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { searchTavily } from './poi-search.mjs';

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

export function dossierPagesVerified(dossier = {}) {
  return Array.isArray(dossier.pages) && dossier.pages.length > 0 && dossier.pages.every((page) =>
    /^https?:\/\//.test(page.url || '') && Number.isFinite(Date.parse(page.fetchedAt)) && page.text?.trim()
    && createHash('sha256').update(page.text).digest('hex') === page.sha256);
}

export async function gatherThingEvidence(place = {}, {
  destination = '', env = process.env, fetchImpl = globalThis.fetch,
  searchImpl = searchTavily, resolveImpl = lookup,
} = {}) {
  const name = String(place.title || place.name || '').trim();
  if (!name) throw new Error('evidence_thing_name_required');
  const dossier = { thing: name, pages: [], attempts: [], reviewsRead: 0, knownFor: [] };
  const urls = new Set();
  const official = place.website || place.url || place.sourceRecord?.website || place.sourceRecord?.url;
  if (official) urls.add(official);
  for (const topic of ['official website menu prices opening hours happy hour', 'ratings reviews', 'articles known for']) {
    try {
      const result = await searchImpl(`${name} ${destination} ${topic}`, { env, fetchImpl, maxResults: 10, searchDepth: 'advanced' });
      for (const row of result.results || []) if (row.url) urls.add(row.url);
      dossier.attempts.push({ kind: 'search', topic, status: 'ok' });
    } catch {
      dossier.attempts.push({ kind: 'search', topic, status: 'failed' });
    }
  }
  for (const url of urls) {
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
