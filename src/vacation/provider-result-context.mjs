import { filterPlacesWithinRadius } from './place-search-radius-filter.mjs';

function webResultAliases(name) {
  const aliases = new Set();
  const base = String(name || '').trim();
  if (base) aliases.add(base.toLowerCase());
  for (const part of base.split(/[|/–—-]/)) {
    const piece = part.trim();
    if (piece.length >= 3) aliases.add(piece.toLowerCase());
  }
  return aliases;
}

function textMentionsPhrase(text, phrase) {
  const esc = String(phrase || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'iu').test(String(text || ''));
}

function normalizePlaceTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/\.+$/g, '').trim();
}

function placeTitle(row) {
  if (typeof row === 'string') return normalizePlaceTitle(row.split(':')[0]);
  return normalizePlaceTitle(row?.title || row?.name || '');
}

function rejectedOrPriorRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.rejected === true || row.relevanceRejected === true || row.notCitableAsResult === true) return true;
  const source = String(row.source || row.sourceRef?.source || '').trim().toLowerCase();
  return source === 'prior_db';
}

function foldPlaceLetters(value) {
  return String(value || '').toLowerCase().replace(/[''`]/g, '');
}

function areaOrLocalityPlaceRow(row) {
  if (!row || typeof row !== 'object') return false;
  const cat = String(row.category || row.metadata?.categoryName || row.subtype || '').trim().toLowerCase();
  if (/^(locality|administrative|neighbourhood|neighborhood|suburb|county|state|region|district|island|town|village|hamlet|city)$/.test(cat)) {
    return true;
  }
  const tags = row.metadata?.sourceRecord?.tags || row.tags;
  if (tags && typeof tags === 'object') {
    const place = String(tags.place || '').trim().toLowerCase();
    if (place && /^(city|town|village|hamlet|suburb|neighbourhood|neighborhood|locality|county|state|island)$/.test(place)) {
      return true;
    }
  }
  return false;
}

function citableInTurnVenueRow(row) {
  return !rejectedOrPriorRow(row) && !areaOrLocalityPlaceRow(row);
}

function rowCoordinates(row) {
  if (!row || typeof row !== 'object') return { lat: null, lng: null };
  const lat = Number(row.lat ?? row.location?.lat);
  const lng = Number(row.lng ?? row.location?.lng);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

/** Drop in-turn rows outside the turn's anchor radius policy (Kihei-scoped search, etc.). */
export function filterInTurnPlaceRowsForAreaScope(rows = [], scope = null) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length || !scope || typeof scope !== 'object') return list;
  const center = scope.center;
  const centerLat = Number(center?.lat);
  const centerLng = Number(center?.lng);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return list;
  const radiusScope = String(scope.scope || '').trim();
  const categoryFallback = String(scope.categoryFallback || 'restaurant').trim().toLowerCase() || 'restaurant';
  const normalized = list.map((row) => {
    const { lat, lng } = rowCoordinates(row);
    const category = String(row.category || row.metadata?.categoryName || categoryFallback).trim().toLowerCase();
    return { ...row, lat, lng, category };
  });
  const policyScope = radiusScope || 'lodging_anchor';
  return filterPlacesWithinRadius(
    normalized,
    { lat: centerLat, lng: centerLng, label: String(center?.label || '').trim() },
    (place) => String(place?.category || categoryFallback).trim().toLowerCase(),
    policyScope,
  ).places;
}

function rememberAllowName(rows, seen, raw) {
  const name = normalizePlaceTitle(raw);
  const key = foldPlaceLetters(name);
  if (!name || key.length < 3 || seen.has(key)) return;
  seen.add(key);
  rows.push({ name });
  for (const part of name.split(/[,/]/)) {
    const piece = normalizePlaceTitle(part);
    const pieceKey = foldPlaceLetters(piece);
    if (piece.length >= 3 && !seen.has(pieceKey)) {
      seen.add(pieceKey);
      rows.push({ name: piece });
    }
  }
}

export function tripOwnedPlaceAllowRows({
  destination = '',
  lodging = '',
  tripResolvedArea = '',
  tripStatedLodgingArea = '',
  things = [],
} = {}) {
  const rows = [];
  const seen = new Set();
  for (const value of [destination, lodging, tripResolvedArea, tripStatedLodgingArea]) {
    rememberAllowName(rows, seen, value);
  }
  for (const thing of Array.isArray(things) ? things : []) {
    const kind = String(thing?.kind || thing?.category || '').trim().toLowerCase();
    if (!['hotel', 'lodging', 'accommodation'].includes(kind)) continue;
    rememberAllowName(rows, seen, thing?.title || thing?.name);
    const location = thing?.location && typeof thing.location === 'object' ? thing.location : {};
    rememberAllowName(rows, seen, location.address);
    rememberAllowName(rows, seen, location.locality);
    rememberAllowName(rows, seen, location.city);
    rememberAllowName(rows, seen, thing?.description);
  }
  return rows;
}

export function citablePlaceTitles(inTurnResults = []) {
  const titles = [];
  const seen = new Set();
  for (const row of Array.isArray(inTurnResults) ? inTurnResults : []) {
    if (!citableInTurnVenueRow(row)) continue;
    const title = placeTitle(row);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

export const CUSTOMER_OWN_LODGING_CONTEXT_LABEL = "Customer's own lodging (context only; not a search result; never recommend or describe it as a find)";

export function modelVisibleTripContext(tripContext) {
  if (!tripContext || typeof tripContext !== 'object') return tripContext;
  if (!('tripReplyGate' in tripContext) && !('placeSearchAreaScope' in tripContext)) return tripContext;
  const { tripReplyGate, placeSearchAreaScope, ...rest } = tripContext;
  return rest;
}

export function applyInTurnCitablePlaces(facts, inTurnResults) {
  if (!facts || typeof facts !== 'object') return facts;
  if (!Array.isArray(inTurnResults) || !inTurnResults.length) return facts;
  const scopedRows = String(facts.searchArea || '').trim() && facts.placeSearchAreaScope
    ? filterInTurnPlaceRowsForAreaScope(inTurnResults, facts.placeSearchAreaScope)
    : inTurnResults;
  const citablePlaces = citablePlaceTitles(scopedRows);
  const citableKeys = new Set(citablePlaces.map((title) => title.toLowerCase()));
  const notCitableAsResult = [];
  const remember = (row) => {
    const title = placeTitle(row);
    const key = title.toLowerCase();
    if (!title || citableKeys.has(key)) return;
    if (notCitableAsResult.some((item) => item.toLowerCase() === key)) return;
    notCitableAsResult.push(title);
  };
  for (const item of facts.itinerary || []) remember(item);
  for (const item of facts.survivingPriorDbTitles || []) remember(item);
  for (const item of facts.relevanceRejections || []) remember(item);
  for (const item of facts.priorPlaces || []) remember(item);
  remember(facts.lodging);
  remember(facts.statedLodgingArea);
  const itinerary = (Array.isArray(facts.itinerary) ? facts.itinerary : []).flatMap((item) => {
    const title = placeTitle(item);
    if (!title || !citableKeys.has(title.toLowerCase())) return [];
    return [typeof item === 'string' ? item : title];
  });
  const replyFacts = { ...facts, itinerary, citablePlaces };
  delete replyFacts.survivingPriorDbTitles;
  delete replyFacts.relevanceRejections;
  delete replyFacts.priorPlaces;
  const lodgingLabel = String(facts.lodging || '').trim();
  const statedArea = String(facts.statedLodgingArea || '').trim();
  delete replyFacts.lodging;
  delete replyFacts.statedLodgingArea;
  if (lodgingLabel || statedArea) {
    replyFacts.customerOwnLodgingContext = {
      label: CUSTOMER_OWN_LODGING_CONTEXT_LABEL,
      ...(lodgingLabel ? { lodging: lodgingLabel } : {}),
      ...(statedArea ? { statedLodgingArea: statedArea } : {}),
    };
  }
  if (notCitableAsResult.length) {
    replyFacts.notCitableAsResult = notCitableAsResult;
    replyFacts.notCitableAsResultRule = 'notCitableAsResult places are not results from this turn. Cite only citablePlaces.';
  }
  return replyFacts;
}

function inTurnPlaceRows(sources) {
  return (Array.isArray(sources) ? sources : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    if (!citableInTurnVenueRow(item)) return [];
    const name = String(item.name ?? item.title ?? '').trim();
    if (!name) return [];
    return [{ name }];
  });
}

function venuePhraseSourced(phrase, rows) {
  const lower = String(phrase || '').trim().toLowerCase();
  const folded = foldPlaceLetters(lower);
  if (!lower) return false;
  for (const row of rows) {
    for (const alias of webResultAliases(row.name)) {
      const normalized = alias.toLowerCase();
      if (lower === normalized || lower.includes(normalized) || normalized.includes(lower)) return true;
      const aliasFolded = foldPlaceLetters(normalized);
      if (folded === aliasFolded) return true;
      if (aliasFolded.length >= 4 && (folded.includes(aliasFolded) || aliasFolded.includes(folded))) return true;
    }
  }
  return false;
}

function parsedDayMatches(candidate, day) {
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).getDate() === day;
}

function phraseParsesAsDate(text, matchIndex, phrase) {
  const after = String(text || '').slice(matchIndex + phrase.length);
  const dayLead = after.match(/^\s*,?\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dayLead) {
    const rest = after.slice(dayLead.index + dayLead[0].length);
    const year = rest.match(/^\s*,\s*(\d{4})\b/);
    const candidate = `${phrase} ${dayLead[1]}${year ? `, ${year[1]}` : ''}`;
    if (parsedDayMatches(candidate, Number(dayLead[1]))) return true;
  }
  const monthLead = after.match(/^\s*,\s*([\p{Lu}][\p{L}'’.-]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/u);
  if (!monthLead) return false;
  return parsedDayMatches(`${phrase}, ${monthLead[1]} ${monthLead[2]}`, Number(monthLead[2]));
}

function inventedVenueMentions(text, rows, allowRows = []) {
  const sourcedRows = [...rows, ...(Array.isArray(allowRows) ? allowRows : [])];
  if (!sourcedRows.length) return [];
  const flagged = [];
  const body = String(text || '');
  for (const match of body.matchAll(/\b(?:at|near|including|from|visit)\s+([\p{Lu}][\p{L}'’&-]+(?:\s+[\p{Lu}][\p{L}'’&-]+)*)/gu)) {
    const phrase = match[1].replace(/\s+/g, ' ').trim();
    const phraseStart = match.index + match[0].lastIndexOf(phrase);
    if (!phrase || venuePhraseSourced(phrase, sourcedRows) || phraseParsesAsDate(body, phraseStart, phrase)) continue;
    flagged.push(phrase);
  }
  return flagged;
}

function spokenPlaceName(text, index) {
  const before = String(text || '').slice(Math.max(0, index - 80), index);
  return (before.match(/([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+[\p{Lu}][\p{L}\p{M}'’.-]*)*)\s*$/u) || [])[1] || '';
}

export function placeResultExtra(sources) {
  const items = Array.isArray(sources) ? sources : [];
  const parts = items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    if (!citableInTurnVenueRow(item)) return [];
    const name = normalizePlaceTitle(item.name ?? item.title ?? '');
    return name ? [name] : [];
  });
  if (!parts.length) return '';
  return `Results: ${parts.join('; ')}.`;
}

export function unsourcedAgainstInTurnResults(reply, sources, options = {}) {
  const text = String(reply || '');
  const rows = inTurnPlaceRows(sources);
  const allowRows = Array.isArray(options.tripPlaceAllowRows) ? options.tripPlaceAllowRows : [];
  if (!rows.length && !allowRows.length) return [];
  const sourcedRows = [...rows, ...allowRows];
  const flagged = new Set(inventedVenueMentions(text, rows, allowRows));
  for (const match of text.matchAll(/\(id:([^)\s]+)\)/g)) {
    const spoken = spokenPlaceName(text, match.index);
    if (spoken && !venuePhraseSourced(spoken, sourcedRows)) flagged.add(spoken);
  }
  return [...flagged];
}
