import { assertThrowaway, isHarnessTag } from './protected.mjs';

export async function measureInitialBuild(db, tripId, tag) {
  if (!tripId || !isHarnessTag(tag)) return null;
  try {
    assertThrowaway({ tripId });
    const [row] = await db`
      with vacation as (
        select id from trips where id = ${tripId} and metadata->>'harnessTag' = ${tag}
      ), customer_turns as (
        select request_id::text, row_number() over (order by coalesce(received_at, created_at), created_at, id)::int as customer_turn
        from transcript_turns where trip_id = (select id from vacation) and channel = 'vacation-app'
          and speaker = 'customer' and direction = 'inbound'
      )
      select result.customer_turn, result.research
      from vacation left join lateral (
        select customer_turn, state_json::jsonb->'research' as research
        from vacation_trip_state_revisions rev join customer_turns using (request_id)
        where rev.trip_id = vacation.id and rev.phase in ('reply_ready', 'shipped')
          and rev.state_json::jsonb->'research' ? 'build'
          and rev.state_json::jsonb->'research'->>'turn' = rev.turn::text
        order by customer_turn, rev.revision limit 1
      ) result on true
    `;
    if (!row) return null;
    const build = row.research?.build;
    return {
      source: 'db',
      turn: row.customer_turn,
      timeToBuildMs: build?.started_offset_ms ?? null,
      buildDurationMs: build?.duration_ms ?? null,
      itemsByType: build?.items_by_type ?? {},
      providerUnavailable: row.research?.provider_unavailable === true,
    };
  } catch {
    return null;
  }
}

export function initialBuildFinding(evidence) {
  const buildTurn = evidence?.turn ?? null;
  const firedByTurn2 = buildTurn !== null && buildTurn <= 2;
  const itemsByType = evidence?.itemsByType ?? null;
  const count = Object.values(itemsByType || {}).reduce((sum, value) => sum + value, 0);
  const details = [];
  if (!evidence) details.push('DB build evidence unavailable');
  else if (buildTurn === null) details.push('No initial build recorded');
  else {
    if (!firedByTurn2) details.push(`Initial build fired on customer turn ${buildTurn}`);
    if (evidence.providerUnavailable) details.push('VK Search was unavailable');
    if (!count) details.push('Initial build stored zero placed items');
  }
  return {
    id: 'initial-build',
    status: details.length ? 'FLAGGED' : 'PASS',
    ...(details.length ? { severity: 'major' } : {}),
    detail: details.join('. ') || `Built on customer turn ${buildTurn} with ${count} stored items`,
    firedByTurn2,
    buildTurn,
    itemsByType,
  };
}
