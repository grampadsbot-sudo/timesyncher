import { savedTripGapFields } from './gap-ask-reply-context.mjs';

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
    return {
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
  } catch {
    return null;
  }
}
