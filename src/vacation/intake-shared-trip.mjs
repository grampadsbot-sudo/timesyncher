import { captureThingLogo } from './thing-logo-capture.mjs';
import { writeRatings } from './write-ratings.mjs';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function customerPlaceName(value) {
  const text = String(value || '').trim();
  if (!text || /^(shell|intake)-[a-z0-9]+$/i.test(text)) return '';
  return text;
}

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

export function assignDates(thing, year, tripDates) {
  const whenText = [thing.customerWhen, thing.whenLabel].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
  if (!whenText) return [];
  const named = [...namedDates(thing.customerWhen, year), ...namedDates(thing.whenLabel, year)];
  const unique = [...new Set(named)].filter((date) => tripDates.includes(date));
  return unique;
}

function flightLikeLabel(record = {}) {
  const text = [record.name, record.title, record.description, record.whenLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  if (!text) return false;
  if (/\bflight\b/i.test(text)) return true;
  return /\b[A-Z]{3}\s*(?:→|->|to|-)\s*[A-Z]{3}\b/.test(text);
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
  if (flightLikeLabel(record) && (tokens.has('transport') || tokens.has('transfer'))) return 'flight';
  return '';
}

function labelText(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) return String(value.name || '').trim();
  return '';
}

function sourceCategoryName(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const record = thing.sourceRecord && typeof thing.sourceRecord === 'object' ? thing.sourceRecord : {};
  const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  for (const value of [
    thing.categoryName,
    meta.categoryName,
    record.categoryName,
    metaRecord.categoryName,
    record.category_name,
    metaRecord.category_name,
  ]) {
    const text = labelText(value);
    if (text) return text;
  }
  return labelText(thing.category);
}

