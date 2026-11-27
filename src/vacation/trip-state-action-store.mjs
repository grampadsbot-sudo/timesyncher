import { Pool } from '@neondatabase/serverless';
import { getDatabaseUrl } from './db.mjs';
import { insertTripStateThing } from './trip-things.mjs';

async function readSite(client, { tripId, actorId, requestId, operationKey }, lock = false) {
  const trip = (await client.query(
    `select id, customer_id, title, destination, start_date::text, end_date::text, metadata, status
     from trips where id = $1 and customer_id = $2${lock ? ' for update' : ''}`,
    [tripId, actorId],
  )).rows[0];
  if (!trip) return null;
  const things = (await client.query(
    `select id, category, title, description, metadata, ratings, location, source, starts_at::text, ends_at::text
     from trip_things where trip_id = $1 order by created_at, id`, [tripId],
  )).rows;
  const invites = Object.fromEntries((await client.query(
    'select id, record from vacation_trip_state_held_invites where trip_id = $1 order by id', [tripId],
  )).rows.map(({ id, record }) => [id, record]));
  const record = (await client.query(
    'select record from vacation_trip_state_action_receipts where trip_id = $1 and request_id = $2 and operation_key = $3',
    [tripId, requestId, operationKey],
  )).rows[0]?.record;
  return { trip, things, invites, record };
}

async function writeSite(client, context, old, next, record) {
  const previousThings = new Map(old.things.map((row) => [row.id, row]));
  for (const row of next.things) {
    const previous = previousThings.get(row.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(row)) continue;
    if (previous) {
      await client.query(
        `update trip_things set title = $3, metadata = $4, updated_at = now() where trip_id = $1 and id = $2`,
        [context.tripId, row.id, row.title, row.metadata],
      );
    } else {
      await insertTripStateThing(client, {
        tripId: context.tripId,
        id: row.id,
        category: row.category,
        title: row.title,
        metadata: row.metadata,
        source: row.source || 'customer',
      });
    }
  }
  for (const [id, invite] of Object.entries(next.invites)) {
    if (JSON.stringify(old.invites[id]) === JSON.stringify(invite)) continue;
    await client.query(
      `insert into vacation_trip_state_held_invites (trip_id, id, record) values ($1, $2, $3)
       on conflict (trip_id, id) do update set record = excluded.record`,
      [context.tripId, id, invite],
    );
  }
  await client.query(
    'insert into vacation_trip_state_action_receipts (trip_id, request_id, operation_key, record) values ($1, $2, $3, $4)',
    [context.tripId, context.requestId, context.operationKey, record],
  );
}

export function createTripStateActionStore({ env = process.env, pool, transactionClient } = {}) {
  const connectionString = transactionClient ? null : getDatabaseUrl(env);
  const available = Boolean(transactionClient || pool || connectionString);
  async function inTransaction(write, callback) {
    if (transactionClient) return callback(transactionClient);
    if (!available) throw new Error('Trip State action store is unavailable');
    const activePool = pool || new Pool({ connectionString });
    try {
      const client = await activePool.connect();
      try {
        await client.query(write ? 'begin isolation level serializable' : 'begin isolation level repeatable read read only');
        const value = await callback(client);
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
    available,
    async read(context) {
      return await inTransaction(false, async (client) => await readSite(client, context));
    },
    async transact(context, decide) {
      return await inTransaction(true, async (client) => {
        const site = await readSite(client, context, true);
        if (!site) return null;
        const decision = decide(site);
        if (decision.next) await writeSite(client, context, site, decision.next, decision.record);
        return decision.record;
      });
    },
  };
}
