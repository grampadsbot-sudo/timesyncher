import { transportKind } from './intake-transport-kind.mjs';
import { normalizeThingType } from './timeline-icons.mjs';
import { writeRatings } from './write-ratings.mjs';

const NON_TRANSPORT_CATEGORIES = new Set([
  'restaurant',
  'bar',
  'store',
  'shopping',
  'activity',
  'tour',
  'attraction',
  'event',
  'sightseeing',
  'other',
  'music',
  'workout',
  'artist',
  'theatre',
  'tickets',
  'family_event',
]);

const HAPPY_HOUR_CATEGORIES = new Set(['restaurant', 'bar']);

export function text(value, max = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value) {
  return text(value, 20000).split(/\s+/).filter(Boolean).length;
}

function sourceRecordFrom(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  if (meta.sourceRecord && typeof meta.sourceRecord === 'object') return meta.sourceRecord;
  if (thing.sourceRecord && typeof thing.sourceRecord === 'object') return thing.sourceRecord;
  return null;
}

function detailBagFrom(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const bag = meta.thingDetail && typeof meta.thingDetail === 'object' ? meta.thingDetail : {};
  return { ...bag };
}

function detailBagHasExplicitFields(bag = {}) {
  return Object.values(bag).some((value) => text(value));
}

/** Skip title-only itinerary lines on customer stubs; search/enriched things still get notes. */
function shouldApplyAutoDetailFields(thing = {}) {
  const bag = detailBagFrom(thing);
  if (detailBagHasExplicitFields(bag)) return true;
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const source = text(thing.source || meta.source, 80).toLowerCase();
  if (['brave', 'osm', 'tavily', 'google-places'].includes(source)) return true;
  const record = sourceRecordFrom(thing);
  if (!record) return false;
  return Boolean(
    text(record.address)
    || text(record.phone)
    || text(record.hours)
    || record.rating != null
    || text(record.longDetails),
  );
}

function copyIfBlank(target, key, ...values) {
  if (text(target[key])) return;
  for (const value of values) {
    const row = text(value);
    if (row) {
      target[key] = row;
      return;
    }
  }
}

function copyReview(target, index, quote, sourceLabel, rating) {
  const key = `review${index}`;
  const sourceKey = `review${index}Source`;
  const ratingKey = `review${index}Rating`;
  copyIfBlank(target, key, quote);
  copyIfBlank(target, sourceKey, sourceLabel);
  copyIfBlank(target, ratingKey, rating);
}

function ratingCountLabel(record = {}) {
  const count = record.ratingCount ?? record.count ?? record.reviewCount;
  if (count === null || count === undefined || count === '') return '';
  const parsed = Number(count);
  if (Number.isFinite(parsed)) return String(Math.round(parsed));
  return text(count, 40);
}

function isGooglePlacesSource(record = {}) {
  const source = text(record?.source).toLowerCase().replace(/[\s_]+/g, '-');
  return source === 'google-places';
}

function ratingValueLabel(record = {}) {
  const rating = record.rating ?? record.googleRating ?? record.yelpRating;
  if (rating === null || rating === undefined || rating === '') return '';
  const parsed = Number(rating);
  if (Number.isFinite(parsed)) return String(parsed);
  return /\d/.test(String(rating)) ? text(rating, 40) : '';
}

function itineraryNoteFrom({ title, category, summary, longDetails, neighborhood, address } = {}) {
  const name = text(title, 160);
  const area = text(neighborhood || address, 120);
  const cat = text(category, 40).toLowerCase();
  const bits = [];
  if (cat === 'restaurant' || cat === 'bar') bits.push(area ? `${name} in ${area}` : name);
  else if (cat === 'hotel') bits.push(area ? `Stay at ${name} (${area})` : `Stay at ${name}`);
  else if (cat === 'car') bits.push(`Pick up ${name}`);
  else if (cat === 'flight') bits.push(name);
  else bits.push(name);
  const why = text(summary || longDetails, 220);
  if (why && !bits.join(' ').includes(why.slice(0, 40))) bits.push(why);
  return text(bits.join(' — '), 280);
}

