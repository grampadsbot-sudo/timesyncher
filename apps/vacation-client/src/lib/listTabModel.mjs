/** Pure list-tab logic (sort, filters, row fields, empty copy). Tested from test/listRows.unit.mjs */

import {
  captureThingLogo,
  isPlaceholderLogoUrl,
  resolveThingLogoUrl,
  sourceLogoUrl,
} from '../../../../src/vacation/thing-logo-capture.mjs';
import {
  buildCategoryDescription,
  ensureProductListSummary,
} from '../../../../src/vacation/trip-thing-enrichment.mjs';

export const LIST_TAB_IDS = ['flights', 'hotels', 'cars', 'restaurants', 'stores', 'events'];

export const DEFAULT_SORT = { key: 'price', dir: 'asc' };

function wordCount(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function text(value) {
  return String(value ?? '').trim();
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

export function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const match = String(value).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

export function tabCategoryKey(place, trip) {
  const override = overrideFor(trip, place);
  if (/^Flight option:/i.test(placeName(place))) return 'flight';
  const raw = text(
    override.category || place.category?.name || place.category_name || place.category,
  ).toLowerCase();
  if (raw.includes('flight') || raw === 'transport') return 'flight';
  if (raw.includes('hotel') || raw.includes('lodging')) return 'hotel';
  if (raw.includes('restaurant') || raw === 'bar') return 'restaurant';
  if (raw.includes('car')) return 'car';
  if (raw.includes('store') || raw.includes('shop')) return 'store';
  return 'event';
}

export function placesForCategoryTab(trip, tab) {
  const places = trip?.places || [];
  if (tab === 'flights') return places.filter((p) => tabCategoryKey(p, trip) === 'flight');
  if (tab === 'hotels') return places.filter((p) => tabCategoryKey(p, trip) === 'hotel');
  if (tab === 'cars') return places.filter((p) => tabCategoryKey(p, trip) === 'car');
  if (tab === 'restaurants') return places.filter((p) => tabCategoryKey(p, trip) === 'restaurant');
  if (tab === 'stores') return places.filter((p) => tabCategoryKey(p, trip) === 'store');
  if (tab === 'events') {
    return places.filter((p) => {
      const k = tabCategoryKey(p, trip);
      return k === 'event';
    });
  }
  return places;
}

export function placeName(place) {
  return text(place.name || place.title || 'Untitled');
}

/** TREK mr() strips the flight-catalog prefix for budget rows and controls. */
export function catalogRowDisplayName(place, trip) {
  const raw = placeName(place);
  if (tabCategoryKey(place, trip) === 'flight' || /^Flight option:/i.test(raw)) {
    return text(raw.replace(/^\s*Flight option:\s*/i, '')) || raw;
  }
  return raw;
}

/** Budget row label: catalog flights use mr() strip; other rows use full place name (R2). */
export function budgetLineDisplayName(place, trip) {
  const raw = placeName(place);
  if (tabCategoryKey(place, trip) === 'flight' || /^Flight option:/i.test(raw)) {
    return catalogRowDisplayName(place, trip);
  }
  return raw;
}

function neighborhood(place, override, source) {
  return text(
    override.neighborhood ||
      source.neighborhood ||
      place.neighborhood ||
      place.metadata?.neighborhood,
  );
}

function tagList(place, override, source) {
  const raw =
    override.restaurantTags ||
    override.storeTags ||
    override.tags ||
    source.tags ||
    source.restaurantTags ||
    source.storeTags ||
    place.metadata?.tags;
  if (Array.isArray(raw)) return raw.map((t) => text(t)).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,;|]/)
      .map((t) => text(t))
      .filter(Boolean);
  }
  return [];
}

function restTypeLabel(place, override) {
  const raw = text(
    override.presentationType ||
      override.eventType ||
      override.categoryLabel ||
      place.category_name ||
      place.category?.name ||
      override.category,
  );
  if (!raw) return 'event';
  return raw;
}

export function areaChipsForTab(places, trip, tab) {
  const chips = ['All areas'];
  const seen = new Set();
  for (const place of places) {
    const override = overrideFor(trip, place);
    const source = sourceRecord(place, override);
    const area = neighborhood(place, override, source);
    if (area && !seen.has(area)) {
      seen.add(area);
      chips.push(area);
    }
  }
  if (tab === 'events' && chips.length === 1) {
    /* Rest tabs still expose area row when list is empty. */
  }
  return chips;
}

