import { savedTripGapFields } from './gap-ask-reply-context.mjs';

async function sharedTripThings(meta, env) {
  const slug = String(meta.sharedToken || meta.shareToken || meta.publicSlug || meta.source_token || '').trim();
  const base = String(env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!slug || slug.startsWith('intake-') || !base) return [];
  const response = await fetch(`${base}/api/shared/${encodeURIComponent(slug)}/`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`saved_trip_shared_context_http_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.places)) throw new Error('saved_trip_shared_context_invalid');
  return payload.places.flatMap((place) => {
    const title = String(place.name || place.title || '').trim();
    if (!title || place.id == null) return [];
    const override = payload.thingOverrides?.[`place:${place.id}`] || {};
    const days = (payload.days || []).filter((day) => {
      if (override.timeline === false) return false;
      if (Array.isArray(override.dayIds)) return override.dayIds.some((id) => String(id) === String(day.id));
      return (payload.assignments?.[String(day.id)] || []).some((row) => String(row.place_id ?? row.place?.id) === String(place.id));
    });
    const whenLabel = days.map((day) => {
      const time = override.perDaySchedule?.[String(day.id)]?.startTime || override.startTime || place.place_time || '';
      return [day.date || day.day_date || `Day ${day.day_number}`, time].filter(Boolean).join(' ');
    }).join(' · ');
    return [{
      title,
      category: String(override.category || place.category?.name || place.category_name || '').toLowerCase(),
      whenLabel,
      customerWhen: '',
      sourceRef: { source: 'shared_trip', id: `place:${place.id}` },
    }];
  });
}

export async function loadSavedTripRecord(session, env = process.env) {
  const tripId = session?.trip_id || session?.tripId;
  if (!tripId || !env?.DATABASE_URL) return null;
  try {
    const { sql } = await import('./db.mjs');
    const db = sql(env);
    const trips = await db`select destination, start_date, end_date, metadata from trips where id = ${tripId} limit 1`;
    const row = trips[0];
    if (!row) return null;
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const thingRows = await db`select title, category, metadata from trip_things where trip_id = ${tripId} order by created_at asc`;
    const sharedThings = await sharedTripThings(meta, env);
    const record = {
      start: row.start_date || '',
      end: row.end_date || '',
      destination: String(row.destination || '').trim(),
      things: thingRows.map((thing) => {
        const thingMeta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
        const sourceRef = thingMeta.sourceRef && typeof thingMeta.sourceRef === 'object' ? thingMeta.sourceRef : null;
        return {
          title: thing.title,
          category: thing.category || thingMeta.category || '',
          who: thingMeta.who || '',
          whenLabel: thingMeta.whenLabel || '',
          customerWhen: thingMeta.customerWhen || '',
          notes: thingMeta.notes || [],
          ...(sourceRef ? { sourceRef } : {}),
        };
      }),
      party: meta.dialogParty && typeof meta.dialogParty === 'object' ? meta.dialogParty : null,
      rule: meta.intakeRule || '',
      planOwned: meta.planOwned === true || meta.unlimitedPlanOwned === true,
      ...savedTripGapFields(meta),
    };
    const savedByTitle = new Map(record.things.map((thing) => [String(thing.title || '').trim().toLowerCase(), thing]));
    const sharedTitles = new Set(sharedThings.map((thing) => thing.title.toLowerCase()));
    record.things = [
      ...sharedThings.map((thing) => ({ ...savedByTitle.get(thing.title.toLowerCase()), ...thing })),
      ...record.things.filter((thing) => !sharedTitles.has(String(thing.title || '').trim().toLowerCase())),
    ];
    return record;
  } catch {
    return null;
  }
}
