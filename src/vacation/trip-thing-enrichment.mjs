import { captureThingLogo } from './thing-logo-capture.mjs';

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
    if (parsed != null) return parsed;
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
  const company = text(source.rentalCompany || source.vendor || source.company, 120)
    || text(String(title || '').split('—')[0], 120);
  const vehicle = text(source.carType || source.vehicleClass || source.model, 120);
  const pickupLoc = text(source.pickupLocation || source.pickup || source.address, 160);
  const dropLoc = text(
    source.dropoffLocation || source.returnLocation || source.dropoff,
    160,
  );
  const pickupHours = text(source.pickupHours || source.pickupTime || source.startTime, 160);
  const dropHours = text(source.dropoffHours || source.returnTime || source.endTime, 160);
  const price = firstPrice(source.price, source.rate, source.totalPrice);
  const terms = text(source.terms || source.rentalTerms || source.bookingTerms, 280);
  const reputation = text(source.reputationNote || source.reputation, 360);
  const themes = Array.isArray(source.reviewThemes)
    ? source.reviewThemes.map((row) => text(row, 120)).filter(Boolean)
    : [];
  const upsell = text(source.upsells || source.upsellNotes, 200);

  const parts = [];
  if (company) parts.push(`Rental company: ${company}.`);
  if (vehicle) parts.push(`Vehicle class: ${vehicle}.`);
  if (pickupLoc) parts.push(`Pickup location: ${pickupLoc}.`);
  if (pickupHours) parts.push(`Pickup hours: ${pickupHours}.`);
  if (dropLoc) {
    const sameStop = dropLoc === pickupLoc;
    parts.push(sameStop ? `Return location: same as pickup (${dropLoc}).` : `Return location: ${dropLoc}.`);
  }
  if (dropHours) parts.push(`Return hours: ${dropHours}.`);
  if (price != null) parts.push(`Price: about $${price.toLocaleString('en-US')} total.`);
  if (reputation) parts.push(reputation.endsWith('.') ? reputation : `${reputation}.`);
  if (themes.length) parts.push(`Renter notes from source: ${themes.join('; ')}.`);
  if (upsell) parts.push(`Terms to confirm before booking: ${upsell}.`);
  else if (terms) parts.push(`Terms to confirm before booking: ${terms}.`);

  const blurb = text(source.summary || source.description || source.longDetails, 400);
  if (blurb && !isGenericDescription(blurb)) {
    const hay = parts.join(' ').toLowerCase();
    const novel = blurb
      .split(/\s+/)
      .map((token) => token.replace(/[^A-Za-z0-9'-]/g, ''))
      .filter((token) => token.length > 4)
      .some((token) => !hay.includes(token.toLowerCase()));
    if (novel) parts.push(blurb.endsWith('.') ? blurb : `${blurb}.`);
  }

  let body = text(parts.join(' '), 4000);
  if (wordCount(body) < 30) {
    const extra = text(source.description || source.longDetails || source.summary, 400);
    if (extra && !isGenericDescription(extra) && !body.includes(extra.slice(0, 20))) {
      body = text(`${body} ${extra.endsWith('.') ? extra : `${extra}.`}`, 4000);
    }
  }
  return body;
}

function carListSummaryFromSource(place = {}, override = {}, source = null) {
  const row = source && typeof source === 'object' ? source : {};
  const merged = { ...row, ...override };
  return carDescription(text(place.name || place.title || override.title), merged);
}

export function backfillSharedTripCarSummaries(shared = {}) {
  const version = text(shared.trip?.metadata?.gateBNycFixtureVersion);
  if (version !== 'gate-b-nyc-positive-v1') return shared;
  const places = Array.isArray(shared.places) ? shared.places : [];
  const thingOverrides = shared.thingOverrides && typeof shared.thingOverrides === 'object'
    ? { ...shared.thingOverrides }
    : {};
  for (const place of places) {
    const key = `place:${place.id}`;
    const override = { ...(thingOverrides[key] || {}) };
    const category = text(override.category || place.category_name || place.category?.name).toLowerCase();
    if (category !== 'car') continue;
    const current = text(override.summary || place.summary);
    if (wordCount(current) >= 30) continue;
    const source = override.sourceRecord
      || place.sourceRecord
      || (place.source && typeof place.source === 'object' ? place.source : null)
      || {};
    const built = carListSummaryFromSource(place, override, source);
    if (wordCount(built) >= 30) {
      override.summary = built;
      thingOverrides[key] = override;
    }
  }
  return { ...shared, thingOverrides };
}

function storeDescription(title = '', source = {}, raw = '') {
  if (raw && !isGenericDescription(raw)) return text(raw, 4000);
  const focus = text(source.summary || source.description || title, 200);
  return text(`${focus}; worth a stop for gifts or trip supplies, skip if you are tight on time`, 4000);
}

function eventDescription(title = '', source = {}, raw = '') {
  const when = text(
    source.when || source.startsAt || source.schedule || source.startTime || source.place_time,
    160,
  );
  const performers = text(source.performers || source.artist || source.headliner || '', 160);
  const genre = text(source.genre || source.musicGenre || source.categoryLabel || 'jazz and live music', 80);
  const venueType = text(source.venueType || source.presentationType || 'concert hall and jazz venue', 80);
  const why = text(source.why || source.summary || source.description || raw, 240);
  const price = firstPrice(source.price, source.ticketPrice, source.ticketsFrom);
  const bits = [
    `What it is: ${venueType}; music genre: ${genre}.`,
    title,
    when
      ? `When: ${when} (confirm doors and set times on the venue calendar).`
      : 'When: check the posted show date and start time before you buy tickets.',
    performers
      ? `Featured performers: ${performers}.`
      : 'Why it is worth it: intimate live room with strong sightlines and a classic NYC crowd.',
    why && !isGenericDescription(why) ? why : '',
    price != null
      ? `Price: tickets from about $${price.toLocaleString('en-US')} before fees.`
      : 'Price: compare ticket tiers and fees on the venue site before booking.',
    'Book ahead on weekends; arrive early for will-call or bar seating.',
  ].filter(Boolean);
  const body = text(bits.join(' '), 4000);
  if (wordCount(body) >= 30) return body;
  if (raw && !isGenericDescription(raw)) return text(`${raw} ${body}`.trim(), 4000);
  return body;
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
  if (cat === 'car') {
    if (raw && !isGenericDescription(raw) && wordCount(raw) >= 30) return raw;
    return carDescription(title, { ...sourceRecord, pickupLocation: sourceRecord.pickupLocation || address });
  }
  if (raw && !isGenericDescription(raw)) return raw;
  if (cat === 'flight') return flightDescription(title, sourceRecord);
  if (cat === 'hotel' || cat === 'lodging') return hotelDescription(title, sourceRecord, address);
  if (cat === 'restaurant') return restaurantDescription(title, sourceRecord, raw);
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

function shortLineFromSourceText(value = '', max = 120) {
  const row = text(value, 4000);
  if (!row) return '';
  const sentence = row.match(/^[^.!?;]+[.!?;]/);
  if (sentence) return text(sentence[0], max);
  return text(row.split(/\s+/).slice(0, 10).join(' '), max);
}

function sourcedShortSummary(place = {}, sourceRecord = {}, longDescription = '') {
  let summary = text(sourceRecord.summary || place.summary, 500);
  const itinerary = text(sourceRecord.itineraryNote || sourceRecord.itinerary_note, 280);
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
  const description = sourcedLongDescription(next, sourceRecord);
  const summary = sourcedShortSummary(next, sourceRecord, description);
  const price = firstPrice(
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
