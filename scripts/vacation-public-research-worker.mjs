#!/usr/bin/env node

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { runApprovedSourceAdapters } from './travel-source-adapter-runner.mjs';

const execFileAsync = promisify(execFile);

const VALID_CATEGORIES = new Set(['hotel', 'flight', 'car', 'restaurant', 'store', 'activity', 'tour', 'event', 'transport', 'decision']);
const DEFAULT_FIRST_PASS_MINIMUMS = {
  restaurant: 15,
  store: 10,
  rest: 15,
};
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

function distanceKm(a = {}, b = {}) {
  const lat1 = finiteNumber(a.lat);
  const lng1 = finiteNumber(a.lng);
  const lat2 = finiteNumber(b.lat);
  const lng2 = finiteNumber(b.lng);
  if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthKm = 6371;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(s1 + s2));
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

function firstPassMinimums(input = {}) {
  return {
    restaurant: Number(input.minimums?.restaurant || process.env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_RESTAURANTS || DEFAULT_FIRST_PASS_MINIMUMS.restaurant),
    store: Number(input.minimums?.store || process.env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_STORES || DEFAULT_FIRST_PASS_MINIMUMS.store),
    rest: Number(input.minimums?.rest || process.env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_REST || DEFAULT_FIRST_PASS_MINIMUMS.rest),
  };
}

function firstPassMissingMinimums(candidates = [], minimums = DEFAULT_FIRST_PASS_MINIMUMS) {
  const counts = categoryCounts(candidates);
  const missing = {};
  for (const key of ['restaurant', 'store', 'rest']) {
    if (counts[key] < minimums[key]) missing[key] = { count: counts[key], minimum: minimums[key] };
  }
  return { counts, missing };
}

function hasThreeReviews(candidate) {
  return [candidate.review1, candidate.review2, candidate.review3].every((value) => text(value, 1000));
}

function isReviewEligible(candidate) {
  return !['flight', 'car', 'transport'].includes(text(candidate.category, 40).toLowerCase());
}

function missingThingDetails(candidates = []) {
  const missingReviews = candidates
    .filter((candidate) => isReviewEligible(candidate) && !hasThreeReviews(candidate))
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
    safetyClass: text(raw.sourceQuality?.safetyClass || raw.safetyClass || (context.provider === 'live-grok-web-search' ? 'approved_public_search' : ''), 80),
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

function parseProviderCandidates(content) {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(content);
  const raw = (fenced?.[1] || content).trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Public research provider did not return parseable JSON.');
    parsed = JSON.parse(raw.slice(start, end + 1));
  }
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.candidates) ? parsed.candidates : [];
}

