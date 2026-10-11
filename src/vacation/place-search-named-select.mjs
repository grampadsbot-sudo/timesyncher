import { lodgingAreaNameFromText } from './lodging-anchor.mjs';
import { nominatimLabelsEquivalent } from './nominatim-label-equivalent.mjs';
import { normalizePlaceSearchTargetKind } from './place-search-target-kind.mjs';
import { distanceMeters } from './place-search-same-place.mjs';

const NAMED_PLACE_SCORE_TIE_EPSILON = 0.05;
const NAMED_PLACE_DISTANCE_TIE_EPSILON_METERS = 25;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreOf(row) {
  const score = Number(row?.jevScore);
  return Number.isFinite(score) ? score : 0;
}

function placeCoords(row = {}) {
  const lat = finite(row?.lat ?? row?.latitude);
  const lng = finite(row?.lng ?? row?.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

/** Geocode label for named_place anchor-radius (town in target, lodging area, not whole-island destination). */
export function resolveNamedPlaceRadiusGeocodeLabel({
  namedTarget = '',
  namedArea = '',
  searchAnchor = null,
  destination = '',
  lodging = '',
  statedLodgingArea = '',
} = {}) {
  const fromTarget = lodgingAreaNameFromText(namedTarget);
  if (fromTarget) return fromTarget;
  const stated = String(statedLodgingArea || '').trim();
  if (stated) return stated;
  const anchorSource = String(searchAnchor?.source || '').trim();
  const anchorText = String(searchAnchor?.text || '').trim();
  if (anchorText && (anchorSource === 'named_anchor' || anchorSource === 'stated_lodging_area')) {
    return anchorText;
  }
  const fromLodging = lodgingAreaNameFromText(lodging);
  if (fromLodging) return fromLodging;
  const area = String(namedArea || '').trim();
  const dest = String(destination || '').trim();
  if (area && dest && !nominatimLabelsEquivalent(area, dest)) return area;
  return '';
}

/** Label geocoded to break named_place score ties (relevance area, then non-lodging anchor). */
export function resolveNamedPlaceTieBreakLabel({
  namedArea = '',
  searchAnchor = null,
  destination = '',
} = {}) {
  const area = String(namedArea || '').trim();
  if (area) return area;
  const text = String(searchAnchor?.text || '').trim();
  const source = String(searchAnchor?.source || '').trim();
  if (text && source !== 'lodging' && source !== 'stated_lodging_area') return text;
  return String(destination || '').trim();
}

function namedPlaceCandidates(rows) {
  return rows.slice(0, 4).map((row) => ({
    title: String(row.title || '').trim(),
    score: scoreOf(row),
    source: String(row.source || '').trim(),
  })).filter((row) => row.title);
}

function breakScoreTieWithAnchor(tiedRows, anchorCenter) {
  if (!Array.isArray(tiedRows) || !tiedRows.length) {
    return { places: [], ambiguous: true, namedPlaceCandidates: [] };
  }
  if (tiedRows.length === 1) {
    return { places: [tiedRows[0]], ambiguous: false };
  }
  if (!anchorCenter) {
    return {
      places: [],
      ambiguous: true,
      namedPlaceCandidates: namedPlaceCandidates(tiedRows),
    };
  }
  const ranked = tiedRows.map((row) => {
    const coords = placeCoords(row);
    const meters = coords ? distanceMeters(anchorCenter, coords) : null;
    return { row, meters, score: scoreOf(row) };
  });
  ranked.sort((left, right) => {
    const leftMeters = left.meters;
    const rightMeters = right.meters;
    if (leftMeters === null && rightMeters === null) return right.score - left.score;
    if (leftMeters === null) return 1;
    if (rightMeters === null) return -1;
    if (leftMeters !== rightMeters) return leftMeters - rightMeters;
    return right.score - left.score;
  });
  const bestMeters = ranked[0].meters;
  if (bestMeters === null) {
    return {
      places: [],
      ambiguous: true,
      namedPlaceCandidates: namedPlaceCandidates(tiedRows),
    };
  }
  const winners = ranked.filter(
    (entry) => entry.meters !== null
      && Math.abs(entry.meters - bestMeters) <= NAMED_PLACE_DISTANCE_TIE_EPSILON_METERS,
  );
  if (winners.length !== 1) {
    return {
      places: [],
      ambiguous: true,
      namedPlaceCandidates: namedPlaceCandidates(tiedRows),
    };
  }
  return { places: [winners[0].row], ambiguous: false };
}

/** Named-place saves persist one venue: the highest Jev relevance survivor, never every passing row. */
export function finalizeNamedPlaceSearchResults(places = [], targetKind = '', { anchorCenter = null } = {}) {
  const rows = Array.isArray(places) ? places : [];
  if (normalizePlaceSearchTargetKind(targetKind) !== 'named_place') {
    return { places: rows, ambiguous: false };
  }
  if (!rows.length) return { places: [], ambiguous: false };
  const ranked = [...rows].sort((a, b) => scoreOf(b) - scoreOf(a));
  const topScore = scoreOf(ranked[0]);
  const tied = ranked.filter((row) => Math.abs(scoreOf(row) - topScore) < NAMED_PLACE_SCORE_TIE_EPSILON);
  if (tied.length > 1) {
    return breakScoreTieWithAnchor(tied, anchorCenter);
  }
  return { places: [ranked[0]], ambiguous: false };
}