function categoryFor(thing) {
  const kind = transportKind(thing);
  if (kind === 'flight' || kind === 'car') {
    const category_name = kind === 'flight' ? 'Flight' : 'Car';
    const category_icon = kind === 'flight' ? '✈️' : '🚗';
    return { category_name, category_icon, category: kind };
  }
  const source = thing?.source && typeof thing.source === 'object' ? thing.source : {};
  const model = thing?.model && typeof thing.model === 'object' ? thing.model : {};
  const raw = String(
    source.category || source.category_name || thing?.sourceCategory || ''
    || model.category || model.category_name || thing?.modelCategory || ''
    || sourceCategoryName(thing)
  ).trim();
  if (!raw) return { category_name: '', category_icon: '', category: '' };
  const key = raw.toLowerCase();
  if (key === 'hotel') {
    const named = sourceCategoryName(thing);
    const category_name = named && named.toLowerCase() !== 'hotel' ? named : 'Hotel';
    return { category_name, category_icon: '🏨', category: 'hotel' };
  }
  const known = {
    restaurant: ['Restaurant', '🍽️', 'restaurant'],
    store: ['Store', '🛍️', 'store'],
    shopping: ['Store', '🛍️', 'shopping'],
    transport: ['Transport', '🚕', 'transport'],
    attraction: ['Attraction', '🏛️', 'attraction'],
    bar: ['Bar', '☕', 'bar'],
  }[key];
  if (known) return { category_name: known[0], category_icon: known[1], category: known[2] };
  return { category_name: raw, category_icon: '', category: key };
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

function categoryKey(record = {}) {
  const raw = record?.category;
  const fromCategory = typeof raw === 'string'
    ? raw
    : (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.name : '');
  const text = String(fromCategory || record?.category_name || '').trim().toLowerCase();
  if (text === 'flight' || text === 'car') return text;
  if (text === 'hotel' || text === 'lodging' || text === 'accommodation') return 'lodging';
  return '';
}

function recordInputKind(record = {}) {
  const keyed = categoryKey(record);
  if (keyed) return keyed;
  return transportKind(record);
}

function flightAirlineMissing(record = {}) {
  const blob = [
    record?.name,
    record?.title,
    record?.description,
    ...(Array.isArray(record?.notes) ? record.notes : []),
  ].map((part) => String(part || '')).join(' ');
  if (!blob.trim()) return true;
  if (/\bairline\b/i.test(blob)) return false;
  if (/\b[A-Z]{3}\s*(?:→|->|to|-)\s*[A-Z]{3}\b/.test(blob)) return false;
  return !/\b(?:united|delta|american|southwest|alaska|hawaiian|jetblue|frontier|spirit)\b/i.test(blob);
}

/** Missing lodging/car/flight facts only. Flight ask is preferred airline. No wording. */
export function customerInputState(records = []) {
  const present = new Set();
  let flightNeedsAirline = false;
  for (const record of records || []) {
    const kind = recordInputKind(record);
    if (kind === 'flight') {
      present.add('flight');
      if (flightAirlineMissing(record)) flightNeedsAirline = true;
    } else if (kind === 'car' || kind === 'lodging') {
      present.add(kind);
    }
  }
  const needsCustomerInput = [];
  if (!present.has('lodging')) needsCustomerInput.push('lodging');
  if (!present.has('car')) needsCustomerInput.push('car');
  if (!present.has('flight')) needsCustomerInput.push('flight');
  else if (flightNeedsAirline) needsCustomerInput.push('flight');
  if (!needsCustomerInput.length) return {};
  const state = { needsCustomerInput };
  if (needsCustomerInput.includes('flight')) state.flightAsk = 'preferredAirline';
  return state;
}

function noteText(thing) {
  return [
    ...(Array.isArray(thing?.notes) ? thing.notes : []),
    ...(Array.isArray(thing?.collaboratorNotes) ? thing.collaboratorNotes : []),
  ].map((note) => String(note || '').trim()).filter(Boolean).join('\n');
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
    categoryName: String(meta.categoryName || '').trim(),
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
    const notes = noteText(thing);
    const point = locationOf(thing);
    const ratings = writeRatings(thing);
    const sourceRef = sourceRefOf(thing);
    const source = String(thing.source || ratings.source || 'customer');
    places.push({
      id,
      trip_id: intId(trip.id),
      name: thing.title,
      description: '',
      category_name: kind.category_name,
      category_icon: kind.category_icon,
      category: { name: kind.category_name, icon: kind.category_icon },
      reservation_status: 'considering',
      notes,
      source,
      ratings,
      ...(sourceRef ? { sourceRef } : {}),
      ...(point ? { lat: point.lat, lng: point.lng, ...(point.address ? { address: point.address } : {}) } : {}),
    });
    const dayIds = [];
    thingOverrides[`place:${id}`] = {
      timeline: true,
      status: 'considering',
      category: kind.category,
      source,
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
        notes,
        place_id: id,
        place: places[places.length - 1],
      });
      assignments[key] = rows;
    }
  }
  const destination = customerPlaceName(trip?.destination);
  const planned = Boolean(destination || start || end || (things || []).length);
  const rawTitle = String(trip?.title || '').trim();
  const title = customerPlaceName(rawTitle);
  return {
    trip: {
      id: intId(trip.id),
      title: planned ? (title || (rawTitle ? '' : 'Vacation')) : '',
      description: destination,
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
      share_budget: (things || []).some((thing) => {
        const value = thing?.total_price ?? thing?.price;
        return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
      }),
      share_collab: false,
    },
    budget: (things || []).flatMap((thing, index) => {
      const value = thing?.total_price ?? thing?.price;
      if (value === null || value === undefined || value === '') return [];
      const amount = Number(value);
      if (!Number.isFinite(amount)) return [];
      return [{
        id: intId(`${trip.id}:budget:${thing.id || thing.title || index}`),
        trip_id: intId(trip.id),
        category: String(thing?.category || 'Trip'),
        name: thing?.title || trip.title || 'Vacation',
        total_price: amount,
        note: '',
        sort_order: index,
      }];
    }),
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

function sourceObject(place = {}) {
  const row = place.source;
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

/** Tags and happy hour come from the Thing's source record. Missing fields stay blank. */
function sourcedRestaurantFields(place = {}) {
  const source = sourceObject(place);
  const tags = Array.isArray(place.restaurantTags)
    ? place.restaurantTags
    : (Array.isArray(source?.restaurantTags) ? source.restaurantTags : []);
  const happyHourFlag = place.happyHour ?? source?.happyHour;
  return {
    restaurantTags: tags.map((tag) => String(tag || '').trim()).filter(Boolean),
    happyHour: typeof happyHourFlag === 'boolean' ? happyHourFlag : null,
    happyHourDetails: String(place.happyHourDetails || source?.happyHourDetails || '').trim(),
  };
}

export function windLookupPointsFromThings(things = []) {
  const points = [];
  const seen = new Set();
  for (const thing of things || []) {
    const name = String(thing.title || thing.name || '').trim();
    const point = locationOf(thing);
    if (!name || !point) continue;
    const key = `${point.lat},${point.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ name, lat: point.lat, lng: point.lng });
  }
  return points;
}

export function applyThingPresentation(shared = {}, options = {}) {
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = { ...(shared.thingOverrides || {}) };
  const put = (place, extra) => {
    const key = `place:${place.id}`;
    thingOverrides[key] = { ...(thingOverrides[key] || {}), ...extra };
  };
  for (const place of places) {
    const name = String(place.name || '').trim();
    place.description = '';
    const lat = finiteCoord(place.lat);
    const lng = finiteCoord(place.lng);
    const ratings = place.ratings && typeof place.ratings === 'object' && !Array.isArray(place.ratings) ? place.ratings : {};
    const extra = {
      source: String(place.source || 'customer'),
      logoUrl: captureThingLogo(place, { title: name, category: place.category_name }),
      ...ratings,
    };
    if (place.sourceRef) extra.sourceRef = place.sourceRef;
    if (lat != null && lng != null) {
      extra.lat = lat;
      extra.lng = lng;
      if (place.address) extra.address = place.address;
    }
    const sourcedMenu = sourcedRestaurantFields(place);
    if (sourcedMenu.restaurantTags.length) extra.restaurantTags = sourcedMenu.restaurantTags;
    if (sourcedMenu.happyHour != null) extra.happyHour = sourcedMenu.happyHour;
    if (sourcedMenu.happyHourDetails) extra.happyHourDetails = sourcedMenu.happyHourDetails;
    put(place, extra);
  }
  const next = { ...shared, places, thingOverrides };
  delete next.needsCustomerInput;
  delete next.flightAsk;
  return { ...next, ...customerInputState(places) };
}
