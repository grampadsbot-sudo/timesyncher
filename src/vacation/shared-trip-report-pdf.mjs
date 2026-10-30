import { applyProductKeepsakeOverrides, keepsakeListBuckets } from './keepsake-product-overrides.mjs';
import { renderMinimalTextPdf } from './minimal-text-pdf.mjs';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function thingFields(place = {}, override = {}) {
  const source = place.sourceRecord && typeof place.sourceRecord === 'object'
    ? place.sourceRecord
    : (place.source && typeof place.source === 'object' ? place.source : {});
  const name = text(place.name || place.title || override.title);
  const area = text(
    override.neighborhood
    || place.neighborhood
    || source.neighborhood
    || place.area
    || place.address,
  );
  const itineraryNote = text(
    override.itineraryNote
    || override.itinerary_note
    || place.itineraryNote
    || place.itinerary_note
    || source.itineraryNote
    || source.itinerary_note,
  );
  const summary = text(override.summary || place.summary || source.summary);
  const note = itineraryNote || summary;
  const address = text(place.address || source.address || override.address);
  const phone = text(place.phone || source.phone || override.phone);
  const website = text(
    override.website
    || override.url
    || place.website
    || place.url
    || source.website
    || source.url,
  );
  const rating = text(
    place.googleRating
    || place.rating
    || source.googleRating
    || source.rating
    || override.googleRating,
  );
  return { name, area, note, address, phone, website, rating };
}

function formatThingBlock(place = {}, override = {}) {
  const row = thingFields(place, override);
  if (!row.name) return [];
  const lines = [row.name];
  if (row.area) lines.push(`Area: ${row.area}`);
  if (row.note) lines.push(row.note);
  if (row.address) lines.push(`Address: ${row.address}`);
  if (row.phone) lines.push(`Phone: ${row.phone}`);
  if (row.website) lines.push(`Website: ${row.website}`);
  if (row.rating) lines.push(`Rating: ${row.rating}`);
  lines.push('');
  return lines;
}

const SHARED_LIST_REPORT_SLUGS = new Set([
  'restaurants',
  'stores',
  'rest',
  'complete-list',
]);

export function normalizeSharedListReportSlug(name = '') {
  const cleaned = String(name || '').replace(/\.pdf$/i, '').trim().toLowerCase();
  if (cleaned === 'complete-list' || cleaned === 'complete_list') return 'complete-list';
  if (cleaned === 'restaurants' || cleaned === 'restaurant') return 'restaurants';
  if (cleaned === 'stores' || cleaned === 'store') return 'stores';
  if (cleaned === 'rest' || cleaned === 'the-rest') return 'rest';
  return cleaned;
}

export function isSharedListReportSlug(name = '') {
  return SHARED_LIST_REPORT_SLUGS.has(normalizeSharedListReportSlug(name));
}

function tripHeading(shared = {}) {
  const trip = shared.trip && typeof shared.trip === 'object' ? shared.trip : {};
  const title = text(trip.title || trip.name || 'Vacation');
  const start = text(trip.start_date || trip.startDate);
  const end = text(trip.end_date || trip.endDate);
  const dates = start && end ? `${start} – ${end}` : (start || end || '');
  return dates ? `${title} (${dates})` : title;
}

function rowsForSlug(shared = {}, slug = '') {
  const prepared = applyProductKeepsakeOverrides(shared);
  const buckets = keepsakeListBuckets(prepared);
  if (slug === 'restaurants') return buckets.Restaurants;
  if (slug === 'stores') return buckets.Stores;
  if (slug === 'rest') return buckets['Shows, Tours and the Rest'];
  if (slug === 'complete-list') {
    return [
      ...buckets.Restaurants,
      ...buckets.Stores,
      ...buckets['Shows, Tours and the Rest'],
      ...buckets.Hotels,
    ];
  }
  return [];
}

function dailyRows(shared = {}, dayNumber = 1) {
  const prepared = applyProductKeepsakeOverrides(shared);
  const days = Array.isArray(prepared.days) ? prepared.days : [];
  const day = days.find((row) => Number(row.day_number) === Number(dayNumber))
    || days[Number(dayNumber) - 1];
  if (!day) return [];
  const rows = prepared.assignments?.[String(day.id)] || prepared.assignments?.[day.id] || [];
  return (Array.isArray(rows) ? rows : []).map((assignment) => {
    const place = assignment.place || {};
    const override = prepared.thingOverrides?.[`place:${place.id}`] || {};
    const time = text(
      assignment.start_time
      || assignment.time
      || place.place_time
      || place.time,
    ) || 'TBD';
    return { place, override, time };
  });
}

export function renderSharedTripReportPdf(shared = {}, { report = '', dayNumber = 0 } = {}) {
  const slug = normalizeSharedListReportSlug(report);
  const titleParts = [tripHeading(shared)];
  const lines = [];

  if (slug === 'daily' || Number(dayNumber) > 0) {
    const day = Number(dayNumber) || 1;
    titleParts.push(`Day ${day} printout`);
    const items = dailyRows(shared, day);
    for (const item of items) {
      lines.push(`${item.time} — ${text(item.place.name || item.place.title)}`);
      lines.push(...formatThingBlock(item.place, item.override).slice(1));
    }
    if (!items.length) lines.push('No timed items for this day.');
  } else if (isSharedListReportSlug(slug)) {
    const label = slug === 'restaurants'
      ? 'Restaurants'
      : slug === 'stores'
        ? 'Stores'
        : slug === 'rest'
          ? 'The Rest'
          : 'Complete List';
    titleParts.push(label);
    const items = rowsForSlug(shared, slug);
    for (const item of items) {
      lines.push(...formatThingBlock(item.place, item.override));
    }
    if (!items.length) lines.push('No items in this section.');
  } else {
    return null;
  }

  return renderMinimalTextPdf({ title: titleParts.join(' — '), lines });
}

export function placeNamesForReport(shared = {}, { report = '', dayNumber = 0 } = {}) {
  const slug = normalizeSharedListReportSlug(report);
  if (slug === 'daily' || Number(dayNumber) > 0) {
    return dailyRows(shared, Number(dayNumber) || 1)
      .map((item) => text(item.place.name || item.place.title))
      .filter(Boolean);
  }
  if (!isSharedListReportSlug(slug)) return [];
  return rowsForSlug(shared, slug)
    .map((item) => text(item.place.name || item.place.title))
    .filter(Boolean);
}
