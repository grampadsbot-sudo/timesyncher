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

function tripStatedLodgingAreaFromMetadata(metadata = {}) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return clean(meta.statedLodgingArea || meta.statedLodgingAreaHint, 180);
}

export async function loadTripPlaceSearchContext(db, tripId) {
  if (!db || !tripId) return { tripDestination: '', tripResolvedArea: '', tripStatedLodgingArea: '' };
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
    tripStatedLodgingArea: tripStatedLodgingAreaFromMetadata(meta),
  };
}

/** Area text for place search: lodging Thing, stated lodging area, trip destination, resolved metadata area; else named anchor. */
export function resolvePlaceSearchAreaDetail({
  classification = null,
  lodgingText = '',
  tripStatedLodgingArea = '',
  tripDestination = '',
  tripResolvedArea = '',
} = {}) {
  const lodging = clean(lodgingText, 180);
  const statedLodgingArea = clean(tripStatedLodgingArea, 180);
  const destination = clean(tripDestination, 180);
  const resolved = clean(tripResolvedArea, 180);
  const anchor = clean(classification?.anchor, 180);
  const anchorIsLodging = classification?.anchorIsLodging === true;

  if (anchorIsLodging) {
    if (lodging) return { text: lodging, source: 'lodging' };
    if (statedLodgingArea) return { text: statedLodgingArea, source: 'stated_lodging_area' };
    if (destination) return { text: destination, source: 'destination' };
    if (resolved) return { text: resolved, source: 'resolved_area' };
    return { text: '', source: '' };
  }
  if (anchor) return { text: anchor, source: 'named_anchor' };
  if (destination) return { text: destination, source: 'destination' };
  if (resolved) return { text: resolved, source: 'resolved_area' };
  return { text: '', source: '' };
}

export function resolvePlaceSearchDestination(params = {}) {
  return resolvePlaceSearchAreaDetail(params).text;
}

/** Geographic area for the relevance judge (not a lodging property name). */
export function resolvePlaceSearchRelevanceArea({
  classification = null,
  lodgingText = '',
  tripStatedLodgingArea = '',
  tripDestination = '',
  tripResolvedArea = '',
} = {}) {
  const anchorIsLodging = classification?.anchorIsLodging === true;
  const statedLodgingArea = clean(tripStatedLodgingArea, 180);
  const destination = clean(tripDestination, 180);
  const resolved = clean(tripResolvedArea, 180);
  const lodging = clean(lodgingText, 180);
  const anchor = clean(classification?.anchor, 180);

  if (!anchorIsLodging) {
    if (anchor) return anchor;
    if (destination) return destination;
    if (resolved) return resolved;
    return '';
  }
  if (statedLodgingArea) return statedLodgingArea;
  if (lodging && lodging.includes(',')) return lodging;
  if (destination) return destination;
  if (resolved) return resolved;
  return lodging;
}