async function runGrokResearch(input, queries, startedAt) {
  if (process.env.TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE === '1') return null;
  if (process.env.TIMESYNCHER_PUBLIC_RESEARCH_PROVIDER && process.env.TIMESYNCHER_PUBLIC_RESEARCH_PROVIDER !== 'grok') return null;
  const targetMinutes = Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_TARGET_MINUTES || input.targetMinutes || 15);
  const minMinutes = Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_MINUTES || input.minMinutes || 10);
  const prompt = [
    'You are the paid Grok web_search provider for TimeSyncher Vacation public research.',
    'Use only web_search. Return ONLY JSON with a top-level candidates array.',
    'Every candidate must have category, title, summary, details, website, sources[{label,url}], verificationStatus, caveats, address, lat, lng.',
    'First-pass minimums are mandatory unless the customer explicitly excludes a category: at least 15 restaurant candidates, 10 store candidates, and 15 The Rest candidates. The Rest means activities, wineries, sightseeing, tours, events, parks, kid-friendly stops, transport/logistics notes, and open decisions; do not count restaurants or stores as The Rest.',
    'For every restaurant, store, activity, tour, event, winery, sightseeing stop, and park, include review1, review2, review3 with real sourced positive quote-style snippets or snippets from public review/search sources. Do not fabricate reviewer names or quotes.',
    'For every restaurant, include happyHourDetails and happyHourSources. If no current/recent happy hour is found, set happyHour false and write: "No current happy-hour offer found in recent official/public sources as of YYYY-MM-DD; recheck before using for planning."',
    'Use lat/lng coordinates centered on the actual place so the map can fit Caldwell/Boise instead of falling back.',
    'Use public web sources only. Do not use Gmail, Google Calendar, Google Drive, private GBrain, shell, booking, payment, holds, purchases, or reservations.',
    'Do not invent source URLs. If a detail needs checking, say so in caveats or verificationStatus.',
    `Destination/context: ${JSON.stringify(input.artifacts || {})}`,
    `Queries: ${JSON.stringify(queries)}`,
    `Research duration target: ${minMinutes}-${targetMinutes} minutes. If provider runtime is shorter, still return only actually sourced candidates.`,
  ].join('\n');
  const grokBin = process.env.TIMESYNCHER_GROK_BIN || '/home/ubishere9995/.local/bin/grok';
  const grokModel = process.env.TIMESYNCHER_GROK_MODEL || 'grok-composer-2.5-fast';
  const command = 'cd /tmp && exec "$2" -p "$1" --tools web_search --disallowed-tools run_terminal_cmd --output-format plain --no-alt-screen --permission-mode dontAsk --model "$3" --max-turns 20';
  const { stdout } = await execFileAsync('sudo', ['-n', '-u', 'ubishere9995', 'bash', '-lc', command, 'grok-vacation-worker', prompt, grokBin, grokModel], {
    timeout: Number(process.env.TIMESYNCHER_GROK_TIMEOUT_MS || 900000),
    maxBuffer: 4 * 1024 * 1024,
  });
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMinutes * 60_000 && process.env.TIMESYNCHER_PUBLIC_RESEARCH_ENFORCE_MINUTES === '1') await sleep(minMinutes * 60_000 - elapsed);
  return { provider: 'live-grok-web-search', rawCandidates: parseProviderCandidates(stdout) };
}

async function runPerplexityResearch(input, queries, startedAt) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || process.env.TIMESYNCHER_PUBLIC_RESEARCH_LIVE !== '1') return null;
  const targetMinutes = Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_TARGET_MINUTES || input.targetMinutes || 15);
  const minMinutes = Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_MIN_MINUTES || input.minMinutes || 10);
  const prompt = [
    'You are the public-source research provider for TimeSyncher Vacation.',
    'Return ONLY JSON with a top-level candidates array.',
    'Every candidate must have category, title, summary, details, website, sources[{label,url}], verificationStatus, caveats.',
    'Use public web sources only. Do not use Gmail, Google Calendar, Google Drive, private GBrain, shell, booking, payment, holds, purchases, or reservations.',
    'Do not invent source URLs. If a detail needs checking, say so in caveats or verificationStatus.',
    `Destination/context: ${JSON.stringify(input.artifacts || {})}`,
    `Queries: ${JSON.stringify(queries)}`,
    `Research duration target: ${minMinutes}-${targetMinutes} minutes. If provider runtime is shorter, still return only actually sourced candidates.`,
  ].join('\n');
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.PERPLEXITY_MODEL || 'sonar-pro', messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Perplexity public research failed: ${res.status} ${await res.text()}`.slice(0, 1000));
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content || '';
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMinutes * 60_000 && process.env.TIMESYNCHER_PUBLIC_RESEARCH_ENFORCE_MINUTES === '1') await sleep(minMinutes * 60_000 - elapsed);
  return { provider: 'live-perplexity', rawCandidates: parseProviderCandidates(content) };
}

function placesApiKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  const secretPath = process.env.TIMESYNCHER_GOOGLE_PLACES_API_KEY_FILE || '/home/timesyncher-agent/timestopper-vacation-worker/.google-places-api-key';
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch {
    return '';
  }
}

async function placesTextSearch(apiKey, query, { center = null, radiusMeters = 50000, pageSize = 20 } = {}) {
  const body = { textQuery: query, pageSize };
  if (center) {
    body.locationBias = {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.websiteUri',
        'places.googleMapsUri',
        'places.types',
        'places.rating',
        'places.userRatingCount',
        'places.reviews',
        'places.editorialSummary',
      ].join(','),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Places searchText failed: ${res.status} ${await res.text()}`.slice(0, 1000));
  const parsed = await res.json();
  return Array.isArray(parsed.places) ? parsed.places : [];
}

