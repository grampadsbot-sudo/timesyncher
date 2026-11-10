import { parseStarRating } from './star-rating-model.mjs';
import { productThingCategory } from './keepsake-product-overrides.mjs';
import { flightFieldsFromBlob } from './place-detail-extract.mjs';

const TRIP_MONTH_TOKEN_RE = /\b([A-Za-z]{3,9})\b/g;

function englishMonthIndexLookup() {
  const byLabel = new Map();
  for (let month = 0; month < 12; month += 1) {
    const anchor = new Date(Date.UTC(2020, month, 15));
    for (const style of ['short', 'long']) {
      const label = new Intl.DateTimeFormat('en', { month: style, timeZone: 'UTC' }).format(anchor);
      byLabel.set(label.toLowerCase(), month + 1);
    }
  }
  return byLabel;
}

const ENGLISH_MONTH_INDEX = englishMonthIndexLookup();
const CLOCK_TITLE_RE = /\s+\d{1,2}:\d{2}(?:\s*[–—-]\s*\d{1,2}:\d{2})?/g;
const CITED_SHOWS_RE = /\b([A-Za-z][A-Za-z0-9'’-]*(?:\s+[A-Za-z][A-Za-z0-9'’-]*){0,3})\s+shows\s+(\d(?:\.\d)?)/gi;

function text(value, max = 12000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function missingFieldsHasRatings(override = {}, place = {}) {
  const raw = override.missingFields ?? place.missingFields;
  if (!Array.isArray(raw)) return false;
  return raw.some((row) => text(row, 40).toLowerCase() === 'ratings');
}

function tripMonthSet(trip = {}) {
  const t = trip.trip && typeof trip.trip === 'object' ? trip.trip : trip;
  const start = text(t.start_date || t.startDate);
  const end = text(t.end_date || t.endDate || start);
  const months = new Set();
  for (const iso of [start, end]) {
    const match = iso.match(/^(\d{4})-(\d{2})-/);
    if (match) months.add(Number(match[2]));
  }
  return months;
}

function hourLineMentionsOutsideTripMonths(hoursLine, tripMonths) {
  const line = text(hoursLine, 800);
  if (!line || !tripMonths.size) return false;
  TRIP_MONTH_TOKEN_RE.lastIndex = 0;
  for (const match of line.matchAll(TRIP_MONTH_TOKEN_RE)) {
    const month = ENGLISH_MONTH_INDEX.get(match[1].toLowerCase());
    if (month && !tripMonths.has(month)) return true;
  }
  return false;
}

export function citedShowsRatingFromNarrative(...blobs) {
  for (const blob of blobs) {
    const body = text(blob, 8000);
    if (!body) continue;
    let best = null;
    for (const match of body.matchAll(CITED_SHOWS_RE)) {
      const parsed = parseStarRating(match[2]);
      if (parsed != null) best = { source: text(match[1], 60), value: parsed };
    }
    if (best) return best;
  }
  return null;
}

function clearBorrowedRatings(override = {}, place = {}) {
  if (!missingFieldsHasRatings(override, place)) return;
  for (const key of [
    'googleRating',
    'googleReviewCount',
    'yelpRating',
    'yelpReviewCount',
    'thirdPartyRating',
    'thirdPartyReviewCount',
    'rating',
    'ratingCount',
    'otherRatingSites',
  ]) {
    delete override[key];
  }
}

function alignStarsWithCitedNarrative(override = {}) {
  const cited = citedShowsRatingFromNarrative(
    override.longDetails,
    override.description,
    override.summary,
    override.details,
  );
  if (!cited) return;
  const display = String(cited.value);
  override.googleRating = '';
  override.yelpRating = '';
  override.thirdPartyRating = display;
  override.thirdPartySource = cited.source;
  if (!text(override.rating)) override.rating = display;
}

function normalizeHoursForTrip(override = {}, tripMonths) {
  const hours = text(override.hours);
  if (!hours || !hourLineMentionsOutsideTripMonths(hours, tripMonths)) return;
  const general = hours
    .replace(/^\s*[A-Za-z]+:\s*/i, '')
    .replace(/\s*\([^)]*seasonal[^)]*\)/gi, '')
    .trim();
  if (general) override.hours = general;
  else delete override.hours;
}

function copyOverrideTimeIfBlank(override, key, ...values) {
  if (text(override[key], 40)) return;
  for (const value of values) {
    const row = text(value, 40);
    if (row) {
      override[key] = row;
      return;
    }
  }
}

function titleHasClockRange(rawTitle = '') {
  const row = text(rawTitle, 240);
  if (!row) return false;
  CLOCK_TITLE_RE.lastIndex = 0;
  return CLOCK_TITLE_RE.test(row);
}

function applyFlightTitleTimes(place, override) {
  const category = productThingCategory(place, override);
  if (category !== 'flight') return;
  const rawTitle = text(place.name || place.title || override.title, 240);
  if (!rawTitle) return;
  if (!titleHasClockRange(rawTitle)) return;
  const fromTitle = flightFieldsFromBlob(rawTitle, '');
  copyOverrideTimeIfBlank(override, 'departureTime', fromTitle.departureTime, place.place_time, place.start_time);
  copyOverrideTimeIfBlank(override, 'arrivalTime', fromTitle.arrivalTime, place.end_time);
}

export function applyLiveQa903Presentation(shared = {}) {
  const tripMonths = tripMonthSet(shared);
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = { ...(shared.thingOverrides || {}) };
  for (const place of places) {
    const key = `place:${place.id}`;
    const override = { ...(thingOverrides[key] || {}) };
    clearBorrowedRatings(override, place);
    alignStarsWithCitedNarrative(override);
    normalizeHoursForTrip(override, tripMonths);
    applyFlightTitleTimes(place, override);
    thingOverrides[key] = override;
  }
  return { ...shared, places, thingOverrides };
}
