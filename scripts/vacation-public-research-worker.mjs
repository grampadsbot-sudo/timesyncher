#!/usr/bin/env node

import { fillTripIntake, lodgingFromChat } from '../src/vacation/place-search.mjs';
import { DEFAULT_FIRST_PASS_MINIMUMS, firstPassSearchLimit } from '../src/vacation/keepsake-list-minimums.mjs';

export { DEFAULT_FIRST_PASS_MINIMUMS, firstPassSearchLimit };

const VALID_CATEGORIES = new Set(['hotel', 'flight', 'car', 'restaurant', 'store', 'activity', 'tour', 'event', 'transport', 'decision']);

function floorCategoryMin(value, floor) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(floor, parsed) : floor;
}
const PRIVATE_PATTERNS = [
  /\bg\s?mail\b/i,
  /\bgoogle\s+calendar\b/i,
  /\bgoogle\s+drive\b/i,
  /\bgoogle\s+contacts\b/i,
  /\bprivate\s+gbrain\b/i,
  /\bshell\b|\bssh\b|\bsudo\b/i,
  /\bbook\b|\breserve\b|\bpurchase\b|\bpay\b/i,
];

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function publicUrl(value) {
  try {
    const parsed = new URL(text(value, 1000));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function addDaysIso(baseIso, days) {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function houseRadiusPlace(candidate = {}) {
  return Boolean(candidate.poiId)
    && finiteNumber(candidate.lat) !== null
    && finiteNumber(candidate.lng) !== null
    && Boolean(publicUrl(candidate.website));
}

function categoryBucket(category) {
  const value = text(category, 40).toLowerCase();
  if (value === 'restaurant') return 'restaurant';
  if (value === 'store') return 'store';
  if (['hotel', 'flight', 'car'].includes(value)) return value;
  return 'rest';
}

function categoryCounts(candidates = []) {
  const counts = { restaurant: 0, store: 0, rest: 0, hotel: 0, flight: 0, car: 0 };
  for (const candidate of candidates) {
    counts[categoryBucket(candidate.category)] += 1;
  }
  return counts;
}

export function firstPassMinimums(input = {}, env = process.env) {
  return {
    restaurant: floorCategoryMin(input.minimums?.restaurant || env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_RESTAURANTS, DEFAULT_FIRST_PASS_MINIMUMS.restaurant),
    store: floorCategoryMin(input.minimums?.store || env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_STORES, DEFAULT_FIRST_PASS_MINIMUMS.store),
    rest: floorCategoryMin(input.minimums?.rest || env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_REST, DEFAULT_FIRST_PASS_MINIMUMS.rest),
  };
}

export function firstPassMissingMinimums(candidates = [], minimums = DEFAULT_FIRST_PASS_MINIMUMS) {
  const counts = categoryCounts(candidates);
  const missing = {};
  for (const key of ['restaurant', 'store', 'rest']) {
    if (counts[key] < minimums[key]) missing[key] = { count: counts[key], minimum: minimums[key] };
  }
  return { counts, missing };
}

export function assertRequiredFirstPassMinimums(candidates = [], minimums = DEFAULT_FIRST_PASS_MINIMUMS) {
  const required = firstPassMinimums({ minimums }, {});
  const { counts, missing } = firstPassMissingMinimums(candidates, required);
  if (Object.keys(missing).length) {
    throw new Error(
      `initial website fill requires per-category mins restaurant>=${required.restaurant} store>=${required.store} rest>=${required.rest} `
      + `(DEFAULT_FIRST_PASS_MINIMUMS in src/vacation/keepsake-list-minimums.mjs). `
      + `Got ${JSON.stringify(counts)}; missing ${JSON.stringify(missing)}. Under-min is fail-closed and cannot be skipped.`,
    );
  }
  return { ok: true, counts, minimums: required };
}

function hasThreeReviews(candidate) {
  return [candidate.review1, candidate.review2, candidate.review3].every((value) => text(value, 1000));
}

function isReviewEligible(candidate) {
  return !['flight', 'car', 'transport'].includes(text(candidate.category, 40).toLowerCase());
}

function missingThingDetails(candidates = []) {
  const missingReviews = candidates
    .filter((candidate) => isReviewEligible(candidate) && !houseRadiusPlace(candidate) && !hasThreeReviews(candidate))
    .map((candidate) => candidate.title);
  const missingHappyHour = candidates
    .filter((candidate) => {
      if (text(candidate.category, 40).toLowerCase() !== 'restaurant') return false;
      const sources = Array.isArray(candidate.happyHourSources) ? candidate.happyHourSources.filter(Boolean) : [];
      return !text(candidate.happyHourDetails, 1200) || sources.length === 0;
    })
    .map((candidate) => candidate.title);
  const missingCoordinates = candidates
    .filter((candidate) => finiteNumber(candidate.lat) === null || finiteNumber(candidate.lng) === null)
    .map((candidate) => candidate.title);
  return { missingReviews, missingHappyHour, missingCoordinates };
}

function firstPassReadyCandidate(candidate = {}) {
  if (finiteNumber(candidate.lat) === null || finiteNumber(candidate.lng) === null) return false;
  if (houseRadiusPlace(candidate)) return true;
  if (isReviewEligible(candidate) && !hasThreeReviews(candidate)) return false;
  if (text(candidate.category, 40).toLowerCase() === 'restaurant') {
    const sources = Array.isArray(candidate.happyHourSources) ? candidate.happyHourSources.filter(Boolean) : [];
    if (!text(candidate.happyHourDetails, 1200) || sources.length === 0) return false;
  }
  return true;
}

function selectFirstPassCandidates(candidates = [], minimums = DEFAULT_FIRST_PASS_MINIMUMS) {
  const selected = [];
  const bucketLimits = {
    restaurant: Math.max(minimums.restaurant, Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_MAX_RESTAURANTS || minimums.restaurant)),
    store: Math.max(minimums.store, Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_MAX_STORES || minimums.store)),
    rest: Math.max(minimums.rest, Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_MAX_REST || minimums.rest)),
  };
  const bucketCounts = { restaurant: 0, store: 0, rest: 0 };
  for (const candidate of candidates) {
    const bucket = categoryBucket(candidate.category);
    if (['hotel', 'flight', 'car'].includes(bucket)) {
      selected.push(candidate);
    } else if (bucketCounts[bucket] < bucketLimits[bucket]) {
      selected.push(candidate);
      bucketCounts[bucket] += 1;
    }
  }
  return selected;
}

