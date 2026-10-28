import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descriptionNamesThing, fitDescriptionWords } from './thing-dossier-fields.mjs';

export const VK_SEARCH_BOT_ID = 'aa90bc69-c4eb-4237-a2f9-bcd76cd14dce';
export const VK_SEARCH_PROVIDER = 'vk-search';
const censusDefault = fileURLToPath(new URL('../../scripts/fixtures/vk-search-census/results/', import.meta.url));
const text = (value) => typeof value === 'string' ? value.trim() : '';
const list = (value) => Array.isArray(value) ? value : [];
function publicUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
const sourcesOf = (result) => list(result?.sources).filter((source) => publicUrl(source?.url));

export function isThinVkSearchResult(result) {
  return !sourcesOf(result).length && !result?.rating?.primary && !list(result?.summaryClaims).length;
}

export function vkSearchClaimSupportOk(result) {
  const urls = new Set(sourcesOf(result).map((source) => source.url));
  return result?.voicePass?.claimSupportOk === true
    && list(result?.summaryClaims).every((claim) => urls.has(claim?.sourceUrl));
}

export function loadVkSearchCensusResult(place, { env = process.env, censusDir } = {}) {
  const id = String(place?.id || place?.placeId || place?.rowId || '');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  try {
    return JSON.parse(readFileSync(join(env.VK_SEARCH_CENSUS_DIR || censusDir || censusDefault, `${id}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function vkSearchResultToDossier(result = {}, place = {}) {
  const thin = isThinVkSearchResult(result);
  const supported = vkSearchClaimSupportOk(result);
  const thing = text(place.title || place.name || result.thingName);
  const sources = thin ? [] : sourcesOf(result);
  const now = new Date().toISOString();
  const pages = sources.map((source) => ({
    url: source.url,
    fetchedAt: Number.isFinite(Date.parse(source.fetchedAt)) ? source.fetchedAt : now,
    text: [thing, source.title, source.text, source.snippet].filter(text).join('\n'),
    via: VK_SEARCH_PROVIDER,
  }));
  const dossier = {
    thing, pages, fields: {},
    attempts: [{ provider: result.provider || VK_SEARCH_PROVIDER, kind: VK_SEARCH_PROVIDER,
      stage: 'discovery', status: thin ? 'thin' : supported ? 'ok' : 'claim_support_failed', botId: VK_SEARCH_BOT_ID }],
  };
  const pageIndex = (url) => pages.findIndex((page) => page.url === url);
  const claims = list(result.summaryClaims).filter((claim) => text(claim?.claim || claim?.text) && pageIndex(claim.sourceUrl) >= 0);
  const append = (index, value) => { pages[index].text += `\n${value}`; };
  const scalar = (key, value, index) => {
    if (!text(value) || index < 0) return;
    append(index, value);
    dossier.fields[key] = { value, claims: [{ text: value, sourceUrl: pages[index].url, pages: [`p${index + 1}`], supported: true }] };
  };
  for (const claim of claims) append(pageIndex(claim.sourceUrl), text(claim.claim || claim.text));
  const wordCount = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;
  const citations = claims.map((claim) => ({ text: text(claim.claim || claim.text), sourceUrl: claim.sourceUrl,
    pages: [`p${pageIndex(claim.sourceUrl) + 1}`], supported: true }));
  const claimText = claims.map((claim) => text(claim.claim || claim.text)).filter(Boolean).join(' ');
  const pageBits = pages.map((page) => text(page.text)).filter(Boolean);
  const compose = (minWords, maxWords) => {
    const parts = [];
    if (thing) parts.push(thing);
    if (claimText) parts.push(claimText);
    for (const bit of pageBits) {
      if (wordCount(parts.join(' ')) >= minWords) break;
      const next = bit.replace(/\s+/g, ' ').trim();
      if (!next || parts.some((part) => part.includes(next.slice(0, 40)))) continue;
      parts.push(next);
    }
    let value = parts.join('. ').replace(/\s+/g, ' ').trim();
    if (thing && !descriptionNamesThing(value, thing)) value = `${thing}: ${value}`;
    return fitDescriptionWords(value, maxWords);
  };
  if (claims.length || pages.length) {
    const summaryValue = compose(12, 40);
    const descriptionValue = compose(40, 120);
    if (wordCount(summaryValue) >= 12 && descriptionNamesThing(summaryValue, thing)) {
      dossier.fields.summary = { value: summaryValue, claims: citations.length ? citations : [{ text: summaryValue, sourceUrl: pages[0]?.url, pages: ['p1'], supported: true }] };
    }
    if (wordCount(descriptionValue) >= 40 && descriptionNamesThing(descriptionValue, thing) && pages.length) {
      dossier.fields.description = { value: descriptionValue, claims: citations.length ? citations : [{ text: descriptionValue, sourceUrl: pages[0]?.url, pages: ['p1'], supported: true }] };
    } else if (pages.length && !dossier.fields.description) {
      scalar('description', descriptionValue || pages.map((page) => page.text).join('\n'), 0);
    }
  }
  const hint = (key, raw, sourceUrl) => {
    const value = text(raw?.value ?? raw);
    const explicit = raw?.sourceUrl || sourceUrl;
    const claim = claims.find((row) => text(row.claim || row.text).includes(value));
    const official = sources.findIndex((source) => !/yelp\.|google\.|tripadvisor\./i.test(new URL(source.url).hostname));
    const index = explicit ? pageIndex(explicit) : claim ? pageIndex(claim.sourceUrl) : official >= 0 ? official : pages.length ? 0 : -1;
    scalar(key, value, index);
  };
  hint('hours', result.hoursHint, result.hoursSourceUrl);
  hint('happyHourDetails', result.happyHourHint, result.happyHourSourceUrl);
  hint('price', result.priceHint, result.priceSourceUrl);
  if (supported && text(result.itineraryNoteCandidate)) {
    hint('itineraryNote', result.itineraryNoteCandidate, result.itineraryNoteSourceUrl);
    if (dossier.fields.itineraryNote) dossier.itineraryNote = dossier.fields.itineraryNote.value;
  }
  const source = text(result.rating?.primarySource).toLowerCase();
  const average = Number(result.rating?.primary);
  if (['yelp', 'google', 'tripadvisor'].includes(source) && average > 0 && average <= 5) {
    const url = result.rating.sourceUrl || result.rating.primarySourceUrl;
    const claim = claims.find((row) => text(row.claim || row.text).toLowerCase().includes(source));
    const index = url ? pageIndex(url) : sources.findIndex((row) => new URL(row.url).hostname.includes(`${source}.`));
    const citing = index >= 0 ? index : !url && claim ? pageIndex(claim.sourceUrl) : -1;
    if (citing >= 0) {
      const count = Number(result.reviewCount?.[source]);
      const quote = `${thing}: ${source} rating ${average}/5${count > 0 ? ` from ${count} reviews` : ''}`;
      append(citing, quote);
      const rating = { average, ...(count > 0 ? { count } : {}), scaleMax: 5, quote, url: pages[citing].url, source };
      pages[citing].braveRating = rating;
      if (count > 0) {
        dossier.rating = average;
        dossier.reviewsAvailable = count;
        dossier.ratingEvidence = { ...rating, pages: [`p${citing + 1}`] };
      }
      if (source === 'yelp' || source === 'google') {
        dossier[`${source}Rating`] = average;
        if (count > 0) dossier[`${source}ReviewCount`] = count;
        dossier[`${source}RatingSourceUrl`] = pages[citing].url;
      }
    }
  }
  for (const page of pages) page.sha256 = createHash('sha256').update(page.text).digest('hex');
  return dossier;
}

async function defaultVkSearchImpl(place, { env, fetchImpl }) {
  if (env.VK_SEARCH_WAKE_URL) {
    const response = await fetchImpl(env.VK_SEARCH_WAKE_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botId: VK_SEARCH_BOT_ID, place }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`vk_search_http_${response.status}`);
    return response.json();
  }
  return loadVkSearchCensusResult(place, { env })
    || { provider: VK_SEARCH_PROVIDER, sources: [], voicePass: { claimSupportOk: false } };
}

export async function gatherVkSearchEvidence(place, { vkSearchImpl, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  try {
    const result = await (vkSearchImpl || defaultVkSearchImpl)(place, { env, fetchImpl });
    return vkSearchResultToDossier(result || {}, place);
  } catch (error) {
    const dossier = vkSearchResultToDossier({}, place);
    dossier.attempts[0].error = String(error?.message || error).slice(0, 120);
    return dossier;
  }
}
