import { isPlaceholderTripRecord } from './owner-shell-trip.mjs';

const travelSummaryFields = ['where', 'who', 'transport', 'tripName', 'description'];

export function travelSummaryValues(value) {
  return Object.fromEntries(travelSummaryFields.map((field) => [
    field, typeof value?.[field] === 'string' ? value[field].trim() : '',
  ]));
}

export function travelSummaryPrefix(tripId) {
  return `artifacts/${encodeURIComponent(tripId)}/travel-summary`;
}

export async function travelSummaryContext(db, trip) {
  if (!trip?.id) return {};
  const prefix = `vk-admin-review/${travelSummaryPrefix(trip.id)}`;
  const [rows, turns, things] = await Promise.all([
    db`select party, metadata->'dialogParty' as dialog_party from trips where id = ${trip.id}`,
    db`
      select t.body, a.document as summary from transcript_turns t
      left join eula_store_objects a on a.key = ${prefix} || '/' || t.id::text || '.json'
      where t.trip_id = ${trip.id} and t.direction = 'inbound' and t.speaker = 'customer'
      order by coalesce(t.received_at, t.created_at) desc, t.id desc limit 16
    `,
    db`
      select category, title, starts_at, metadata->>'who' as travelers
      from trip_things where trip_id = ${trip.id}
      order by updated_at desc, id desc limit 25
    `,
  ]);
  const party = rows[0]?.dialog_party || rows[0]?.party;
  const names = (people) => Array.isArray(people) ? people.map((person) => person?.name).filter(Boolean) : [];
  return {
    where: isPlaceholderTripRecord(trip) ? '' : trip.destination,
    party: [party?.primary?.name, ...names(party?.collaborators), ...names(party?.preference_subjects)].filter(Boolean),
    things,
    previousSummary: turns.find(({ summary }) => summary)?.summary,
    customerTurns: turns.reverse().map(({ body }) => String(body || '').slice(0, 2400)),
  };
}

export function travelSummaryForTurn(trip, modelSummary) {
  const saved = isPlaceholderTripRecord(trip) ? {} : trip;
  return travelSummaryValues({ ...modelSummary, tripName: saved.title, where: modelSummary?.where || saved.destination });
}
