import { sharedTripFromIntake } from './intake-shared-trip.mjs';

function thingView(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description || '',
    who: meta.who || '',
    whenLabel: meta.whenLabel || '',
    customerWhen: meta.customerWhen || '',
    notes: Array.isArray(meta.notes) ? meta.notes : [],
    collaboratorNotes: [],
  };
}

export function preCollaboratorPayload(trip, things) {
  const stripped = (things || []).map((thing) => ({ ...thing, collaboratorNotes: [] }));
  return sharedTripFromIntake({ trip, things: stripped });
}

export async function storePreCollaboratorSnapshot(db, tripId) {
  if (!tripId) return null;
  const rows = await db`
    select id, title, destination, start_date, end_date, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const trip = rows[0];
  if (!trip) return null;
  const meta = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  if (meta.preCollaboratorSnapshot && typeof meta.preCollaboratorSnapshot === 'object') {
    return meta.preCollaboratorSnapshot;
  }
  const thingRows = await db`
    select id, category, title, description, metadata
    from trip_things
    where trip_id = ${trip.id}
    order by created_at asc
  `;
  const payload = preCollaboratorPayload(trip, thingRows.map(thingView));
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{ preCollaboratorSnapshot: payload }},
      updated_at = now()
    where id = ${trip.id}
      and (metadata->'preCollaboratorSnapshot') is null
  `;
  return payload;
}
