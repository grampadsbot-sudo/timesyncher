

import {
  carPriceDisplay,
  flightPriceDisplay,
  flightSchedule,
  formatUsd,
  hotelPriceDisplay,
  logoUrlForPlace,
  numericPrice,
  placeName,
  tabCategoryKey,
} from './listTabModel.mjs';

const REVIEW_SOURCES = new Set(['Google', 'Yelp', 'TripAdvisor']);
export const REPRESENTATIVE_REVIEWS_FOOTNOTE =
  'Reviews usually created to be representative of all reviews found.';
const XAI_REPRESENTATIVE_REVIEW_MIN_WORDS = 12;

function text(value) {
  return String(value ?? '').trim();
}

function tripCurrency(trip) {
  return text(trip?.trip?.currency) || 'USD';
}

export function safeHttpUrl(raw) {
  const value = text(raw);
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return null;
  }
  return null;
}

function wordCount(value) {
  return text(value, 20000).split(/\s+/).filter(Boolean).length;
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function sourceRecord(place, override) {
  return (
    override.sourceRecord ||
    place.sourceRecord ||
    (place.source && typeof place.source === 'object' ? place.source : null) ||
    {}
  );
}

const CATEGORY_LABELS = {
  flight: 'Flight',
  hotel: 'Hotel',
  car: 'Car',
  restaurant: 'Restaurant',
  bar: 'Bar',
  store: 'Store',
  event: 'Event',
  activity: 'Activity',
  attraction: 'Attraction',
  transport: 'Transport',
};

export function detailCategoryKey(place, trip) {
  const override = overrideFor(trip, place);
  const raw = text(
    override.category || place.category?.name || place.category_name || tabCategoryKey(place, trip),
  ).toLowerCase();
  if (raw === 'bar') return 'bar';
  if (raw === 'transport') return 'transport';
  if (raw.includes('attraction')) return 'attraction';
  if (raw.includes('activity') || raw === 'event') return 'activity';
  return tabCategoryKey(place, trip);
}

export function detailCategoryLabel(category) {
  const key = text(category).toLowerCase();
  return CATEGORY_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
}

function descriptionPassesDetailJudge(description, placeName = '') {
  const body = text(description, 4000);
  if (wordCount(body) < 30) return false;
  const name = text(placeName, 160);
  if (name) {
    const tokens = name.split(/\s+/).filter((token) => token.length > 3);
    if (tokens.some((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body))) {
      return true;
    }
  }
  const genericOnly = /^(this (is a )?good option|highly rated|popular spot|worth a visit)\.?$/i.test(body);
  return !genericOnly;
}

function coordValue(primary, ...fallbacks) {
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  if (primary === null || primary === undefined || primary === '') {
    for (const candidate of fallbacks) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
      if (candidate !== null && candidate !== undefined && candidate !== '') {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }
  const parsed = Number(primary);
  return Number.isFinite(parsed) ? parsed : null;
}

export function detailCoordinates(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const lat = coordValue(
    place.lat,
    override.lat,
    source.lat,
    place.location?.lat,
  );
  const lng = coordValue(
    place.lng,
    override.lng,
    source.lng,
    place.location?.lng,
  );
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function formatCoordinates(coords) {
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
}

function xaiRepresentativeReviews(override) {
  if (override.xaiRatingsFetched === true) return true;
  const nested = override.sourceRecord;
  return nested && typeof nested === 'object' && nested.xaiRatingsFetched === true;
}

function reviewIsComplete(override, index) {
  const body = text(override[`review${index}`], 2000);
  const source = text(override[`review${index}Source`], 40);
  const rating = text(override[`review${index}Rating`], 20);
  const minWords = xaiRepresentativeReviews(override) ? XAI_REPRESENTATIVE_REVIEW_MIN_WORDS : 25;
  if (wordCount(body) < minWords) return false;
  if (!/\d/.test(rating)) return false;
  return REVIEW_SOURCES.has(source);
}

function reviewCompositeLabel(override, index) {
  const dossierLabel = text(override[`review${index}Label`] || override.reviewsLabel, 200);
  if (dossierLabel) return dossierLabel;
  const explicit = text(override[`review${index}CompositeLabel`], 200);
  if (explicit) return explicit;
  const flagged = override[`review${index}Composite`];
  if (flagged !== true && !/^1|true|yes$/i.test(text(flagged))) return '';
  const totals = detailReviewTotals(override);
  const count = totals?.count;
  const sources = totals?.sources?.length ? totals.sources.join('/') : text(override[`review${index}Source`]);
  if (count) return `Composite of ${count} ${sources} reviews`.replace(/\s+/g, ' ').trim();
  return sources ? `Composite of ${sources} reviews` : 'Composite of reviews';
}

export function detailReviewTotals(override) {
  const raw = override.review_totals || override.reviewTotals;
  if (!raw || typeof raw !== 'object') return null;
  const count = Number(raw.count);
  const average = Number(raw.average);
  const histogram = Array.isArray(raw.histogram) ? raw.histogram.map((row) => Number(row)) : [];
  const sources = Array.isArray(raw.sources)
    ? raw.sources.map((row) => text(row)).filter(Boolean)
    : text(raw.sources)
        .split(/[,/|]+/)
        .map((row) => text(row))
        .filter(Boolean);
  if (!Number.isFinite(count) || count < 1 || !Number.isFinite(average)) return null;
  return { count, average, histogram, sources };
}

export function detailReviewTotalsLine(override) {
  const totals = detailReviewTotals(override);
  if (!totals) return '';
  return `Based on ${totals.count} reviews, avg ${totals.average.toFixed(1)} (other ratings)`;
}

export function detailHeaderLabel(categoryLabel, source) {
  const label = text(categoryLabel);
  const src = text(source);
  if (!label) return src;
  if (!src || /^customer$/i.test(src)) return label;
  const pretty = src.charAt(0).toUpperCase() + src.slice(1);
  return `${label} · ${pretty}`;
}

export function detailSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const name = placeName(place);
  const candidate = text(
    override.longDetails ||
      override.details ||
      override.summary ||
      source.longDetails ||
      source.summary ||
      place.description,
  );
  if (wordCount(candidate) < 30) return '';
  if (!descriptionPassesDetailJudge(candidate, name)) return '';
  return candidate;
}

export function detailItineraryNote(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(override.itineraryNote || override.itinerary_note || source.itineraryNote);
}

export function detailHappyHour(override) {
  return text(override.happyHourDetails);
}

export function detailPriceLabel(place, trip, category) {
  const cat = text(category).toLowerCase();
  const override = overrideFor(trip, place);
  if (cat === 'flight') return flightPriceDisplay(place, trip);
  if (cat === 'hotel') return hotelPriceDisplay(place, trip);
  if (cat === 'car') return carPriceDisplay(place, trip);
  const price = numericPrice(place, trip);
  if (price != null) return formatUsd(price, tripCurrency(trip));
  const level = text(override.priceLevel || override.price_level);
  return level;
}

export function detailRatingLines(override) {
  const lines = [];
  const googleRating = text(override.googleRating);
  const googleCount = text(override.googleReviewCount);
  if (googleRating) {
    lines.push({
      id: 'google',
      text: googleCount ? `${googleRating} on Google (${googleCount} reviews)` : `${googleRating} on Google`,
    });
  }
  const yelpRating = text(override.yelpRating);
  const yelpCount = text(override.yelpReviewCount);
  if (yelpRating) {
    lines.push({
      id: 'yelp',
      text: yelpCount ? `${yelpRating} on Yelp (${yelpCount} reviews)` : `${yelpRating} on Yelp`,
    });
  }
  const explicitThird = text(override.thirdPartyRating);
  const fallbackRating = text(override.rating);
  const thirdRating = explicitThird || (!googleRating && !yelpRating ? fallbackRating : '');
  const thirdCount = text(override.thirdPartyReviewCount || override.count);
  if (thirdRating) {
    const value = thirdCount ? `${thirdRating} (${thirdCount} reviews)` : thirdRating;
    lines.push({
      id: 'third',
      text: `Other ratings: ${value}`,
    });
  }
  return lines;
}

export function detailReviews(override, category) {
  const cat = text(category).toLowerCase();
  if (cat === 'flight' || cat === 'car') return [];
  const reviews = [];
  for (let index = 1; index <= 4; index += 1) {
    if (!reviewIsComplete(override, index)) continue;
    const compositeLabel = reviewCompositeLabel(override, index);
    reviews.push({
      index,
      text: text(override[`review${index}`]),
      rating: text(override[`review${index}Rating`]),
      source: text(override[`review${index}Source`]),
      compositeLabel,
    });
  }
  return reviews;
}

export function detailSummarySourceUrls(override) {
  const raw = override.summarySourceUrls;
  if (!Array.isArray(raw)) return [];
  const urls = [];
  const seen = new Set();
  for (const row of raw) {
    const safe = safeHttpUrl(row);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    urls.push(safe);
  }
  return urls;
}

function flightDetailRows(place, trip, override) {
  const source = sourceRecord(place, override);
  const schedule = flightSchedule(place, trip);
  const rows = [];
  const airline = text(override.airline || source.airline);
  if (airline) rows.push({ key: 'airline', label: 'Airline', value: airline });
  const flightNumber = text(override.flightNumber || override.flight_number || source.flightNumber);
  if (flightNumber) rows.push({ key: 'flightNumber', label: 'Flight number', value: flightNumber });
  if (schedule.depart) rows.push({ key: 'departureTime', label: 'Departure', value: schedule.depart });
  if (schedule.arrive) rows.push({ key: 'arrivalTime', label: 'Arrival', value: schedule.arrive });
  const layovers = text(override.layovers || source.layovers);
  if (layovers) rows.push({ key: 'layovers', label: 'Layovers', value: layovers });
  const duration = text(override.duration || source.duration);
  if (duration) rows.push({ key: 'duration', label: 'Duration', value: duration });
  return rows;
}

function carDetailRows(place, trip, override) {
  const source = sourceRecord(place, override);
  const rows = [];
  const company = text(override.rentalCompany || source.rentalCompany || source.company);
  if (company) rows.push({ key: 'rentalCompany', label: 'Rental company', value: company });
  const carType = text(override.carType || override.vehicleClass || source.carType || source.vehicleClass);
  if (carType) rows.push({ key: 'carType', label: 'Car type', value: carType });
  const pickup = text(override.pickupLocation || source.pickupLocation || source.pickup_location);
  if (pickup) rows.push({ key: 'pickupLocation', label: 'Pickup', value: pickup });
  const dropoff = text(override.returnLocation || source.returnLocation || source.return_location);
  if (dropoff) rows.push({ key: 'returnLocation', label: 'Return', value: dropoff });
  return rows;
}

function hotelExtraRows(override) {
  const rows = [];
  const checkIn = text(override.checkInTime || override.check_in_time);
  if (checkIn) rows.push({ key: 'checkInTime', label: 'Check-in', value: checkIn });
  const checkOut = text(override.checkOutTime || override.check_out_time);
  if (checkOut) rows.push({ key: 'checkOutTime', label: 'Check-out', value: checkOut });
  const note = text(override.hotelNote || override.hotel_note);
  if (note) rows.push({ key: 'hotelNote', label: 'Hotel note', value: note });
  return rows;
}

function standardContactRows(place, override) {
  const source = sourceRecord(place, override);
  const rows = [];
  const address = text(override.address || place.address || source.address);
  if (address) rows.push({ key: 'address', label: 'Address', value: address });
  const hours = text(override.hours || source.hours || source.openingHours);
  if (hours) rows.push({ key: 'hours', label: 'Hours', value: hours });
  const phone = text(override.phone || place.phone || source.phone || source.telephone);
  if (phone) rows.push({ key: 'phone', label: 'Phone', value: phone, href: `tel:${phone.replace(/\s+/g, '')}` });
  const website = text(override.website || override.url || place.url || source.website || source.url);
  const websiteHref = safeHttpUrl(website);
  if (website) {
    rows.push({
      key: 'website',
      label: 'Website',
      value: websiteHref ? website : website,
      href: websiteHref || undefined,
    });
  }
  return rows;
}

function coordinateRow(place, trip) {
  const coords = detailCoordinates(place, trip);
  if (!coords) return null;
  return { key: 'coordinates', label: 'Coordinates', value: formatCoordinates(coords) };
}

export function detailFieldRows(place, trip) {
  const override = overrideFor(trip, place);
  const category = detailCategoryKey(place, trip);
  const cat = text(category).toLowerCase();
  if (cat === 'flight') {
    const rows = flightDetailRows(place, trip, override);
    const coords = coordinateRow(place, trip);
    if (coords) rows.push(coords);
    return rows;
  }
  if (cat === 'car') {
    const rows = carDetailRows(place, trip, override);
    const coords = coordinateRow(place, trip);
    if (coords) rows.push(coords);
    return rows;
  }
  const rows = standardContactRows(place, override);
  const coords = coordinateRow(place, trip);
  if (coords) rows.push(coords);
  if (cat === 'hotel') rows.push(...hotelExtraRows(override));
  return rows;
}

export function buildDetailViewModel(place, trip) {
  const override = overrideFor(trip, place);
  const category = detailCategoryKey(place, trip);
  const name = placeName(place);
  const logoUrl = logoUrlForPlace(place, trip);
  const source = text(
    override.source ||
      (typeof place.source === 'object' && place.source?.source) ||
      place.source,
  );
  const categoryLabel = detailCategoryLabel(category);
  return {
    name,
    category,
    categoryLabel,
    headerLabel: detailHeaderLabel(categoryLabel, source),
    source: source,
    logoUrl,
    showLogo: Boolean(logoUrl),
    summary: detailSummary(place, trip),
    itineraryNote: detailItineraryNote(place, trip),
    happyHourDetails: detailHappyHour(override),
    priceLabel: detailPriceLabel(place, trip, category),
    ratingLines: detailRatingLines(override),
    reviews: detailReviews(override, category),
    reviewFootnote:
      xaiRepresentativeReviews(override) && detailReviews(override, category).length
        ? REPRESENTATIVE_REVIEWS_FOOTNOTE
        : '',
    reviewTotalsLine: detailReviewTotalsLine(override),
    summarySourceUrls: detailSummarySourceUrls(override),
    fieldRows: detailFieldRows(place, trip),
  };
}
