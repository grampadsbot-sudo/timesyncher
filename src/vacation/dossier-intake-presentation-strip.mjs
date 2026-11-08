function text(value, max = 12000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function words(value = '') {
  return text(value).split(/\s+/).filter(Boolean).length;
}

const INTAKE_PRICE_FLOOR_RE =
  /\s*;?\s*Price:\s*\$[\d,]+(?:\s+(?:[\w'’/-]+\s*){0,12})?floor(?:\s+from[^;.]*)?\s*\.?\s*;?/gi;
const INTAKE_STATUS_SUFFIX_RE = /\s*;?\s*Status:\s*candidate only\.?\s*$/i;
const INTAKE_SUMMARY_PRICE_TAIL_RE = /\s*;\s*Price:\s*\$[\d,]+[^.]*\bfloor\.?\s*$/i;
const INTAKE_PRICE_FLOOR_ANYWHERE_RE = /\bPrice:\s*\$[\d,]+[^;]{0,96}\bfloor\b/i;
const INTAKE_STATUS_CANDIDATE_RE = /\bStatus:\s*candidate only\b/i;
const INTAKE_FLIGHT_OPTION_LEDGER_RE = /^\s*Flight option:\s*.+/i;
const INTAKE_DOCUMENTED_OPTION_RE = /\bDocumented\b[^.;]{0,160}\boption\b/i;

const PRESENTATION_SOURCE_FIELDS = [
  'summary',
  'description',
  'longDetails',
  'details',
  'itineraryNote',
];

export function isStructuredFlightNarrative(value = '') {
  const row = text(value);
  if (!row) return false;
  return /\bAirline:\s*\S/i.test(row) && /\bRoute:\s*\S/i.test(row);
}

export function isPreservedEvidenceNarrative(value = '') {
  const row = text(value);
  if (!row) return false;
  if (isStructuredFlightNarrative(row)) return true;
  if (/\b(?:Airline:|Route:)\b/.test(row) && /\battempts?\b/i.test(row)) return true;
  return false;
}

function stripStructuredFlightStatus(row = '') {
  return text(
    String(row || '')
      .replace(INTAKE_STATUS_SUFFIX_RE, '')
      .replace(/\s*;?\s*Status:\s*candidate only\s*;?/gi, '; ')
      .replace(/;\s*;/g, ';')
      .replace(/\s+;/g, ';'),
  );
}

export function stripIntakePresentationFragments(value = '', { category = '' } = {}) {
  let row = text(value);
  if (!row) return '';
  const cat = String(category || placeCategoryFromRow(row, category)).toLowerCase();
  if (cat === 'flight' || isStructuredFlightNarrative(row)) {
    return stripStructuredFlightStatus(row);
  }
  row = row.replace(INTAKE_PRICE_FLOOR_RE, ' ');
  row = row.replace(INTAKE_STATUS_SUFFIX_RE, '');
  row = row.replace(INTAKE_SUMMARY_PRICE_TAIL_RE, '');
  return text(row.replace(/\s+\.\s*$/g, '').replace(/[;]\s*$/g, ''));
}

function placeCategoryFromRow(row, category) {
  if (category) return category;
  if (isStructuredFlightNarrative(row)) return 'flight';
  return '';
}

export function intakePresentationStubMatch(value = '', { category = '' } = {}) {
  const row = text(value);
  if (!row) return null;
  if (isPreservedEvidenceNarrative(row)) return null;
  if (isStructuredFlightNarrative(row)) return null;

  if (INTAKE_FLIGHT_OPTION_LEDGER_RE.test(row) && (INTAKE_STATUS_CANDIDATE_RE.test(row) || INTAKE_PRICE_FLOOR_ANYWHERE_RE.test(row))) {
    return { reason: 'flight_option_intake_ledger', excerpt: row.slice(0, 160) };
  }
  if (INTAKE_DOCUMENTED_OPTION_RE.test(row) && (INTAKE_STATUS_CANDIDATE_RE.test(row) || INTAKE_PRICE_FLOOR_ANYWHERE_RE.test(row))) {
    return { reason: 'documented_option_intake', excerpt: row.slice(0, 160) };
  }
  if (INTAKE_PRICE_FLOOR_ANYWHERE_RE.test(row) && INTAKE_STATUS_CANDIDATE_RE.test(row)) {
    return { reason: 'price_floor_and_status_candidate', excerpt: row.slice(0, 160) };
  }
  if (INTAKE_SUMMARY_PRICE_TAIL_RE.test(row)) {
    return { reason: 'summary_price_floor_tail', excerpt: row.slice(-120) };
  }
  if (INTAKE_PRICE_FLOOR_ANYWHERE_RE.test(row)) {
    return { reason: 'price_floor_fragment', excerpt: row.slice(-120) };
  }
  if (INTAKE_STATUS_SUFFIX_RE.test(row) || (INTAKE_STATUS_CANDIDATE_RE.test(row) && words(row) < 40)) {
    return { reason: 'status_candidate_only', excerpt: row.slice(-120) };
  }
  return null;
}

export function containsIntakePresentationStub(value = '', options = {}) {
  return intakePresentationStubMatch(value, options) != null;
}

function categoryFromRow(row = {}) {
  const raw = row.category?.name || row.category_name || row.category;
  return String(raw || '').toLowerCase();
}

function pushMatch(matches, seen, row, { placeId, path, category, value }) {
  const hit = intakePresentationStubMatch(value, { category });
  if (!hit) return;
  const key = `${placeId}|${path}|${hit.reason}`;
  if (seen.has(key)) return;
  seen.add(key);
  matches.push({
    placeId: placeId == null ? null : String(placeId),
    path,
    reason: hit.reason,
    excerpt: hit.excerpt,
    category: category || '',
  });
}

function walkScalarObject(matches, seen, obj, basePath, placeId, category) {
  if (!obj || typeof obj !== 'object') return;
  for (const field of PRESENTATION_SOURCE_FIELDS) {
    if (typeof obj[field] === 'string' && obj[field].trim()) {
      pushMatch(matches, seen, obj, {
        placeId,
        path: `${basePath}.${field}`,
        category,
        value: obj[field],
      });
    }
  }
  if (obj.sourceRecord && typeof obj.sourceRecord === 'object') {
    const srCat = categoryFromRow(obj.sourceRecord) || category;
    walkScalarObject(matches, seen, obj.sourceRecord, `${basePath}.sourceRecord`, placeId, srCat);
  }
  const fields = obj.fields;
  if (fields && typeof fields === 'object') {
    for (const [field, row] of Object.entries(fields)) {
      if (!PRESENTATION_SOURCE_FIELDS.includes(field)) continue;
      const value = row && typeof row === 'object' ? row.value : row;
      if (typeof value === 'string' && value.trim()) {
        pushMatch(matches, seen, obj, {
          placeId,
          path: `${basePath}.fields.${field}.value`,
          category,
          value,
        });
      }
    }
  }
}

export function scanIntakePresentationStubs(shared = {}, options = {}) {
  const matches = [];
  const seen = new Set();
  const places = Array.isArray(shared.places) ? shared.places : [];
  const placeNameById = new Map(places.map((p) => [String(p.id), p.name || '']));

  for (const place of places) {
    const category = categoryFromRow(place);
    walkScalarObject(matches, seen, place, `places[${place.id}]`, place.id, category);
  }

  for (const [key, override] of Object.entries(shared.thingOverrides || {})) {
    if (!key.startsWith('place:')) continue;
    const placeId = key.slice('place:'.length);
    const place = places.find((row) => String(row.id) === String(placeId));
    const category = categoryFromRow(override) || categoryFromRow(place);
    walkScalarObject(matches, seen, override, `thingOverrides.${key}`, placeId, category);
    const name = placeNameById.get(String(placeId)) || override.title || '';
    for (const m of matches) {
      if (m.placeId === String(placeId) && !m.name) m.name = name;
    }
  }

  const matchCount = matches.length;
  const pass = matchCount === 0;
  return {
    pass,
    matchCount,
    matches: options.includeMatches === false ? undefined : matches,
  };
}
