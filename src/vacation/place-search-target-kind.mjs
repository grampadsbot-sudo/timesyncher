const KIND_SET = new Set(['named_place', 'category']);

export function normalizePlaceSearchTargetKind(value) {
  const kind = String(value || '').trim();
  return KIND_SET.has(kind) ? kind : '';
}

export function intakePlaceSearchTargetKindError(extractedFields = {}) {
  if (String(extractedFields.turnKind || '').trim().toLowerCase() !== 'place_search') return '';
  const raw = String(extractedFields.targetKind ?? '').trim();
  if (!raw) return 'trip intake place_search extraction targetKind required';
  if (!KIND_SET.has(raw)) return 'trip intake place_search extraction targetKind unknown';
  return '';
}

export function namedPlaceLookupFromTargetKind(targetKind = '') {
  return normalizePlaceSearchTargetKind(targetKind) === 'named_place';
}

/** Live queue / in-turn search: turnKind required on ok classifications. */
export function placeSearchTurnKindError(classification = {}) {
  if (classification?.ok !== true) return '';
  const turnKind = String(classification.turnKind || '').trim();
  if (!turnKind) return 'trip intake classification turnKind missing';
  return '';
}
