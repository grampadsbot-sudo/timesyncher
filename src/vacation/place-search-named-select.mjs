import { normalizePlaceSearchTargetKind } from './place-search-target-kind.mjs';

const NAMED_PLACE_SCORE_TIE_EPSILON = 0.05;

function scoreOf(row) {
  const score = Number(row?.jevScore);
  return Number.isFinite(score) ? score : 0;
}

/** Named-place saves persist one venue: the highest Jev relevance survivor, never every passing row. */
export function finalizeNamedPlaceSearchResults(places = [], targetKind = '') {
  const rows = Array.isArray(places) ? places : [];
  if (normalizePlaceSearchTargetKind(targetKind) !== 'named_place') {
    return { places: rows, ambiguous: false };
  }
  if (!rows.length) return { places: [], ambiguous: false };
  const ranked = [...rows].sort((a, b) => scoreOf(b) - scoreOf(a));
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (runnerUp && Math.abs(scoreOf(top) - scoreOf(runnerUp)) < NAMED_PLACE_SCORE_TIE_EPSILON) {
    return {
      places: [],
      ambiguous: true,
      namedPlaceCandidates: ranked.slice(0, 4).map((row) => ({
        title: String(row.title || '').trim(),
        score: scoreOf(row),
        source: String(row.source || '').trim(),
      })).filter((row) => row.title),
    };
  }
  return { places: [top], ambiguous: false };
}
