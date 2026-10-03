import { assignDatesScheduling as scheduleThingDates, tripIsoDay } from './intake-weekday-dates.mjs';

export { tripIsoDay };
import { placeSourceFieldsFromThing, logoFieldsForSharedPlace } from './intake-shared-place-source.mjs';
import { transportKind } from './intake-transport-kind.mjs';
import { normalizeThingType } from './timeline-icons.mjs';
import { destinationCenterFromTripMetadata } from './trip-destination-center.mjs';
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

export function intId(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 900000000 + 1000;
}

function isoDate(value) {
  return tripIsoDay(value);
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

function schedulingRecord(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' && !Array.isArray(thing.metadata) ? thing.metadata : {};
  return {
    whenLabel: String(thing.whenLabel || thing.when || meta.whenLabel || '').trim(),
    customerWhen: String(thing.customerWhen || meta.customerWhen || '').trim(),
    starts_at: thing.starts_at || thing.startsAt || meta.starts_at || null,
  };
}

export function assignDatesScheduling(thing, year, tripDates) {
  const record = schedulingRecord(thing);
  const scheduled = scheduleThingDates(record, year, tripDates, namedDates);
  if (scheduled.dates.length || scheduled.weekdayAmbiguous) return scheduled;
  const stamped = tripIsoDay(record.starts_at);
  if (stamped && Array.isArray(tripDates) && tripDates.includes(stamped)) {
    return { dates: [stamped], weekdayAmbiguous: false, candidateDates: [] };
  }
  return scheduled;
}

export function assignDates(thing, year, tripDates) {
  return assignDatesScheduling(thing, year, tripDates).dates;
}

function thingMetadata(thing = {}) {
  return thing.metadata && typeof thing.metadata === 'object' && !Array.isArray(thing.metadata) ? thing.metadata : {};
}

export function customerStatedLodgingThing(thing = {}) {
  const category = String(thing.category || '').toLowerCase();
  if (category !== 'hotel' && category !== 'lodging' && category !== 'accommodation') return true;
  const meta = thingMetadata(thing);
  if (meta.customerStatedLodging === true) return true;
  const source = String(meta.source || thing.source || '').toLowerCase();
  if (source === 'customer_stated' || source === 'customer') return true;
  if (meta.intakeSource === 'chat_extraction') return true;
  if (['brave', 'osm', 'tavily'].includes(source) && locationOf(thing)) return true;
  return false;
}

export function statedLodgingLabelFromThings(things = []) {
  for (const thing of things || []) {
    if (!customerStatedLodgingThing(thing)) continue;
    const kind = categoryKey(thing) || String(thing.category || '').trim().toLowerCase();
    if (kind !== 'lodging' && kind !== 'hotel' && kind !== 'accommodation') continue;
    const title = String(thing.title || thing.name || '').trim();
    if (title) return title.slice(0, 240);
  }
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

function lodgingLabels(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const record = thing.sourceRecord && typeof thing.sourceRecord === 'object' ? thing.sourceRecord : {};
  const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  return [
    thing.category,
    thing.categoryName,
    meta.categoryName,
    record.icon_category,
    metaRecord.icon_category,
    ...(Array.isArray(thing.providerCategories) ? thing.providerCategories : []),
    ...(Array.isArray(meta.providerCategories) ? meta.providerCategories : []),
    ...(Array.isArray(record.categories) ? record.categories : []),
    ...(Array.isArray(metaRecord.categories) ? metaRecord.categories : []),
  ];
}

function isLodgingStay(thing = {}) {
  return lodgingLabels(thing).some((value) => normalizeThingType(value) === 'hotel');
}

function categoryFor(thing) {
  const lodging = isLodgingStay(thing);
  const kind = transportKind(thing);
  if (kind === 'flight' || (kind === 'car' && !lodging)) {
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
  if (!raw && !lodging) return { category_name: '', category_icon: '', category: '' };
  const key = raw.toLowerCase();
  if (lodging || normalizeThingType(raw) === 'hotel') {
    const named = sourceCategoryName(thing);
    const category_name = named && !/^(hotel|lodging|accommodation|resort|motel|hostel|inn)$/i.test(named) ? named : 'Hotel';
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

export function customerInputState(records = [], trip = {}) {
  if (statedLodgingLabelFromThings(records) || String(trip?.lodging || trip?.statedLodgingArea || trip?.statedLodgingAreaHint || '').trim()) return {};
  const present = new Set();
  for (const record of records || []) {
    const kind = recordInputKind(record);
    if (kind === 'lodging') present.add('lodging');
  }
  if (present.has('lodging')) return {};
  return { needsCustomerInput: ['lodging'], lodgingAsk: true };
}

function noteText(thing) {
  return [
    ...(Array.isArray(thing?.notes) ? thing.notes : []),
    ...(Array.isArray(thing?.collaboratorNotes) ? thing.collaboratorNotes : []),
  ].map((note) => String(note || '').trim()).filter(Boolean).join('\n');
}

export function budgetPriceFromThing(thing = {}) {
  const direct = thing?.total_price ?? thing?.price;
  if (direct !== null && direct !== undefined && direct !== '' && Number.isFinite(Number(direct))) {
    return Number(direct);
  }
  const cents = thing?.cost_estimate_cents ?? thing?.costEstimateCents;
  if (Number.isInteger(cents) && cents >= 0) return cents / 100;
  return null;
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
    starts_at: row.starts_at || row.startsAt || null,
    notes: Array.isArray(meta.notes) ? meta.notes : [],
    collaboratorNotes: Array.isArray(meta.collaboratorNotes) ? meta.collaboratorNotes : [],
    ratings,
    sourceRecord,
    source: row.source || '',
    categoryName: String(meta.categoryName || '').trim(),
    providerCategories: Array.isArray(meta.providerCategories) ? meta.providerCategories : [],
    metadata: meta,
    location,
    lat: location.lat,
    lng: location.lng,
    address: location.address || '',
    sourceRef,
    cost_estimate_cents: Number.isInteger(row.cost_estimate_cents) ? row.cost_estimate_cents : null,
    logoUrl: textField(meta.logoUrl || ''),
    logoCaptureReason: textField(meta.logoCaptureReason || ''),
  };
}

function textField(value) {
  return String(value || '').trim();
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
    if (!customerStatedLodgingThing(thing)) continue;
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
      ...placeSourceFieldsFromThing(thing),
      ...(thing.logoUrl ? { logoUrl: thing.logoUrl } : {}),
      ...(thing.logoCaptureReason ? { logoCaptureReason: thing.logoCaptureReason } : {}),
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
      ...(thing.logoUrl ? { logoUrl: thing.logoUrl } : {}),
      ...(thing.logoCaptureReason ? { logoCaptureReason: thing.logoCaptureReason } : {}),
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
  const categoryRegistry = new Map();
  for (const place of places) {
    const name = String(place.category_name || '').trim() || 'Place';
    const icon = String(place.category_icon || '').trim();
    const key = `${name}\0${icon}`;
    if (!categoryRegistry.has(key)) {
      categoryRegistry.set(key, { id: intId(`category:${trip.id}:${name}:${icon}`), name, icon });
    }
    const category = categoryRegistry.get(key);
    place.category_id = category.id;
    place.category = { id: category.id, name: category.name, icon: category.icon };
  }
  const categories = [...categoryRegistry.values()];
  const destination = customerPlaceName(trip?.destination);
  const destinationCenter = destinationCenterFromTripMetadata(trip?.metadata);
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
      metadata: trip?.metadata && typeof trip.metadata === 'object' ? trip.metadata : {},
      ...(destinationCenter ? { lat: destinationCenter.lat, lng: destinationCenter.lng } : {}),
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories,
    permissions: {
      share_map: true,
      share_bookings: true,
      share_packing: false,
      share_budget: (things || []).length > 0 && planned,
      share_collab: false,
    },
    budget: (things || []).flatMap((thing, index) => {
      const amount = budgetPriceFromThing(thing);
      if (amount === null) return [];
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
    const priorOverride = thingOverrides[`place:${place.id}`] || {};
    const extra = {
      source: String(place.source || 'customer'),
      ...logoFieldsForSharedPlace(place, priorOverride),
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
