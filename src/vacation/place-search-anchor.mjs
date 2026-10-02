function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function tripResolvedAreaFromMetadata(metadata = {}) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return clean(meta.resolvedArea || meta.resolvedDestination || meta.destinationArea, 180);
}

function cleanSql(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function loadTripPlaceSearchContext(db, tripId) {
  if (!db || !tripId) return { tripDestination: '', tripResolvedArea: '' };
  const rows = await db`
    select destination, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const row = rows[0] || {};
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    tripDestination: cleanSql(row.destination, 180),
    tripResolvedArea: tripResolvedAreaFromMetadata(meta),
  };
}

/** Area text for place search: lodging Thing, then trip destination, then resolved metadata area; else named anchor. */
export function resolvePlaceSearchDestination({
  classification = null,
  lodgingText = '',
  tripDestination = '',
  tripResolvedArea = '',
} = {}) {
  const lodging = clean(lodgingText, 180);
  const destination = clean(tripDestination, 180);
  const resolved = clean(tripResolvedArea, 180);
  const anchor = clean(classification?.anchor, 180);
  const anchorIsLodging = classification?.anchorIsLodging === true;

  if (anchorIsLodging) {
    if (lodging) return lodging;
    if (destination) return destination;
    if (resolved) return resolved;
    return '';
  }
  if (anchor) return anchor;
  if (destination) return destination;
  if (resolved) return resolved;
  return '';
}
