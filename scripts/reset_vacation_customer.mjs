#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

function loadEnv(path = '.env.local') {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function usage() {
  console.error(`Usage:
  node scripts/reset_vacation_customer.mjs --telegram-user-id <id> [--execute]
  node scripts/reset_vacation_customer.mjs --email <email> [--execute]

Default mode is a dry run.

Options:
  --trip-match <text>    Only reset trips whose title/destination/metadata matches text
  --execute              Preserve Things and delete customer/trip runtime rows
  --keep-transcripts     Preserve transcript rows with customer_id nulled instead of deleting by trip
`);
}

function readArgs(argv) {
  const args = {
    telegramUserId: '',
    email: '',
    tripMatch: '',
    execute: false,
    keepTranscripts: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--telegram-user-id') args.telegramUserId = argv[++i] || '';
    else if (arg === '--email') args.email = argv[++i] || '';
    else if (arg === '--trip-match') args.tripMatch = argv[++i] || '';
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--keep-transcripts') args.keepTranscripts = true;
    else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exit(2);
    }
  }
  args.telegramUserId = String(args.telegramUserId || '').trim().replace(/^telegram:/, '');
  args.email = String(args.email || '').trim().toLowerCase();
  args.tripMatch = String(args.tripMatch || '').trim();
  if (!args.telegramUserId && !args.email) {
    usage();
    process.exit(2);
  }
  return args;
}

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = String(email).split('@');
  return `${name?.[0] || '*'}***@${domain?.[0] || '*'}***`;
}

function shortId(id) {
  return id ? `${String(id).slice(0, 8)}...` : null;
}

async function ensureResetTables(db) {
  await db`
    create table if not exists preserved_travel_things (
      id uuid primary key default gen_random_uuid(),
      reset_id uuid not null,
      source_customer_id uuid,
      source_trip_id uuid,
      source_thing_id uuid,
      category text not null,
      subtype text,
      title text not null,
      description text,
      starts_at timestamptz,
      ends_at timestamptz,
      cost_estimate_cents integer,
      currency text not null default 'usd',
      location jsonb not null default '{}'::jsonb,
      links jsonb not null default '[]'::jsonb,
      ratings jsonb not null default '{}'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      preserved_at timestamptz not null default now()
    )
  `;
  await db`create index if not exists idx_preserved_travel_things_reset on preserved_travel_things(reset_id)`;
  await db`create index if not exists idx_preserved_travel_things_category on preserved_travel_things(category, subtype)`;
  await db`
    create table if not exists vacation_customer_reset_receipts (
      id uuid primary key,
      target jsonb not null default '{}'::jsonb,
      counts jsonb not null default '{}'::jsonb,
      notes jsonb not null default '{}'::jsonb,
      executed_at timestamptz not null default now()
    )
  `;
}

async function selectTargets(db, args) {
  const telegramKey = args.telegramUserId ? `telegram:${args.telegramUserId}` : '';
  const customers = await db`
    select distinct c.*
    from customers c
    left join telegram_sessions ts on ts.customer_id = c.id
    where (${telegramKey} = '' or c.telegram_user_id = ${telegramKey} or ts.telegram_user_id = ${telegramKey} or ts.telegram_chat_id = ${args.telegramUserId})
      and (${args.email} = '' or lower(c.email) = lower(${args.email}))
    order by c.created_at asc
  `;

  const targets = [];
  for (const customer of customers) {
    const trips = args.tripMatch
      ? await db`
          select *
          from trips
          where customer_id = ${customer.id}
            and (
              title ilike ${`%${args.tripMatch}%`}
              or destination ilike ${`%${args.tripMatch}%`}
              or metadata::text ilike ${`%${args.tripMatch}%`}
            )
          order by created_at asc
        `
      : await db`select * from trips where customer_id = ${customer.id} order by created_at asc`;
    targets.push({ customer, trips });
  }
  return targets;
}

async function countsFor(db, customerId, tripIds) {
  const rows = await db`
    select
      (select count(*) from trip_things where trip_id = any(${tripIds}::uuid[])) as trip_things,
      (select count(*) from budget_items where trip_id = any(${tripIds}::uuid[])) as budget_items,
      (select count(*) from vacation_requests where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as vacation_requests,
      (select count(*) from worker_jobs where trip_id = any(${tripIds}::uuid[]) or request_id in (select id from vacation_requests where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId})) as worker_jobs,
      (select count(*) from transcript_turns where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as transcript_turns,
      (select count(*) from support_notes where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as support_notes,
      (select count(*) from onboarding_sessions where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as onboarding_sessions,
      (select count(*) from telegram_sessions where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as telegram_sessions,
      (select count(*) from paid_orders where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as paid_orders,
      (select count(*) from entitlements where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}) as entitlements
  `;
  return Object.fromEntries(Object.entries(rows[0] || {}).map(([key, value]) => [key, Number(value || 0)]));
}

