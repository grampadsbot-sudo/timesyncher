import { categoryRadiusMeters } from './keepsake-list-minimums.mjs';
import { isLodgingProviderPlace } from './intake-lodging-category.mjs';
import { distanceMeters } from './place-search-same-place.mjs';

export function normalizePlaceName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizePlaceName(value).split(/\s+/).filter((token) => token.length >= 2);
}

export function intakeLodgingNameSimilarity(statedName, placeTitle) {
  const left = new Set(nameTokens(statedName));
  const right = new Set(nameTokens(placeTitle));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  if (!union) return 0;
  return intersection / union;
}

function hasCoordinates(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function intakeLodgingNameMatches(propertyName, placeTitle) {
  return intakeLodgingNameSimilarity(propertyName, placeTitle) > 0;
}

function intakeLodgingAreaMatches(place, { areaCenter = null, areaText = '' } = {}) {
  const area = normalizePlaceName(areaText);
  const hasCenter = hasCoordinates(areaCenter);
  if (hasCenter && hasCoordinates(place)) {
    const meters = distanceMeters(areaCenter, place);
    if (meters !== null && meters <= categoryRadiusMeters('hotel')) return true;
  }
  if (area) {
    const address = normalizePlaceName(place?.address || '');
    const areaTokens = area.split(/\s+/).filter((token) => token.length >= 3);
    if (areaTokens.some((token) => address.includes(token))) return true;
    if (hasCenter) return false;
    return areaTokens.some((token) => normalizePlaceName(place?.title || '').includes(token));
  }
  return !hasCenter;
}

function providerRank(place) {
  const rank = Number(place?.providerRank);
  return Number.isFinite(rank) ? rank : Number.POSITIVE_INFINITY;
}

function rankingRow(place, { similarityScore, providerRank: rank, outcome }) {
  return {
    title: String(place?.title || '').trim(),
    externalId: String(place?.externalId || '').trim(),
    similarityScore: Number(similarityScore),
    providerRank: rank,
    outcome: String(outcome || '').trim(),
  };
}

export function rankIntakeLodgingCandidates(places = [], {
  propertyName = '',
  areaText = '',
  areaCenter = null,
} = {}) {
  const rows = (Array.isArray(places) ? places : []).filter((place) => hasCoordinates(place));
  const rejected = [];
  const lodging = [];
  for (const place of rows) {
    if (isLodgingProviderPlace(place)) lodging.push(place);
    else rejected.push(rankingRow(place, { similarityScore: 0, providerRank: providerRank(place), outcome: 'rejected_lodging_tag' }));
  }
  if (!lodging.length) {
    return { picked: null, pickRanking: { winner: null, runnersUp: rejected } };
  }
  const named = [];
  for (const place of lodging) {
    const similarityScore = intakeLodgingNameSimilarity(propertyName, place.title);
    if (similarityScore > 0) named.push({ place, similarityScore });
    else rejected.push(rankingRow(place, { similarityScore: 0, providerRank: providerRank(place), outcome: 'rejected_name_similarity' }));
  }
  if (!named.length) {
    return { picked: null, pickRanking: { winner: null, runnersUp: rejected } };
  }
  const inArea = [];
  for (const row of named) {
    if (intakeLodgingAreaMatches(row.place, { areaCenter, areaText })) inArea.push(row);
    else rejected.push(rankingRow(row.place, { similarityScore: row.similarityScore, providerRank: providerRank(row.place), outcome: 'rejected_area' }));
  }
  if (!inArea.length) {
    return { picked: null, pickRanking: { winner: null, runnersUp: rejected } };
  }
  inArea.sort((left, right) => {
    const scoreDelta = right.similarityScore - left.similarityScore;
    if (scoreDelta !== 0) return scoreDelta;
    return providerRank(left.place) - providerRank(right.place);
  });
  const winnerRow = inArea[0];
  const winner = winnerRow.place;
  const runnersUp = [
    rankingRow(winner, {
      similarityScore: winnerRow.similarityScore,
      providerRank: providerRank(winner),
      outcome: 'won',
    }),
    ...inArea.slice(1).map((row) => rankingRow(row.place, {
      similarityScore: row.similarityScore,
      providerRank: providerRank(row.place),
      outcome: 'lost_rank',
    })),
    ...rejected,
  ];
  return {
    picked: winner,
    pickRanking: {
      winner: runnersUp[0],
      runnersUp: runnersUp.slice(1),
    },
  };
}

export function pickIntakeLodgingCandidate(places = [], options = {}) {
  return rankIntakeLodgingCandidates(places, options).picked;
}

export function intakeLodgingPickMissReason(places = [], {
  propertyName = '',
  areaText = '',
  areaCenter = null,
} = {}) {
  const rows = (Array.isArray(places) ? places : []).filter((place) => hasCoordinates(place));
  if (!rows.length) return 'no_coordinates';
  const lodging = rows.filter((place) => isLodgingProviderPlace(place));
  if (!lodging.length) return 'no_hotel_category_result';
  const named = lodging.filter((place) => intakeLodgingNameMatches(propertyName, place.title));
  if (!named.length) return 'no_structural_name_match';
  const inArea = named.filter((place) => intakeLodgingAreaMatches(place, { areaCenter, areaText }));
  if (!inArea.length) return 'no_structural_area_match';
  return 'no_address';
}
