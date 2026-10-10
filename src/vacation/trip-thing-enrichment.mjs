import { captureThingLogo, NAMED_THING_LOGOS } from './thing-logo-capture.mjs';

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

export function parsePriceValue(value) {
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
  return { ...embedded };
}

function firstPrice(...values) {
  for (const value of values) {
    const parsed = parsePriceValue(value);
    if (parsed != null) return parsed;
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
    'worth it if the timing beats a connection; skip if you need a late checkout',
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
    vibe || 'reservation-friendly dining room',
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
  const when = text(source.when || source.startsAt || source.schedule || '', 120);
  const why = text(source.why || source.summary || 'Live set with a classic NYC room feel', 200);
  return text([title, when, why, 'book ahead on weekends'].filter(Boolean).join('; '), 4000);
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

export function enrichSearchPlace(place = {}) {
  const next = { ...place };
  const sourceRecord = sourceRecordFrom(next);
  const category = text(next.category, 80).toLowerCase();
  const address = text(next.address || sourceRecord.address, 240);
  const rawDescription = text(next.description || sourceRecord.description || sourceRecord.summary, 4000);
  const description = buildCategoryDescription({
    category,
    title: next.title,
    sourceRecord,
    address,
    rawDescription,
  });
  const price = firstPrice(
    next.price,
    next.totalPrice,
    sourceRecord.price,
    sourceRecord.rate,
    sourceRecord.amount,
    rawDescription,
    description,
  );
  const logoUrl = logoUrlFromSearchPlace(next, sourceRecord);
  const enrichedSource = {
    ...sourceRecord,
    ...(description ? { summary: description, description } : {}),
    ...(price != null ? { price } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(next.url ? { url: next.url, website: next.url } : {}),
  };
  next.description = description;
  next.sourceRecord = enrichedSource;
  if (price != null) next.price = price;
  if (logoUrl) next.logoUrl = logoUrl;
  return next;
}

export function enrichTripThing(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? { ...thing.metadata } : {};
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object'
    ? { ...meta.sourceRecord }
    : {};
  const category = text(thing.category, 80).toLowerCase();
  const location = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const description = buildCategoryDescription({
    category,
    title: thing.title,
    sourceRecord,
    address: location.address || '',
    rawDescription: thing.description,
  });
  const price = firstPrice(
    thing.price,
    meta.price,
    sourceRecord.price,
    thing.description,
    description,
  );
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

export { NAMED_THING_LOGOS };
