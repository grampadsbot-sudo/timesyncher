import { createHash } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { getDatabaseUrl, sql } from './db.mjs';
import { tripStateActionsEnabled } from './trip-state-actions-enabled.mjs';
import { assertTripState, projectTripState } from './trip-state-projector.mjs';
import { digestTripState } from './trip-state-action-site.mjs';

export async function listTripStateRevisions(tripId, db = sql()) {
  return db`
    select * from vacation_trip_state_revisions where trip_id = ${tripId} order by revision
  `;
}

export async function getTripStateRevisionForTurn(tripId, turn, db = sql()) {
  const [row] = await db`
    select * from vacation_trip_state_revisions
    where trip_id = ${tripId} and turn = ${turn}
    order by revision desc limit 1
  `;
  return row || null;
}

async function readSite(client, trip, requestId, turn) {
  const { rows: [site] } = await client.query(
    `select
      coalesce((select jsonb_agg(to_jsonb(t) - 'created_at' order by t.created_at, t.id) from (
        select id, category, title, description, metadata, ratings, location, source,
          starts_at::text, ends_at::text, created_at
        from trip_things where trip_id = $1
      ) t), '[]'::jsonb) as things,
      coalesce((select jsonb_object_agg(id, record)
        from vacation_trip_state_held_invites where trip_id = $1), '{}'::jsonb) as invites,
      coalesce((select jsonb_agg(jsonb_build_object('operation_key', operation_key, 'record', record) order by operation_key)
        from vacation_trip_state_action_receipts where trip_id = $1 and request_id = $2), '[]'::jsonb) as receipts,
      coalesce((select jsonb_object_agg(id, jsonb_build_object(
          'name', name, 'access', access, 'status', status, 'via', 'legacy_site', 'turn', $3::integer))
        from (
          select id, nullif(left(trim(display_name), 280), '') as name, 'collaborator' as access, status
          from vacation_collaborators where trip_id = $1
          union all
          select id, nullif(left(trim(display_name), 280), ''),
            case role when 'web_editor' then 'edit' when 'viewer' then 'view'
              when 'owner' then 'owner' else 'collaborator' end,
            case status when 'accepted' then 'active' else 'revoked' end
          from vacation_web_access_grants where trip_id = $1 and status in ('accepted', 'revoked', 'expired')
        ) members), '{}'::jsonb) as collaborators`,
    [trip.id, requestId, turn],
  );
  return { ...site, trip };
}

async function revisionForRequest(client, tripId, requestId, phase) {
  const { rows: [row] } = await client.query(
    'select * from vacation_trip_state_revisions where trip_id = $1 and request_id = $2 and phase = $3',
    [tripId, requestId, phase],
  );
  return row || null;
}

async function insertRevision(client, requestId, state, replyId = null) {
  assertTripState(state);
  const bytes = JSON.stringify(state);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const { rows: [row] } = await client.query(
    `insert into vacation_trip_state_revisions
      (trip_id, revision, request_id, turn, phase, schema_version, digest, state_json, shipped_reply_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [state.trip_id, state.revision, requestId, state.updated_turn, state.phase, state.version, digest, bytes, replyId],
  );
  return row;
}

async function nextRevision(client, tripId) {
  const { rows: [row] } = await client.query(
    'select coalesce(max(revision), 0) + 1 as revision from vacation_trip_state_revisions where trip_id = $1',
    [tripId],
  );
  return row.revision;
}

function transactionSql(client) {
  return async (parts, ...params) => {
    const statement = parts.reduce((query, part, index) => index ? `${query}$${index}${part}` : part, '');
    return (await client.query(statement, params)).rows;
  };
}

function replyStateDigest({ saved, last_actions, tool_status }) {
  return digestTripState({ saved, last_actions, tool_status });
}

export function createTripStateRevisionStore({ env = process.env, pool } = {}) {
  async function withTripLock(tripId, callback) {
    const activePool = pool || new Pool({ connectionString: getDatabaseUrl(env) });
    try {
      const client = await activePool.connect();
      try {
        await client.query('begin');
        const { rows: [trip] } = await client.query(
          `select id, customer_id, title, destination, start_date::text, end_date::text, metadata, status
           from trips where id = $1 for no key update`, [tripId],
        );
        const value = trip && tripStateActionsEnabled({ env, trip }) ? await callback(client, trip) : null;
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    } finally {
      if (!pool) await activePool.end();
    }
  }

  return {
    async prepare({ trip, requestId, turn, phase = 'reply_ready', actorId, ...context }) {
      if (!trip?.id || !tripStateActionsEnabled({ env, trip })) return null;
      if (!['planning', 'reply_ready'].includes(phase)) throw new TypeError('Invalid Trip State preparation phase');
      return withTripLock(trip.id, async (client, currentTrip) => {
        const existing = await revisionForRequest(client, trip.id, requestId, phase);
        if (existing) return existing;
        const { rows: [latest] } = await client.query(
          `select turn, state_json from vacation_trip_state_revisions where trip_id = $1
           order by turn desc, revision desc limit 1`,
          [trip.id],
        );
        const planning = await revisionForRequest(client, trip.id, requestId, 'planning');
        const previous = planning || latest;
        const nextTurn = planning?.turn ?? Math.max(turn, (latest?.turn ?? 0) + 1);
        const { receipts, ...site } = await readSite(client, currentTrip, requestId, nextTurn);
        const state = projectTripState({
          ...context, trip: currentTrip, site, receipts, requestId, phase, env,
          turn: nextTurn, revision: await nextRevision(client, trip.id),
          grant: actorId === currentTrip.customer_id ? 'owner' : context.grant,
          previous: previous && JSON.parse(previous.state_json),
        });
        return insertRevision(client, requestId, state);
      });
    },

    async ship({ tripId, requestId, writeReply, pin = null }) {
      return withTripLock(tripId, async (client, trip) => {
        const existing = await revisionForRequest(client, tripId, requestId, 'shipped');
        if (existing) {
          const { rows: [reply] } = await client.query(
            'select id, body from transcript_turns where id = $1', [existing.shipped_reply_id],
          );
          return { reply: { ...reply, duplicateSuppressed: true }, revision: existing };
        }
        const ready = await revisionForRequest(client, tripId, requestId, 'reply_ready');
        if (!ready) return null;
        const readyState = JSON.parse(ready.state_json);
        if (pin) {
          if (pin.trip_id !== tripId || pin.revision !== ready.revision || pin.revision_digest !== ready.digest) return null;
          const { receipts, ...site } = await readSite(client, trip, requestId, ready.turn);
          const current = projectTripState({
            trip, site, receipts, requestId, turn: ready.turn, revision: ready.revision, previous: readyState, env,
          });
          if (replyStateDigest(current) !== replyStateDigest(readyState)) return null;
        }
        const reply = await writeReply(transactionSql(client));
        const state = { ...readyState, phase: 'shipped', revision: await nextRevision(client, tripId) };
        const revision = await insertRevision(client, requestId, state, reply.id);
        return { reply, revision };
      });
    },
  };
}
