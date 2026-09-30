const PLACE_SOURCES = new Set(['prior_db', 'foursquare_os', 'osm', 'brave', 'tavily']);

export function tripThingSource(thing) {
  const source = String(thing?.source || '').trim();
  return PLACE_SOURCES.has(source) ? source : null;
}

export function tripThingRow(thing) {
  const title = String(thing?.title || '').trim().slice(0, 240);
  if (!title) return null;
  const category = String(thing?.category || 'note').trim().slice(0, 80) || 'note';
  const source = tripThingSource(thing);
  return {
    category,
    subtype: String(thing?.subtype || '').trim().slice(0, 120) || null,
    title,
    description: String(thing?.description || '').trim().slice(0, 4000) || null,
    startsAt: thing?.startsAt || thing?.starts_at || null,
    endsAt: thing?.endsAt || thing?.ends_at || null,
    costEstimateCents: Number.isInteger(thing?.costEstimateCents)
      ? thing.costEstimateCents
      : (thing?.cost_estimate_cents || null),
    currency: String(thing?.currency || 'usd').trim().slice(0, 12) || 'usd',
    location: thing?.location || {},
    links: thing?.links || [],
    ratings: thing?.ratings || {},
    metadata: thing?.metadata || {},
    source: source,
  };
}

export async function insertTripThing(db, { tripId, requestId, thing }) {
  const item = tripThingRow(thing);
  if (!item) return null;
  await db`
    insert into trip_things (
      trip_id, source_request_id, category, subtype, title, description, starts_at, ends_at,
      cost_estimate_cents, currency, location, links, ratings, metadata, source
    )
    values (
      ${tripId}, ${requestId}, ${item.category}, ${item.subtype},
      ${item.title}, ${item.description}, ${item.startsAt}, ${item.endsAt},
      ${item.costEstimateCents}, ${item.currency},
      ${JSON.stringify(item.location)}::jsonb,
      ${JSON.stringify(item.links)}::jsonb,
      ${JSON.stringify(item.ratings)}::jsonb,
      ${JSON.stringify(item.metadata)}::jsonb,
      ${item.source}
    )
  `;
  return { ...item, source: item.source };
}
