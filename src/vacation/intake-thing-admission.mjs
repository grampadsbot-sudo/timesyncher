import { samePlace } from './place-search-same-place.mjs';
import { isCarRentalProviderPlace, placePersistCategory } from './intake-car-category.mjs';

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const CUSTOMER_ORIGINS = new Set(['customer_blurb', 'customer_turn']);
const PROVIDER_ORIGINS = new Set(['provider_search', 'booking']);

const LODGING_DERIVED_TITLE_RE = /^(check[\s-]?in|sleep|wake)\s*:/i;

function normalizeWhitespace(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function customerSpanContainedInTurn(span, turnText) {
  const needle = normalizeWhitespace(span);
  const hay = normalizeWhitespace(turnText);
  if (!needle || !hay) return false;
  return hay.includes(needle);
}

export function intakeProvenanceOrigin(metadata = {}) {
  const bag = metadata && typeof metadata === 'object' ? metadata : {};
  const origin = clean(bag.origin, 80).toLowerCase();
  if (CUSTOMER_ORIGINS.has(origin) || PROVIDER_ORIGINS.has(origin)) return origin;
  const src = clean(bag.source || bag.intakeSource, 80).toLowerCase();
  if (src === 'customer_stated') return 'customer_turn';
  if (src === 'customer-turn') return 'customer_turn';
  if (src === 'long-intake') return 'customer_blurb';
  if (src === 'booking') return 'booking';
  if (['prior_db', 'osm', 'vk-search', 'tavily', 'brave'].includes(src)) return 'provider_search';
  const column = clean(bag.columnSource, 80).toLowerCase();
  if (['prior_db', 'osm', 'vk-search', 'tavily'].includes(column)) return 'provider_search';
  return '';
}

function thingProvenanceRef(metadata = {}) {
  const origin = intakeProvenanceOrigin(metadata);
  return {
    origin,
    customerTurnId: clean(metadata.customerTurnId, 120),
    customerSpan: clean(metadata.customerSpan, 240),
    providerResultId: clean(
      metadata.providerResultId
        || metadata.sourceRecord?.id
        || metadata.sourceRecord?.providerResultId,
      120,
    ),
    bookingId: clean(metadata.bookingId || metadata.sourceRecord?.bookingId, 120),
  };
}

function customerTurnRecordText(turn = {}) {
  if (typeof turn === 'string') return turn;
  return turn?.storedText || turn?.text || '';
}

function customerTurnSpeaker(turn = {}) {
  if (typeof turn === 'string') return 'customer';
  return clean(turn?.speaker || turn?.role, 40).toLowerCase() || 'customer';
}

function validateCustomerProvenance(ref, { customerTurns = {}, tripBlurb = '' } = {}) {
  if (!CUSTOMER_ORIGINS.has(ref.origin)) return { valid: false, reason: 'not_customer_origin' };
  const span = normalizeWhitespace(ref.customerSpan);
  if (!span) return { valid: false, reason: 'missing_customer_span' };
  if (ref.origin === 'customer_blurb') {
    if (tripBlurb && !customerSpanContainedInTurn(span, tripBlurb)) {
      return { valid: false, reason: 'span_not_in_blurb' };
    }
    return { valid: true };
  }
  if (!ref.customerTurnId) return { valid: false, reason: 'missing_customer_turn_id' };
  const rawTurn = customerTurns[ref.customerTurnId];
  if (!rawTurn) {
    return { valid: true, reason: 'turn_context_missing' };
  }
  if (customerTurnSpeaker(rawTurn) !== 'customer') {
    return { valid: false, reason: 'assistant_turn_ref' };
  }
  const turnText = customerTurnRecordText(rawTurn);
  if (!customerSpanContainedInTurn(span, turnText)) {
    return { valid: false, reason: 'span_not_in_turn' };
  }
  return { valid: true };
}

function validateProviderProvenance(ref) {
  if (ref.origin === 'provider_search') {
    if (!ref.providerResultId) return { valid: false, reason: 'missing_provider_result_id' };
    return { valid: true };
  }
  if (ref.origin === 'booking') {
    if (!ref.bookingId) return { valid: false, reason: 'missing_booking_id' };
    return { valid: true };
  }
  return { valid: false, reason: 'invalid_provider_origin' };
}

export function isCustomerIntakeProvenance(metadata = {}) {
  return CUSTOMER_ORIGINS.has(intakeProvenanceOrigin(metadata));
}

export function tripThingHasAdmissibleProvenance(row = {}, context = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const ref = thingProvenanceRef({ ...meta, columnSource: row?.source });
  const origin = ref.origin;
  if (!origin) return false;
  if (CUSTOMER_ORIGINS.has(origin)) return validateCustomerProvenance(ref, context).valid;
  return validateProviderProvenance(ref).valid;
}

export function provenanceDedupeKey(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const ref = thingProvenanceRef(meta);
  if (CUSTOMER_ORIGINS.has(ref.origin)) {
    const turnPart = ref.origin === 'customer_blurb' ? 'blurb' : ref.customerTurnId;
    const span = normalizeWhitespace(ref.customerSpan).toLowerCase();
    if (!span) return '';
    return `cust:${turnPart}:${span}`;
  }
  if (ref.origin === 'provider_search' && ref.providerResultId) return `prov:${ref.providerResultId}`;
  if (ref.origin === 'booking' && ref.bookingId) return `book:${ref.bookingId}`;
  return '';
}

function rowProviderPoint(row = {}) {
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  return {
    title: clean(row?.title, 240),
    lat: loc.lat,
    lng: loc.lng,
  };
}

function sameProviderIdentity(resolvedPlace = {}, row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const ref = thingProvenanceRef(meta);
  const leftId = clean(
    resolvedPlace?.providerResultId || resolvedPlace?.id || resolvedPlace?.sourceRecord?.id,
    120,
  );
  if (leftId && ref.providerResultId && leftId === ref.providerResultId) return true;
  const candidate = {
    title: clean(resolvedPlace?.title, 240),
    lat: resolvedPlace?.lat,
    lng: resolvedPlace?.lng,
  };
  return samePlace(candidate, rowProviderPoint(row));
}

export function findStructuralDuplicate(existingRows = [], { metadata = {}, resolvedPlace = null, title = '' } = {}) {
  const existingThingId = clean(metadata?.existingThingId, 120);
  if (existingThingId) {
    const hit = existingRows.find((row) => String(row.id) === existingThingId);
    if (hit) return hit;
  }
  const key = provenanceDedupeKey({ metadata });
  if (key) {
    for (const row of existingRows) {
      if (provenanceDedupeKey(row) === key) return row;
    }
  }
  if (resolvedPlace) {
    for (const row of existingRows) {
      if (sameProviderIdentity(resolvedPlace, row)) return row;
    }
  }
  const name = clean(title, 240);
  const cat = clean(metadata?.category, 80).toLowerCase();
  if (cat === 'hotel' && name) {
    for (const row of existingRows) {
      if (clean(row?.category, 80).toLowerCase() !== 'hotel') continue;
      if (samePlace({ title: name, lat: null, lng: null }, rowProviderPoint(row))) return row;
    }
  }
  return null;
}

export function intakeWriteRejected(title = '', metadata = {}, provenanceContext = {}) {
  const text = clean(title, 240);
  if (!text) return 'empty_title';
  const ref = thingProvenanceRef(metadata);
  if (!ref.origin) return 'invalid_provenance';
  if (CUSTOMER_ORIGINS.has(ref.origin)) {
    const verdict = validateCustomerProvenance(ref, provenanceContext);
    if (!verdict.valid) return verdict.reason;
  } else {
    const verdict = validateProviderProvenance(ref);
    if (!verdict.valid) return verdict.reason;
  }
  return '';
}

function categoryFromProviderPlace(resolvedPlace = {}, fallback = 'activity') {
  if (!resolvedPlace) return clean(fallback, 80).toLowerCase() || 'activity';
  const fromProvider = placePersistCategory(resolvedPlace);
  return clean(fromProvider || fallback, 80).toLowerCase() || 'activity';
}

function carHasProviderOrBookingProvenance(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const ref = thingProvenanceRef(meta);
  if (ref.origin === 'booking' && ref.bookingId) return true;
  if (ref.origin === 'provider_search' && ref.providerResultId) return true;
  const record = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  return isCarRentalProviderPlace({
    title: row?.title,
    sourceRecord: record,
    providerCategories: meta.providerCategories,
    osmTags: meta.osmTags,
  });
}

function flightHasBookingProvenance(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const ref = thingProvenanceRef(meta);
  return ref.origin === 'booking' && Boolean(ref.bookingId);
}

function flightHasCustomerPlaceholderProvenance(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return CUSTOMER_ORIGINS.has(intakeProvenanceOrigin(meta));
}

function providerTypeContradictsCategory(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const providerCategory = clean(meta.providerCategory || meta.sourceRecord?.category, 80).toLowerCase();
  const rowCategory = clean(row?.category, 80).toLowerCase();
  if (!providerCategory || !rowCategory) return false;
  if (providerCategory === rowCategory) return false;
  if (rowCategory === 'family_event' && providerCategory === 'activity') return false;
  return true;
}

export function thingRowFilled(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.needsDetails === true) return false;
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  const ref = thingProvenanceRef(meta);
  if (ref.origin === 'provider_search' && ref.providerResultId) return true;
  if (ref.origin === 'booking' && ref.bookingId) return true;
  return false;
}

