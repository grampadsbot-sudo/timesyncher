import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimTextSupportedByPage, claimTextWasRejected, claimTextVerdictEligible } from './dossier-claim-support.mjs';

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
  const voiceAllowed = result?.voicePass?.claimSupportOk !== false;
  const thing = text(place.title || place.name || result.thingName);
  const sources = thin ? [] : sourcesOf(result);
  const pages = sources.map((source) => ({
    url: source.url,
    fetchedAt: source.fetchedAt,
    text: [source.title, source.text, source.snippet].filter(text).join('\n'),
    via: VK_SEARCH_PROVIDER,
    claimSupportOk: result?.voicePass?.claimSupportOk,
  }));
  const dossier = {
    thing, pages, fields: {},
    attempts: [{ provider: result.provider || VK_SEARCH_PROVIDER, kind: VK_SEARCH_PROVIDER,
      stage: 'discovery', status: thin ? 'thin' : supported ? 'ok' : 'claim_support_failed', botId: VK_SEARCH_BOT_ID }],
  };
  const pageIndex = (url) => pages.findIndex((page) => page.url === url);
  const mapWrittenField = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const value = text(raw.value);
    const rows = list(raw.claims);
    if (!value && !rows.length) return null;
    const claims = rows.map((claim) => {
      const body = text(claim.text || claim.claim);
      const sourceUrl = text(claim.sourceUrl || raw.sourceUrl);
      const index = sourceUrl ? pageIndex(sourceUrl) : -1;
      const row = {
        text: body,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(Object.hasOwn(claim, 'supported') ? { supported: claim.supported } : {}),
      };
      if (index >= 0) {
        row.sourceUrl = pages[index].url;
        row.pages = [`p${index + 1}`];
        if (!Object.hasOwn(row, 'supported')) row.supported = true;
      } else if (claim.pages?.length) {
        row.pages = claim.pages;
      }
      return row;
    }).filter((claim) => claim.text);
    if (!value && !claims.length) return null;
    return { value: value || claims.map((claim) => claim.text).join(' '), claims };
  };
  const written = result.fields && typeof result.fields === 'object' ? result.fields
    : result.dossierFields && typeof result.dossierFields === 'object' ? result.dossierFields : null;
  if (written) {
    for (const key of ['summary', 'description', 'itineraryNote', 'hours', 'happyHourDetails', 'price']) {
      const field = mapWrittenField(written[key]);
      if (field) dossier.fields[key] = field;
    }
    if (dossier.fields.itineraryNote) dossier.itineraryNote = dossier.fields.itineraryNote.value;
  }
  const pageSupports = (index, value) => voiceAllowed && typeof pages[index]?.fetchedAt === 'string'
    && Number.isFinite(Date.parse(pages[index].fetchedAt))
    && claimTextVerdictEligible(value, pages[index].inputClaimVerdicts)
    && claimTextSupportedByPage(value, pages[index].text);
  const inputClaims = list(result.summaryClaims);
  const verdictEligible = (claim) => claim && (!Object.hasOwn(claim, 'supported') || claim.supported === true);
  const eligible = (claim) => verdictEligible(claim)
    && pageSupports(pageIndex(claim?.sourceUrl), text(claim?.claim || claim?.text));
  const rejected = inputClaims.filter((claim) => !voiceAllowed || claim?.supported === false)
    .map((claim) => text(claim?.claim || claim?.text)).filter(Boolean);
  for (const page of pages) {
    page.inputClaimVerdicts = inputClaims.filter((claim) => claim?.sourceUrl === page.url && Object.hasOwn(claim, 'supported'))
      .map((claim) => ({ text: text(claim.claim || claim.text), supported: typeof claim.supported === 'boolean' ? claim.supported : null }));
    page.rejectedClaimTexts = [...rejected];
    page.summaryExcerptAllowed = voiceAllowed && !inputClaims.some((claim) => claim?.supported === false && claim.sourceUrl === page.url);
  }
  const claims = inputClaims.filter((claim) => eligible(claim)
    && !claimTextWasRejected(text(claim.claim || claim.text), rejected));
  const scalar = (key, value, index) => {
    if (!text(value) || claimTextWasRejected(value, rejected) || !pageSupports(index, value)) return;
    dossier.fields[key] = { value, claims: [{ text: value, sourceUrl: pages[index].url, pages: [`p${index + 1}`], supported: true }] };
  };
  const hint = (key, raw, sourceUrl) => {
    if (raw && typeof raw === 'object' && !verdictEligible(raw)) return;
    const value = text(raw?.value ?? raw);
    const explicit = raw?.sourceUrl || sourceUrl;
    const claim = claims.find((row) => text(row.claim || row.text).includes(value) && pageSupports(pageIndex(row.sourceUrl), value));
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
  if (voiceAllowed && verdictEligible(result.rating)
    && ['yelp', 'google', 'tripadvisor'].includes(source) && average > 0 && average <= 5) {
    const url = result.rating.sourceUrl || result.rating.primarySourceUrl;
    const claim = claims.find((row) => text(row.claim || row.text).toLowerCase().includes(source));
    const index = url ? pageIndex(url) : sources.findIndex((row) => new URL(row.url).hostname.includes(`${source}.`));
    const citing = index >= 0 ? index : !url && claim ? pageIndex(claim.sourceUrl) : -1;
    const count = Number(result.reviewCount?.[source]);
    const ratingText = `${source} rating ${average}${count > 0 ? ` from ${count} reviews` : ''}`;
    if (!claimTextWasRejected(ratingText, rejected) && pageSupports(citing, ratingText)) {
      const quote = pages[citing].text;
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