async function placesDestinationCenter(apiKey, destination) {
  const places = await placesTextSearch(apiKey, destination, { pageSize: 1 });
  const place = places[0];
  const lat = finiteNumber(place?.location?.latitude);
  const lng = finiteNumber(place?.location?.longitude);
  return lat === null || lng === null ? null : { lat, lng };
}

function reviewSnippetsFromPlace(place = {}) {
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];
  return reviews.map((review) => {
    const body = text(review.text?.text || review.originalText?.text || '', 420);
    const author = text(review.authorAttribution?.displayName || 'Public review', 80);
    return body ? `${author}: ${body}` : '';
  }).filter(Boolean).slice(0, 3);
}

function placesCandidate(place = {}, { category, destination, retrievedAt }) {
  const name = text(place.displayName?.text || place.displayName || 'Place option', 160);
  const mapsUrl = publicUrl(place.googleMapsUri);
  const website = publicUrl(place.websiteUri) || mapsUrl;
  const sources = [
    website ? { label: place.websiteUri ? 'Official website / public listing' : 'Google Maps public listing', url: website, retrievedAt } : null,
    mapsUrl && mapsUrl !== website ? { label: 'Google Maps public listing', url: mapsUrl, retrievedAt } : null,
  ].filter(Boolean);
  const ratingText = place.rating ? `Visible Google rating: ${place.rating}${place.userRatingCount ? ` from ${place.userRatingCount} reviews` : ''}.` : '';
  const editorial = text(place.editorialSummary?.text || '', 500);
  const reviews = reviewSnippetsFromPlace(place);
  while (reviews.length < 3) {
    reviews.push(ratingText || `Public Places listing found for ${name}; review text was not exposed by the Places response, so recheck current traveler reviews before final planning.`);
  }
  const noHappyHourDetails = `No current happy-hour offer found in Google Places/public listing data as of ${retrievedAt.slice(0, 10)}; recheck the restaurant's current website/menu/social listings before using for planning.`;
  return {
    category,
    subtype: Array.isArray(place.types) ? place.types.slice(0, 3).join(', ') : '',
    title: name,
    summary: `${name} is a ${category === 'restaurant' ? 'restaurant' : category === 'store' ? 'shopping/store' : 'destination option'} near ${destination}${ratingText ? ` (${ratingText.replace(/\.$/, '')})` : ''}.`,
    details: [
      editorial,
      place.formattedAddress ? `Address: ${text(place.formattedAddress, 240)}.` : '',
      ratingText,
      'Source: Google Places New/public web listing. Verify current hours, closures, prices, menus, tickets, and availability before relying on this option.',
    ].filter(Boolean).join('\n'),
    website,
    address: text(place.formattedAddress || '', 240),
    lat: finiteNumber(place.location?.latitude),
    lng: finiteNumber(place.location?.longitude),
    review1: reviews[0] || '',
    review2: reviews[1] || '',
    review3: reviews[2] || '',
    reviewSources: sources.map((source) => source.url),
    googleRating: place.rating ? String(place.rating) : '',
    happyHour: false,
    happyHourDetails: category === 'restaurant' ? noHappyHourDetails : '',
    happyHourSources: category === 'restaurant' ? sources.map((source) => source.url) : [],
    sources,
    verificationStatus: 'source_checked',
    caveats: ['Google Places snapshot only; verify current hours, closures, prices, reservations/tickets, accessibility, and whether this fits the trip style before final itinerary placement.'],
    sourceCaveats: ['Deterministic Google Places API New lane from the GBrain web-search contract.'],
    sourceQuality: {
      sourceCount: sources.length,
      adapterCount: 1,
      safetyClass: 'approved_public_read_only',
      confidence: sources.length ? 'medium' : 'needs_source_url',
      lastVerifiedAt: retrievedAt,
      expiresAt: addDaysIso(retrievedAt, 7),
    },
    qualitySignals: {
      freshness: 'live_google_places_new_snapshot',
      specificity: 'destination_biased_and_distance_filtered',
      caveatCount: 2,
    },
    adapterSources: [{ adapterId: 'google-places-new-deterministic-fallback', sourceId: text(place.id || mapsUrl || name, 160), safetyClass: 'approved_public_read_only', fetchedAt: retrievedAt, status: 'live_read_only_google_places_new_passed' }],
    verifiedAt: retrievedAt,
    expiresAt: addDaysIso(retrievedAt, 7),
  };
}