export function descriptionPassesDetailJudge(description, placeName = '') {
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

function explicitCategoryForThing(thing = {}) {
  return text(thing.category || thing.category_name || thing.category?.name, 80).toLowerCase();
}

/** Prefer stored trip category over airport-code heuristics for attractions and tours. */
export function resolvedPresentationCategory(thing = {}) {
  const explicit = explicitCategoryForThing(thing);
  if (NON_TRANSPORT_CATEGORIES.has(explicit)) {
    const normalized = normalizeThingType(explicit) || explicit;
    return normalized === 'shopping' ? 'store' : normalized;
  }
  const kind = transportKind(thing);
  if (kind === 'flight' || kind === 'car') return kind;
  if (explicit === 'hotel' || explicit === 'lodging' || explicit === 'accommodation') return 'hotel';
  return normalizeThingType(explicit) || explicit || 'other';
}

export function detailFieldsFromPlace(place = {}, thing = {}) {
  const record = sourceRecordFrom(thing) || sourceRecordFrom(place) || {};
  const category = resolvedPresentationCategory({ ...thing, ...place, category: place.category || thing.category });
  const title = text(place.title || thing.title || place.name, 240);
  const address = text(place.address || thing.address || record.address, 240);
  const phone = text(record.phone || record.telephone || place.phone, 80);
  const website = text(place.url || record.url || record.website, 500);
  const hours = text(record.hours || record.openingHours || record.opening_hours, 800);
  const priceLevel = text(record.priceLevel || record.price_level || place.priceLevel, 40);
  const price = place.price ?? record.price ?? thing.price;
  const googleRating = text(record.googleRating, 40);
  const googleReviewCount = text(record.googleReviewCount, 40);
  const yelpRating = text(record.yelpRating, 40);
  const yelpReviewCount = text(record.yelpReviewCount, 40);
  const thirdPartyRating = isGooglePlacesSource(record)
    ? ''
    : text(record.thirdPartyRating || ratingValueLabel(record), 40);
  const thirdPartyReviewCount = isGooglePlacesSource(record)
    ? ''
    : text(record.thirdPartyReviewCount || ratingCountLabel(record), 40);
  const longDetails = text(
    record.longDetails || record.details || place.description || thing.description,
    3000,
  );
  const summary = text(record.summary || place.summary || thing.summary, 500);
  const summarySourceUrls = Array.isArray(record.summarySourceUrls)
    ? record.summarySourceUrls.map((row) => text(row, 500)).filter(Boolean)
    : [];
  const itineraryNote = text(
    record.itineraryNote || record.itinerary_note || itineraryNoteFrom({
      title,
      category,
      summary,
      longDetails,
      neighborhood: record.neighborhood,
      address,
    }),
    280,
  );
  const lat = record.lat ?? place.lat ?? thing.lat;
  const lng = record.lng ?? place.lng ?? thing.lng;
  const fields = {
    category,
    title,
    address,
    phone,
    website,
    hours,
    priceLevel,
    summary,
    summarySourceUrls,
    longDetails,
    itineraryNote,
    ...(lat != null ? { lat } : {}),
    ...(lng != null ? { lng } : {}),
    googleRating,
    googleReviewCount,
    yelpRating,
    yelpReviewCount,
    thirdPartyRating,
    thirdPartyReviewCount,
  };
  if (price !== null && price !== undefined && price !== '') fields.price = price;
  if (!isGooglePlacesSource(record)) {
    copyReview(fields, 1, record.review1, record.review1Source || record.reviewSources?.[0], record.review1Rating);
    copyReview(fields, 2, record.review2, record.review2Source || record.reviewSources?.[1], record.review2Rating);
    copyReview(fields, 3, record.review3, record.review3Source || record.reviewSources?.[2], record.review3Rating);
    copyReview(fields, 4, record.review4, record.review4Source || record.reviewSources?.[3], record.review4Rating);
  }
  if (HAPPY_HOUR_CATEGORIES.has(category)) {
    if (record.happyHour != null) fields.happyHour = !!record.happyHour;
    copyIfBlank(fields, 'happyHourDays', record.happyHourDays, record.happy_hour_days);
    copyIfBlank(fields, 'happyHourTimes', record.happyHourTimes, record.happy_hour_times);
    copyIfBlank(fields, 'happyHourDeals', record.happyHourDeals, record.happy_hour_deals);
    const details = text(record.happyHourDetails, 1200);
    if (details) {
      fields.happyHourDetails = details;
      fields.happyHour = true;
    } else if (fields.happyHourDays || fields.happyHourTimes || fields.happyHourDeals) {
      const merged = [
        fields.happyHourDays && `Days: ${fields.happyHourDays}`,
        fields.happyHourTimes && `Times: ${fields.happyHourTimes}`,
        fields.happyHourDeals && `Deals: ${fields.happyHourDeals}`,
      ].filter(Boolean).join(' · ');
      if (merged) {
        fields.happyHourDetails = merged;
        fields.happyHour = true;
      }
    }
  }
  if (category === 'flight') {
    copyIfBlank(fields, 'airline', record.airline);
    copyIfBlank(fields, 'flightNumber', record.flightNumber || record.flight_number);
    copyIfBlank(fields, 'departureTime', record.departureTime || record.departure_time);
    copyIfBlank(fields, 'arrivalTime', record.arrivalTime || record.arrival_time);
    copyIfBlank(fields, 'layovers', record.layovers);
    copyIfBlank(fields, 'duration', record.duration);
  }
  if (category === 'hotel') {
    copyIfBlank(fields, 'checkInTime', record.checkInTime || record.check_in_time);
    copyIfBlank(fields, 'checkOutTime', record.checkOutTime || record.check_out_time);
    copyIfBlank(fields, 'hotelNote', record.hotelNote || record.hotel_note);
  }
  if (category === 'car') {
    copyIfBlank(fields, 'rentalCompany', record.rentalCompany || record.company);
    copyIfBlank(fields, 'carType', record.carType || record.vehicleClass);
    copyIfBlank(fields, 'pickupLocation', record.pickupLocation || record.pickup_location);
    copyIfBlank(fields, 'returnLocation', record.returnLocation || record.return_location);
  }
  return fields;
}

export function mergeThingDetailMetadata(metadata = {}, detail = {}) {
  const next = { ...(metadata || {}) };
  const bag = { ...(next.thingDetail && typeof next.thingDetail === 'object' ? next.thingDetail : {}), ...detail };
  next.thingDetail = bag;
  if (detail.sourceRecord && typeof detail.sourceRecord === 'object') {
    next.sourceRecord = { ...(next.sourceRecord || {}), ...detail.sourceRecord };
  }
  return next;
}

export function thingDetailOverrideFields(thing = {}) {
  const bag = detailBagFrom(thing);
  const record = sourceRecordFrom(thing) || {};
  const fromRecord = detailFieldsFromPlace({}, thing);
  const merged = { ...fromRecord, ...bag };
  const explicitItinerary = text(
    bag.itineraryNote
    || bag.itinerary_note
    || record.itineraryNote
    || record.itinerary_note,
  );
  if (explicitItinerary) merged.itineraryNote = explicitItinerary;
  else {
    delete merged.itineraryNote;
    delete merged.itinerary_note;
  }
  if (!shouldApplyAutoDetailFields(thing) && !explicitItinerary) {
    delete merged.itineraryNote;
  }
  const override = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && !value.length) continue;
    override[key] = value;
  }
  const ratings = writeRatings(thing);
  Object.assign(override, ratings);
  if (merged.googleRating) override.googleRating = merged.googleRating;
  if (merged.yelpRating) override.yelpRating = merged.yelpRating;
  if (merged.googleReviewCount) override.googleReviewCount = merged.googleReviewCount;
  if (merged.yelpReviewCount) override.yelpReviewCount = merged.yelpReviewCount;
  if (merged.thirdPartyRating && !text(override.thirdPartyRating)) override.thirdPartyRating = merged.thirdPartyRating;
  if (merged.thirdPartyReviewCount && !text(override.count)) override.thirdPartyReviewCount = merged.thirdPartyReviewCount;
  if (merged.category) override.category = merged.category;
  return override;
}

