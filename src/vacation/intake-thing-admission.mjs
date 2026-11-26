import { intakeThingHasProperName } from './intake-thing-name.mjs';
import { samePlace, distanceMeters } from './place-search-same-place.mjs';
import { isCarRentalProviderPlace } from './intake-car-category.mjs';

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeKey(title = '') {
  return clean(title, 240)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lodgingStem(title = '') {
  return normalizeKey(title)
    .replace(/\b(hotel|resort|inn|lodge|motel|stay|accommodation|the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RENTAL_BRANDS = [
  'enterprise', 'hertz', 'avis', 'budget', 'national', 'alamo', 'dollar', 'thrifty', 'sixt', 'europcar',
  'fox rent a car', 'payless', 'advantage', 'ace rent', 'zipcar', 'turo',
];

const AIRLINE_NAMES = [
  'american airlines', 'american', 'delta', 'southwest', 'united', 'jetblue', 'alaska', 'spirit', 'frontier',
  'allegiant', 'hawaiian', 'sun country', 'breeze',
];

const PHRASE_DENY_RES = [
  /\boptions?\b/i,
  /\bor\b.*\b(flight|departure|return|southwest|delta|airline)\b/i,
  /\bearly\s+(departure|afternoon|morning)\b/i,
  /\bsimple\s+snack\b/i,
  /\bafter\s+morning\s+snack\b/i,
  /\brides?\s+between\b/i,
  /\bfamily\s+hotel\s+or\s+resort\b/i,
  /\bsettle[\s-]?in\s+with\s+the\s+pool\b/i,
  /\bnothing\s+has\s+been\b/i,
  /\band\s+nothing\s+has\s+been\b/i,
  /\bhas\s+not\s+been\s+booked\b/i,
  /\bflight\s+options?\b/i,
  /\breturn\s+flight\s+option\b/i,
  /\bdeparture\s+flight\s+option\b/i,
  /\bhotel\s+or\s+resort\b/i,
  /\bpreferences?\b/i,
  /\bcandidate\s+only\b/i,
  /\bnot\s+booked\b/i,
  /^(wake|sleep|check[\s-]?in|check[\s-]?out):\s/i,
];

const FAMILY_EVENT_RES = [
  /\bparade\b/i,
  /\bcharacter\s+meal\b/i,
  /\bfireworks\b/i,
  /\bshow\b/i,
  /\bspectacular\b/i,
  /\bcavalcade\b/i,
];

const SENTENCE_TAIL_RE = /[.!?]\s*$/;
const STATUS_ONLY_RE = /^(nothing|no|not)\b/i;

const CUSTOMER_ORIGINS = new Set(['customer_blurb', 'customer_turn']);
const PROVIDER_ORIGINS = new Set(['provider_search', 'booking']);

export function intakeProvenanceOrigin(metadata = {}) {
  const bag = metadata && typeof metadata === 'object' ? metadata : {};
  const origin = clean(bag.origin, 80).toLowerCase();
  if (CUSTOMER_ORIGINS.has(origin) || PROVIDER_ORIGINS.has(origin)) return origin;
  const src = clean(bag.source || bag.intakeSource, 80).toLowerCase();
  if (src === 'customer_stated') return 'customer_turn';
  if (src === 'customer-turn') return 'customer_turn';
  if (src === 'chat_extraction') return 'customer_turn';
  if (src === 'long-intake') return 'customer_blurb';
  if (['prior_db', 'osm', 'vk-search', 'tavily', 'brave'].includes(src)) return 'provider_search';
  if (src === 'booking') return 'booking';
  const column = clean(bag.columnSource, 80).toLowerCase();
  if (['prior_db', 'osm', 'vk-search', 'tavily'].includes(column)) return 'provider_search';
  return '';
}

export function isCustomerIntakeProvenance(metadata = {}) {
  return CUSTOMER_ORIGINS.has(intakeProvenanceOrigin(metadata));
}

export function tripThingHasAdmissibleProvenance(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const origin = intakeProvenanceOrigin({ ...meta, columnSource: row?.source });
  if (origin) return true;
  const src = String(row?.source || '').toLowerCase();
  return ['prior_db', 'osm', 'vk-search', 'tavily', 'customer_stated'].includes(src);
}

export function intakePhraseDenied(title = '', { skipProperName = false } = {}) {
  const text = clean(title, 240);
  if (!text) return 'empty_title';
  if (SENTENCE_TAIL_RE.test(text) && text.split(/\s+/).length >= 4) return 'assistant_sentence';
  if (STATUS_ONLY_RE.test(text) && /\b(booked|emailed|sent|confirmed|reserved)\b/i.test(text)) return 'status_sentence';
  for (const re of PHRASE_DENY_RES) {
    if (re.test(text)) return `phrase_deny:${re.source.slice(0, 40)}`;
  }
  if (!skipProperName && !intakeThingHasProperName(text)) return 'not_proper_name';
  const words = text.split(/\s+/);
  if (words.length > 12) return 'composed_phrase';
  return '';
}

export function intakeCategoryForTitle(title = '', proposed = 'activity') {
  const category = clean(proposed, 80).toLowerCase() || 'activity';
  const text = clean(title, 240);
  if (FAMILY_EVENT_RES.some((re) => re.test(text))) return 'family_event';
  if (/\b(parade|fireworks|character meal)\b/i.test(text) && category === 'restaurant') return 'family_event';
  return category;
}

export function carTitleNamesRentalBrand(title = '') {
  const key = normalizeKey(title);
  if (!key) return false;
  return RENTAL_BRANDS.some((brand) => key.includes(brand));
}

function flightTitleIsBareAirlineName(title = '') {
  const text = clean(title, 240);
  if (!text || text.split(/\s+/).length !== 1) return false;
  const key = normalizeKey(text);
  return AIRLINE_NAMES.includes(key);
}

export function flightTitleHasRealFlight(title = '', metadata = {}, description = '') {
  const blob = `${title} ${description} ${JSON.stringify(metadata?.sourceRecord || {})}`.trim();
  if (/\b[A-Z]{2}\s*\d{1,4}\b/.test(blob)) return true;
  if (/\b(flight\s+)?\d{1,4}\b/.test(blob) && AIRLINE_NAMES.some((a) => blob.toLowerCase().includes(a))) return false;
  if (/\b\d{1,2}:\d{2}\b/.test(blob) && AIRLINE_NAMES.some((a) => blob.toLowerCase().includes(a))) return true;
  const airline = clean(metadata?.airline || metadata?.sourceRecord?.airline, 80);
  const flightNumber = clean(metadata?.flightNumber || metadata?.sourceRecord?.flightNumber, 40);
  if (airline && flightNumber) return true;
  const dep = clean(metadata?.departureTime || metadata?.sourceRecord?.departure, 40);
  const arr = clean(metadata?.arrivalTime || metadata?.sourceRecord?.arrival, 40);
  if (airline && dep && arr) return true;
  const routeOnly = normalizeKey(title);
  if (AIRLINE_NAMES.includes(routeOnly)) return false;
  if (/\boptions?\b/i.test(title)) return false;
  if (/\bor\b/i.test(title) && /\b(flight|airline|southwest|delta)\b/i.test(title)) return false;
  if (/\bflight\s+options?\b/i.test(title)) return false;
  if (/^flight options\b/i.test(title)) return false;
  return false;
}

export function nearDuplicateTitle(left = '', right = '') {
  const a = normalizeKey(left);
  const b = normalizeKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (long.startsWith(short) && long.length - short.length <= 24) return true;
  const tokensA = a.split(/\s+/).filter(Boolean);
  const tokensB = b.split(/\s+/).filter(Boolean);
  const smallTokens = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const bigTokens = tokensA.length <= tokensB.length ? tokensB : tokensA;
  if (smallTokens.length >= 2 && smallTokens.every((token) => bigTokens.includes(token)) && bigTokens.length - smallTokens.length <= 4) {
    return true;
  }
  const stemA = lodgingStem(left);
  const stemB = lodgingStem(right);
  if (stemA && stemA === stemB && stemA.length >= 6) return true;
  return false;
}

export function thingRowFilled(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.needsDetails === true) return false;
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const category = clean(row?.category, 80).toLowerCase();
  if (category === 'flight') {
    return flightTitleHasRealFlight(row?.title, meta, row?.description || '');
  }
  if (category === 'car') {
    return carTitleNamesRentalBrand(row?.title) || isCarRentalProviderPlace({ title: row?.title, sourceRecord: meta.sourceRecord, providerCategories: meta.providerCategories });
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  if (['prior_db', 'osm', 'vk-search', 'tavily'].includes(String(row?.source || '').toLowerCase())) return true;
  return false;
}

export function evaluateIntakeAdmission({
  title = '',
  category = 'activity',
  description = '',
  metadata = {},
  resolvedPlace = null,
  existingRows = [],
} = {}) {
  const name = clean(title, 240);
  if (!name) return { admit: false, reason: 'empty_title' };

  const customerSaid = isCustomerIntakeProvenance(metadata);
  const phraseReason = intakePhraseDenied(name, {
    skipProperName: customerSaid || Boolean(resolvedPlace),
  });
  if (phraseReason) return { admit: false, reason: phraseReason };

  let adjustedCategory = intakeCategoryForTitle(name, category);

  if (adjustedCategory === 'restaurant' && FAMILY_EVENT_RES.some((re) => re.test(name))) {
    adjustedCategory = 'family_event';
  }

  if (adjustedCategory === 'car' && !carTitleNamesRentalBrand(name) && !customerSaid) {
    if (!resolvedPlace || !isCarRentalProviderPlace(resolvedPlace)) {
      return { admit: false, reason: 'car_not_rental_brand' };
    }
  }

  if (adjustedCategory === 'flight' && !flightTitleHasRealFlight(name, metadata, description)) {
    const src = clean(metadata?.source || metadata?.intakeSource, 80).toLowerCase();
    if (flightTitleIsBareAirlineName(name) && src === 'chat_extraction') {
      return { admit: false, reason: 'defect_j_bare_airline' };
    }
    if (!customerSaid && !resolvedPlace) return { admit: false, reason: 'flight_not_booked' };
  }

  const candidate = resolvedPlace
    ? { title: clean(resolvedPlace?.title || name, 240), lat: resolvedPlace?.lat, lng: resolvedPlace?.lng }
  : { title: name, lat: null, lng: null };

  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    const rowCat = clean(row?.category, 80).toLowerCase();
    if (rowCat && adjustedCategory && rowCat !== adjustedCategory && rowCat !== 'family_event' && adjustedCategory !== 'family_event') {
      if (!(rowCat === 'activity' || adjustedCategory === 'activity')) continue;
    }
    const rowTitle = clean(row?.title, 240);
    const loc = row?.location && typeof row.location === 'object' ? row.location : {};
    const rowPoint = { title: rowTitle, lat: loc.lat, lng: loc.lng };
    if (samePlace(candidate, rowPoint) || nearDuplicateTitle(name, rowTitle)) {
      return { admit: false, reason: 'merge_duplicate', mergeIntoId: String(row.id || ''), mergeRow: row, adjustedCategory };
    }
  }

  if (!resolvedPlace) {
    if (isCustomerIntakeProvenance(metadata)) {
      return { admit: true, reason: 'customer_placeholder', adjustedCategory };
    }
    return { admit: false, reason: 'unresolved_requires_search' };
  }

  return { admit: true, reason: 'resolved_place', adjustedCategory };
}

export function evaluateIntakePreSearch({
  title = '',
  category = 'activity',
  description = '',
  metadata = {},
  existingRows = [],
} = {}) {
  const name = clean(title, 240);
  if (!name) return { admit: false, reason: 'empty_title' };
  const phraseReason = intakePhraseDenied(name, { skipProperName: true });
  if (phraseReason) return { admit: false, reason: phraseReason };
  const adjustedCategory = intakeCategoryForTitle(name, category);
  const customerSaid = isCustomerIntakeProvenance(metadata);
  if (adjustedCategory === 'car' && !carTitleNamesRentalBrand(name)) {
    if (!customerSaid) return { admit: false, reason: 'car_not_rental_brand' };
  }
  if (adjustedCategory === 'flight' && !flightTitleHasRealFlight(name, metadata, description)) {
    const src = clean(metadata?.source || metadata?.intakeSource, 80).toLowerCase();
    if (flightTitleIsBareAirlineName(name) && src === 'chat_extraction') {
      return { admit: false, reason: 'defect_j_bare_airline' };
    }
    if (!customerSaid) return { admit: false, reason: 'flight_not_booked' };
  }
  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    if (nearDuplicateTitle(name, row?.title)) {
      return { admit: false, reason: 'merge_duplicate', mergeIntoId: String(row.id || ''), mergeRow: row, adjustedCategory };
    }
    const loc = row?.location && typeof row.location === 'object' ? row.location : {};
    if (Number.isFinite(Number(loc.lat)) && lodgingStem(name) && lodgingStem(name) === lodgingStem(row?.title)) {
      return { admit: false, reason: 'merge_duplicate', mergeIntoId: String(row.id || ''), mergeRow: row, adjustedCategory };
    }
  }
  return { admit: true, reason: 'search_pending', adjustedCategory };
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

export function tripItineraryTitleRejected(title = '') {
  return Boolean(intakePhraseDenied(title));
}

function thingCategoryKind(row = {}) {
  return intakeCategoryForTitle(row?.title, row?.category || 'activity');
}

export function tripThingGateViolations(things = [], { itineraryTitles = [] } = {}) {
  const violations = [];
  const rows = Array.isArray(things) ? things : [];
  for (const raw of itineraryTitles) {
    const title = clean(raw, 240);
    if (title && intakePhraseDenied(title)) violations.push({ code: 'defect_f_itinerary_phrase', title });
  }
  for (const row of rows) {
    const title = clean(row?.title, 240);
    const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const phraseReason = intakePhraseDenied(title);
    if (phraseReason) {
      violations.push({ code: 'composed_or_assistant_phrase', title, id: row?.id, reason: phraseReason });
      continue;
    }
    if (!tripThingHasAdmissibleProvenance(row)) {
      violations.push({ code: 'missing_provenance', title, id: row?.id });
    }
    const kind = thingCategoryKind(row);
    if (kind === 'restaurant' && FAMILY_EVENT_RES.some((re) => re.test(title))) {
      violations.push({ code: 'defect_g_wrong_category', title, id: row?.id, expected: 'family_event' });
    }
    if (kind === 'car' && !carTitleNamesRentalBrand(title)) {
      const record = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
      if (!isCarRentalProviderPlace({ title, sourceRecord: record, providerCategories: meta.providerCategories })) {
        violations.push({ code: 'defect_i_car_phrase', title, id: row?.id });
      }
    }
    if (kind === 'flight' && !flightTitleHasRealFlight(title, meta, row?.description || '')) {
      const src = clean(meta?.source || meta?.intakeSource || row?.source, 80).toLowerCase();
      if (flightTitleIsBareAirlineName(title) && src === 'chat_extraction') {
        violations.push({ code: 'defect_j_flight_phrase', title, id: row?.id, reason: 'bare_airline_extraction' });
      } else if (!isCustomerIntakeProvenance(meta)) {
        violations.push({ code: 'defect_j_flight_phrase', title, id: row?.id });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      const leftKind = thingCategoryKind(left);
      const rightKind = thingCategoryKind(right);
      if (leftKind !== rightKind && !(leftKind === 'family_event' || rightKind === 'family_event')) continue;
      if (nearDuplicateTitle(left?.title, right?.title)) {
        violations.push({
          code: 'defect_a_duplicate',
          title: clean(left?.title, 240),
          other: clean(right?.title, 240),
          id: left?.id,
          otherId: right?.id,
        });
      }
    }
  }
  return violations;
}

export function tripThingsRealGatePasses(things = [], options = {}) {
  return tripThingGateViolations(things, options).length === 0;
}

export { normalizeKey, lodgingStem };