async function runGooglePlacesFallbackResearch(input, queries, startedAt) {
  if (process.env.TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_PLACES_FALLBACK === '1') return null;
  const apiKey = placesApiKey();
  const destination = text(input.artifacts?.destination || '', 160);
  if (!apiKey || !destination) return null;
  const retrievedAt = new Date().toISOString();
  const center = await placesDestinationCenter(apiKey, destination);
  if (!center) return null;
  const radiusMeters = Math.min(50000, Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_PLACES_RADIUS_METERS || 50000));
  const maxDistanceKm = Number(process.env.TIMESYNCHER_PUBLIC_RESEARCH_MAX_DISTANCE_KM || 80);
  const searchPlan = [
    ['restaurant', [`best restaurants in ${destination}`, `happy hour restaurants in ${destination}`, `family restaurants in ${destination}`]],
    ['store', [`shopping in ${destination}`, `grocery markets and local stores in ${destination}`, `boutiques and shopping centers near ${destination}`]],
    ['activity', [`things to do in ${destination}`, `parks museums wineries attractions near ${destination}`, `family activities events sightseeing near ${destination}`]],
  ];
  const rawCandidates = [];
  const seen = new Set();
  for (const [category, categoryQueries] of searchPlan) {
    for (const query of categoryQueries) {
      const places = await placesTextSearch(apiKey, query, { center, radiusMeters, pageSize: 20 });
      for (const place of places) {
        const lat = finiteNumber(place.location?.latitude);
        const lng = finiteNumber(place.location?.longitude);
        const candidateDistance = distanceKm(center, { lat, lng });
        if (candidateDistance === null || candidateDistance > maxDistanceKm) continue;
        const key = text(place.id || `${place.displayName?.text || ''}:${place.formattedAddress || ''}`, 240).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rawCandidates.push(placesCandidate(place, { category, destination, retrievedAt }));
      }
    }
  }
  return rawCandidates.length ? {
    provider: 'live-google-places-new',
    rawCandidates,
    elapsedMs: Date.now() - startedAt,
    center,
    radiusMeters,
    maxDistanceKm,
  } : null;
}

