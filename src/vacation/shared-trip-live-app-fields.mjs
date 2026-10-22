import { mergeStoredCcabNarrativeIntoOverride } from '../../scripts/fixtures/pr336-vk-search-trip-sources.mjs';
import {
  NYC_CCAB_DISPLAY_ALIASES,
  NYC_STAGING_CAPTURE_LIST_ROWS,
} from '../../scripts/fixtures/nyc-vk-list-tab-rows.mjs';
import { estimateSearchPlacePrice } from './trip-thing-enrichment.mjs';
import { productThingCategory } from './keepsake-product-overrides.mjs';
import { flightFieldsFromBlob } from './place-detail-extract.mjs';
import { resolveThingLogoUrl } from './thing-logo-capture.mjs';

function text(value) {
  return String(value || '').trim();
}

function sourceObject(...rows) {
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) return row;
  }
  return null;
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

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const match = String(value).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function dropBlankPriceField(target, key) {
  if (!target || typeof target !== 'object') return;
  const raw = target[key];
  if (raw === '' || raw === null) delete target[key];
}

const GATE_B_CAPTURE_NAME_BY_ID = new Map(
  NYC_STAGING_CAPTURE_LIST_ROWS.map((row) => [String(row.id), row.ccabKey || row.name]),
);

function applyGateBCaptureCanonicalPlaceName(place = {}) {
  const canon = GATE_B_CAPTURE_NAME_BY_ID.get(String(place.id));
  if (canon) place.name = canon;
  const alias = NYC_CCAB_DISPLAY_ALIASES[place.name];
  if (alias) place.name = alias;
}

export function syncCatalogFieldsIntoAssignments(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places : [];
  const byId = new Map(places.map((place) => [String(place.id), place]));
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object'
    ? shared.thingOverrides
    : {};
  const assignments = shared.assignments && typeof shared.assignments === 'object'
    ? shared.assignments
    : null;
  if (!assignments) return shared;
  const nextAssignments = {};
  for (const [bucket, rows] of Object.entries(assignments)) {
    if (!Array.isArray(rows)) {
      nextAssignments[bucket] = rows;
      continue;
    }
    nextAssignments[bucket] = rows.map((row) => {
      const id = String(row?.place_id ?? row?.place?.id ?? '');
      const catalog = byId.get(id);
      if (!catalog || !row?.place || typeof row.place !== 'object') return row;
      const override = overrides[`place:${id}`] || {};
      const price = override.price ?? catalog.price ?? row.place.price;
      const place = {
        ...row.place,
        ...catalog,
        name: catalog.name ?? row.place.name,
      };
      if (price !== undefined && price !== '' && price !== null) place.price = price;
      return { ...row, place };
    });
  }
  return { ...shared, assignments: nextAssignments };
}

function placeMetadata(place = {}) {
  return place.metadata && typeof place.metadata === 'object' && !Array.isArray(place.metadata)
    ? place.metadata
    : {};
}

export function provenanceBlocksSourcedPrice(override = {}, place = {}) {
  for (const bag of [
    override,
    place.sourceRecord,
    place.source && typeof place.source === 'object' ? place.source : null,
  ]) {
    if (!bag || typeof bag !== 'object') continue;
    if (!text(bag.provenanceBlocker)) continue;
    const blocked = Array.isArray(bag.provenanceBlocked) ? bag.provenanceBlocked : [];
    if (blocked.some((field) => text(field, 80).toLowerCase() === 'price')) return true;
  }
  return false;
}

function rentalCompanyFromTitle(name = '') {
  const title = text(name);
  if (!title) return '';
  const head = title.split(/\s+\bat\b\s+/i)[0]?.trim();
  return head || title;
}

function priceFromTextFields(place = {}, override = {}, source = null) {
  const meta = placeMetadata(place);
  const blobs = [
    place.notes,
    place.description,
    override.notes,
    source?.summary,
    source?.description,
    source?.details,
    meta.reservationSummary,
    meta.reservation_summary,
    meta.pickSummary,
  ];
  for (const blob of blobs) {
    const parsed = parsePrice(blob);
    if (parsed != null) return parsed;
  }
  return null;
}

export function bindTravelListRowPrice(place = {}, override = {}, source = null, category = '', shared = {}) {
  const cat = text(category).toLowerCase();
  let price = priceFromRecords(place, override, source);
  if (price == null && ['flight', 'hotel', 'car'].includes(cat)) {
    const estimated = estimateSearchPlacePrice({
      category: cat,
      title: place.name || place.title,
      description: place.description || override.longDetails || override.details || '',
      summary: override.summary || source?.summary || '',
      sourceRecord: source && typeof source === 'object' ? source : {},
    });
    price = parsePrice(estimated);
  }
  const keepPriceOnPlaceOnly = provenanceBlocksSourcedPrice(override, place);
  if (price != null) {
    if (place.price == null || place.price === '') place.price = price;
    if (!keepPriceOnPlaceOnly) override.price = price;
  }
  return price;
}

function priceFromRecords(place = {}, override = {}, source = null) {
  const meta = placeMetadata(place);
  const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : null;
  const candidates = [
    override.price,
    place.price,
    place.total_price,
    meta.price,
    metaRecord?.price,
    source?.price,
    source?.totalPrice,
    source?.total_price,
    source?.amount,
    source?.rate,
  ];
  for (const candidate of candidates) {
    const parsed = parsePrice(candidate);
    if (parsed != null) return parsed;
  }
  return priceFromTextFields(place, override, source);
}

