import {
  stripFlightOptionTitlePrefix,
  stripPipelineItineraryStub,
} from './thing-title-normalize.mjs';
import { productThingCategory } from './keepsake-product-overrides.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function cleanTitle(value) {
  const raw = text(value);
  if (!raw) return raw;
  const stripped = stripFlightOptionTitlePrefix(raw);
  return stripped === raw ? raw : stripped;
}

function cleanDocumentedFlightDescription(value) {
  const row = text(value);
  if (!row) return '';
  if (/^Documented NYC option \(flight\)$/i.test(row)) return '';
  if (stripPipelineItineraryStub(row) === '') return '';
  return value;
}

function scrubStringField(target, key) {
  if (target == null || typeof target !== 'object') return;
  const raw = target[key];
  if (raw == null || typeof raw !== 'string') return;
  const title = cleanTitle(raw);
  if (title !== raw) target[key] = title;
}

function scrubDescriptionField(target, key) {
  if (target == null || typeof target !== 'object') return;
  const raw = target[key];
  if (raw == null || typeof raw !== 'string') return;
  const next = cleanDocumentedFlightDescription(raw);
  if (next !== raw) target[key] = next;
}

function placeHasFlightReservation(shared, placeId) {
  const reservations = Array.isArray(shared.reservations) ? shared.reservations : [];
  return reservations.some(
    (row) => String(row?.place_id ?? row?.placeId ?? '') === String(placeId)
      && text(row?.type).toLowerCase() === 'flight',
  );
}

function isFlightStoredRow(place, override, shared) {
  const capture = place?.websiteCapture && typeof place.websiteCapture === 'object'
    ? place.websiteCapture
    : {};
  if (text(capture.category).toLowerCase() === 'flight') return true;
  if (productThingCategory(place, override) === 'flight') return true;
  return placeHasFlightReservation(shared, place?.id);
}

function repairStoredPlace(place, override, shared) {
  if (!place || typeof place !== 'object') return;
  const flightRow = isFlightStoredRow(place, override, shared);
  if (!flightRow) return;

  scrubStringField(place, 'name');
  scrubStringField(place, 'title');
  scrubDescriptionField(place, 'description');

  const capture = place.websiteCapture && typeof place.websiteCapture === 'object'
    ? place.websiteCapture
    : null;
  if (capture) {
    scrubStringField(capture, 'name');
    scrubStringField(capture, 'title');
    scrubDescriptionField(capture, 'description');
  }

  if (override && typeof override === 'object') {
    scrubStringField(override, 'name');
    scrubStringField(override, 'title');
    scrubDescriptionField(override, 'description');
    override.category = 'flight';
  }

  place.category_name = place.category_name || 'Flight';
  if (place.category && typeof place.category === 'object') {
    place.category = { ...place.category, name: place.category.name || 'Flight' };
  } else if (!place.category) {
    place.category = { name: 'Flight', icon: '✈️' };
  }
}

export function repairLegacyFlightOptionStoredFields(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
    reservations: Array.isArray(shared.reservations)
      ? shared.reservations.map((row) => ({ ...row }))
      : shared.reservations,
    assignments: shared.assignments && typeof shared.assignments === 'object'
      ? Object.fromEntries(
        Object.entries(shared.assignments).map(([key, rows]) => [
          key,
          Array.isArray(rows) ? rows.map((row) => ({ ...row, place: row?.place ? { ...row.place } : row?.place })) : rows,
        ]),
      )
      : shared.assignments,
  };

  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    repairStoredPlace(place, override, next);
    next.thingOverrides[key] = override;
  }

  for (const row of next.reservations || []) {
    if (!row || typeof row !== 'object') continue;
    if (text(row.type).toLowerCase() !== 'flight') continue;
    scrubStringField(row, 'title');
    scrubStringField(row, 'name');
    scrubDescriptionField(row, 'description');
  }

  for (const rows of Object.values(next.assignments || {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      scrubStringField(row, 'title');
      scrubStringField(row, 'name');
      const embedded = row.place;
      if (embedded && typeof embedded === 'object') {
        const id = row.place_id ?? embedded.id;
        const catalog = (next.places || []).find((p) => String(p.id) === String(id));
        const override = catalog
          ? { ...(next.thingOverrides[`place:${catalog.id}`] || {}) }
          : {};
        repairStoredPlace(embedded, override, next);
        if (catalog) next.thingOverrides[`place:${catalog.id}`] = override;
      }
    }
  }

  return next;
}
