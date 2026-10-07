function text(value) {
  return String(value || '').trim();
}

export function itineraryMinThings(env = process.env) {
  const parsed = Number.parseInt(env.TIMESYNCHER_ITINERARY_MIN_THINGS || '8', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

export function includePrintMaps(shared = {}, env = process.env) {
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {};
  if (overrides.__includeMaps === true || overrides.__printMaps === true) return true;
  if (overrides.__includeMaps === false || overrides.__printMaps === false) return false;
  const flag = text(env.TIMESYNCHER_STYLE2_INCLUDE_MAPS).toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function placeId(place = {}) {
  return Number(place.id || place.place_id || 0) || 0;
}

export function assignedPlaceIds(shared = {}) {
  const ids = new Set();
  const assignments = shared.assignments && typeof shared.assignments === 'object' ? shared.assignments : {};
  for (const rows of Object.values(assignments)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = Number(row.place_id || row.place?.id || 0);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function backfillAssignments(sharedInput = {}, env = process.env) {
  const shared = {
    ...sharedInput,
    places: Array.isArray(sharedInput.places) ? sharedInput.places.map((place) => ({ ...place })) : [],
    days: Array.isArray(sharedInput.days) ? [...sharedInput.days] : [],
    assignments: sharedInput.assignments && typeof sharedInput.assignments === 'object'
      ? Object.fromEntries(Object.entries(sharedInput.assignments).map(([key, rows]) => [key, Array.isArray(rows) ? [...rows] : []]))
      : {},
  };
  const minThings = itineraryMinThings(env);
  const assigned = assignedPlaceIds(shared);
  const realPlaces = shared.places.filter((place) => placeId(place));
  const unassigned = realPlaces.filter((place) => !assigned.has(placeId(place)));
  const days = [...shared.days].sort((a, b) => Number(a.day_number) - Number(b.day_number));
  let next = 0;
  while (assigned.size < minThings && next < unassigned.length && days.length) {
    const place = unassigned[next];
    next += 1;
    const day = days[(assigned.size + next) % days.length] || days[0];
    const key = String(day.id);
    const rows = shared.assignments[key] || [];
    rows.push({
      place_id: placeId(place),
      place,
      assignment_time: place.place_time || '',
      backfilled: true,
    });
    shared.assignments[key] = rows;
    assigned.add(placeId(place));
  }
  return {
    shared,
    minThings,
    placeCount: realPlaces.length,
    assignedCount: assigned.size,
    backfilled: Math.max(0, assigned.size - assignedPlaceIds(sharedInput).size),
    shortfall: Math.max(0, minThings - realPlaces.length),
  };
}