export function blockedPrivateSignals(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value || {});
  return PRIVATE_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
}

export function buildResearchQueries(artifacts = {}) {
  const destination = text(artifacts.destination || 'destination', 120) || 'destination';
  const dates = text(artifacts.dates?.dateText || artifacts.dates?.startDate || '', 120);
  const requestText = text(artifacts.requestText, 4000);
  const base = [destination, dates].filter(Boolean).join(' ');
  const needsFlights = /\bflight|airport|airline|fly|flying|airfare\b/i.test(requestText);
  const suppressFlights = /\b(?:no|don't|do not|dont)\s+(?:need\s+)?(?:search\s+(?:for\s+)?)?(?:more\s+|extra\s+|additional\s+)?flights?\b|\bflights?\s+(?:are\s+)?(?:already\s+)?(?:set|booked|handled)\b/i.test(requestText);
  const suppressHotels = /\b(?:no|don't|do not|dont)\s+(?:need\s+)?(?:a\s+)?(?:hotel|hotels|lodging|place\s+to\s+stay)\b|\b(?:staying|stay)\s+(?:at|with)\s+(?:their|family|our\s+son|my\s+son)\b/i.test(requestText);
  const suppressCars = /\b(?:no|don't|do not|dont)\s+(?:need\s+)?(?:a\s+)?(?:car|cars|rental\s+car|rental\s+cars)\b/i.test(requestText);
  const queries = [];
  if (needsFlights && !suppressFlights) queries.push({ category: 'flight', query: `${base} flights airlines airports baggage fare official` });
  if (!suppressHotels) queries.push({ category: 'hotel', query: `${base} hotels official site cancellation fees location` });
  queries.push(
    { category: 'restaurant', query: `${base} restaurants official menu hours reservations` },
    { category: 'store', query: `${base} shopping grocery market official visitor information` },
    { category: 'activity', query: `${base} activities wineries kid friendly sightseeing official tickets hours` },
  );
  if (!suppressCars) queries.push({ category: 'transport', query: `${base} airport transfer rental car transit official` });
  return queries;
}

export function normalizeCandidate(raw = {}, context = {}) {
  const category = VALID_CATEGORIES.has(text(raw.category, 40)) ? text(raw.category, 40) : 'decision';
  const now = text(context.retrievedAt || new Date().toISOString(), 40);
  const sources = (Array.isArray(raw.sources) ? raw.sources : raw.website ? [{ label: 'Source', url: raw.website }] : [])
    .map((source) => ({
      label: text(source.label || source.title || 'Source', 120),
      url: publicUrl(source.url),
      retrievedAt: text(source.retrievedAt || now, 40),
      adapterId: text(source.adapterId || raw.adapterId || context.adapterId || context.provider || '', 120),
    }))
    .filter((source) => source.url);
  const sourceBacked = sources.length > 0;
  const adapterSources = Array.isArray(raw.adapterSources)
    ? raw.adapterSources.map((item) => ({
      adapterId: text(item.adapterId || raw.adapterId || context.adapterId || context.provider || '', 120),
      sourceId: text(item.sourceId || item.id || '', 160),
      safetyClass: text(item.safetyClass || '', 80),
      fetchedAt: text(item.fetchedAt || now, 40),
      status: text(item.status || 'source_checked', 80),
    })).filter((item) => item.adapterId || item.sourceId)
    : [];
  const sourceCaveats = Array.isArray(raw.sourceCaveats)
    ? raw.sourceCaveats.map((item) => text(item, 240)).filter(Boolean)
    : [];
  const caveats = Array.isArray(raw.caveats)
    ? raw.caveats.map((item) => text(item, 240)).filter(Boolean)
    : ['Verify current prices, availability, hours, seasonal details, and terms before relying on this option.'];
  const verifiedAt = text(raw.verifiedAt || raw.sourceQuality?.lastVerifiedAt || now, 40);
  const expiresAt = text(raw.expiresAt || raw.sourceQuality?.expiresAt || addDaysIso(verifiedAt, 14), 40);
  const adapterCount = new Set([
    ...adapterSources.map((item) => item.adapterId).filter(Boolean),
    ...sources.map((source) => source.adapterId).filter(Boolean),
    context.provider,
  ].filter(Boolean)).size;
  const sourceQuality = {
    sourceCount: Number(raw.sourceQuality?.sourceCount || sources.length),
    adapterCount: Number(raw.sourceQuality?.adapterCount || Math.max(adapterCount, context.provider ? 1 : 0)),
    safetyClass: text(raw.sourceQuality?.safetyClass || raw.safetyClass || '', 80),
    confidence: text(raw.sourceQuality?.confidence || (sources.length > 1 ? 'medium' : sourceBacked ? 'basic' : 'unverified'), 80),
    lastVerifiedAt: verifiedAt,
    expiresAt,
  };
  const qualitySignals = {
    freshness: text(raw.qualitySignals?.freshness || (sourceBacked ? 'source_checked' : 'needs_source'), 120),
    specificity: text(raw.qualitySignals?.specificity || (raw.area || context.destination ? 'destination_specific' : 'generic'), 120),
    caveatCount: Number(raw.qualitySignals?.caveatCount ?? caveats.length + sourceCaveats.length),
    recentSentiment: text(raw.qualitySignals?.recentSentiment || '', 160),
    ...(raw.qualitySignals && typeof raw.qualitySignals === 'object' ? raw.qualitySignals : {}),
  };
  return {
    category,
    subtype: text(raw.subtype || '', 80),
    title: text(raw.title || raw.name || `${category} option`, 160),
    summary: text(raw.summary || raw.description || '', 500),
    details: text(raw.details || raw.description || raw.summary || '', 3000),
    website: publicUrl(raw.website || sources[0]?.url),
    address: text(raw.address || raw.location || '', 240),
    lat: finiteNumber(raw.lat ?? raw.latitude),
    lng: finiteNumber(raw.lng ?? raw.longitude),
    price: text(raw.price || raw.priceNote || '', 120),
    area: text(raw.area || context.destination || '', 120),
    review1: text(raw.review1 || raw.reviews?.[0] || '', 1000),
    review2: text(raw.review2 || raw.reviews?.[1] || '', 1000),
    review3: text(raw.review3 || raw.reviews?.[2] || '', 1000),
    reviewSources: Array.isArray(raw.reviewSources) ? raw.reviewSources.map((item) => text(item, 500)).filter(Boolean) : [],
    googleRating: text(raw.googleRating || raw.rating || '', 40),
    yelpRating: text(raw.yelpRating || '', 40),
    thirdPartyRating: text(raw.thirdPartyRating || '', 80),
    happyHour: Boolean(raw.happyHour),
    happyHourDetails: text(raw.happyHourDetails || '', 1200),
    happyHourSources: Array.isArray(raw.happyHourSources) ? raw.happyHourSources.map((item) => text(item, 500)).filter(Boolean) : [],
    sources,
    sourceBacked,
    verificationStatus: text(raw.verificationStatus || (sourceBacked ? 'source_checked' : 'needs_browser_review'), 80),
    caveats,
    sourceCaveats,
    adapterSources,
    sourceQuality,
    qualitySignals,
    fitScores: raw.fitScores && typeof raw.fitScores === 'object' ? raw.fitScores : {},
    verifiedAt,
    expiresAt,
    poiId: text(raw.poiId || '', 160),
    structuredPoi: Boolean(raw.structuredPoi),
    metadata: {
      provider: text(context.provider || 'public-research-worker', 120),
      researchedAt: now,
      destination: text(context.destination || '', 160),
    },
  };
}

function mergeCandidateLists(primary = [], supplemental = []) {
  const seen = new Set();
  const merged = [];
  for (const candidate of [...primary, ...supplemental]) {
    const key = `${text(candidate.category, 40).toLowerCase()}::${text(candidate.title, 200).toLowerCase()}::${text(candidate.website || candidate.sources?.[0]?.url || '', 500).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged;
}

function listed(value) {
  return Array.isArray(value) ? value : [];
}

function researchJob(input = {}) {
  const job = input.job && typeof input.job === 'object' ? input.job : {};
  const jobInput = job.input && typeof job.input === 'object' ? job.input : {};
  const artifacts = input.artifacts && typeof input.artifacts === 'object' ? input.artifacts : {};
  const wantedThings = listed(input.wantedThings).length
    ? input.wantedThings
    : listed(jobInput.wantedThings).length
      ? jobInput.wantedThings
      : listed(job.wantedThings).length
        ? job.wantedThings
        : listed(artifacts.wantedThings);
  const intakeEvent = input.intakeEvent ?? jobInput.intakeEvent ?? job.intakeEvent ?? artifacts.intakeEvent ?? null;
  return { wantedThings, intakeEvent, artifacts };
}

function stayPoint(artifacts = {}) {
  const places = [artifacts.house, artifacts.lodging, artifacts.origin, artifacts.stay];
  for (const place of places) {
    if (!place || typeof place !== 'object') continue;
    const lat = finiteNumber(place.lat ?? place.latitude);
    const lng = finiteNumber(place.lng ?? place.longitude);
    if (lat !== null && lng !== null) return { lat, lng };
  }
  const lat = finiteNumber(artifacts.houseLat ?? artifacts.originLat);
  const lng = finiteNumber(artifacts.houseLng ?? artifacts.originLng);
  if (lat !== null && lng !== null) return { lat, lng };
  return null;
}

export async function runPublicResearch(input = {}) {
  const startedAt = Date.now();
  const blocked = blockedPrivateSignals(input);
  if (blocked.length) {
    return {
      status: 'blocked_private_or_booking_signal',
      provider: 'capability-gate',
      elapsedMs: Date.now() - startedAt,
      sourceBackedCandidateCount: 0,
      candidates: [],
      things: [],
      blockedSignals: blocked,
    };
  }
  const { wantedThings, intakeEvent, artifacts } = researchJob(input);
  const minimums = firstPassMinimums(input);
  if (!wantedThings.length) {
    return {
      status: 'no_wanted_things',
      provider: 'place-search',
      elapsedMs: Date.now() - startedAt,
      intakeEvent,
      wantedThings: [],
      queries: [],
      firstPassMinimums: minimums,
      candidates: [],
      things: [],
      sourceBackedCandidateCount: 0,
    };
  }
  const origin = stayPoint(artifacts);
  const lodgingText = typeof artifacts.lodging === 'string' ? artifacts.lodging : '';
  const stay = lodgingFromChat(artifacts.requestText || intakeEvent?.requestText || '', {
    lodging: lodgingText,
    lat: origin?.lat,
    lng: origin?.lng,
  });
  const sourceEnv = input.env || process.env;
  const intake = await fillTripIntake({
    destination: artifacts.destination || '',
    lodging: stay.text,
    lodgingPoint: origin || undefined,
    wantedThings,
    env: {
      brave: sourceEnv.brave || sourceEnv.BRAVE_SEARCH_API_KEY || '',
      foursquare: sourceEnv.foursquare || sourceEnv.FOURSQUARE_SERVICE_KEY || '',
      tavily: sourceEnv.tavily || sourceEnv.TAVILY_API_KEY || '',
      braveName: 'BRAVE_SEARCH_API_KEY',
      foursquareName: 'FOURSQUARE_SERVICE_KEY',
      tavilyName: 'TAVILY_API_KEY',
      DATABASE_URL: sourceEnv.DATABASE_URL || '',
      NEON_DATABASE_URL: sourceEnv.NEON_DATABASE_URL || '',
    },
    fetchImpl: input.fetchImpl,
    priorPlaces: input.priorPlaces,
    loadPriorPlaces: input.loadPriorPlaces,
  });
  return {
    status: 'live_place_search',
    provider: 'place-search',
    elapsedMs: Date.now() - startedAt,
    intakeEvent,
    wantedThings,
    queries: intake.search.queries,
    firstPassMinimums: minimums,
    sourceCounts: intake.search.sourceCounts,
    candidates: intake.researchedThings,
    things: intake.things,
    sourceBackedCandidateCount: intake.things.length,
  };
}

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  console.log(JSON.stringify(await runPublicResearch(input)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || String(error)); process.exit(1); });
}
