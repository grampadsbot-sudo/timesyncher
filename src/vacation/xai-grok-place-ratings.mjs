import {
  postXaiPlaceRatingsResponses,
  xaiGrokPlaceSearchModelId,
} from '../../scripts/vacation-app-reply-rules.mjs';
import {
  applyXaiPlaceRatingsToRecord,
  parseXaiStructuredPayload,
  reviewThemesDistinctCount,
  searchProductCategoryFromPlace,
  writeRepresentativeReviews,
} from './xai-grok-place-ratings-helpers.mjs';

export {
  parseXaiStructuredPayload,
  applyXaiPlaceRatingsToRecord,
  writeRepresentativeReviews,
  formatOtherRatingsLine,
  xaiThemesReviewPath,
  reviewThemesDistinctCount,
} from './xai-grok-place-ratings-helpers.mjs';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

function xaiApiKey(env = process.env) {
  return text(env?.XAI_API_KEY || '', 500);
}

function placeRatingsJsonSchema() {
  return {
    type: 'object',
    properties: {
      google: {
        type: 'object',
        properties: {
          average: { type: ['number', 'null'] },
          reviewCount: { type: ['integer', 'null'] },
          sourceUrl: { type: ['string', 'null'] },
          notPublished: { type: 'boolean' },
        },
        required: ['notPublished'],
        additionalProperties: false,
      },
      yelp: {
        type: 'object',
        properties: {
          average: { type: ['number', 'null'] },
          reviewCount: { type: ['integer', 'null'] },
          sourceUrl: { type: ['string', 'null'] },
          notPublished: { type: 'boolean' },
        },
        required: ['notPublished'],
        additionalProperties: false,
      },
      otherSites: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            average: { type: 'number' },
            reviewCount: { type: 'integer' },
            sourceUrl: { type: 'string' },
          },
          required: ['average', 'reviewCount', 'sourceUrl'],
          additionalProperties: false,
        },
      },
      reviewThemes: {
        type: 'object',
        properties: {
          praise: { type: 'array', items: { type: 'string' } },
          complaints: { type: 'array', items: { type: 'string' } },
        },
        required: ['praise', 'complaints'],
        additionalProperties: false,
      },
      websiteFlavour: { type: 'string' },
    },
    required: ['google', 'yelp', 'otherSites', 'reviewThemes', 'websiteFlavour'],
    additionalProperties: false,
  };
}

function buildPlaceRatingsPrompt(place = {}, destination = '') {
  const title = text(place.title, 240);
  const address = text(place.address || place.sourceRecord?.address, 240);
  const website = text(place.url || place.sourceRecord?.website || place.sourceRecord?.url, 500);
  const area = text(destination, 160);
  return [
    `Place: ${title}`,
    address ? `Address: ${address}` : '',
    area ? `Area: ${area}` : '',
    website ? `Official website (use for flavour only): ${website}` : '',
    '',
    'Use web_search to find published average star ratings and published review counts for this exact place.',
    'Return JSON matching the schema.',
    'For Google and Yelp: set notPublished true when the rating or count is not visibly published on the page you found.',
    'For otherSites: up to three additional review sites (TripAdvisor, OpenTable, Booking.com, Facebook, etc.) with average, reviewCount, and sourceUrl. Do not include Google or Yelp in otherSites.',
    'Never invent a 1-5 star breakdown or star mix.',
    'Collect real review themes (praise and complaints) from fetched review pages.',
    'websiteFlavour: short notes from the place\'s own official website (dishes, setting, vibe) when available.',
    'Do not present text as if it were TripAdvisor-owned content; only store numbers and themes you saw on public pages.',
  ].filter(Boolean).join('\n');
}

function extractResponsesOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block?.type === 'output_text' && text(block.text)) return text(block.text, 200000);
      if (block?.type === 'text' && text(block.text)) return text(block.text, 200000);
    }
  }
  return '';
}

function logXaiPlaceCost(payload, placeTitle) {
  const ticks = payload?.usage?.cost_in_usd_ticks;
  if (ticks == null) return;
  console.error(JSON.stringify({
    xaiPlaceRatingsCostUsdTicks: ticks,
    place: text(placeTitle, 160),
  }));
}

function clearReviewFields(record) {
  for (let index = 1; index <= 4; index += 1) {
    delete record[`review${index}`];
    delete record[`review${index}Source`];
    delete record[`review${index}Rating`];
    delete record[`review${index}Url`];
  }
}

function addMissingFields(record, keys = []) {
  const set = new Set(Array.isArray(record.missingFields) ? record.missingFields : []);
  for (const key of keys) set.add(key);
  record.missingFields = [...set];
}

function numericRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 5) return null;
  return Math.round(parsed * 10) / 10;
}

function numericCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function siteBlockPublished(block = {}) {
  if (block.notPublished === true) return false;
  const average = numericRating(block.average);
  const count = numericCount(block.reviewCount);
  return average != null && count != null;
}

export async function fetchXaiPlaceRatings(place = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  destination = '',
  timeoutMs = 120000,
} = {}) {
  const apiKey = xaiApiKey(env);
  if (!apiKey) {
    const error = new Error('XAI_API_KEY is not set.');
    error.code = 'XAI_API_KEY_MISSING';
    throw error;
  }
  const response = await postXaiPlaceRatingsResponses({
    apiKey,
    fetchImpl,
    timeoutMs,
    payload: {
      model: xaiGrokPlaceSearchModelId(),
      input: [{ role: 'user', content: buildPlaceRatingsPrompt(place, destination) }],
      tools: [{ type: 'web_search' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'VkPlaceRatings',
          schema: placeRatingsJsonSchema(),
          strict: true,
        },
      },
    },
  });
  const responseText = typeof response.text === 'function' ? await response.text() : '';
  if (!response?.ok) {
    const error = new Error(`xAI place ratings failed: HTTP ${response?.status || 'no status'} ${text(responseText, 300)}`);
    error.code = 'xai_place_ratings_failed';
    error.httpStatus = Number(response?.status) || null;
    throw error;
  }
  let payload = {};
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = {};
  }
  logXaiPlaceCost(payload, place.title);
  const structuredText = extractResponsesOutputText(payload);
  return {
    payload,
    structuredText,
    parsed: parseXaiStructuredPayload(structuredText),
  };
}

export function enrichPlaceRecordWithXaiRatings(record = {}, parsed = {}, { title = '' } = {}) {
  const next = { ...record };
  const hasPublishedAggregate = siteBlockPublished(parsed.google)
    || siteBlockPublished(parsed.yelp)
    || (Array.isArray(parsed.otherSites) && parsed.otherSites.some((row) => numericRating(row?.average) != null && numericCount(row?.reviewCount) != null));

  if (!hasPublishedAggregate) {
    clearReviewFields(next);
    for (const key of [
      'googleRating',
      'googleReviewCount',
      'googleRatingSourceUrl',
      'yelpRating',
      'yelpReviewCount',
      'yelpRatingSourceUrl',
      'thirdPartyRating',
      'thirdPartyReviewCount',
      'thirdPartySource',
      'otherRatingSites',
      'ratingCount',
      'ratingMix',
      'reviewThemes',
      'websiteFlavour',
    ]) {
      delete next[key];
    }
    next.xaiRatingsFetched = false;
    addMissingFields(next, ['ratings', 'reviews']);
    return next;
  }

  applyXaiPlaceRatingsToRecord(next, parsed);
  clearReviewFields(next);
  if (reviewThemesDistinctCount(next) < 4) {
    addMissingFields(next, ['reviews']);
  } else {
    writeRepresentativeReviews(next, parsed, { title });
  }
  next.xaiRatingsFetched = true;
  return next;
}

function placeNeedsGrokRatings(place = {}) {
  const category = searchProductCategoryFromPlace(place);
  if (category === 'flight' || category === 'car') return false;
  return true;
}

export async function enrichSearchPlacesWithGrokRatings(places = [], {
  env = process.env,
  fetchImpl = globalThis.fetch,
  destination = '',
} = {}) {
  const apiKey = xaiApiKey(env);
  if (!apiKey) {
    return { places, skipped: 'missing_xai_api_key' };
  }
  const list = Array.isArray(places) ? places : [];
  const enriched = [];
  for (const place of list) {
    if (!placeNeedsGrokRatings(place)) {
      enriched.push(place);
      continue;
    }
    const sourceRecord = place.sourceRecord && typeof place.sourceRecord === 'object'
      ? { ...place.sourceRecord }
      : {};
    try {
      const { parsed } = await fetchXaiPlaceRatings(
        { ...place, sourceRecord },
        { env, fetchImpl, destination },
      );
      const mergedRecord = enrichPlaceRecordWithXaiRatings(sourceRecord, parsed, { title: place.title });
      enriched.push({ ...place, sourceRecord: mergedRecord });
    } catch (error) {
      console.error(`xAI place ratings failed for "${text(place.title, 160)}": ${text(error?.message || error, 300)}`);
      const failedRecord = { ...sourceRecord };
      clearReviewFields(failedRecord);
      failedRecord.xaiRatingsFetched = false;
      addMissingFields(failedRecord, ['ratings', 'reviews']);
      enriched.push({ ...place, sourceRecord: failedRecord });
    }
  }
  return { places: enriched, skipped: null };
}
