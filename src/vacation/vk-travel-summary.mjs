import { isPlaceholderTripRecord } from './owner-shell-trip.mjs';

const travelSummaryFields = ['where', 'who', 'transport', 'tripName', 'description'];
const summaryVersion = 2;

export function travelSummaryValues(value) {
  return Object.fromEntries(travelSummaryFields.map((field) => [
    field, typeof value?.[field] === 'string' ? value[field].trim() : '',
  ]));
}

export function travelSummaryPrefix(tripId) {
  return `artifacts/${encodeURIComponent(tripId)}/travel-summary`;
}

export async function loadCurrentTravelSummary(db, tripId) {
  if (!tripId) return null;
  const prefix = `vk-admin-review/${travelSummaryPrefix(tripId)}`;
  const [row] = await db`
    select a.document as summary
    from transcript_turns t
    join eula_store_objects a on a.key = ${prefix} || '/' || t.id::text || '.json'
    where t.trip_id = ${tripId} and t.direction = 'inbound' and t.speaker = 'customer'
      and a.document->>'version' = ${String(summaryVersion)}
    order by coalesce(t.received_at, t.created_at) desc, t.id desc limit 1
  `;
  return row?.summary ? travelSummaryValues(row.summary) : null;
}

export async function travelSummaryContext(db, trip) {
  if (!trip?.id) return {};
  const previousSummary = await loadCurrentTravelSummary(db, trip.id);
  const [turns, things] = await Promise.all([
    db`
      select t.body from transcript_turns t
      where t.trip_id = ${trip.id} and t.direction = 'inbound' and t.speaker = 'customer'
      order by coalesce(t.received_at, t.created_at) desc, t.id desc limit 16
    `,
    db`
      select category, title, starts_at
      from trip_things where trip_id = ${trip.id}
      order by updated_at desc, id desc limit 25
    `,
  ]);
  return {
    where: isPlaceholderTripRecord(trip) ? '' : trip.destination,
    things,
    previousSummary,
    customerTurns: turns.reverse().map(({ body }) => String(body || '').slice(0, 2400)),
  };
}

export function travelSummaryDocument(summary) {
  return { ...travelSummaryValues(summary), version: summaryVersion };
}

export function travelSummaryForTurn(trip, modelSummary) {
  const saved = isPlaceholderTripRecord(trip) ? {} : trip;
  return travelSummaryValues({ ...modelSummary, tripName: saved.title, where: modelSummary?.where || saved.destination });
}

export async function refreshTravelSummaryTripFields(db, trip, turnId, summary) {
  if (!trip?.id || !turnId || !summary) return summary;
  const current = travelSummaryForTurn(trip, summary);
  if (current.tripName !== summary.tripName || current.where !== summary.where) {
    const key = `vk-admin-review/${travelSummaryPrefix(trip.id)}/${turnId}.json`;
    await db`
      update eula_store_objects set document = ${{ ...travelSummaryDocument(current), turnId }}, updated_at = now()
      where key = ${key}
    `;
  }
  return current;
}
