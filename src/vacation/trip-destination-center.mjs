import { finiteCoord } from './trip-map-initial-view.mjs';
import { tryGeocodeLabel } from './place-search-geocode.mjs';
import { scheduleBackgroundWork } from './deferred-work.mjs';

function cleanCenter(center = {}) {
  const lat = finiteCoord(center?.lat ?? center?.latitude);
  const lng = finiteCoord(center?.lng ?? center?.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

export function destinationCenterFromTripMetadata(metadata = {}) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return cleanCenter(meta.destinationCenter) || cleanCenter(meta.searchCenter);
}

export async function persistTripDestinationCenter(db, tripId, center) {
  const point = cleanCenter(center);
  if (!db || !tripId || !point) return false;
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ destinationCenter: point })}::jsonb,
        updated_at = now()
    where id = ${tripId}
      and (metadata->'destinationCenter') is null
  `;
  return true;
}

export async function geocodeAndPersistTripDestinationCenter(
  db,
  tripId,
  destinationLabel,
  fetchImpl = globalThis.fetch,
  env = process.env,
) {
  const label = String(destinationLabel || '').trim();
  if (!db || !tripId || !label) return null;
  const rows = await db`
    select metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const meta = rows[0]?.metadata && typeof rows[0].metadata === 'object' ? rows[0].metadata : {};
  const existing = destinationCenterFromTripMetadata(meta);
  if (existing) return existing;
  const providerLog = [];
  const found = await tryGeocodeLabel(fetchImpl, label, providerLog, null, { env });
  if (!found) {
    console.error(JSON.stringify({
      event: 'trip_destination_geocode_failed',
      tripId: String(tripId || ''),
      label,
    }));
    return null;
  }
  await persistTripDestinationCenter(db, tripId, found);
  return found;
}

export function scheduleTripDestinationGeocode({
  db,
  tripId,
  destinationLabel,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  return scheduleBackgroundWork(() => geocodeAndPersistTripDestinationCenter(
    db,
    tripId,
    destinationLabel,
    fetchImpl,
    env,
  ));
}
