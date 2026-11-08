import { flightFieldsFromBlob } from './place-detail-extract.mjs';
import {
  isPipelineFlightStubSummary,
  stripPipelineFlightStubPrefix,
} from './flight-list-row-summary.mjs';
import { isGenericDescription } from './list-row-generic-description.mjs';
import { stripFlightOptionTitlePrefix } from './thing-title-normalize.mjs';

function text(value) {
  return String(value || '').trim();
}

function firstPresent(...values) {
  for (const value of values) {
    const row = text(value);
    if (row) return row;
  }
  return '';
}

function copyIfBlank(target, key, ...values) {
  if (text(target[key])) return;
  const row = firstPresent(...values);
  if (row) target[key] = row;
}

export function stripFlightOptionPrefix(value = '') {
  return stripFlightOptionTitlePrefix(value);
}

export function syncAssignmentPlaceSnapshots(shared = {}) {
  if (!shared.assignments || typeof shared.assignments !== 'object') return;
  const byId = new Map((shared.places || []).map((place) => [String(place.id), place]));
  for (const rows of Object.values(shared.assignments)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const embedded = row?.place;
      if (!embedded || typeof embedded !== 'object') continue;
      const id = String(row.place_id ?? embedded.id ?? '');
      if (!id) continue;
      const catalog = byId.get(id);
      if (!catalog) continue;
      if (row.place_id == null || row.place_id === '') row.place_id = catalog.id;
      row.place = {
        ...embedded,
        ...catalog,
        name: catalog.name,
        title: text(catalog.title) || catalog.name,
      };
    }
  }
}

export function applyFlightThingFields(place, override, source) {
  place.category_name = place.category_name || 'Flight';
  place.category = place.category && typeof place.category === 'object'
    ? { ...place.category, name: place.category.name || 'Flight' }
    : { name: 'Flight', icon: '✈️' };
  override.category = 'flight';
  const rawTitle = firstPresent(place.name, place.title, override.name, override.title);
  const cleanedTitle = stripFlightOptionPrefix(rawTitle);
  if (cleanedTitle) {
    place.name = cleanedTitle;
    place.title = cleanedTitle;
    override.name = cleanedTitle;
    override.title = cleanedTitle;
  }
  copyIfBlank(override, 'fareDirection', source?.fareDirection, source?.tripType, source?.pricingType);
  const flightBlob = firstPresent(
    source?.summary,
    source?.description,
    place.description,
    place.notes,
  );
  let flightFields = flightFieldsFromBlob(flightBlob, '');
  if (!flightFields.departureTime) {
    flightFields = {
      ...flightFields,
      ...flightFieldsFromBlob(firstPresent(place.name, place.title), ''),
    };
  }
  copyIfBlank(override, 'departureTime', source?.departureTime, source?.departTime, flightFields.departureTime);
  copyIfBlank(override, 'arrivalTime', source?.arrivalTime, source?.arriveTime, flightFields.arrivalTime);
  copyIfBlank(override, 'duration', source?.duration, flightFields.duration);
  const placeDesc = firstPresent(place.description);
  const overrideDesc = firstPresent(override.description);
  if (placeDesc && (isGenericDescription(placeDesc) || isPipelineFlightStubSummary(placeDesc))) {
    place.description = '';
    const sourceRecord = override.sourceRecord && typeof override.sourceRecord === 'object'
      ? override.sourceRecord
      : null;
    if (sourceRecord) {
      delete sourceRecord.description;
    }
  }
  if (overrideDesc && (isGenericDescription(overrideDesc) || isPipelineFlightStubSummary(overrideDesc))) {
    delete override.description;
  }
}

export function mergeFlightThingOverrideAfterCcab(place, override, source) {
  copyIfBlank(
    override,
    'itineraryNote',
    source?.itineraryNote,
    source?.itinerary_note,
    place.itineraryNote,
    place.itinerary_note,
  );
  if (text(override.itineraryNote) && text(override.summary) === text(override.itineraryNote)) {
    delete override.summary;
  }
  if (isPipelineFlightStubSummary(override.summary)) {
    const next = text(stripPipelineFlightStubPrefix(override.summary));
    if (next) override.summary = next;
  }
  if (isPipelineFlightStubSummary(override.longDetails)) {
    const next = text(stripPipelineFlightStubPrefix(override.longDetails));
    if (next) override.longDetails = next;
  }
}