function reviewIsComplete(fields = {}, index = 1) {
  const body = text(fields[`review${index}`], 2000);
  const source = text(fields[`review${index}Source`], 40);
  const rating = text(fields[`review${index}Rating`], 20);
  if (wordCount(body) < 25) return false;
  if (!['Google', 'Yelp', 'TripAdvisor'].includes(source)) return false;
  return /\d/.test(rating);
}

export function missingDetailFieldsForCategory(fields = {}, category = 'other') {
  const cat = text(category, 40).toLowerCase() || 'other';
  const missing = [];
  const need = (key, label = key) => {
    if (!text(fields[key])) missing.push(label);
  };
  need('itineraryNote', 'itinerary_note');
  if (cat !== 'flight' && cat !== 'decision' && cat !== 'note') {
    need('address');
    need('phone');
    need('hours');
    need('website');
    need('longDetails', 'description');
    if (!descriptionPassesDetailJudge(fields.longDetails, fields.title)) missing.push('description_judge');
    if (!text(fields.price) && !text(fields.priceLevel)) missing.push('price');
    need('googleReviewCount', 'google_review_count');
    need('summary');
    if (wordCount(fields.summary) < 30 || !descriptionPassesDetailJudge(fields.summary, fields.title)) {
      missing.push('summary_judge');
    }
    const summaryUrls = Array.isArray(fields.summarySourceUrls)
      ? fields.summarySourceUrls.filter((row) => text(row))
      : [];
    if (summaryUrls.length < 2) missing.push('summary_source_urls');
    if (fields.lat == null || fields.lng == null) missing.push('coordinates');
    if (!['flight', 'car', 'transport'].includes(cat)) {
      need('googleRating');
      for (const index of [1, 2, 3, 4]) {
        if (!reviewIsComplete(fields, index)) missing.push(`review${index}`);
      }
    }
  }
  if (HAPPY_HOUR_CATEGORIES.has(cat)) {
    need('happyHourDetails', 'happy_hour');
  }
  if (cat === 'flight') {
    ['airline', 'flightNumber', 'departureTime', 'arrivalTime', 'duration', 'price'].forEach((key) => need(key));
  }
  if (cat === 'hotel') {
    ['googleRating', 'price', 'checkInTime', 'checkOutTime', 'hotelNote'].forEach((key) => need(key));
  }
  if (cat === 'car') {
    ['rentalCompany', 'carType', 'pickupLocation', 'returnLocation', 'price'].forEach((key) => need(key));
  }
  return missing;
}

export function applyThingDetailOverrides(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = { ...(shared.thingOverrides || {}) };
  for (const place of places) {
    const key = `place:${place.id}`;
    const prior = thingOverrides[key] || {};
    const mergedThing = {
      ...place,
      title: place.name || place.title,
      category: prior.category || place.category?.name || place.category_name,
      metadata: {
        ...(place.metadata || {}),
        sourceRecord: place.sourceRecord,
        thingDetail: { ...(place.metadata?.thingDetail || {}), ...prior },
      },
      sourceRecord: place.sourceRecord,
    };
    thingOverrides[key] = { ...thingDetailOverrideFields(mergedThing), ...prior };
  }
  return { ...shared, places, thingOverrides };
}
