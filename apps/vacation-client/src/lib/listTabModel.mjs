/** Pure list-tab logic (sort, filters, row fields, empty copy). Tested from test/listRows.unit.mjs */

import { resolveThingLogoUrl } from '../../../../src/vacation/thing-logo-capture.mjs';

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
  const meta = place.metadata?.thingDetail && typeof place.metadata.thingDetail === 'object'
    ? place.metadata.thingDetail
    : {};
  const longCandidates = [
    override.longDetails,
    override.details,
    meta.longDetails,
    meta.details,
    source.longDetails,
    source.details,
    place.longDetails,
    place.description,
  ]
    .map((value) => text(value))
    .filter(Boolean);
  const richLong = longCandidates.find((body) => wordCount(body) >= 30);
  if (richLong) return richLong;

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
  if (rr && wordCount(rr) >= 30) return rr;
  if (rr) return rr;
  return longCandidates.reduce((best, body) => (wordCount(body) > wordCount(best) ? body : best), '');
}

export function logoUrlForPlace(place, trip) {
  const override = overrideFor(trip, place);
  const resolved = text(resolveThingLogoUrl(place, override));
  if (resolved) return resolved;
  const source = sourceRecord(place, override);
  const page = text(
    source.url || source.website || source.sourceUrl || place.url || place.website,
  );
  if (page) {
    try {
      const { origin, hostname } = new URL(page);
      if (hostname && !/(^|\.)google\./i.test(hostname)) {
        return `${origin}/favicon.ico`;
      }
    } catch {
      /* ignore */
    }
  }
  return '';
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
