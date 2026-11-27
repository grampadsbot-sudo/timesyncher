function tripStateActionsFromMetadata(trip) {
  if (!trip || typeof trip !== 'object') return false;
  const metadata = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : trip;
  const value = metadata.trip_state_actions;
  return value === true || value === 'true';
}

export function tripStateActionsEnabled({ env = process.env, trip } = {}) {
  if (env.VK_TRIP_STATE_ACTIONS === '1' || env.VK_TRIP_STATE_ACTIONS === 'true') return true;
  return tripStateActionsFromMetadata(trip);
}

export async function tripRowForStateActions(db, tripId, trip) {
  if (trip && typeof trip === 'object') return trip;
  if (typeof db !== 'function' || !tripId) return null;
  const rows = await db`select start_date, end_date, metadata from trips where id = ${tripId} limit 1`;
  return rows[0] || null;
}