async function executeReset(db, args, target) {
  const resetId = crypto.randomUUID();
  const customerId = target.customer.id;
  const tripIds = target.trips.map((trip) => trip.id);
  const before = await countsFor(db, customerId, tripIds);

  await ensureResetTables(db);
  const preservedThings = before.trip_things || 0;
  const transcriptQuery = args.keepTranscripts
    ? (tx) => tx`update transcript_turns set customer_id = null, trip_id = null where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`
    : (tx) => tx`delete from transcript_turns where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`;

  await db.transaction((tx) => [
    tx`
      insert into preserved_travel_things (
        reset_id, source_customer_id, source_trip_id, source_thing_id, category, subtype, title, description,
        starts_at, ends_at, cost_estimate_cents, currency, location, links, ratings, metadata
      )
      select
        ${resetId}, ${customerId}, trip_id, id, category, subtype, title, description,
        starts_at, ends_at, cost_estimate_cents, currency, location, links, ratings,
        metadata || jsonb_build_object('preservedFromCustomerReset', true, 'preservedAt', now())
      from trip_things
      where trip_id = any(${tripIds}::uuid[])
    `,
    tx`
      update paid_orders
      set customer_id = null,
        trip_id = null,
        entitlement_id = null,
        contact = '{}'::jsonb,
        metadata = metadata || jsonb_build_object('customerResetId', ${resetId}::text, 'customerResetAt', now()),
        updated_at = now()
      where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}
    `,
    tx`delete from outbound_emails where customer_id = ${customerId} or order_id in (select id from paid_orders where metadata->>'customerResetId' = ${resetId})`,
    tx`delete from onboarding_sessions where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`,
    tx`delete from telegram_sessions where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`,
    tx`delete from worker_jobs where trip_id = any(${tripIds}::uuid[]) or request_id in (select id from vacation_requests where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId})`,
    tx`delete from vacation_requests where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`,
    transcriptQuery(tx),
    tx`delete from support_notes where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`,
    tx`delete from budget_items where trip_id = any(${tripIds}::uuid[])`,
    tx`delete from trip_things where trip_id = any(${tripIds}::uuid[])`,
    tx`delete from entitlements where trip_id = any(${tripIds}::uuid[]) or customer_id = ${customerId}`,
    tx`delete from trips where id = any(${tripIds}::uuid[])`,
    tx`delete from customers where id = ${customerId}`,
    tx`
      insert into vacation_customer_reset_receipts (id, target, counts, notes)
      values (
        ${resetId},
        ${{
          customerId,
          email: maskEmail(target.customer.email),
          telegramUserId: target.customer.telegram_user_id,
          displayName: target.customer.display_name,
          tripIds,
          tripTitles: target.trips.map((trip) => trip.title),
        }},
        ${{
          before,
          preservedThings,
          deletedTrips: tripIds.length,
        }},
        ${{
          reason: 'customer requested hosted onboarding reset',
          preserved: 'trip_things copied to preserved_travel_things',
          paidOrders: 'kept with contact/customer/trip references removed',
        }}
      )
    `,
  ]);
  return { resetId, before, preservedThings };
}

loadEnv();
const args = readArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL or NEON_DATABASE_URL is required.');
  process.exit(2);
}

const db = neon(databaseUrl);
const targets = await selectTargets(db, args);

if (!targets.length) {
  console.log(JSON.stringify({ ok: true, found: false, executed: false }, null, 2));
  process.exit(0);
}

const summaries = [];
for (const target of targets) {
  const tripIds = target.trips.map((trip) => trip.id);
  const counts = tripIds.length ? await countsFor(db, target.customer.id, tripIds) : {};
  summaries.push({
    customer: {
      id: shortId(target.customer.id),
      email: maskEmail(target.customer.email),
      telegramUserId: target.customer.telegram_user_id,
      displayName: target.customer.display_name,
    },
    trips: target.trips.map((trip) => ({
      id: shortId(trip.id),
      title: trip.title,
      destination: trip.destination,
      status: trip.status,
    })),
    counts,
  });
}

if (!args.execute) {
  console.log(JSON.stringify({ ok: true, found: true, executed: false, targets: summaries }, null, 2));
  process.exit(0);
}

const results = [];
for (let i = 0; i < targets.length; i += 1) {
  const target = targets[i];
  if (!target.trips.length) continue;
  const result = await executeReset(db, args, target);
  results.push({
    resetId: result.resetId,
    target: summaries[i],
    preservedThings: result.preservedThings,
  });
}

console.log(JSON.stringify({ ok: true, found: true, executed: true, results }, null, 2));