function pickLongDetails(place = {}, override = {}, source = null) {
  return firstPresent(
    override.longDetails,
    place.longDetails,
    source?.longDetails,
    source?.details,
  );
}

function explicitLogo(place = {}, override = {}, source = null) {
  return firstPresent(
    override.logoUrl,
    override.iconUrl,
    place.logoUrl,
    place.iconUrl,
    place.image_url,
    source?.logoUrl,
    source?.logo,
    source?.iconUrl,
    source?.favicon,
    source?.faviconUrl,
  );
}

export function applyLiveAppListRowFields(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    dropBlankPriceField(override, 'price');
    dropBlankPriceField(place, 'price');
    const source = sourceObject(
      override.sourceRecord,
      place.sourceRecord,
      override.source,
      place.source,
    );
    const category = productThingCategory(place, override);

    const logoUrl = resolveThingLogoUrl(place, override) || explicitLogo(place, override, source);
    if (logoUrl) {
      override.logoUrl = logoUrl;
      if (!text(place.logoUrl)) place.logoUrl = logoUrl;
    }

    bindTravelListRowPrice(place, override, source, category, next);

    if (category === 'car') {
      copyIfBlank(
        override,
        'rentalCompany',
        source?.rentalCompany,
        source?.vendor,
        source?.company,
        source?.provider,
        rentalCompanyFromTitle(place.name || place.title),
      );
      copyIfBlank(
        override,
        'carType',
        source?.carType,
        source?.vehicleClass,
        source?.model,
        source?.vehicle,
      );
      copyIfBlank(override, 'vehicleClass', source?.vehicleClass, source?.carType, source?.model);
    }

    const longDetails = pickLongDetails(place, override, source);
    if (longDetails) {
      override.longDetails = longDetails;
      if (!text(override.details)) override.details = longDetails;
    }

    if (category === 'flight') {
      place.category_name = place.category_name || 'Flight';
      place.category = place.category && typeof place.category === 'object'
        ? { ...place.category, name: place.category.name || 'Flight' }
        : { name: 'Flight', icon: '✈️' };
      override.category = 'flight';
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
    } else if (category === 'car') {
      override.category = 'car';
      copyIfBlank(override, 'startTime', source?.startTime, source?.pickupTime);
      copyIfBlank(override, 'duration', source?.duration, source?.rentalDuration);
      copyIfBlank(override, 'endTime', source?.endTime, source?.returnTime, source?.dropoffTime);
      if (source?.perDaySchedule && typeof source.perDaySchedule === 'object') {
        override.perDaySchedule = { ...(override.perDaySchedule || {}), ...source.perDaySchedule };
      }
    } else if (category === 'hotel') {
      override.category = 'hotel';
      copyIfBlank(override, 'checkInDate', source?.checkInDate, source?.check_in_date);
      copyIfBlank(override, 'checkOutDate', source?.checkOutDate, source?.check_out_date);
      copyIfBlank(override, 'checkInTime', source?.checkInTime, source?.check_in_time);
      copyIfBlank(override, 'checkOutTime', source?.checkOutTime, source?.check_out_time);
      if (source?.stayDays != null && override.stayDays == null) {
        override.stayDays = source.stayDays;
      }
    }

    if (override.timeline == null && source?.timeline != null) {
      override.timeline = !!source.timeline;
    }

    Object.assign(override, mergeStoredCcabNarrativeIntoOverride(place, override));
    applyGateBCaptureCanonicalPlaceName(place);

    next.thingOverrides[key] = override;
  }
  return syncCatalogFieldsIntoAssignments(next);
}

export function applyLiveAppTimelineSelections(shared = {}, selectedPlaceIds = []) {
  const selected = new Set((selectedPlaceIds || []).map((id) => String(id)));
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
    assignments: shared.assignments && typeof shared.assignments === 'object'
      ? { ...shared.assignments }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    override.timeline = selected.has(String(place.id));
    next.thingOverrides[key] = override;
  }
  return next;
}

export function assignPlaceToTripDays(shared = {}, placeId, dayNumbers = [], extraOverride = {}) {
  const id = String(placeId);
  const place = (shared.places || []).find((row) => String(row.id) === id);
  if (!place) return shared;
  const days = Array.isArray(shared.days) ? shared.days : [];
  const dayByNumber = new Map(days.map((day) => [Number(day.day_number), day]));
  const dayIds = dayNumbers
    .map((num) => dayByNumber.get(Number(num))?.id)
    .filter((value) => value != null)
    .map((value) => Number(value));
  const key = `place:${id}`;
  const assignments = { ...(shared.assignments || {}) };
  const thingOverrides = {
    ...(shared.thingOverrides || {}),
    [key]: { ...(shared.thingOverrides?.[key] || {}), ...extraOverride, dayIds },
  };
  for (const dayNum of dayNumbers) {
    const day = dayByNumber.get(Number(dayNum));
    if (!day) continue;
    const bucket = String(day.id);
    const rows = [...(assignments[bucket] || [])];
    if (rows.some((row) => String(row.place_id) === id)) continue;
    rows.push({
      id: rows.length + 1,
      day_id: day.id,
      order_index: rows.length,
      notes: place.notes || '',
      place_id: place.id,
      place: { ...place },
    });
    assignments[bucket] = rows;
  }
  return { ...shared, assignments, thingOverrides };
}
