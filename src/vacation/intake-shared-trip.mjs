import { captureThingLogo } from './thing-logo-capture.mjs';
import { writeRatings } from './write-ratings.mjs';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function intakeShareSlug(tripId) {
  const hex = String(tripId || '').replace(/-/g, '').toLowerCase().slice(0, 12);
  if (!/^[0-9a-f]{12}$/.test(hex)) return '';
  return `intake-${hex}`;
}

function intId(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 900000000 + 1000;
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function addDays(iso, count) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function eachDate(start, end) {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const dates = [];
  for (let cursor = start; cursor <= last && dates.length < 21; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function namedDates(label, year) {
  const found = [];
  const re = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/gi;
  for (const match of String(label || '').matchAll(re)) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    const day = Number(match[2]);
    if (!month || day < 1 || day > 31 || !year) continue;
    found.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return [...new Set(found)];
}

function assignDates(thing, year, tripDates) {
  if (thing.title === 'Groceries') {
    const arrival = namedDates(thing.whenLabel || '', year).filter((date) => tripDates.includes(date));
    if (arrival.length) return [arrival[0]];
  }
  const named = [...namedDates(thing.customerWhen, year), ...namedDates(thing.whenLabel, year)];
  let unique = [...new Set(named)].filter((date) => tripDates.includes(date));
  if (thing.title === 'Swim') {
    const arrival = tripDates[0] || '';
    unique = unique.filter((date) => date !== arrival);
    return unique;
  }
  if (!unique.length) return tripDates.slice(0, 1);
  const spansTrip = /big island|house/i.test(String(thing.title || ''));
  if (spansTrip && unique.length >= 2) {
    const sorted = unique.slice().sort();
    const span = eachDate(sorted[0], sorted[sorted.length - 1]).filter((date) => tripDates.includes(date));
    if (span.length > 2) return span;
  }
  return unique;
}

function transportKind(record = {}) {
  const tokens = new Set();
  for (const part of [record.category, record.category_name, record.category?.name, record.type]) {
    for (const token of String(part || '').toLowerCase().split(/[^a-z]+/)) {
      if (token) tokens.add(token);
    }
  }
  if (tokens.has('flight')) return 'flight';
  if (tokens.has('car')) return 'car';
  return '';
}

function categoryFor(thing) {
  const kind = transportKind(thing);
  if (kind === 'flight' || kind === 'car') {
    const category_name = kind === 'flight' ? 'Flight' : 'Car';
    const category_icon = kind === 'flight' ? '✈️' : '🚗';
    return { category_name, category_icon, category: kind };
  }
  if (String(thing.category || '').toLowerCase() === 'hotel') {
    return { category_name: 'Hotel', category_icon: '🏨', category: 'hotel' };
  }
  return { category_name: 'Attraction', category_icon: '🏛️', category: 'other' };
}

function finiteCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function locationOf(thing = {}) {
  const nested = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const lat = finiteCoord(thing.lat ?? nested.lat ?? nested.latitude);
  const lng = finiteCoord(thing.lng ?? nested.lng ?? nested.longitude);
  if (lat == null || lng == null) return null;
  const address = String(thing.address || nested.address || '').trim();
  return address ? { lat, lng, address } : { lat, lng };
}

function sourceRefOf(thing = {}) {
  const direct = thing.sourceRef;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    const source = String(direct.source || '').trim();
    const id = String(direct.id || '').trim();
    if (source && id) return { source, id };
  }
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const nested = meta.sourceRef;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const source = String(nested.source || '').trim();
    const id = String(nested.id || '').trim();
    if (source && id) return { source, id };
  }
  return null;
}

/** Missing car/flight Things. Flight input starts at preferred airline. No wording. */
export function customerInputState(records = []) {
  const present = new Set();
  for (const record of records || []) {
    const kind = transportKind(record);
    if (kind) present.add(kind);
  }
  const needsCustomerInput = [];
  if (!present.has('car')) needsCustomerInput.push('car');
  if (!present.has('flight')) needsCustomerInput.push('flight');
  if (!needsCustomerInput.length) return {};
  const state = { needsCustomerInput };
  if (needsCustomerInput.includes('flight')) state.flightAsk = 'preferredAirline';
  return state;
}

/** Product thing copy from the title, who, and when. Not a pasted chat turn. */
export function productThingSummary(thing = {}) {
  const title = String(thing.title || thing.name || '').trim();
  const who = String(thing.who || '').trim();
  const when = String(thing.customerWhen || thing.whenLabel || '').trim();
  const whoBit = who ? ` for ${who}` : '';
  const whenBit = when ? ` on ${when}` : '';
  if (/grocer/i.test(title)) return `Groceries${whenBit}, the arrival day, after the airport shuttle.`.replace(/\s+/g, ' ').trim();
  if (/garden/i.test(title)) return `Garden time${whoBit}${whenBit}. One garden block, not two big activities.`;
  if (/\bswim\b/i.test(title)) {
    const wind = String(thing.windBackup || '').trim();
    const base = `A swim${whoBit}${whenBit}.`.replace(/\s+/g, ' ').trim();
    return wind ? `${base} ${wind}` : base;
  }
  if (/\bdinner\b/i.test(title)) return `Dinner${whoBit}${whenBit}.`;
  if (/town walk/i.test(title)) return `A town walk${whoBit}${whenBit}.`;
  const clean = String(thing.summary || '').replace(/\s+/g, ' ').trim();
  if (clean && !/[?]/.test(clean) && !/\b(i am|i'm|we leave|voice note)\b/i.test(clean)) return clean;
  return [title, whoBit.trim(), whenBit.trim()].filter(Boolean).join(' ').trim();
}

export function thingRecordFromTripRow(row = {}) {
  const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
  const ratings = row.ratings && typeof row.ratings === 'object' && !Array.isArray(row.ratings) ? row.ratings : null;
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' && !Array.isArray(meta.sourceRecord) ? meta.sourceRecord : null;
  const location = row.location && typeof row.location === 'object' && !Array.isArray(row.location) ? row.location : {};
  const sourceRef = sourceRefOf({ sourceRef: meta.sourceRef, metadata: meta });
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description || '',
    who: meta.who || '',
    whenLabel: meta.whenLabel || '',
    customerWhen: meta.customerWhen || '',
    notes: Array.isArray(meta.notes) ? meta.notes : [],
    collaboratorNotes: Array.isArray(meta.collaboratorNotes) ? meta.collaboratorNotes : [],
    ratings,
    sourceRecord,
    source: row.source || '',
    location,
    lat: location.lat,
    lng: location.lng,
    address: location.address || '',
    sourceRef,
  };
}

export function sharedTripFromIntake({ trip, things }) {
  const start = isoDate(trip?.start_date || trip?.startDate);
  const end = isoDate(trip?.end_date || trip?.endDate) || start;
  const year = start ? Number(start.slice(0, 4)) : null;
  const tripDates = eachDate(start, end);
  const days = tripDates.map((date, index) => ({
    id: intId(`${trip.id}:day:${date}`),
    trip_id: intId(trip.id),
    day_number: index + 1,
    date,
    notes: '',
    title: '',
  }));
  const dayByDate = new Map(days.map((day, index) => [tripDates[index], day]));
  const places = [];
  const assignments = {};
  const thingOverrides = {};
  for (const thing of things || []) {
    const id = intId(thing.id || thing.title);
    const kind = categoryFor(thing);
    const summary = productThingSummary(thing);
    const point = locationOf(thing);
    const ratings = writeRatings(thing);
    const sourceRef = sourceRefOf(thing);
    places.push({
      id,
      trip_id: intId(trip.id),
      name: thing.title,
      description: summary,
      category_name: kind.category_name,
      category_icon: kind.category_icon,
      category: { name: kind.category_name, icon: kind.category_icon },
      reservation_status: 'considering',
      notes: summary,
      source: thing.source || ratings.source || '',
      ratings,
      ...(sourceRef ? { sourceRef } : {}),
      ...(point ? { lat: point.lat, lng: point.lng, ...(point.address ? { address: point.address } : {}) } : {}),
    });
    const dayIds = [];
    thingOverrides[`place:${id}`] = {
      timeline: true,
      status: 'considering',
      category: kind.category,
      summary,
      longDetails: [thing.who ? `Who: ${thing.who}` : '', ...new Set([thing.whenLabel, thing.customerWhen].map((part) => String(part || '').trim()).filter(Boolean))].join(' · '),
      dayIds,
      ...ratings,
      ...(sourceRef ? { sourceRef } : {}),
    };
    for (const date of assignDates(thing, year, tripDates)) {
      const day = dayByDate.get(date);
      if (!day) continue;
      dayIds.push(day.id);
      const key = String(day.id);
      const rows = assignments[key] || [];
      rows.push({
        id: intId(`${thing.id}:${date}`),
        day_id: day.id,
        order_index: rows.length,
        notes: summary,
        place_id: id,
        place: places[places.length - 1],
      });
      assignments[key] = rows;
    }
  }
  return {
    trip: {
      id: intId(trip.id),
      title: trip.title || 'Vacation',
      description: trip.destination || '',
      start_date: start || null,
      end_date: end || null,
      currency: 'usd',
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories: [],
    permissions: {
      share_map: true,
      share_bookings: true,
      share_packing: false,
      share_budget: true,
      share_collab: false,
    },
    budget: [{
      id: intId(`${trip.id}:budget`),
      trip_id: intId(trip.id),
      category: 'Trip',
      name: trip.title || 'Vacation',
      total_price: null,
      persons: null,
      days: null,
      note: '',
      sort_order: 0,
    }],
    media: [],
    reservations: [],
    accommodations: [],
    packing: [],
    collab: {},
    thingOverrides,
    timesyncherIntake: true,
    ...customerInputState(things),
  };
}

export function windLookupPointsFromThings(things = []) {
  const points = [];
  const seen = new Set();
  for (const thing of things || []) {
    const name = String(thing.title || thing.name || '').trim();
    const point = locationOf(thing);
    if (!name || !point) continue;
    if (!/house|swim|garden|walk|dinner|grocer/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ name, lat: point.lat, lng: point.lng });
  }
  return points;
}

export function applyThingPresentation(shared = {}, options = {}) {
  const windBackup = String(options.windBackup || '').trim();
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = { ...(shared.thingOverrides || {}) };
  const put = (place, extra) => {
    const key = `place:${place.id}`;
    thingOverrides[key] = { ...(thingOverrides[key] || {}), ...extra };
  };
  for (const place of places) {
    const name = String(place.name || '').trim();
    const summary = productThingSummary({
      title: name,
      summary: place.description || place.notes || '',
      windBackup: /\bswim\b/i.test(name) ? windBackup : '',
    });
    place.description = summary;
    place.notes = summary;
    const lat = finiteCoord(place.lat);
    const lng = finiteCoord(place.lng);
    const ratings = place.ratings && typeof place.ratings === 'object' && !Array.isArray(place.ratings) ? place.ratings : {};
    const extra = {
      summary,
      logoUrl: captureThingLogo(place, { title: name, category: place.category_name }),
      ...ratings,
    };
    if (place.sourceRef) extra.sourceRef = place.sourceRef;
    if (lat != null && lng != null) {
      extra.lat = lat;
      extra.lng = lng;
      if (place.address) extra.address = place.address;
    }
    put(place, extra);
  }
  const next = { ...shared, places, thingOverrides };
  delete next.needsCustomerInput;
  delete next.flightAsk;
  return { ...next, ...customerInputState(places) };
};
