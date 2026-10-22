import { captureThingLogo } from './thing-logo-capture.mjs';
import { estimateSearchPlacePrice } from './search-place-price-estimate.mjs';
import { descriptionPassesDetailJudge } from './thing-detail-fields.mjs';

export { estimateSearchPlacePrice } from './search-place-price-estimate.mjs';

const GENERIC_DESCRIPTION_RES = [
  /^Documented NYC option\b/i,
  /^Documented .+ option\b/i,
  /^[A-Za-z ]+ option \([^)]+\)\.?$/,
];

const AIRLINE_LOGOS = [
  [/\bjetblue\b/i, 'https://www.jetblue.com/favicon.ico'],
  [/\bsouthwest\b/i, 'https://www.southwest.com/favicon.ico'],
  [/\bunited\b/i, 'https://www.united.com/favicon.ico'],
  [/\bdelta\b/i, 'https://www.delta.com/favicon.ico'],
  [/\bamerican\b/i, 'https://www.aa.com/favicon.ico'],
];

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

export function isGenericDescription(value = '') {
  const row = text(value, 4000);
  if (!row) return true;
  if (GENERIC_DESCRIPTION_RES.some((re) => re.test(row))) return true;
  if (wordCount(row) < 6) return true;
  if (/^\S+\s+\S+\s*,\s*New York/i.test(row) && wordCount(row) < 10) return true;
  return false;
}