export function evaluateIntakePreSearch({
  title = '',
  category = 'activity',
  description = '',
  metadata = {},
  existingRows = [],
  provenanceContext = {},
} = {}) {
  const name = clean(title, 240);
  if (!name) return { admit: false, reason: 'empty_title' };

  const reject = intakeWriteRejected(name, metadata, provenanceContext);
  if (reject) return { admit: false, reason: reject };

  const mergeRow = findStructuralDuplicate(existingRows, { metadata, title: name });
  if (mergeRow) {
    return {
      admit: false,
      reason: 'merge_duplicate',
      mergeIntoId: String(mergeRow.id || ''),
      mergeRow,
      adjustedCategory: clean(category, 80).toLowerCase() || 'activity',
    };
  }

  const adjustedCategory = clean(category, 80).toLowerCase() || 'activity';
  return { admit: true, reason: 'search_pending', adjustedCategory, description };
}

export function evaluateIntakeAdmission({
  title = '',
  category = 'activity',
  description = '',
  metadata = {},
  resolvedPlace = null,
  existingRows = [],
  provenanceContext = {},
} = {}) {
  const name = clean(title, 240);
  if (!name) return { admit: false, reason: 'empty_title' };

  const reject = intakeWriteRejected(name, metadata, provenanceContext);
  if (reject) return { admit: false, reason: reject };

  let adjustedCategory = clean(category, 80).toLowerCase() || 'activity';
  if (resolvedPlace) adjustedCategory = categoryFromProviderPlace(resolvedPlace, adjustedCategory);

  const mergeRow = findStructuralDuplicate(existingRows, { metadata, resolvedPlace, title: name });
  if (mergeRow) {
    return {
      admit: false,
      reason: 'merge_duplicate',
      mergeIntoId: String(mergeRow.id || ''),
      mergeRow,
      adjustedCategory,
    };
  }

  if (!resolvedPlace && !isCustomerIntakeProvenance(metadata)) {
    return { admit: false, reason: 'unresolved_requires_customer_provenance' };
  }

  return { admit: true, reason: resolvedPlace ? 'resolved_place' : 'customer_placeholder', adjustedCategory, description };
}

