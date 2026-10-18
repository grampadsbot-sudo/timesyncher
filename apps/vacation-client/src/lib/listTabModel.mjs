import { isDisplayNameFragment, opaqueCarNeedsBlank } from './listTabSummaries.mjs';


export const DEFAULT_SORT = { key: 'price', dir: 'asc' };

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
  const s = String(value).trim();
  if (!s) return null;
  const plain = s.match(/^([\d,]+(?:\.\d+)?)$/);
  if (plain) return Number(plain[1].replace(/,/g, ''));
  const direct = Number(s.replace(/,/g, ''));
  if (Number.isFinite(direct) && /^[\d.]/.test(s.replace(/,/g, ''))) return direct;
  const match = s.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

export function formatUsd(amount, currency = 'USD') {
  const code = text(currency).toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const body = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (code === 'USD' || code === '') return `$${body}`;
  return `${code} ${body}`;
}

function tripCurrency(trip) {
  return text(trip?.trip?.currency) || 'USD';
}

const EVENT_TYPE_LABELS = {
  family_event: 'Family event',
  tour: 'Tour',
  music: 'Music',
  workout: 'Workout',
  artist: 'Artist',
  theatre: 'Theatre',
  sightseeing: 'Sightseeing',
  activity: 'Activity',
  event: 'Event',
};

function humanizeTypeKey(raw) {
  const key = text(raw).toLowerCase();
  if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key];
  if (key.includes('_')) {
    return key
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  if (!raw) return 'Event';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function tabCategoryKey(place, trip) {
  if (/^Flight option:/i.test(placeName(place))) return 'flight';
  const override = overrideFor(trip, place);
  const raw = text(
    override.category || place.category?.name || place.category_name || place.category,
  ).toLowerCase();
  if (raw.includes('flight')) return 'flight';
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

export function catalogRowDisplayName(place, trip) {
  const raw = placeName(place);
  if (tabCategoryKey(place, trip) === 'flight' || /^Flight option:/i.test(raw)) {
    return text(raw.replace(/^\s*Flight option:\s*/i, '')) || raw;
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
  return humanizeTypeKey(raw);
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
        const dedupeKey = label.toLowerCase();
        if (label && !seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          chips.push(label);
        }
        continue;
      }
      for (const tag of tagList(place, override, source)) {
        const dedupeKey = tag.toLowerCase();
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
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
  const direct =
    parsePrice(override.price) ??
    parsePrice(place.price) ??
    parsePrice(place.total_price) ??
    parsePrice(source.price) ??
    parsePrice(source.totalPrice) ??
    parsePrice(source.ticketPrice) ??
    parsePrice(source.ticketsFrom);
  if (direct != null) return direct;
  const hay = [
    override.details,
    override.summary,
    source.description,
    source.summary,
    place.description,
  ]
    .map((value) => text(value))
    .filter(Boolean)
    .join(' ');
  if (!hay) return null;
  const ticket = hay.match(/(?:tickets?\s+from|price:|from)\s*(?:about\s*)?\$\s*([\d,]+(?:\.\d+)?)/i);
  if (ticket) return parsePrice(ticket[1]);
  const priced = hay.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return priced ? parsePrice(priced[1]) : null;
}

export function eventListPriceDisplay(place, trip) {
  const price = numericPrice(place, trip);
  if (price == null || price <= 0) return '';
  return `$${price}`;
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
      if (aMissing && bMissing) {
        return sign * placeName(a).localeCompare(placeName(b), undefined, { numeric: true, sensitivity: 'base' });
      }
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (pa !== pb) return sign * (pa - pb);
      return sign * placeName(a).localeCompare(placeName(b), undefined, { numeric: true, sensitivity: 'base' });
    }
    return sign * placeName(a).localeCompare(placeName(b), undefined, { numeric: true, sensitivity: 'base' });
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
  const amt = formatUsd(price, tripCurrency(trip));
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
  return { depart, arrive };
}

export function hotelPriceDisplay(place, trip) {
  const price = numericPrice(place, trip);
  return price == null ? '' : formatUsd(price, tripCurrency(trip));
}

export function carPriceDisplay(place, trip) {
  const price = numericPrice(place, trip);
  return price == null ? '' : formatUsd(price, tripCurrency(trip));
}

export function carSubtitle(place, trip) {
  if (opaqueCarNeedsBlank(place, trip)) return '';
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const name = placeName(place);
  const parts = [
    override.carType,
    override.vehicleClass,
    source.carType,
    source.vehicleClass,
    override.rentalCompany,
    source.rentalCompany,
  ];
  for (const part of parts) {
    const row = text(part);
    if (!row || isDisplayNameFragment(row, name)) continue;
    return row;
  }
  return '';
}

export { isDisplayNameFragment, opaqueCarNeedsBlank, rowSummary } from './listTabSummaries.mjs';

export function logoUrlForPlace(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(
    override.logoUrl ||
      override.iconUrl ||
      place.logoUrl ||
      place.captured_logo_url ||
      source.logoUrl,
  );
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
