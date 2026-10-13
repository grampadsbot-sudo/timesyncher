import { enrichSearchPlace } from './trip-thing-enrichment.mjs';

const SEARCH_PRODUCT_CATEGORIES = new Set([
  'hotel',
  'event',
  'restaurant',
  'car',
  'flight',
  'store',
]);

const BANNED_VALUE_RE = /\b(?:TBD|N\/A|Quote TBD|Add price|\$0|lorem|placeholder|sample)\b/i;

/** Minimum restaurant/store/event Things in a trip batch (VK contract v1.3.0). */
export const TRIP_MIN_NON_EXEMPT_THINGS = 15;
/** Max share of Things that may miss required fields when each gap is flagged in missingFields. */
const TRIP_MAX_MISSING_THING_FRACTION = 0.2;

const FLAGGABLE_MISSING_VIOLATIONS = new Set([
  'blank_description',
  'blank_summary',
  'missing_price',
  'missing_logoUrl',
  'missing_rating',
  'missing_sourced_reviews',
]);

const VIOLATION_TO_MISSING_FIELD = {
  blank_description: 'description',
  blank_summary: 'summary',
  missing_price: 'price',
  missing_logoUrl: 'logoUrl',
  missing_rating: 'ratings',
  missing_sourced_reviews: 'reviews',
};
const BANNED_SUMMARY_PREFIX_RE = /^(?:candidate|option|Flight option:)/i;
const KNOWN_FILLER_SUMMARY_RES = [
  /hotel option worth comparing/i,
  /flight option to compare/i,
  /convenient grocery stop/i,
  /worth comparing because of its JFK counter tradeoff/i,
];

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

function sourceRecordOnPlace(place = {}) {
  return place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
}

/** Normalize search/list categories to the six VK product place types. */
function searchProductCategory(category = '') {
  const cat = text(category, 80).toLowerCase();
  if (cat === 'lodging' || cat === 'accommodation') return 'hotel';
  if (cat === 'grocery' || cat === 'market' || cat === 'shopping' || cat === 'shop') return 'store';
  if (cat === 'activity' || cat === 'attraction' || cat === 'tour' || cat === 'music' || cat === 'theatre') {
    return 'event';
  }
  if (SEARCH_PRODUCT_CATEGORIES.has(cat)) return cat;
  return cat;
}

function parsePriceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && BANNED_VALUE_RE.test(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const direct = Number(value);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  const match = String(value).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function priceOnPlace(place = {}) {
  const sourceRecord = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  return parsePriceValue(
    place.price
    ?? sourceRecord.price
    ?? sourceRecord.rate
    ?? sourceRecord.amount
    ?? sourceRecord.totalPrice,
  );
}

function logoOnPlace(place = {}) {
  const sourceRecord = sourceRecordOnPlace(place);
  return text(place.logoUrl || sourceRecord.logoUrl || sourceRecord.logo || sourceRecord.faviconUrl);
}

function reviewField(place = {}, index = 1, suffix = '') {
  const record = sourceRecordOnPlace(place);
  const key = `review${index}${suffix}`;
  const max = suffix === 'Source'
    ? 40
    : suffix === 'Rating'
      ? 20
      : suffix === 'Url'
        ? 500
        : 2000;
  return text(place[key] ?? record[key], max);
}

function normalizeReviewSource(source = '') {
  const row = text(source, 40);
  if (row.toLowerCase() === 'tripadvisor') return 'TripAdvisor';
  return row;
}

function isAllowedReviewSource(source = '') {
  const row = normalizeReviewSource(source);
  if (row === 'written from the set') return true;
  return ['Google', 'Yelp', 'TripAdvisor'].includes(row);
}

/** VK v1.5.0: ~25 words, allowed source label, numeric star — no review URL required. */
function reviewBodyIsPresent(place = {}, index = 1) {
  const body = reviewField(place, index);
  const source = reviewField(place, index, 'Source');
  const rating = reviewField(place, index, 'Rating');
  if (wordCount(body) < 25) return false;
  if (!isAllowedReviewSource(source)) return false;
  if (!/\d/.test(rating)) return false;
  return true;
}

function parseNumericRating(value) {
  const normalized = text(value, 40);
  if (!normalized) return null;
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/([\d.]+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericAverageOnPlace(place = {}) {
  const record = sourceRecordOnPlace(place);
  for (const key of ['googleRating', 'yelpRating', 'thirdPartyRating']) {
    if (parseNumericRating(place[key] ?? record[key]) != null) return true;
  }
  return false;
}

function ratingCountOnPlace(place = {}) {
  const record = sourceRecordOnPlace(place);
  const raw = place.ratingCount ?? record.ratingCount;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function ratingMixOnPlace(place = {}) {
  const record = sourceRecordOnPlace(place);
  const mix = place.ratingMix ?? record.ratingMix;
  if (!mix || typeof mix !== 'object') return null;
  const counts = {};
  for (const star of ['1', '2', '3', '4', '5']) {
    const value = Number(mix[star]);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
    counts[star] = value;
  }
  return counts;
}

function ratingMixMatchesCount(place = {}) {
  const mix = ratingMixOnPlace(place);
  const count = ratingCountOnPlace(place);
  if (!mix || count == null) return false;
  const sum = Object.values(mix).reduce((total, value) => total + value, 0);
  return sum === count;
}

function requiredDistinctReviewCount(place = {}) {
  const ratingCount = ratingCountOnPlace(place);
  if (ratingCount != null && ratingCount >= 1 && ratingCount <= 4) return ratingCount;
  return 4;
}

/** Stored reviews count only when average, count, and mix rules (v1.5.0) are satisfied. */
function reviewAggregateAllowsStoredReviews(place = {}, distinctBodyPresentCount = 0) {
  if (!numericAverageOnPlace(place)) return false;
  const ratingCount = ratingCountOnPlace(place);
  if (ratingCount == null) return false;
  if (ratingCount <= 4) {
    return distinctBodyPresentCount === ratingCount && distinctBodyPresentCount >= 1;
  }
  return ratingMixMatchesCount(place);
}

function distinctBodyPresentReviewCount(place = {}) {
  const seen = new Set();
  let count = 0;
  for (let index = 1; index <= 4; index += 1) {
    if (!reviewBodyIsPresent(place, index)) continue;
    const body = reviewField(place, index);
    if (seen.has(body)) continue;
    seen.add(body);
    count += 1;
  }
  return count;
}

function effectiveDistinctSourcedReviewCount(place = {}) {
  const bodyPresent = distinctBodyPresentReviewCount(place);
  if (!reviewAggregateAllowsStoredReviews(place, bodyPresent)) return 0;
  return bodyPresent;
}

function normalizeReviewBodyForCrossPlace(body = '') {
  return text(body, 2000).toLowerCase();
}

/** Same long review text must not appear on more than one product place row. */
export function crossPlaceDuplicateReviewBodyFailures(places = []) {
  const byBody = new Map();
  for (const place of places) {
    const category = searchProductCategory(place.category);
    if (category === 'flight' || category === 'car') continue;
    const placeTitle = text(place.title, 160) || '(untitled)';
    for (let index = 1; index <= 4; index += 1) {
      const body = reviewField(place, index);
      if (wordCount(body) < 25) continue;
      const key = normalizeReviewBodyForCrossPlace(body);
      if (!byBody.has(key)) byBody.set(key, []);
      byBody.get(key).push(placeTitle);
    }
  }
  const failures = [];
  for (const [bodyKey, titles] of byBody) {
    const uniqueTitles = [...new Set(titles)];
    if (uniqueTitles.length > 1) {
      failures.push({ bodyPreview: bodyKey.slice(0, 96), places: uniqueTitles });
    }
  }
  return failures;
}

export function assertCrossPlaceReviewBodiesDistinct(places = []) {
  const failures = crossPlaceDuplicateReviewBodyFailures(places);
  if (!failures.length) return;
  const detail = failures
    .map((row) => `"${row.bodyPreview}…" on ${row.places.join(', ')}`)
    .join('; ');
  throw new Error(`cross-place duplicate review bodies: ${detail}`);
}

function hasAggregateRating(place = {}) {
  return numericAverageOnPlace(place);
}

function bannedTextViolations(label, value) {
  const normalized = text(value);
  if (!normalized) return [];
  const violations = [];
  if (BANNED_VALUE_RE.test(normalized)) violations.push(`${label}_banned_value`);
  if (BANNED_SUMMARY_PREFIX_RE.test(normalized)) violations.push(`${label}_banned_prefix`);
  for (const re of KNOWN_FILLER_SUMMARY_RES) {
    if (re.test(normalized)) {
      violations.push(`${label}_known_filler`);
      break;
    }
  }
  if (label === 'summary' && /^Neighborhood:/i.test(normalized) && normalized.length > 48) {
    violations.push('summary_template_neighborhood');
  }
  return violations;
}

function titleViolations(place = {}) {
  const title = text(place.title);
  const violations = [];
  if (!title) return violations;
  if (/^Flight option:/i.test(title)) violations.push('title_flight_option_prefix');
  return violations;
}

/** Fail when search output is missing required product fields for a place row. */
export function searchPlaceOutputViolations(place = {}) {
  const category = searchProductCategory(place.category);
  if (!SEARCH_PRODUCT_CATEGORIES.has(category)) return [];
  const violations = [];
  const description = text(place.description);
  const summary = text(place.summary);
  const price = priceOnPlace(place);
  const logoUrl = logoOnPlace(place);
  if (!description) violations.push('blank_description');
  if (!summary) violations.push('blank_summary');
  if (summary && description && summary === description && description.length > 320) {
    violations.push('summary_equals_long_description');
  }
  if (summary && description && summary.length > 320 && description.length > 320 && summary.slice(0, 280) === description.slice(0, 280)) {
    violations.push('summary_not_short');
  }
  violations.push(...bannedTextViolations('summary', summary));
  violations.push(...bannedTextViolations('description', description));
  violations.push(...titleViolations(place));
  if (price == null) violations.push('missing_price');
  else if (price === 0) violations.push('banned_price_zero');
  if (!logoUrl) violations.push('missing_logoUrl');

  if (category !== 'flight' && category !== 'car') {
    if (!hasAggregateRating(place)) violations.push('missing_rating');
    if (effectiveDistinctSourcedReviewCount(place) < requiredDistinctReviewCount(place)) {
      violations.push('missing_sourced_reviews');
    }
  }

  return violations;
}

function missingFieldsOnPlace(place = {}) {
  const record = sourceRecordOnPlace(place);
  const raw = place.missingFields ?? record.missingFields;
  if (!Array.isArray(raw)) return [];
  return raw.map((field) => text(field, 80).toLowerCase()).filter(Boolean);
}

function isNonExemptTripThing(place = {}) {
  const category = searchProductCategory(place.category);
  return category !== 'flight' && category !== 'hotel' && category !== 'car';
}

function classifyPlaceContractViolations(place = {}) {
  const violations = searchPlaceOutputViolations(place);
  if (!violations.length) {
    return { hard: [], flaggedMissing: [], hasMissing: false };
  }
  const flagged = new Set(missingFieldsOnPlace(place));
  const hard = [];
  const flaggedMissing = [];
  for (const violation of violations) {
    if (!FLAGGABLE_MISSING_VIOLATIONS.has(violation)) {
      hard.push(violation);
      continue;
    }
    const fieldKey = VIOLATION_TO_MISSING_FIELD[violation];
    if (!fieldKey || !flagged.has(fieldKey)) {
      hard.push(`unflagged_${violation}`);
    } else {
      flaggedMissing.push(violation);
    }
  }
  return {
    hard,
    flaggedMissing,
    hasMissing: flaggedMissing.length > 0,
  };
}

/** Trip-level VK contract violations for a place list (v1.3.0). */
function searchPlaceOutputTripViolations(places = []) {
  const list = Array.isArray(places) ? places : [];
  if (!list.length) return [];
  const tripFailures = [];
  let thingsWithFlaggedMissing = 0;
  for (const place of list) {
    const { hard, flaggedMissing, hasMissing } = classifyPlaceContractViolations(place);
    if (hasMissing) thingsWithFlaggedMissing += 1;
    if (!hard.length) continue;
    tripFailures.push({
      title: text(place.title, 160) || '(untitled)',
      category: searchProductCategory(place.category),
      violations: hard,
      flaggedMissing,
    });
  }

  const nonExemptCount = list.filter(isNonExemptTripThing).length;
  if (nonExemptCount < TRIP_MIN_NON_EXEMPT_THINGS) {
    tripFailures.push({
      scope: 'trip',
      violations: [`trip_too_few_things:${nonExemptCount}_of_${TRIP_MIN_NON_EXEMPT_THINGS}`],
    });
  }

  const totalThings = list.length;
  if (thingsWithFlaggedMissing / totalThings > TRIP_MAX_MISSING_THING_FRACTION) {
    tripFailures.push({
      scope: 'trip',
      violations: [
        `trip_too_many_missing_things:${thingsWithFlaggedMissing}_of_${totalThings}`,
      ],
    });
  }

  const crossPlace = crossPlaceDuplicateReviewBodyFailures(list);
  if (crossPlace.length) {
    tripFailures.push({
      scope: 'trip',
      violations: ['cross_place_duplicate_review_bodies'],
      crossPlace,
    });
  }

  return tripFailures;
}

export function assertSearchPlaceOutputContract(places = []) {
  assertCrossPlaceReviewBodiesDistinct(places);
  const failures = searchPlaceOutputTripViolations(places);
  if (!failures.length) return;
  const detail = failures
    .map((row) => {
      if (row.scope === 'trip') return `trip → ${row.violations.join(', ')}`;
      return `${row.category}:${row.title} → ${row.violations.join(', ')}`;
    })
    .join('; ');
  throw new Error(`search place output contract failed: ${detail}`);
}

/** Enrich search rows; callers that require VK contract proof assert separately (fixture generator, contract tests). */
export function finalizeSearchPlaces(places = []) {
  return (Array.isArray(places) ? places : []).map((place) => enrichSearchPlace({ ...place }));
}