export async function recordChatIntakeSearchMiss(db, tripId, { title, category, reason }) {
  if (!db || !tripId || !title) return;
  const row = { title: clean(title, 240), category: clean(category, 80), reason: clean(reason, 120), at: new Date().toISOString() };
  try {
    await db`
      update trips
      set metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{intakePlaceSearchMisses}',
        coalesce(metadata->'intakePlaceSearchMisses', '[]'::jsonb) || ${JSON.stringify([row])}::jsonb,
        true
      ),
      updated_at = now()
      where id = ${tripId}::uuid
    `;
  } catch (error) {
    console.error(`chat intake search miss record failed: ${String(error?.message || error)}`);
  }
}

export function tripItineraryTitleRejected(title = '', provenanceContext = {}) {
  const text = clean(title, 240);
  if (!text) return true;
  if (LODGING_DERIVED_TITLE_RE.test(text)) return false;
  const customerTexts = Object.values(provenanceContext.customerTurns || {})
    .filter((turn) => customerTurnSpeaker(turn) === 'customer')
    .map(customerTurnRecordText);
  if (provenanceContext.tripBlurb) customerTexts.push(provenanceContext.tripBlurb);
  if (!customerTexts.length) return false;
  return !customerTexts.some((turnText) => customerSpanContainedInTurn(text, turnText));
}

