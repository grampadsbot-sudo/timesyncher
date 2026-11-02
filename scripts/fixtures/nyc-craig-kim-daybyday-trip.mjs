import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mergeBindingsIntoShared } from '../../src/vacation/thing-media-bind.mjs';
import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import { enrichSearchPlace } from '../../src/vacation/trip-thing-enrichment.mjs';
import {
  applyLiveAppTimelineSelections,
  assignPlaceToTripDays,
} from '../../src/vacation/shared-trip-live-app-fields.mjs';
import { buildNycCraigKimDaybydayFixtureRows } from './nyc-craig-kim-daybyday-rows.mjs';
import { buildGateBSearchPlaceForRow } from './pr336-vk-search-trip-sources.mjs';

export { buildNycCraigKimDaybydayFixtureRows } from './nyc-craig-kim-daybyday-rows.mjs';

const PR336_SEARCH_SNAPSHOT = JSON.parse(
  readFileSync(new URL('./pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);

export const NYC_DAYBYDAY_SLUG = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
export const NYC_CONFLICT_DAY = 3;

export const VK_SEARCH_SNAPSHOT_COPY_ROW_IDS = Object.freeze(
  Array.from({ length: 11 }, (_, index) => 601 + index),
);
const VK_SEARCH_SNAPSHOT_COPY_ROW_ID_SET = new Set(VK_SEARCH_SNAPSHOT_COPY_ROW_IDS);

export const STORED_SUMMARY_FIELD = 'thingOverrides[place:<placeId>].summary';
const MEDIA_PREFIX = '/ts-thing-media/nyc-craig-kim-june-2026';
const VIDEO_URL = 'https://example.com/nyc-day1-walk.mp4';

const SUMMARIES = {
  601: 'Nonstop afternoon arrival; lands with time to reach the hotel before dinner.',
  602: 'UWS grocery stop for picnic supplies and breakfast basics.',
  603: 'UWS base for the week; strong Lincoln Center access on the subway.',
  604: 'Ferry and grounds; keep tickets on phone and arrive early for security.',
  605: 'Browse the rare room if time allows after the harbor tour.',
  606: 'Overlap window A: matinee tickets already held.',
  607: 'Overlap window B: friend meetup at the same hour.',
  610: 'Classic Italian; reserve the earliest table you can get.',
  611: 'Evening set at the Village club; arrive early for will-call pickup.',
  612: 'Chelsea Market lunch stop between Midtown and the Village.',
  613: 'Herald Square shopping block if you want a practical retail run.',
  614: 'Design-store browse near MoMA when the weather is rough.',
  615: 'Fifth Avenue luxury browse; good rainy-day option near the hotel zone.',
  616: 'Columbus Circle groceries before the late flight home.',
  635: 'Nonstop evening departure; allow extra time for JFK security.',
  630: 'One-stop Southwest option; lowest outbound fare in the search set.',
  631: 'Later Southwest via Dallas; cheaper if you can accept a long travel day.',
  632: 'Early Southwest via Houston; useful if you want a morning departure from LAS.',
  633: 'Southwest via Denver; mid-morning LAS departure with one connection.',
  634: 'Southwest via STL; slowest option but sometimes the only seats left.',
};

const NYC_COORDS = {
  601: { lat: 36.084, lng: -115.1537 },
  602: { lat: 40.7847, lng: -73.9794 },
  603: { lat: 40.7828, lng: -73.9813 },
  604: { lat: 40.6892, lng: -74.0445 },
  605: { lat: 40.7333, lng: -73.9909 },
  606: { lat: 40.758, lng: -73.9855 },
  607: { lat: 40.7536, lng: -73.9832 },
  609: { lat: 40.6413, lng: -73.7781 },
  610: { lat: 40.727915, lng: -74.007235 },
  611: { lat: 40.728, lng: -73.9965 },
  612: { lat: 40.7424, lng: -74.006 },
  613: { lat: 40.7508, lng: -73.9896 },
  614: { lat: 40.7616, lng: -73.9776 },
  615: { lat: 40.7635, lng: -73.9743 },
  616: { lat: 40.7686, lng: -73.9822 },
  630: { lat: 36.084, lng: -115.1537 },
  631: { lat: 36.084, lng: -115.1537 },
  632: { lat: 36.084, lng: -115.1537 },
  633: { lat: 36.084, lng: -115.1537 },
  634: { lat: 36.084, lng: -115.1537 },
  635: { lat: 40.6413, lng: -73.7781 },
};

export function listStoredSummaries() {
  const out = { ...SUMMARIES };
  for (const [id, search] of Object.entries(PR336_SEARCH_SNAPSHOT)) {
    if (search?.summary) out[id] = search.summary;
  }
  return out;
}

export function expectedSummariesOnDay(dayNumber) {
  const idsByDay = {
    1: [602, 610, 611],
    2: [604, 605],
    3: [606, 607],
  };
  return (idsByDay[dayNumber] || []).map((id) => PR336_SEARCH_SNAPSHOT[String(id)]?.summary || SUMMARIES[id] || '');
}

function provenanceBlockedFieldSet(record = {}) {
  const blocked = Array.isArray(record.provenanceBlocked) ? record.provenanceBlocked : [];
  if (!text(record.provenanceBlocker)) return new Set();
  return new Set(blocked.map((field) => text(field, 80)).filter(Boolean));
}

function applyProvenanceBlockedClears(record, place, override) {
  const blocked = provenanceBlockedFieldSet(record);
  if (!blocked.size) return;
  override.provenanceBlocker = text(record.provenanceBlocker);
  override.provenanceBlocked = [...blocked];
  if (blocked.has('price')) delete override.price;
  if (blocked.has('logoUrl')) {
    delete override.logoUrl;
    delete place.logoUrl;
  }
  if (blocked.has('website')) {
    place.website = '';
    delete override.website;
  }
  if (blocked.has('lat') || blocked.has('lng')) {
    place.lat = null;
    place.lng = null;
    override.lat = null;
    override.lng = null;
  }
  for (const ratingKey of [
    'googleRating',
    'yelpRating',
    'thirdPartyRating',
    'googleReviewCount',
    'yelpReviewCount',
    'thirdPartyReviewCount',
    'thirdPartySource',
    'otherRatingSites',
    'ratingCount',
    'ratingMix',
    'reviewThemes',
    'xaiRatingsFetched',
  ]) {
    if (blocked.has(ratingKey)) delete override[ratingKey];
  }
  for (let index = 1; index <= 4; index += 1) {
    for (const suffix of ['', 'Rating', 'Source', 'Url']) {
      const field = `review${index}${suffix}`;
      if (blocked.has(field)) delete override[field];
    }
  }
}

function applyVkSearchSnapshotContractFields(search, place, override) {
  const record = search.sourceRecord && typeof search.sourceRecord === 'object'
    ? search.sourceRecord
    : {};
  if (search.price != null) override.price = search.price;
  if (search.logoUrl) {
    override.logoUrl = search.logoUrl;
    place.logoUrl = search.logoUrl;
  }
  if (search.url) {
    place.website = search.url;
    override.website = search.url;
  }
  if (search.address && text(search.address)) {
    place.address = search.address;
    override.address = search.address;
  }
  if (search.lat != null && search.lng != null) {
    place.lat = search.lat;
    place.lng = search.lng;
    override.lat = search.lat;
    override.lng = search.lng;
  }
  for (const key of [
    'googleRating',
    'yelpRating',
    'thirdPartyRating',
    'googleReviewCount',
    'yelpReviewCount',
    'thirdPartyReviewCount',
    'thirdPartySource',
    'googleRatingSourceUrl',
    'yelpRatingSourceUrl',
    'otherRatingSites',
    'ratingCount',
    'ratingMix',
    'reviewThemes',
    'websiteFlavour',
    'xaiRatingsFetched',
    'missingFields',
    'rentalCompany',
    'vehicleClass',
    'carType',
    'pickupLocation',
    'returnLocation',
    'pickupHours',
    'dropoffHours',
    'startTime',
    'endTime',
    'totalPrice',
    'reputationNote',
    'summarySourceUrls',
  ]) {
    if (record[key] != null && record[key] !== '') override[key] = record[key];
  }
  for (const key of ['pickupHours', 'dropoffHours', 'pickupLocation', 'returnLocation']) {
    if (record[key]) place[key] = record[key];
  }
  if (Array.isArray(record.missingFields)) override.missingFields = record.missingFields;
  if (Array.isArray(record.summarySourceUrls) && record.summarySourceUrls.length) {
    override.summarySourceUrls = record.summarySourceUrls.map((url) => text(url, 500)).filter(Boolean);
  }
  if (record.xaiRatingsFetched === false) override.xaiRatingsFetched = false;
  for (let index = 1; index <= 4; index += 1) {
    for (const suffix of ['', 'Rating']) {
      const field = `review${index}${suffix}`;
      if (record[field]) override[field] = record[field];
    }
    for (const suffix of ['Source', 'Url']) {
      const field = `review${index}${suffix}`;
      if (field in record) override[field] = record[field] || null;
    }
  }
  applyProvenanceBlockedClears(record, place, override);
}

function applyVkSearchSnapshotCopyFields(search, place, override) {
  const title = text(search.title);
  if (title) place.name = title;
  if (search.description) {
    place.description = search.description;
    override.longDetails = search.description;
  }
  if (search.summary) override.summary = search.summary;
  applyVkSearchSnapshotContractFields(search, place, override);
}

function applySearchFillEstimatedPrice(row, place, override, search = null) {
  if (override.price != null && override.price !== '') return;
  const record = search?.sourceRecord && typeof search.sourceRecord === 'object'
    ? search.sourceRecord
    : {};
  const enriched = enrichSearchPlace({
    title: place.name || row.name,
    category: row.cat || override.category,
    description: place.description || override.longDetails || search?.description || '',
    summary: override.summary || search?.summary || '',
    address: place.address || search?.address || '',
    source: place.source || 'fixture-nyc',
    sourceRecord: { ...record, summary: override.summary || search?.summary || '' },
  });
  if (enriched.price == null || enriched.price === '') return;
  const blocked = provenanceBlockedFieldSet(record);
  if (blocked.has('price')) {
    place.price = enriched.price;
    return;
  }
  override.price = enriched.price;
}

function applyCcabRowSearchFields(row, place, override) {
  if (!row.ccabKey) return false;
  const search = buildGateBSearchPlaceForRow(row);
  const record = search.sourceRecord && typeof search.sourceRecord === 'object'
    ? search.sourceRecord
    : {};
  if (search.description) {
    place.description = search.description;
    override.longDetails = search.description;
  }
  if (search.summary) override.summary = search.summary;
  if (search.price != null) override.price = search.price;
  if (search.logoUrl) {
    override.logoUrl = search.logoUrl;
    place.logoUrl = search.logoUrl;
  }
  if (search.url) {
    place.website = search.url;
    override.website = search.url;
  }
  if (search.address && text(search.address)) {
    place.address = search.address;
    override.address = search.address;
  }
  if (search.lat != null && search.lng != null) {
    place.lat = search.lat;
    place.lng = search.lng;
    override.lat = search.lat;
    override.lng = search.lng;
  }
  for (const key of [
    'googleRating',
    'yelpRating',
    'thirdPartyRating',
    'googleReviewCount',
    'yelpReviewCount',
    'thirdPartyReviewCount',
    'thirdPartySource',
    'googleRatingSourceUrl',
    'yelpRatingSourceUrl',
    'otherRatingSites',
    'ratingCount',
    'ratingMix',
    'reviewThemes',
    'websiteFlavour',
    'xaiRatingsFetched',
    'missingFields',
    'rentalCompany',
    'vehicleClass',
    'carType',
    'pickupLocation',
    'returnLocation',
    'pickupHours',
    'dropoffHours',
    'startTime',
    'endTime',
    'totalPrice',
    'reputationNote',
    'summarySourceUrls',
  ]) {
    if (record[key] != null && record[key] !== '') override[key] = record[key];
  }
  for (const key of ['pickupHours', 'dropoffHours', 'pickupLocation', 'returnLocation']) {
    if (record[key]) place[key] = record[key];
  }
  if (Array.isArray(record.missingFields)) override.missingFields = record.missingFields;
  if (Array.isArray(record.summarySourceUrls) && record.summarySourceUrls.length) {
    override.summarySourceUrls = record.summarySourceUrls.map((url) => text(url, 500)).filter(Boolean);
  }
  if (record.xaiRatingsFetched === false) override.xaiRatingsFetched = false;
  for (let index = 1; index <= 4; index += 1) {
    for (const suffix of ['', 'Rating']) {
      const field = `review${index}${suffix}`;
      if (record[field]) override[field] = record[field];
    }
    for (const suffix of ['Source', 'Url']) {
      const field = `review${index}${suffix}`;
      if (field in record) override[field] = record[field] || null;
    }
  }
  applyProvenanceBlockedClears(record, place, override);
  return true;
}

function applyPr336SearchFields(row, place, override) {
  if (applyCcabRowSearchFields(row, place, override)) {
    const search = PR336_SEARCH_SNAPSHOT[String(row.id)];
    if (search && VK_SEARCH_SNAPSHOT_COPY_ROW_ID_SET.has(row.id)) {
      applyVkSearchSnapshotCopyFields(search, place, override);
    }
    applySearchFillEstimatedPrice(row, place, override, search || null);
    return;
  }
  const search = PR336_SEARCH_SNAPSHOT[String(row.id)];
  if (search && VK_SEARCH_SNAPSHOT_COPY_ROW_ID_SET.has(row.id)) {
    applyVkSearchSnapshotCopyFields(search, place, override);
    applySearchFillEstimatedPrice(row, place, override, search);
    return;
  }
  if (!search) {
    applySearchFillEstimatedPrice(row, place, override, search);
    return;
  }
  const record = search.sourceRecord && typeof search.sourceRecord === 'object'
    ? search.sourceRecord
    : {};
  if (search.description) {
    place.description = search.description;
    override.longDetails = search.description;
  }
  if (search.summary) override.summary = search.summary;
  if (search.price != null) override.price = search.price;
  if (search.logoUrl) {
    override.logoUrl = search.logoUrl;
    place.logoUrl = search.logoUrl;
  }
  if (search.url) {
    place.website = search.url;
    override.website = search.url;
  }
  if (search.address && text(search.address)) {
    place.address = search.address;
    override.address = search.address;
  }
  if (search.lat != null && search.lng != null) {
    place.lat = search.lat;
    place.lng = search.lng;
    override.lat = search.lat;
    override.lng = search.lng;
  }
  for (const key of [
    'googleRating',
    'yelpRating',
    'thirdPartyRating',
    'googleReviewCount',
    'yelpReviewCount',
    'thirdPartyReviewCount',
    'thirdPartySource',
    'googleRatingSourceUrl',
    'yelpRatingSourceUrl',
    'otherRatingSites',
    'ratingCount',
    'reviewThemes',
    'websiteFlavour',
    'xaiRatingsFetched',
    'missingFields',
  ]) {
    if (record[key] != null && record[key] !== '') override[key] = record[key];
  }
  if (Array.isArray(record.missingFields)) override.missingFields = record.missingFields;
  if (record.xaiRatingsFetched === false) override.xaiRatingsFetched = false;
  for (let index = 1; index <= 4; index += 1) {
    for (const suffix of ['', 'Rating']) {
      const field = `review${index}${suffix}`;
      if (record[field]) override[field] = record[field];
    }
    for (const suffix of ['Source', 'Url']) {
      const field = `review${index}${suffix}`;
      if (field in record) override[field] = record[field] || null;
    }
  }
  applySearchFillEstimatedPrice(row, place, override, search);
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildPayload() {
  const categories = {
    hotel: { id: 1, name: 'Hotel', icon: '🧳' },
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
    store: { id: 4, name: 'Store', icon: '🛍️' },
    flight: { id: 5, name: 'Flight', icon: '✈️' },
    car: { id: 6, name: 'Car', icon: '🚗' },
  };
  const days = [1, 2, 3, 4, 5, 6, 7, 8].map((day) => ({
    id: 500 + day,
    trip_id: 99,
    day_number: day,
    date: `2026-06-${String(22 + day).padStart(2, '0')}`,
    title: day === 1 ? 'Day 1' : day === 2 ? 'Day 2' : `Day ${day}`,
  }));
  const places = [];
  const assignments = Object.fromEntries(days.map((day) => [String(day.id), []]));
  const thingOverrides = {};
  const rows = buildNycCraigKimDaybydayFixtureRows();
  for (const row of rows) {
    const day = days.find((d) => d.day_number === row.day);
    const kind = categories[row.cat];
    const coords = NYC_COORDS[row.id] || { lat: 40.774, lng: -73.982 };
    const place = {
      id: row.id,
      trip_id: 99,
      name: row.name,
      description: '',
      lat: coords.lat,
      lng: coords.lng,
      address: 'New York, NY',
      category_id: kind.id,
      category_name: kind.name,
      category_icon: kind.icon,
      category: { id: kind.id, name: kind.name, icon: kind.icon },
      reservation_status: 'considering',
      place_time: row.time,
      website: '',
      notes: '',
      source: 'fixture-nyc',
    };
    places.push(place);
    if (!row.listOnly) {
      assignments[String(day.id)].push({
        id: 700 + row.id,
        day_id: day.id,
        order_index: assignments[String(day.id)].length,
        notes: '',
        place,
      });
    }
    const override = {
      timeline: !row.listOnly,
      category: row.cat,
      summary: SUMMARIES[row.id] || '',
    };
    applyPr336SearchFields(row, place, override);
    if (row.id === 603) {
      override.stayDays = 7;
      override.checkInDate = '2026-06-23';
      override.checkOutDate = '2026-06-30';
      override.checkInTime = '16:00';
      override.checkOutTime = '11:00';
    }
    if (row.id === 611) {
      override.category = 'music';
    }
    if (row.id === 630) {
      override.price = 164;
      override.logoUrl = 'https://www.southwest.com/favicon.ico';
      override.airline = 'Southwest';
    }
    if (row.id === 631) {
      override.price = 194;
      override.logoUrl = 'https://www.southwest.com/favicon.ico';
      override.airline = 'Southwest';
    }
    if (row.id === 632) {
      override.price = 239;
      override.logoUrl = 'https://www.southwest.com/favicon.ico';
      override.airline = 'Southwest';
    }
    if (row.id === 633) {
      override.price = 239;
      override.logoUrl = 'https://www.southwest.com/favicon.ico';
      override.airline = 'Southwest';
    }
    if (row.id === 634) {
      override.price = 249;
      override.logoUrl = 'https://www.southwest.com/favicon.ico';
      override.airline = 'Southwest';
    }
    if (row.id === 612) {
      override.logoUrl = 'https://www.chelseamarket.com/favicon.ico';
    }
    if (row.id === 613) {
      override.logoUrl = 'https://www.macys.com/favicon.ico';
    }
    if (row.id === 614) {
      override.logoUrl = 'https://icons.duckduckgo.com/ip3/store.moma.org.ico';
    }
    if (row.id === 615) {
      override.logoUrl = 'https://www.bergdorfgoodman.com/favicon.ico';
    }
    if (row.id === 616) {
      override.logoUrl = 'https://www.wholefoodsmarket.com/favicon.ico';
    }
    thingOverrides[`place:${row.id}`] = override;
  }
  const reservations = rows.map((row) => {
    const day = days.find((d) => d.day_number === row.day);
    const place = places.find((p) => p.id === row.id);
    return {
      id: 800 + row.id,
      trip_id: 99,
      day_id: day.id,
      place_id: row.id,
      title: place?.name || row.name,
      status: 'candidate',
      type: row.cat === 'flight' ? 'flight' : row.cat === 'hotel' ? 'hotel' : 'activity',
      start_time: row.time,
    };
  });
  const shared = {
    trip: {
      id: 99,
      title: 'Craig / Kim NYC June 2026',
      description: 'Las Vegas to New York · Jun 23–30, 2026 · UWS / Lincoln Center priority · planning options only',
      start_date: '2026-06-23',
      end_date: '2026-06-30',
      currency: 'USD',
      lat: 40.774,
      lng: -73.982,
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories: Object.values(categories),
    permissions: { share_map: true, share_bookings: true, share_packing: true, share_budget: true, share_collab: false },
    media: [],
    reservations,
    accommodations: [],
    packing: [],
    budget: [],
    collab: [],
    thingOverrides,
    timesyncherIntake: true,
  };
  const bindings = [];
  const zabars = places.find((p) => p.id === 602);
  const tour = places.find((p) => p.id === 604);
  if (zabars) {
    bindings.push({
      id: 'nyc-bind-photo-day1',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: zabars.id,
      thingName: zabars.name,
      mediaKind: 'photo',
      mimeType: 'image/jpeg',
      originalName: 'uws-street-photo.jpg',
      publicUrl: `${MEDIA_PREFIX}/uws-street-photo.jpg`,
    });
  }
  if (tour) {
    bindings.push({
      id: 'nyc-bind-photo-day2',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: tour.id,
      thingName: tour.name,
      mediaKind: 'photo',
      mimeType: 'image/jpeg',
      originalName: 'lincoln-center-photo.jpg',
      publicUrl: `${MEDIA_PREFIX}/lincoln-center-photo.jpg`,
    });
    bindings.push({
      id: 'nyc-bind-video-day2',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: tour.id,
      thingName: tour.name,
      mediaKind: 'video',
      mimeType: 'video/mp4',
      originalName: 'nyc-day1-walk.mp4',
      publicUrl: VIDEO_URL,
    });
  }
  const timelineIds = rows.filter((row) => !row.listOnly).map((row) => row.id);
  let withTimeline = applyLiveAppTimelineSelections(shared, timelineIds);
  const hotelDayNumbers = [1, 2, 3, 4, 5, 6, 7];
  withTimeline = assignPlaceToTripDays(withTimeline, 603, hotelDayNumbers);
  const conflictDay = days.find((d) => d.day_number === NYC_CONFLICT_DAY);
  if (conflictDay) {
    const dayKey = String(conflictDay.id);
    withTimeline = assignPlaceToTripDays(withTimeline, 606, [NYC_CONFLICT_DAY]);
    withTimeline = assignPlaceToTripDays(withTimeline, 607, [NYC_CONFLICT_DAY]);
    const schedules = {
      606: { startTime: '14:00', duration: '90 min' },
      607: { startTime: '14:30', duration: '60 min' },
    };
    for (const [placeId, slot] of Object.entries(schedules)) {
      const key = `place:${placeId}`;
      withTimeline.thingOverrides[key] = {
        ...(withTimeline.thingOverrides[key] || {}),
        perDaySchedule: { [dayKey]: slot },
      };
    }
  }
  return finalizeServedSharedTripPayload(mergeBindingsIntoShared(withTimeline, bindings));
}

export function buildNycCraigKimDaybydayTrip() {
  return buildPayload();
}