export function typeChipsForTab(places, trip, tab) {
  if (tab === 'restaurants' || tab === 'stores' || tab === 'events') {
    const chips = ['All types'];
    const seen = new Set();
    for (const place of places) {
      const override = overrideFor(trip, place);
      const source = sourceRecord(place, override);
      if (tab === 'events') {
        const label = restTypeLabel(place, override);
        if (label && !seen.has(label)) {
          seen.add(label);
          chips.push(label);
        }
        continue;
      }
      for (const tag of tagList(place, override, source)) {
        if (!seen.has(tag)) {
          seen.add(tag);
          chips.push(tag);
        }
      }
    }
    return chips;
  }
  return [];
}

export function filterPlaces(places, trip, tab, filters = {}) {
  const area = text(filters.area);
  const type = text(filters.type);
  return places.filter((place) => {
    const override = overrideFor(trip, place);
    const source = sourceRecord(place, override);
    if (area && area !== 'All areas') {
      const nb = neighborhood(place, override, source);
      if (nb !== area) return false;
    }
    if (type && type !== 'All types') {
      if (tab === 'events') {
        if (restTypeLabel(place, override) !== type) return false;
      } else {
        const tags = tagList(place, override, source);
        if (!tags.includes(type)) return false;
      }
    }
    return true;
  });
}

export function numericPrice(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return (
    parsePrice(override.price) ??
    parsePrice(place.price) ??
    parsePrice(source.price) ??
    parsePrice(source.totalPrice)
  );
}

export function sortPlaces(places, trip, sort = DEFAULT_SORT) {
  const key = sort?.key === 'price' ? 'price' : 'name';
  const dir = sort?.dir === 'desc' ? 'desc' : 'asc';
  const sign = dir === 'asc' ? 1 : -1;
  const rows = [...places];
  rows.sort((a, b) => {
    if (key === 'price') {
      const pa = numericPrice(a, trip);
      const pb = numericPrice(b, trip);
      const aMissing = pa == null;
      const bMissing = pb == null;
      if (aMissing && bMissing) return sign * placeName(a).localeCompare(placeName(b));
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (pa !== pb) return sign * (pa - pb);
      return sign * placeName(a).localeCompare(placeName(b));
    }
    return sign * placeName(a).localeCompare(placeName(b));
  });
  return rows;
}

export function emptyStateMessage(tab, { categoryCount, filterActive }) {
  if (categoryCount === 0) return 'No items in this category yet.';
  if (!filterActive) return 'No items in this category yet.';
  if (tab === 'restaurants') return 'No restaurants match those tags.';
  if (tab === 'stores') return 'No stores match those tags.';
  return 'No items match this filter.';
}

export function fareDirectionLabel(override = {}) {
  const raw = text(override.fareDirection || override.tripType || override.pricingType).toLowerCase();
  if (raw.includes('round')) return 'round trip';
  if (raw.includes('one')) return 'one-way';
  return '';
}

export function flightPriceDisplay(place, trip) {
  const override = overrideFor(trip, place);
  const price = numericPrice(place, trip);
  if (price == null) return '';
  const fare = fareDirectionLabel(override);
  const amt = `$${price}`;
  return fare ? `${amt} ${fare}` : amt;
}

export function flightSchedule(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const depart = text(
    override.departureTime ||
      override.departTime ||
      source.departureTime ||
      source.departTime,
  );
  const arrive = text(
    override.arrivalTime || override.arriveTime || source.arrivalTime || source.arriveTime,
  );
  if (depart || arrive) return { depart, arrive };
  const title = placeName(place);
  const match = title.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  if (match) return { depart: text(match[1]), arrive: text(match[2]) };
  return { depart: '', arrive: '' };
}

export function hotelPriceDisplay(place, trip) {
  const price = numericPrice(place, trip);
  return price == null ? '' : `$${price}`;
}

export function carPriceDisplay(place, trip) {
  const price = numericPrice(place, trip);
  return price == null ? '' : `$${price}`;
}

export function carSubtitle(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(
    override.carType ||
      override.vehicleClass ||
      source.carType ||
      source.vehicleClass ||
      override.rentalCompany ||
      source.rentalCompany,
  );
}