function lodgingTimelineViolationCounts(things = [], { nights = 0 } = {}) {
  const hotels = things.filter((row) => clean(row?.category, 80).toLowerCase() === 'hotel');
  if (!hotels.length) return null;
  if (hotels.length !== 1) return { hotels: hotels.length };
  const stayTitle = clean(hotels[0]?.title, 240);
  const checkIns = things.filter((row) => /^check[\s-]?in:/i.test(clean(row?.title, 240)));
  const sleeps = things.filter((row) => /^sleep:/i.test(clean(row?.title, 240)));
  const wakes = things.filter((row) => /^wake:/i.test(clean(row?.title, 240)));
  const violations = [];
  if (checkIns.length > 1) violations.push('multiple_check_in');
  if (nights > 0 && sleeps.length > nights) violations.push('multiple_sleep');
  if (nights > 0 && wakes.length > nights) violations.push('multiple_wake');
  if (stayTitle && checkIns.some((row) => !clean(row?.title, 240).includes(stayTitle))) {
    violations.push('check_in_stay_mismatch');
  }
  return violations.length ? { stayTitle, violations } : null;
}

export function tripThingGateViolations(things = [], {
  itineraryTitles = [],
  provenanceContext = {},
  nights = 0,
} = {}) {
  const violations = [];
  const rows = Array.isArray(things) ? things : [];

  for (const raw of itineraryTitles) {
    const title = clean(raw, 240);
    if (title && tripItineraryTitleRejected(title, provenanceContext)) {
      violations.push({ code: 'defect_f_itinerary_unverified', title });
    }
  }

  const dedupeKeys = new Map();
  for (const row of rows) {
    const title = clean(row?.title, 240);
    if (!title) violations.push({ code: 'empty_title', id: row?.id });

    if (!tripThingHasAdmissibleProvenance(row, provenanceContext)) {
      violations.push({ code: 'invalid_provenance', title, id: row?.id });
    }

    const key = provenanceDedupeKey(row);
    if (key) {
      if (dedupeKeys.has(key)) {
        violations.push({
          code: 'duplicate_provenance_ref',
          title,
          id: row?.id,
          otherId: dedupeKeys.get(key),
        });
      } else {
        dedupeKeys.set(key, row?.id);
      }
    }

    const category = clean(row?.category, 80).toLowerCase();
    if (category === 'car' && !carHasProviderOrBookingProvenance(row)) {
      violations.push({ code: 'defect_i_car_without_provider', title, id: row?.id });
    }

    if (category === 'flight' && !flightHasBookingProvenance(row) && !flightHasCustomerPlaceholderProvenance(row)) {
      violations.push({ code: 'defect_j_flight_without_provenance', title, id: row?.id });
    }

    if (providerTypeContradictsCategory(row)) {
      violations.push({ code: 'provider_category_mismatch', title, id: row?.id });
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      if (sameProviderIdentity(
        {
          title: left?.title,
          lat: left?.location?.lat,
          lng: left?.location?.lng,
          providerResultId: thingProvenanceRef(left?.metadata || {}).providerResultId,
        },
        right,
      )) {
        violations.push({
          code: 'defect_a_duplicate_provider',
          title: clean(left?.title, 240),
          other: clean(right?.title, 240),
          id: left?.id,
          otherId: right?.id,
        });
      }
    }
  }

  const lodgingViolation = lodgingTimelineViolationCounts(rows, { nights });
  if (lodgingViolation) {
    violations.push({ code: 'defect_a_lodging_timeline', ...lodgingViolation });
  }

  return violations;
}

export function tripThingsRealGatePasses(things = [], options = {}) {
  return tripThingGateViolations(things, options).length === 0;
}