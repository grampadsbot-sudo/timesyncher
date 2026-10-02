import { finiteCoord } from './trip-map-initial-view.mjs';

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
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{ destinationCenter: point }},
        updated_at = now()
    where id = ${tripId}
      and (metadata->'destinationCenter') is null
  `;
  return true;
}
