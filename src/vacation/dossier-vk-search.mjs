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
const normalizeWhitespace = (value) => String(value || '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
const sourceSearchText = (source) => [source?.title, source?.text, source?.snippet].filter(text).join('\n');
const claimBody = (claim) => typeof claim === 'string' ? text(claim) : text(claim?.claim || claim?.text);

function resolveStringClaimBody(body, sources) {
  const claimBody = text(body);
  if (!claimBody) return null;
  for (const source of sources) {
    const page = normalizeWhitespace(sourceSearchText(source));
    const claim = normalizeWhitespace(claimBody);
    if (claim && page.includes(claim)) {
      return { claim: claimBody, text: claimBody, sourceUrl: source.url };
    }
  }
  return null;
}

function normalizeSummaryClaimEntry(claim, sources) {
  if (typeof claim === 'string') return resolveStringClaimBody(claim, sources);
  if (claim && typeof claim === 'object') return claim;
  return null;
}

function normalizeFieldClaimEntry(claim, sources) {
  if (typeof claim === 'string') return resolveStringClaimBody(claim, sources);
  if (claim && typeof claim === 'object') return claim;
  return null;
}

export function isThinVkSearchResult(result) {
  return !sourcesOf(result).length && !result?.rating?.primary && !list(result?.summaryClaims).length;
}

export function vkSearchClaimSupportOk(result) {
  if (result?.voicePass?.claimSupportOk !== true) return false;
  const sources = sourcesOf(result);
  const urls = new Set(sources.map((source) => source.url));
  return list(result?.summaryClaims).every((claim) => {
    if (typeof claim === 'string') return resolveStringClaimBody(claim, sources) !== null;
    return Boolean(claim?.sourceUrl && urls.has(claim.sourceUrl));
  });
}

function squash(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function verbatimOnPage(row, pageText) {
  const needle = squash(row);
  return Boolean(needle) && squash(pageText).includes(needle);
}

export function personFramedReview(body) {
  return /\b(reviewers?|guests?|customers?|diners?|travell?ers?|shoppers?|visitors?|patrons?)\s+(on|at|says|said|writes|wrote|notes|noted|praises|praised|calls|called|adds|added)\b/i.test(body)
    || /^[^.:]{0,80}\b(reviewer|guest|customer|diner|traveller|traveler|shopper|visitor)\b[^.:]{0,40}:/i.test(body)
    || /\b(one|another|a)\s+(\w+\s+)?(reviewer|guest|customer|diner|traveller|traveler|shopper|visitor)\b/i.test(body)
    || /["“”]/.test(body)
    || /\b(my|me|we|our|us)\b/i.test(body)
    || /\bI\b|\bI['’]/.test(body);
}

function reviewStars(result, n) {
  const tripCom = /trip\.com/i.test(text(result[`review${n}Source`]));
  const tenMatch = text(result[`review${n}Rating`]).match(/^(\d+(?:\.\d+)?)\s*\/\s*10$/);
  const stars = Number(result[`review${n}Stars`]);
  if (Number.isInteger(stars) && stars >= 1 && stars <= 5) return { rating: stars, evidence: tripCom && tenMatch ? `${tenMatch[1]}/10` : `${stars}/5` };
  const raw = text(result[`review${n}Score10`]) || (tripCom && tenMatch ? tenMatch[1] : '');
  const score = Number(raw);
  if (!raw || !/trip\.com/i.test(text(result[`review${n}Source`])) || !Number.isFinite(score) || score <= 0 || score > 10) return null;
  return { rating: Math.min(5, Math.max(1, Math.round(score / 2))), evidence: `${raw}/10` };
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

function ratingTupleMatchesQuote({ site, average, count, scale, quote }) {
  const normalized = quote.replace(/\s+/g, ' ').trim();
  const explicit = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:\/|(?:out )?of)\s*(5|10)\s*(?:bubbles|stars)?\s*(?:Very good|Good|Great|Excellent)?\s*\(?([\d,]+)\s+reviews?\)?$/i);
  const implicit = site === 'tripadvisor' && normalized.match(/^(\d+(?:\.\d+)?)\s+(?:Very good|Good|Great|Excellent)\s*\(([\d,]+)\)$/i);
  const named = normalized.match(/^(yelp|tripadvisor|tripadvisor\.com|trip\.com) rating (\d+(?:\.\d+)?) from ([\d,]+) reviews?$/i);
  const namedTuple = named && named[1].toLowerCase().replace('.com', '') === site.replace('.com', '')
    ? [Number(named[2]), 5, Number(named[3].replace(/,/g, ''))] : null;
  const tuple = explicit ? [Number(explicit[1]), Number(explicit[2]), Number(explicit[3].replace(/,/g, ''))]
    : implicit ? [Number(implicit[1]), 5, Number(implicit[2].replace(/,/g, ''))] : namedTuple;
  return Boolean(tuple && tuple[0] === average && tuple[1] === scale && tuple[2] === count);
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
  const rawInputClaims = list(result.summaryClaims);
  const inputClaims = rawInputClaims
    .map((claim) => normalizeSummaryClaimEntry(claim, sources))
    .filter(Boolean);
  const verdictEligible = (claim) => claim && (!Object.hasOwn(claim, 'supported') || claim.supported === true);
  const rejected = rawInputClaims.filter((claim) => !voiceAllowed || claim?.supported === false)
    .map((claim) => claimBody(claim)).filter(Boolean);
  for (const page of pages) {
    page.inputClaimVerdicts = inputClaims.filter((claim) => claim?.sourceUrl === page.url && Object.hasOwn(claim, 'supported'))
      .map((claim) => ({ text: claimBody(claim), supported: typeof claim.supported === 'boolean' ? claim.supported : null }));
    page.rejectedClaimTexts = [...rejected];
    page.summaryExcerptAllowed = voiceAllowed && !inputClaims.some((claim) => claim?.supported === false && claim.sourceUrl === page.url);
  }
  const pageSupports = (index, value) => voiceAllowed && typeof pages[index]?.fetchedAt === 'string'
    && Number.isFinite(Date.parse(pages[index].fetchedAt))
    && claimTextVerdictEligible(value, pages[index].inputClaimVerdicts)
    && claimTextSupportedByPage(value, pages[index].text);
  const mapWrittenField = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const value = text(raw.value);
    const rows = list(raw.claims);
    if (!value && !rows.length) return null;
    const claims = rows.flatMap((entry) => {
      const claim = normalizeFieldClaimEntry(entry, sources) || entry;
      if (!verdictEligible(claim)) return [];
      const body = claimBody(claim);
      if (!body || claimTextWasRejected(body, rejected)) return [];
      const sourceUrl = text(claim.sourceUrl || raw.sourceUrl);
      const index = sourceUrl ? pageIndex(sourceUrl) : -1;
      if (index < 0 || !pageSupports(index, body)) return [];
      return [{
        text: body,
        sourceUrl: pages[index].url,
        pages: [`p${index + 1}`],
        ...(Object.hasOwn(claim, 'supported') ? { supported: claim.supported } : { supported: true }),
      }];
    });
    if (!claims.length) return null;
    return { value, claims };
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
  const eligible = (claim) => verdictEligible(claim)
    && pageSupports(pageIndex(claim?.sourceUrl), claimBody(claim));
  const claims = inputClaims.filter((claim) => eligible(claim)
    && !claimTextWasRejected(claimBody(claim), rejected));
  const scalar = (key, value, index) => {
    if (!text(value) || claimTextWasRejected(value, rejected) || !pageSupports(index, value)) return;
    dossier.fields[key] = { value, claims: [{ text: value, sourceUrl: pages[index].url, pages: [`p${index + 1}`], supported: true }] };
  };
  const hint = (key, raw, sourceUrl) => {
    if (raw && typeof raw === 'object' && !verdictEligible(raw)) return;
    const value = text(raw?.value ?? raw);
    const explicit = raw?.sourceUrl || sourceUrl;
    const claim = claims.find((row) => claimBody(row).includes(value) && pageSupports(pageIndex(row.sourceUrl), value));
    const official = sources.findIndex((source) => !/yelp\.|google\.|tripadvisor\./i.test(new URL(source.url).hostname));
    const supporting = pages.findIndex((_, i) => pageSupports(i, value));
    const index = explicit ? pageIndex(explicit) : claim ? pageIndex(claim.sourceUrl) : supporting >= 0 ? supporting : official >= 0 ? official : pages.length ? 0 : -1;
    scalar(key, value, index);
  };
  hint('hours', result.hoursHint, result.hoursSourceUrl);
  hint('happyHourDetails', result.happyHourHint, result.happyHourSourceUrl);
  hint('price', result.priceHint, result.priceSourceUrl);
  if (supported && text(result.itineraryNoteCandidate)) {
    hint('itineraryNote', result.itineraryNoteCandidate, result.itineraryNoteSourceUrl);
    if (dossier.fields.itineraryNote) dossier.itineraryNote = dossier.fields.itineraryNote.value;
  }
  const reviews = [1, 2, 3, 4].flatMap((n) => {
    const body = text(result[`review${n}`]);
    if (!body || claimTextWasRejected(body, rejected) || personFramedReview(body)) return [];
    const pasted = [body, ...body.split(/(?<=[.!?])\s+/)]
      .filter((row) => row.split(/\s+/).length >= 8)
      .some((row) => pages.some((page) => verbatimOnPage(row, page?.text)));
    if (pasted) return [];
    const lineUrl = text(result[`review${n}SourceUrl`]);
    const supportClaims = list(result[`review${n}Claims`]).flatMap((raw) => {
      const quote = text(typeof raw === 'string' ? raw : raw?.text);
      const index = pageIndex(text(raw?.sourceUrl) || lineUrl);
      if (!quote || index < 0 || claimTextWasRejected(quote, rejected) || !pageSupports(index, quote)) return [];
      return [{ text: quote, sourceUrl: pages[index].url, pages: [`p${index + 1}`], supported: true }];
    });
    if (!supportClaims.length) return [];
    const stars = reviewStars(result, n);
    return [{
      text: body,
      representative: true,
      ...(stars ? { rating: stars.rating, starsEvidence: stars.evidence } : {}),
      ...(text(result[`review${n}Theme`]) ? { theme: text(result[`review${n}Theme`]) } : {}),
      ...(text(result[`review${n}Source`]) ? { source: text(result[`review${n}Source`]) } : {}),
      claims: supportClaims,
    }];
  });
  if (reviews.length === 4) {
    dossier.reviews = reviews;
    const label = text(result.reviewsLabel);
    if (/^Representative reviews written from \d+ reviews$/.test(label)) dossier.reviewsLabel = label;
  }
  const source = text(result.rating?.primarySource).toLowerCase();
  const average = Number(result.rating?.primary);
  if (voiceAllowed && verdictEligible(result.rating)
    && ['yelp', 'google', 'tripadvisor', 'restaurantji'].includes(source) && average > 0 && average <= 5) {
    const url = result.rating.sourceUrl || result.rating.primarySourceUrl;
    const claim = claims.find((row) => claimBody(row).toLowerCase().includes(source));
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
  const evidence = result.rating?.ratingEvidence;
  if (!dossier.ratingEvidence && voiceAllowed && evidence && typeof evidence === 'object') {
    const site = text(evidence.site).toLowerCase().replace(/\s+/g, '');
    const average = Number(evidence.average);
    const count = Number(evidence.count);
    const scale = Number(evidence.scale);
    const quote = text(evidence.quote);
    const index = text(evidence.sourceUrl) ? pageIndex(text(evidence.sourceUrl)) : -1;
    if (['yelp', 'google', 'tripadvisor', 'trip.com', 'restaurantji', 'exa'].includes(site)
      && [5, 10].includes(scale) && average > 0 && average <= scale && Number.isInteger(count) && count > 0
      && ratingTupleMatchesQuote({ site, average, count, scale, quote })
      && quote && !claimTextWasRejected(quote, rejected) && pageSupports(index, quote)) {
      const rating = { average, count, scaleMax: scale, quote, url: pages[index].url, source: site };
      pages[index].braveRating = rating;
      dossier.rating = Math.round((average * 50) / scale) / 10;
      dossier.reviewsAvailable = count;
      dossier.ratingEvidence = { ...rating, pages: [`p${index + 1}`] };
    }
  }
  if (dossier.reviews && dossier.rating > 0 && dossier.reviews.every((row) => row.rating)) {
    const mean = dossier.reviews.reduce((sum, row) => sum + row.rating, 0) / 4;
    if (Math.abs(mean - dossier.rating) > 0.5) for (const row of dossier.reviews) { delete row.rating; delete row.starsEvidence; }
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
