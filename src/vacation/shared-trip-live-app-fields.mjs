import { mergeStoredCcabNarrativeIntoOverride } from './stored-ccab-narrative-merge.mjs';
import { productThingCategory } from './keepsake-product-overrides.mjs';

const EXPERIENCE_CATEGORIES = new Set([
  'activity',
  'event',
  'attraction',
  'music',
  'tour',
  'sightseeing',
  'theatre',
  'tickets',
  'family_event',
  'other',
]);
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

function placeMetadata(place = {}) {
  return place.metadata && typeof place.metadata === 'object' && !Array.isArray(place.metadata)
    ? place.metadata
    : {};
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
    const source = sourceObject(
      override.sourceRecord,
      place.sourceRecord,
      placeMetadata(place).sourceRecord,
      override.source,
      place.source,
    );
    const category = productThingCategory(place, override);

    const logoUrl = resolveThingLogoUrl(place, override) || explicitLogo(place, override, source);
    if (logoUrl) {
      override.logoUrl = logoUrl;
      if (!text(place.logoUrl)) place.logoUrl = logoUrl;
    }

    const price = priceFromRecords(place, override, source);
    if (price != null) {
      override.price = price;
      if (place.price == null || place.price === '') place.price = price;
    }

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
      copyIfBlank(override, 'pickupLocation', source?.pickupLocation, source?.pickup_location, place.address);
      copyIfBlank(override, 'returnLocation', source?.returnLocation, source?.return_location, source?.dropoffLocation);
      copyIfBlank(override, 'pickupHours', source?.pickupHours, source?.pickup_hours);
      copyIfBlank(override, 'dropoffHours', source?.dropoffHours, source?.dropoff_hours, source?.returnHours);
      copyIfBlank(override, 'reputationNote', source?.reputationNote, source?.reputation_note);
      if (Array.isArray(source?.reviewThemes) && !Array.isArray(override.reviewThemes)) {
        override.reviewThemes = source.reviewThemes;
      }
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
      copyIfBlank(override, 'hotelNote', source?.hotelNote, source?.hotel_note);
      copyIfBlank(override, 'websiteFlavour', source?.websiteFlavour);
      copyIfBlank(override, 'amenities', source?.amenities);
      copyIfBlank(override, 'priceLevel', source?.priceLevel);
      if (source?.reviewThemes && !override.reviewThemes) {
        override.reviewThemes = source.reviewThemes;
      }
      copyIfBlank(
        override,
        'address',
        source?.address,
        place.address,
        place.metadata?.address,
      );
      copyIfBlank(
        override,
        'neighborhood',
        source?.neighborhood,
        place.neighborhood,
        place.metadata?.neighborhood,
      );
      copyIfBlank(override, 'googleRating', source?.googleRating, source?.google_rating);
      copyIfBlank(override, 'googleReviewCount', source?.googleReviewCount, source?.google_review_count);
      copyIfBlank(override, 'yelpRating', source?.yelpRating, source?.yelp_rating);
      copyIfBlank(override, 'yelpReviewCount', source?.yelpReviewCount, source?.yelp_review_count);
      copyIfBlank(override, 'thirdPartyRating', source?.thirdPartyRating, source?.third_party_rating);
      copyIfBlank(override, 'thirdPartyReviewCount', source?.thirdPartyReviewCount, source?.third_party_review_count);
      copyIfBlank(override, 'thirdPartySource', source?.thirdPartySource, source?.third_party_source);
      if (source?.stayDays != null && override.stayDays == null) {
        override.stayDays = source.stayDays;
      }
    } else if (EXPERIENCE_CATEGORIES.has(category)) {
      if (category) override.category = category;
      copyIfBlank(override, 'startTime', source?.startTime, source?.start_time, place.place_time);
      copyIfBlank(override, 'duration', source?.duration);
      copyIfBlank(override, 'itineraryNote', source?.itineraryNote, source?.itinerary_note);
      copyIfBlank(override, 'description', source?.description, place.description);
      copyIfBlank(override, 'longDetails', source?.longDetails, source?.description, place.description);
      copyIfBlank(override, 'websiteFlavour', source?.websiteFlavour);
      copyIfBlank(override, 'worthNote', source?.worthNote, source?.worth_note);
      copyIfBlank(
        override,
        'address',
        source?.address,
        place.address,
        place.metadata?.address,
      );
      copyIfBlank(override, 'thirdPartyRating', source?.thirdPartyRating, source?.third_party_rating);
      copyIfBlank(override, 'thirdPartyReviewCount', source?.thirdPartyReviewCount, source?.third_party_review_count);
      copyIfBlank(override, 'thirdPartySource', source?.thirdPartySource, source?.third_party_source);
      if (source?.reviewThemes && !override.reviewThemes) {
        override.reviewThemes = source.reviewThemes;
      }
    }

    if (override.timeline == null && source?.timeline != null) {
      override.timeline = !!source.timeline;
    }

    const meta = placeMetadata(place);
    if (!text(place.externalId)) {
      const externalId = firstPresent(override.externalId, meta.externalId);
      if (externalId) place.externalId = externalId;
    }
    if (!text(override.externalId) && text(place.externalId)) {
      override.externalId = place.externalId;
    }
    const metaSourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object'
      ? meta.sourceRecord
      : null;
    if (metaSourceRecord) {
      if (!place.sourceRecord || typeof place.sourceRecord !== 'object') {
        place.sourceRecord = { ...metaSourceRecord };
      }
      const mergedSourceRecord = override.sourceRecord && typeof override.sourceRecord === 'object'
        ? { ...metaSourceRecord, ...override.sourceRecord }
        : { ...metaSourceRecord };
      if (override.sourceRecord?.identityProvenance) {
        mergedSourceRecord.identityProvenance = override.sourceRecord.identityProvenance;
      }
      override.sourceRecord = mergedSourceRecord;
    }

    Object.assign(override, mergeStoredCcabNarrativeIntoOverride(place, override));

    next.thingOverrides[key] = override;
  }
  return next;
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
