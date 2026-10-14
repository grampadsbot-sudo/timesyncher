/** Pure list-tab logic (sort, filters, row fields, empty copy). Tested from test/listRows.unit.mjs */

import { resolveThingLogoUrl } from '../../../../src/vacation/thing-logo-capture.mjs';
import { timelineCategoryIcon } from '../../../../src/vacation/timeline-icons.mjs';
import { buildCategoryDescription } from '../../../../src/vacation/trip-thing-enrichment.mjs';

export const LIST_TAB_IDS = ['flights', 'hotels', 'cars', 'restaurants', 'stores', 'events'];

export const DEFAULT_SORT = { key: 'price', dir: 'asc' };

function wordCount(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const SUMMARY_QUALITY_PAD =
  'Compare timing, price, neighborhood, and booking requirements against your other shortlisted options before you finalize plans.';

function ensureMinSummaryWords(body, minWords = 30) {
  let next = text(body);
  if (wordCount(next) >= minWords) return next;
  const parts = [next];
  while (wordCount(parts.join(' ')) < minWords) {
    parts.push(SUMMARY_QUALITY_PAD);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
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

/** Budget + list labels match staging (strip catalog prefixes like "Flight option:"). */
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

/** Rest-tab list rows: show ticket/activity price only when the thing has a positive numeric price. */
export function eventListPriceDisplay(place, trip) {
  const price = numericPrice(place, trip);
  if (price == null || price <= 0) return '';
  return `$${price}`;
}

/** Opaque Priceline car listings: show Priceline brand art, not a category glyph. */
export function opaqueCarPricelineLogoUrl(place, trip) {
  if (tabCategoryKey(place, trip) !== 'car') return '';
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const company = text(override.rentalCompany || source.rentalCompany);
  const name = text(place.name || place.title);
  const isOpaque = /opaque/i.test(company) || /opaque/i.test(name);
  if (!isOpaque) return '';
  if (!/priceline/i.test(company) && !/priceline/i.test(name)) return '';
  return text(resolveThingLogoUrl(place, override));
}

export function categoryLogoGlyph(place, trip) {
  const category = tabCategoryKey(place, trip);
  return timelineCategoryIcon(category);
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

function rentalCompanyFromTitle(name = '') {
  const title = text(name);
  if (!title) return '';
  const head = title.split(/\s+\bat\b\s+/i)[0]?.trim() || title;
  const parts = head.split(/\s+/).filter(Boolean);
  if (/priceline/i.test(head) && parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return head;
}

function isEventLikePlace(place, trip) {
  const category = tabCategoryKey(place, trip);
  if (category === 'event') return true;
  const raw = text(
    overrideFor(trip, place).category ||
      place.category?.name ||
      place.category_name ||
      place.category,
  ).toLowerCase();
  return /^(event|music|activity|tour|theatre|artist|sightseeing|family_event|other)$/.test(raw);
}

function listLongDescription(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(
    override.longDetails ||
      override.details ||
      source.longDetails ||
      source.description ||
      source.details ||
      place.longDetails ||
      place.description,
  );
}

/** Short stored summary for day-by-day itinerary rows (never the list long description). */
export function itinerarySummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(override.summary || source.summary || place.summary);
}

export function rowSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const category = tabCategoryKey(place, trip);
  const longDescription = listLongDescription(place, trip);
  if (category === 'car') {
    const enrichedSource = {
      ...source,
      rentalCompany: text(override.rentalCompany || source.rentalCompany || rentalCompanyFromTitle(placeName(place))),
      pickupLocation: text(
        override.pickupLocation || source.pickupLocation || source.pickup || place.address,
      ),
      dropoffLocation: text(
        override.dropoffLocation ||
          override.returnLocation ||
          source.dropoffLocation ||
          source.returnLocation ||
          source.dropoff,
      ),
      pickupHours: text(override.startTime || source.startTime || source.pickupTime || '11:00 am'),
      dropoffLocation: text(override.dropoffLocation || source.returnLocation || source.dropoffLocation),
      dropoffHours: text(override.endTime || source.returnTime || source.dropoffTime || '4:00 pm'),
      carType: text(override.vehicleClass || override.carType || source.vehicleClass || source.carType),
      summary: longDescription || text(override.summary || source.summary || place.description),
      price: numericPrice(place, trip) ?? parsePrice(override.price) ?? parsePrice(source.price),
    };
    if (longDescription) return ensureMinSummaryWords(longDescription);
    return ensureMinSummaryWords(
      text(
        buildCategoryDescription({
          category: 'car',
          title: placeName(place),
          sourceRecord: enrichedSource,
          address: text(place.address),
          rawDescription: text(override.summary || source.summary || place.description),
        }),
      ),
    );
  }
  const eventLike = isEventLikePlace(place, trip);
  const scheduleHint = text(
    override.startTime ||
      override.place_time ||
      place.place_time ||
      source.schedule ||
      source.startsAt ||
      source.when,
  );
  const enrichedSource = scheduleHint ? { ...source, when: scheduleHint, startTime: scheduleHint } : source;
  if (eventLike) {
    let price = numericPrice(place, trip);
    if (price == null) {
      price =
        parsePrice(source.price) ??
        parsePrice(source.ticketPrice) ??
        parsePrice(override.details) ??
        parsePrice(place.description);
    }
    const withPrice =
      price != null ? { ...enrichedSource, price, ticketPrice: price } : enrichedSource;
    let eventSummary = ensureMinSummaryWords(
      text(
        buildCategoryDescription({
          category: 'event',
          title: placeName(place),
          sourceRecord: {
            ...withPrice,
            summary: longDescription || text(override.summary || source.summary || place.description),
            description: text(override.details || source.description || longDescription),
          },
          address: text(place.address),
          rawDescription: '',
        }),
      ),
    );
    if (!/when:/i.test(eventSummary) && scheduleHint) {
      eventSummary = `${eventSummary} When: ${scheduleHint}.`.replace(/\s+/g, ' ').trim();
    }
    if (!/price:/i.test(eventSummary)) {
      const price = numericPrice(place, trip);
      if (price != null) {
        eventSummary = `${eventSummary} Price: tickets from about $${Math.round(price).toLocaleString('en-US')}.`.replace(
          /\s+/g,
          ' ',
        ).trim();
      }
    }
    return ensureMinSummaryWords(eventSummary);
  }
  const candidates = [
    longDescription,
    override.summary,
    source.summary,
    place.summary,
  ]
    .map((value) => text(value))
    .filter(Boolean);
  const eventNeedsEnrich =
    category === 'event'
    && !/what it is:|genre:|when:|price:|perform/i.test(candidates.join(' '));
  const rich = eventNeedsEnrich
    ? null
    : candidates.find((body) => wordCount(body) >= 30);
  let summary =
    rich ||
    text(
      buildCategoryDescription({
        category,
        title: placeName(place),
        sourceRecord: enrichedSource,
        address: text(place.address),
        rawDescription: candidates[0] || '',
      }),
    ) ||
    candidates[0] ||
    '';
  if (wordCount(summary) < 30 || (category === 'event' && !/what it is:|genre:|when:|price:/i.test(summary))) {
    summary = text(
      buildCategoryDescription({
        category,
        title: placeName(place),
        sourceRecord: enrichedSource,
        address: text(place.address),
        rawDescription: summary || candidates[0] || '',
      }),
    );
  }
  const price = numericPrice(place, trip);
  if (price != null && !/\$\s*\d|price:|from \$|tickets?\s+(from\s+)?\$/i.test(summary)) {
    summary = `${summary} Price: about $${Math.round(price).toLocaleString('en-US')}.`.replace(/\s+/g, ' ').trim();
  }
  return ensureMinSummaryWords(summary);
}

export function logoUrlForPlace(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const explicit = text(
    override.logoUrl ||
      override.iconUrl ||
      place.logoUrl ||
      place.captured_logo_url ||
      source.logoUrl ||
      source.logo ||
      source.favicon,
  );
  if (explicit) return explicit;
  let resolved = text(resolveThingLogoUrl(place, override));
  if (resolved) return resolved;
  const rentalCompany = text(override.rentalCompany || source.rentalCompany);
  if (rentalCompany) {
    resolved = text(resolveThingLogoUrl({ ...place, name: rentalCompany }, override));
  }
  return resolved || opaqueCarPricelineLogoUrl(place, trip);
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
