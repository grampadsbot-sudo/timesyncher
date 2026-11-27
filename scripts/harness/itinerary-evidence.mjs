import { sharedTripFromIntake, thingRecordFromTripRow } from '../../src/vacation/intake-shared-trip.mjs';
import { assertThrowaway, isHarnessTag } from './protected.mjs';

export function itineraryMeasurement(value) {
  const count = value?.itineraryCount;
  if (value?.itineraryCountSource === 'db' && Number.isSafeInteger(count) && count >= 0) {
    return { itineraryCount: count, itineraryCountSource: 'db' };
  }
  return { itineraryCount: null, itineraryCountSource: 'unmeasured' };
}

export async function measureStoredItinerary(db, tripId, tag) {
  if (!tripId || !isHarnessTag(tag)) return itineraryMeasurement();
  try {
    const [row] = await db`
      select to_jsonb(t) as trip, array(
        select to_jsonb(thing) from trip_things thing where thing.trip_id = t.id
        order by thing.created_at, thing.id
      ) as things
      from trips t where t.id = ${tripId} and t.metadata->>'harnessTag' = ${tag}
    `;
    if (!row?.trip || !Array.isArray(row.things)) return itineraryMeasurement();
    assertThrowaway({ tripId });
    const metadata = row.trip.metadata || {};
    for (const shareToken of [metadata.publicSlug, metadata.shareToken, metadata.sharedToken, metadata.source_token]) {
      assertThrowaway({ shareToken });
    }
    const { assignments } = sharedTripFromIntake({ trip: row.trip, things: row.things.map(thingRecordFromTripRow) });
    const placed = new Set(Object.values(assignments).flatMap((day) => day.map((assignment) => assignment.place_id)));
    return { itineraryCount: placed.size, itineraryCountSource: 'db' };
  } catch {
    return itineraryMeasurement();
  }
}

export async function measureItemStorage(db, tripId, tag) {
  if (!tripId || !isHarnessTag(tag)) return { storagePath: 'unmeasured', tripStateRevisions: null, astraJsonTurns: null };
  try {
    assertThrowaway({ tripId });
    const [row] = await db`
      select (
        select count(*)::int from vacation_trip_state_revisions rev
        where rev.trip_id = t.id and rev.state_json is not null
      ) as revisions,
      (
        select count(*)::int from trip_things thing where thing.trip_id = t.id
      ) as things
      from trips t where t.id = ${tripId} and t.metadata->>'harnessTag' = ${tag}
    `;
    if (!row) return { storagePath: 'unmeasured', tripStateRevisions: null, astraJsonTurns: null };
    const revisions = Number(row.revisions) || 0;
    const things = Number(row.things) || 0;
    const storagePath = revisions > 0 ? 'trip_state' : (things > 0 ? 'chat_persist' : 'none');
    return { storagePath, tripStateRevisions: revisions, astraJsonTurns: revisions };
  } catch {
    return { storagePath: 'unmeasured', tripStateRevisions: null, astraJsonTurns: null };
  }
}

export async function countPlanningAgreementTurns(db, tripId, tag) {
  if (!tripId || !isHarnessTag(tag)) return null;
  try {
    const [row] = await db`
      select (
        select count(*)::int from transcript_turns turn
        where turn.trip_id = t.id and turn.speaker = 'customer' and turn.channel = 'vacation-app'
          and (
            turn.turn_tags && array['approval_continue', 'change_request']
            or turn.payload->>'committedPlan' = 'true'
            or (
              coalesce(turn.payload->'turnClassifier'->>'turnKind', '') not in ('place_search', 'web_research')
              and exists (
                select from jsonb_array_elements(
                  case when jsonb_typeof(turn.payload->'wantedThings') = 'array'
                    then turn.payload->'wantedThings' else '[]'::jsonb end
                ) as wanted(thing)
                where nullif(btrim(wanted.thing->>'when'), '') is not null
              )
            )
          )
      ) as count
      from trips t where t.id = ${tripId} and t.metadata->>'harnessTag' = ${tag}
    `;
    return row?.count ?? null;
  } catch {
    return null;
  }
}

export function itineraryStoredCheck(played, env = process.env) {
  const configured = Number(env.VK_GATE_AGREE_TURNS);
  const threshold = Number.isSafeInteger(configured) && configured > 0 ? configured : 4;
  const agreement = played?.planningAgreementTurns ?? null;
  const { itineraryCount } = itineraryMeasurement(played);
  const pass = itineraryCount > 0 || (agreement !== null && agreement < threshold);
  return {
    id: 'itinerary-stored',
    pass,
    detail: `${agreement ?? 'unmeasured'} agreement turns (threshold ${threshold}), ${itineraryCount ?? 'unmeasured'} stored itinerary items`,
    artifact: 'outcomes.json',
  };
}