function pickRrLine(...values) {
  for (const value of values) {
    const s = text(value);
    if (!s) continue;
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= 20) return s;
    if (/^Documented .+ option/i.test(s)) return s;
  }
  return '';
}

export function rowSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const category = tabCategoryKey(place, trip);
  const meta = place.metadata?.thingDetail && typeof place.metadata.thingDetail === 'object'
    ? place.metadata.thingDetail
    : {};
  const longCandidates = [
    override.longDetails,
    override.details,
    override.summary,
    meta.longDetails,
    meta.details,
    meta.summary,
    source.longDetails,
    source.details,
    source.summary,
    source.description,
    place.longDetails,
    place.description,
  ]
    .map((value) => text(value))
    .filter(Boolean);
  const richLong = longCandidates.find((body) => wordCount(body) >= 30);
  const rr = pickRrLine(
    override.itineraryNote,
    override.itinerary_note,
    override.summary,
    meta.itineraryNote,
    meta.summary,
    source.summary,
    source.itineraryNote,
    place.description,
  );
  const best = longCandidates.reduce(
    (acc, body) => (wordCount(body) > wordCount(acc) ? body : acc),
    '',
  );
  let draft = richLong || (rr && wordCount(rr) >= 30 ? rr : '') || (wordCount(best) >= 30 ? best : '');
  if (!draft) {
    draft = buildCategoryDescription({
      category,
      title: placeName(place),
      sourceRecord: source,
      address: text(place.address),
      rawDescription: text(
        override.summary || source.summary || place.description || best || rr,
      ),
    });
  }
  const pricedPlace = {
    ...place,
    price: numericPrice(place, trip) ?? place.price,
  };
  return ensureProductListSummary(draft || best || rr || '', pricedPlace, { category });
}

function faviconFromPageUrl(pageUrl = '') {
  const page = text(pageUrl);
  if (!page) return '';
  try {
    const { origin, hostname } = new URL(page);
    if (hostname && !/(^|\.)google\./i.test(hostname)) {
      return `${origin}/favicon.ico`;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function logoUsedByOtherPlaces(logo, place, trip) {
  if (!logo || !trip?.places?.length) return false;
  const selfId = String(place.id);
  return trip.places.some((row) => {
    if (String(row.id) === selfId) return false;
    const otherOverride = overrideFor(trip, row);
    const candidates = [
      text(otherOverride.logoUrl),
      text(row.logoUrl),
      text(row.captured_logo_url),
    ].filter(Boolean);
    return candidates.includes(logo);
  });
}

export function logoUrlForPlace(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const page = text(
    source.url || source.website || source.sourceUrl || place.url || place.website,
  );
  const pick = () => {
    const overrideLogo = text(override.logoUrl);
    if (overrideLogo && !isPlaceholderLogoUrl(overrideLogo)) return overrideLogo;
    const fromSource = text(sourceLogoUrl(place, override));
    if (fromSource && !isPlaceholderLogoUrl(fromSource)) return fromSource;
    let resolved = text(resolveThingLogoUrl(place, override));
    if (resolved && isPlaceholderLogoUrl(resolved)) resolved = '';
    if (resolved) return resolved;
    const favicon = faviconFromPageUrl(page);
    if (favicon) return favicon;
    const title = placeName(place);
    return captureThingLogo({ name: title, title }, override) || '';
  };
  let logo = pick();
  if (logo && (isPlaceholderLogoUrl(logo) || logoUsedByOtherPlaces(logo, place, trip))) {
    const favicon = faviconFromPageUrl(page);
    const named = captureThingLogo({ name: placeName(place), title: placeName(place) }, override);
    if (favicon && favicon !== logo) logo = favicon;
    else if (named && named !== logo && !logoUsedByOtherPlaces(named, place, trip)) logo = named;
  }
  return logo && !isPlaceholderLogoUrl(logo) ? logo : '';
}

export function hotelFirstRowNote(place, trip, isFirstHotel) {
  if (!isFirstHotel) return '';
  const override = overrideFor(trip, place);
  return text(override.hotelNote || override.hotel_note || override.itineraryNote);
}

export function sortIndicator(activeKey, activeDir, key) {
  if (activeKey !== key) return '';
  return activeDir === 'asc' ? ' ↑' : ' ↓';
}
