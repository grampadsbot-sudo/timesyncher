import { assignTripSiteUrlWhenThingsPresent } from './trip-site-url-after-insert.mjs';
import { samePlace } from './place-search-same-place.mjs';

const PLACE_SOURCES = new Set(['prior_db', 'osm', 'brave', 'tavily']);

export class TripThingInsertError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TripThingInsertError';
  }
}

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

function locationPoint(location = {}) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export async function insertTripThing(db, { tripId, requestId, thing, env = process.env }) {
  const item = tripThingRow(thing);
  if (!item) return null;
  const normalizedTripId = String(tripId || '').trim();
  if (normalizedTripId && item.source) {
    const existingRows = await db`
      select id, title, location
      from trip_things
      where trip_id = ${normalizedTripId}::uuid
        and source in ('prior_db', 'osm', 'brave', 'tavily')
    `;
    const candidate = { title: item.title, ...locationPoint(item.location) };
    for (const row of existingRows) {
      const loc = row?.location && typeof row.location === 'object' ? row.location : {};
      if (samePlace(candidate, { title: row.title, ...locationPoint(loc) })) {
        return { ...item, source: item.source, id: String(row.id), deduped: true };
      }
    }
  }
  const rows = await db`
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
    returning id
  `;
  const id = rows?.[0]?.id ? String(rows[0].id) : null;
  if (!id) {
    throw new TripThingInsertError(`insertTripThing returned no row for title "${item.title}"`);
  }
  await assignTripSiteUrlWhenThingsPresent(db, tripId, env);
  return { ...item, source: item.source, id };
}