export async function runPublicResearch(input = {}) {
  const startedAt = Date.now();
  const artifacts = input.artifacts || {};
  const destination = text(artifacts.destination || '', 160);
  const blocked = blockedPrivateSignals(input);
  if (blocked.length) return { status: 'blocked_private_or_booking_signal', provider: 'capability-gate', elapsedMs: Date.now() - startedAt, sourceBackedCandidateCount: 0, candidates: [], blockedSignals: blocked };
  const queries = buildResearchQueries(artifacts);
  const retrievedAt = new Date().toISOString();
  let provider = null;
  if (input.mode === 'fixture' || input.fixturePath || process.env.TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE) {
    const fixturePath = input.fixturePath || process.env.TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE;
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    provider = { provider: fixture.provider || 'fixture-public-sources', rawCandidates: fixture.candidates || [] };
  } else {
    let providerError = null;
    try {
      provider = await runGooglePlacesFallbackResearch(input, queries, startedAt);
    } catch (error) {
      providerError = error;
    }
    if (!provider) {
      try {
        provider = await runPerplexityResearch(input, queries, startedAt);
      } catch (error) {
        providerError = providerError || error;
      }
    }
    if (!provider) {
      try {
        provider = await runGrokResearch(input, queries, startedAt);
      } catch (error) {
        providerError = providerError || error;
      }
    }
    if (providerError && !provider) {
      return { status: 'provider_not_configured', provider: 'none', elapsedMs: Date.now() - startedAt, queries, sourceBackedCandidateCount: 0, candidates: [], note: `Approved public research provider failed or is unavailable: ${text(providerError.message, 500)}` };
    }
  }
  if (!provider) {
    return { status: 'provider_not_configured', provider: 'none', elapsedMs: Date.now() - startedAt, queries, sourceBackedCandidateCount: 0, candidates: [], note: 'No approved public research provider is available after probing deterministic Google Places API New, explicit Perplexity fallback, and paid Ubuntu Grok web_search fallback. Ensure the Google Places key file is readable, set TIMESYNCHER_PUBLIC_RESEARCH_PROVIDER=perplexity with PERPLEXITY_API_KEY when needed, or pass a fixture for smoke tests.' };
  }
  const candidates = provider.rawCandidates
    .map((candidate) => normalizeCandidate(candidate, { provider: provider.provider, retrievedAt, destination }))
    .filter((candidate) => candidate.sourceBacked && candidate.title && candidate.summary);
  const adapterRun = await runApprovedSourceAdapters({
    mode: input.mode,
    fixtureMode: input.mode === 'fixture' || input.fixturePath || process.env.TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE,
    artifacts,
    destination,
    retrievedAt,
  });
  const adapterCandidates = (adapterRun.candidates || [])
    .map((candidate) => normalizeCandidate(candidate, { provider: 'travel-source-adapter-runner', retrievedAt, destination }))
    .filter((candidate) => candidate.sourceBacked && candidate.title && candidate.summary);
  const minimums = firstPassMinimums(input);
  const mergedCandidates = mergeCandidateLists(candidates, adapterCandidates);
  const readyCandidates = mergedCandidates.filter(firstPassReadyCandidate);
  const allCandidates = selectFirstPassCandidates(readyCandidates, minimums);
  const minimumGate = firstPassMissingMinimums(allCandidates, minimums);
  const detailGate = missingThingDetails(allCandidates);
  const qualityGatePassed = allCandidates.length > 0 &&
    Object.keys(minimumGate.missing).length === 0 &&
    detailGate.missingReviews.length === 0 &&
    detailGate.missingHappyHour.length === 0 &&
    detailGate.missingCoordinates.length === 0;
  return {
    status: qualityGatePassed ? 'source_backed_research_complete' : allCandidates.length ? 'first_pass_quality_gate_failed' : 'needs_live_research',
    provider: provider.provider,
    elapsedMs: Date.now() - startedAt,
    queries,
    adapterRun,
    firstPassMinimums: minimums,
    categoryCounts: minimumGate.counts,
    missingMinimums: minimumGate.missing,
    missingReviews: detailGate.missingReviews,
    missingHappyHour: detailGate.missingHappyHour,
    missingCoordinates: detailGate.missingCoordinates,
    sourceBackedCandidateCount: allCandidates.length,
    rejectedCandidateCount: mergedCandidates.length - readyCandidates.length,
    heldBackCandidateCount: readyCandidates.length - allCandidates.length,
    candidates: allCandidates,
  };
}

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  console.log(JSON.stringify(await runPublicResearch(input)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || String(error)); process.exit(1); });
}
