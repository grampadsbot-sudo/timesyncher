import { intId, sharedTripFromIntake, thingRecordFromTripRow } from './intake-shared-trip.mjs';

function thingRowsForShare(thingRows = []) {
  return (Array.isArray(thingRows) ? thingRows : []).map((row) => {
    if (!row || typeof row !== 'object') return row;
    if (row.metadata || row.starts_at || row.startsAt) return thingRecordFromTripRow(row);
    return row;
  });
}

export function turnSavedThingFields(trip, thingRows, savedIds = []) {
  const ids = [...new Set((Array.isArray(savedIds) ? savedIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length || !trip) return { thingId: null, sharedDayIds: [], savedThings: [] };
  const shared = sharedTripFromIntake({ trip, things: thingRowsForShare(thingRows) });
  const savedThings = ids.map((thingId) => ({
    thingId,
    sharedDayIds: [...(shared.thingOverrides?.[`place:${intId(thingId)}`]?.dayIds || [])],
  }));
  return {
    thingId: savedThings[0].thingId,
    sharedDayIds: savedThings[0].sharedDayIds,
    savedThings,
  };
}

export async function savedThingFieldsForTurn(db, tripId, savedIds = []) {
  const ids = (Array.isArray(savedIds) ? savedIds : []).map((id) => String(id || '').trim()).filter(Boolean);
  if (!ids.length || !tripId) return { thingId: null, sharedDayIds: [], savedThings: [] };
  const tripRows = await db`
    select id, title, destination, start_date, end_date, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const thingRows = await db`
    select id, category, title, description, metadata, location, starts_at, ratings
    from trip_things
    where trip_id = ${tripId}
  `;
  return turnSavedThingFields(tripRows[0] || { id: tripId }, thingRows, ids);
}