function parsePriceValue(value) {
  if (value === null || value === undefined || value === '') return null;
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

function sourceRecordFrom(place = {}) {
  const embedded = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  return {
    ...embedded,
    ...(embedded.rating == null && place.rating != null ? { rating: place.rating } : {}),
    ...(embedded.count == null && embedded.ratingCount == null && place.ratingCount != null
      ? { count: place.ratingCount }
      : {}),
    ...(embedded.categoryName == null && place.categoryName
      ? { categoryName: String(place.categoryName).trim() }
      : {}),
    ...(embedded.providerCategories == null
      && Array.isArray(place.providerCategories)
      && place.providerCategories.length
      ? { providerCategories: place.providerCategories }
      : {}),
  };
}

function firstPrice(...values) {
  for (const value of values) {
    const parsed = parsePriceValue(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function priceFromSourceText(...values) {
  for (const value of values) {
    const row = text(value, 4000);
    if (!row) continue;
    const nightly = row.match(/Price:\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:\/|\s*per\s*)?night/i);
    if (nightly) {
      const parsed = parsePriceValue(nightly[1]);
      if (parsed != null) return parsed;
    }
    const from = row.match(/\bfrom\s+\$?\s*([\d,]+(?:\.\d+)?)/i);
    if (from) {
      const parsed = parsePriceValue(from[1]);
      if (parsed != null) return parsed;
    }
    const total = row.match(/\$\s*([\d,]+(?:\.\d+)?)\s+total\b/i);
    if (total) {
      const parsed = parsePriceValue(total[1]);
      if (parsed != null) return parsed;
    }
    const daily = row.match(/\$\s*([\d,]+(?:\.\d+)?)\s*\/\s*day/i);
    if (daily) {
      const parsed = parsePriceValue(daily[1]);
      if (parsed != null) return parsed;
    }
    const perPerson = row.match(/Price:\s*\$?\s*([\d,]+(?:\.\d+)?)\s*per person/i);
    if (perPerson) {
      const parsed = parsePriceValue(perPerson[1]);
      if (parsed != null) return parsed;
    }
    const adults = row.match(/Adults:\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
    if (adults) {
      const parsed = parsePriceValue(adults[1]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function airlineFromTitle(title = '') {
  const row = text(title, 240);
  for (const [pattern] of AIRLINE_LOGOS) {
    const match = row.match(pattern);
    if (match) return match[0];
  }
  const head = row.split(/\s+/)[0];
  return head || 'Airline';
}

function flightDescription(title = '', source = {}) {
  const airline = text(source.airline || airlineFromTitle(title), 80);
  const times = text(source.schedule || source.summary || title, 240);
  const stops = text(source.stops || source.stopSummary || '', 120);
  const duration = text(source.duration || source.flightDuration || '', 80);
  const bits = [
    `${airline} option`,
    times.includes('→') || times.includes('-') ? `schedule ${times}` : times,
    stops ? `${stops} stops` : 'nonstop when available',
    duration ? `${duration} block` : '',
    'worth it if the timing beats a connection; pass if you need a late hotel departure',
  ].filter(Boolean);
  return text(bits.join('; '), 4000);
}

function hotelDescription(title = '', source = {}, address = '') {
  const area = text(source.neighborhood || source.area || address, 160);
  const rating = text(source.rating || source.googleRating || source.bookingRating || '', 40);
  const amenity = text(source.amenity || source.standoutAmenity || source.highlight || '', 120);
  const price = firstPrice(source.price, source.rate, source.nightlyRate);
  const bits = [
    area ? `${area} base` : text(title, 120),
    amenity || 'walkable neighborhood access',
    rating ? `${rating} guest rating` : '',
    price != null ? `about $${price.toLocaleString('en-US')}/night` : '',
    'fits couples who want an easy subway link and late dinners',
  ].filter(Boolean);
  return text(bits.join('; '), 4000);
}

function restaurantDescription(title = '', source = {}, raw = '') {
  if (raw && !isGenericDescription(raw)) return text(raw, 4000);
  const cuisine = text(source.cuisine || source.category || source.categoryName || 'Seasonal', 80);
  const vibe = text(source.vibe || source.signature || source.highlight || '', 120);
  const priceLevel = text(source.priceLevel || source.price_level || '', 40);
  const bits = [
    `${cuisine} spot`,
    vibe || 'table-service dining room',
    priceLevel || 'mid-range check',
    'go for a sit-down meal; skip if you need a quick counter bite',
  ].filter(Boolean);
  return text(bits.join('; '), 4000);
}

function carDescription(title = '', source = {}) {
  const company = text(source.rentalCompany || source.vendor || source.company || title.split('—')[0], 120);
  const vehicle = text(source.carType || source.vehicleClass || source.model || 'Compact automatic', 120);
  const pickup = text(source.pickup || source.pickupLocation || source.address || 'airport counter', 120);
  const price = firstPrice(source.price, source.rate, source.totalPrice);
  const bits = [
    company,
    vehicle,
    pickup,
    price != null ? `$${price.toLocaleString('en-US')} quote` : '',
    'pick this up if you want trunk space; skip if you are staying near transit',
  ].filter(Boolean);
  return text(bits.join('; '), 4000);
}

function storeDescription(title = '', source = {}, raw = '') {
  if (raw && !isGenericDescription(raw)) return text(raw, 4000);
  const focus = text(source.summary || source.description || title, 200);
  return text(`${focus}; worth a stop for gifts or trip supplies, skip if you are tight on time`, 4000);
}

function eventDescription(title = '', source = {}, raw = '') {
  if (raw && !isGenericDescription(raw)) return text(raw, 4000);
  const when = text(
    source.when || source.startsAt || source.schedule || source.startTime || source.place_time,
    160,
  );
  const why = text(source.why || source.summary || source.description || '', 240);
  const bits = [
    title,
    when
      ? `When: ${when} (confirm doors and set times on the venue calendar).`
      : 'When: check the posted show date and start time before you buy tickets.',
    why && !isGenericDescription(why)
      ? why
      : 'Compare ticket tiers, fees, and refund rules on the official listing before you commit.',
    'Book ahead on weekends; arrive early for will-call or bar seating.',
  ].filter(Boolean);
  return text(bits.join(' '), 4000);
}

export function buildCategoryDescription({
  category = '',
  title = '',
  sourceRecord = {},
  address = '',
  rawDescription = '',
} = {}) {
  const cat = text(category, 80).toLowerCase();
  const raw = text(rawDescription, 4000);
  if (raw && !isGenericDescription(raw)) return raw;
  if (cat === 'flight') return flightDescription(title, sourceRecord);
  if (cat === 'hotel' || cat === 'lodging') return hotelDescription(title, sourceRecord, address);
  if (cat === 'restaurant') return restaurantDescription(title, sourceRecord, raw);
  if (cat === 'car') return carDescription(title, sourceRecord);
  if (cat === 'store' || cat === 'grocery' || cat === 'market') return storeDescription(title, sourceRecord, raw);
  if (cat === 'music' || cat === 'event' || cat === 'tour' || cat === 'activity') {
    return eventDescription(title, sourceRecord, raw);
  }
  return text(raw || `${title}; source-backed option to compare against your shortlist`, 4000);
}

function airlineLogoFromTitle(title = '') {
  const row = text(title, 240);
  for (const [pattern, url] of AIRLINE_LOGOS) {
    if (pattern.test(row)) return url;
  }
  return '';
}

export function logoUrlFromSearchPlace(place = {}, sourceRecord = {}) {
  const explicit = text(
    sourceRecord.logoUrl
    || sourceRecord.logo
    || sourceRecord.favicon
    || sourceRecord.faviconUrl
    || place.logoUrl
    || place.iconUrl,
  );
  if (explicit) return explicit;
  const thumb = sourceRecord?.thumbnail;
  if (thumb && typeof thumb === 'object') {
    const src = text(thumb.original || thumb.src);
    if (src) return src;
  }
  const category = text(place.category, 80).toLowerCase();
  if (category === 'flight') {
    const airlineLogo = airlineLogoFromTitle(place.title);
    if (airlineLogo) return airlineLogo;
  }
  const named = captureThingLogo(
    { ...place, sourceRecord, title: place.title, website: place.url || sourceRecord.url },
    { category, sourceRecord },
  );
  if (named) return named;
  const page = text(place.url || sourceRecord.url || sourceRecord.website);
  if (page) {
    try {
      const parsed = new URL(page);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.origin}/favicon.ico`;
      }
    } catch {
      return '';
    }
  }
  return '';
}

function sourcedLongDescription(place = {}, sourceRecord = {}) {
  return text(
    sourceRecord.longDetails
    || sourceRecord.details
    || sourceRecord.description
    || place.description,
    4000,
  );
}

const SHORT_LINE_MIN_WORDS = 6;

function shortLineFromSourceText(value = '', max = 120) {
  const row = text(value, 4000);
  if (!row) return '';
  const clauses = row.match(/[^.!?;]+[.!?;]/gy);
  if (clauses) {
    let line = '';
    for (const clause of clauses) {
      const next = text(`${line} ${clause}`, 4000);
      if (line && next.length > max) break;
      line = next;
      if (line.split(' ').length >= SHORT_LINE_MIN_WORDS) break;
    }
    return text(line, max);
  }
  return text(row.split(/\s+/).slice(0, 10).join(' '), max);
}

function ccabFactText(sourceRecord = {}, place = {}) {
  return text(sourceRecord.summary || sourceRecord.description || place.description || place.summary, 500);
}

function ccabNeighborhoodTagline(sourceRecord = {}, title = '') {
  const neighborhood = ccabFactText(sourceRecord, {}).match(/Neighborhood:\s*([^;]+)/i);
  const name = text(title, 160);
  if (neighborhood && name) return text(`${name} in ${neighborhood[1]}`, 120);
  return '';
}

function descriptionWhenJudgeFails({
  category = '',
  title = '',
  sourceRecord = {},
  address = '',
  place = {},
  rawDescription = '',
} = {}) {
  const cat = text(category, 80).toLowerCase();
  if ((cat === 'hotel' || cat === 'lodging') && /Neighborhood:\s*[^;]+/i.test(ccabFactText(sourceRecord, place))) return '';
  return buildCategoryDescription({ category: cat, title, sourceRecord, address, rawDescription });
}

function sourcedShortSummary(place = {}, sourceRecord = {}, longDescription = '', title = '') {
  let summary = text(sourceRecord.summary || place.summary, 500);
  const itinerary = text(sourceRecord.itineraryNote || sourceRecord.itinerary_note, 280);
  if (longDescription && descriptionPassesDetailJudge(longDescription, title)) {
    const tagline = ccabNeighborhoodTagline(sourceRecord, title) || shortLineFromSourceText(longDescription);
    if (tagline) return tagline;
  }
  if (itinerary && itinerary !== longDescription) return itinerary;
  if (summary && summary === longDescription) return shortLineFromSourceText(summary);
  if (summary.length > 140) summary = shortLineFromSourceText(summary);
  if (summary && summary !== longDescription) return summary;
  if (summary) return summary;
  if (longDescription) return shortLineFromSourceText(longDescription);
  return itinerary;
}

export function enrichSearchPlace(place = {}) {
  const next = { ...place };
  const sourceRecord = sourceRecordFrom(next);
  const category = text(next.category, 80).toLowerCase();
  const title = text(next.title || next.name, 240);
  let description = text(
    next.longDetails || sourceRecord.longDetails || sourcedLongDescription(next, sourceRecord),
    4000,
  );
  if (!descriptionPassesDetailJudge(description, title)) {
    description = descriptionWhenJudgeFails({
      category,
      title: next.title,
      sourceRecord,
      address: next.address || '',
      place: next,
      rawDescription: sourcedLongDescription(next, sourceRecord),
    });
  }
  const summary = sourcedShortSummary(next, sourceRecord, description, title);
  const explicitBannedZero = next.price === 0 || sourceRecord.price === 0;
  let price = firstPrice(
    next.price,
    next.totalPrice,
    sourceRecord.price,
    sourceRecord.rate,
    sourceRecord.amount,
    sourceRecord.totalPrice,
    sourceRecord.nightlyRate,
    priceFromSourceText(
      description,
      summary,
      sourceRecord.description,
      sourceRecord.summary,
      sourceRecord.longDetails,
      sourceRecord.details,
    ),
    description,
    summary,
    sourceRecord.longDetails,
    sourceRecord.details,
  );
  if (price == null && !explicitBannedZero) {
    price = estimateSearchPlacePrice({
      category,
      title: next.title,
      description,
      summary,
      sourceRecord,
    });
  }
  const logoUrl = logoUrlFromSearchPlace(next, sourceRecord);
  const enrichedSource = {
    ...sourceRecord,
    ...(description ? { description, longDetails: description } : {}),
    ...(summary ? { summary } : {}),
    ...(price != null ? { price } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(next.url ? { url: next.url, website: next.url } : {}),
  };
  next.description = description;
  next.summary = summary;
  next.sourceRecord = enrichedSource;
  if (price != null) next.price = price;
  if (logoUrl) next.logoUrl = logoUrl;
  if (category) next.category = category;
  return next;
}

export function enrichTripThing(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? { ...thing.metadata } : {};
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object'
    ? { ...meta.sourceRecord }
    : {};
  const category = text(thing.category, 80).toLowerCase();
  const location = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const title = text(thing.title, 240);
  const sourcedLong = text(
    meta.thingDetail?.longDetails
    || sourceRecord.longDetails
    || thing.description,
    4000,
  );
  let description = '';
  if (descriptionPassesDetailJudge(sourcedLong, title)) {
    description = sourcedLong;
  } else {
    description = descriptionWhenJudgeFails({
      category,
      title: thing.title,
      sourceRecord,
      address: location.address || '',
      place: { description: thing.description, summary: thing.summary },
      rawDescription: thing.description,
    });
  }
  let price = firstPrice(
    thing.price,
    meta.price,
    sourceRecord.price,
    thing.description,
    description,
  );
  if (price == null && thing.price !== 0) {
    price = estimateSearchPlacePrice({
      category,
      title: thing.title,
      description,
      summary: sourceRecord.summary || thing.summary,
      sourceRecord,
    });
  }
  const logoUrl = logoUrlFromSearchPlace(
    {
      title: thing.title,
      category,
      url: sourceRecord.url || sourceRecord.website,
      sourceRecord,
    },
    sourceRecord,
  );
  const nextMeta = {
    ...meta,
    ...(price != null ? { price } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    sourceRecord: {
      ...sourceRecord,
      ...(description ? { summary: description, description } : {}),
      ...(price != null ? { price } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
  };
  return {
    ...thing,
    description,
    metadata: nextMeta,
    ...(price != null ? { price } : {}),
  };
}

export function rowNeedsProductEnrichment(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (isGenericDescription(row?.description)) return true;
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  if (!text(meta.logoUrl || sourceRecord.logoUrl || row.logoUrl)) return true;
  const price = firstPrice(row?.price, meta.price, sourceRecord.price);
  const category = text(row?.category, 80).toLowerCase();
  if (['flight', 'hotel', 'car'].includes(category) && price == null) {
    const blob = `${row?.description || ''} ${sourceRecord.summary || ''}`;
    if (/\$\s*\d/.test(blob)) return true;
  }
  return false;
}
