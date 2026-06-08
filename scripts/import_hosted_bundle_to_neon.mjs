#!/usr/bin/env node

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
}

function sourceMeta(record) {
  return record?.metadata || {};
}

async function applySchema(db, schemaPath) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = schema
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

async function assertTargetEmpty(db) {
  const tables = ['customers', 'trips', 'trip_things', 'budget_items', 'support_notes'];
  const counts = {};
  for (const table of tables) {
    const rows = await db.query(`select count(*)::int as count from ${table}`);
    counts[table] = rows[0].count;
  }
  const nonEmpty = Object.entries(counts).filter(([, count]) => Number(count) > 0);
  if (nonEmpty.length) {
    throw new Error(`Target tables are not empty: ${nonEmpty.map(([table, count]) => `${table}=${count}`).join(', ')}`);
  }
}

async function insertCustomers(db, customers) {
  const ids = new Map();
  for (const customer of customers) {
    const rows = await db`
      insert into customers (email, first_name, last_name, display_name, metadata)
      values (
        ${customer.email},
        ${customer.first_name},
        ${customer.last_name},
        ${customer.display_name},
        ${JSON.stringify(sourceMeta(customer))}::jsonb
      )
      returning id
    `;
    ids.set(customer.source_key, rows[0].id);
  }
  return ids;
}

async function insertTrips(db, trips, customerIds) {
  const ids = new Map();
  for (const trip of trips) {
    const customerId = customerIds.get(trip.customer_source_key) || null;
    const rows = await db`
      insert into trips (customer_id, title, destination, start_date, end_date, party, preferences, status, metadata)
      values (
        ${customerId},
        ${trip.title},
        ${trip.destination},
        ${trip.start_date},
        ${trip.end_date},
        ${JSON.stringify(trip.party || {})}::jsonb,
        ${JSON.stringify(trip.preferences || {})}::jsonb,
        ${trip.status || 'migrated'},
        ${JSON.stringify(sourceMeta(trip))}::jsonb
      )
      returning id
    `;
    ids.set(trip.source_key, rows[0].id);
  }
  return ids;
}

async function insertThings(db, things, tripIds) {
  const ids = new Map();
  for (const thing of things) {
    const tripId = tripIds.get(thing.trip_source_key);
    if (!tripId) throw new Error(`Missing trip mapping for thing ${thing.source_key}`);
    const rows = await db`
      insert into trip_things (
        trip_id, category, subtype, title, description, starts_at, ends_at,
        cost_estimate_cents, currency, location, links, ratings, metadata
      )
      values (
        ${tripId},
        ${thing.category},
        ${thing.subtype},
        ${thing.title},
        ${thing.description},
        ${thing.starts_at},
        ${thing.ends_at},
        ${thing.cost_estimate_cents},
        ${thing.currency || 'usd'},
        ${JSON.stringify(thing.location || {})}::jsonb,
        ${JSON.stringify(thing.links || [])}::jsonb,
        ${JSON.stringify(thing.ratings || {})}::jsonb,
        ${JSON.stringify(sourceMeta(thing))}::jsonb
      )
      returning id
    `;
    ids.set(thing.source_key, rows[0].id);
  }
  return ids;
}

async function insertBudgetItems(db, budgetItems, tripIds, thingIds) {
  for (const item of budgetItems) {
    const tripId = tripIds.get(item.trip_source_key);
    if (!tripId) throw new Error(`Missing trip mapping for budget item ${item.source_key}`);
    const sourceThingId = item.source_thing_key ? thingIds.get(item.source_thing_key) || null : null;
    await db`
      insert into budget_items (trip_id, source_thing_id, category, label, amount_cents, currency, metadata)
      values (
        ${tripId},
        ${sourceThingId},
        ${item.category},
        ${item.label},
        ${item.amount_cents || 0},
        ${item.currency || 'usd'},
        ${JSON.stringify(sourceMeta(item))}::jsonb
      )
    `;
  }
}

async function insertSupportNotes(db, notes, tripIds) {
  for (const note of notes) {
    const tripId = note.trip_source_key ? tripIds.get(note.trip_source_key) || null : null;
    await db`
      insert into support_notes (trip_id, actor, note, metadata)
      values (
        ${tripId},
        ${note.actor || 'migration'},
        ${note.note || ''},
        ${JSON.stringify(sourceMeta(note))}::jsonb
      )
    `;
  }
}

async function countHosted(db) {
  const tables = ['customers', 'trips', 'trip_things', 'budget_items', 'support_notes'];
  const counts = {};
  for (const table of tables) {
    const rows = await db.query(`select count(*)::int as count from ${table}`);
    counts[table] = rows[0].count;
  }
  return counts;
}

async function main() {
  const bundlePath = arg('--bundle');
  const schemaPath = arg('--schema', 'db/migrations/001_vacation_mvp.sql');
  if (!bundlePath) throw new Error('--bundle is required');
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');

  const db = neon(url);
  const bundle = readJson(bundlePath);
  if (flag('--apply-schema')) await applySchema(db, schemaPath);
  if (!flag('--skip-empty-check')) await assertTargetEmpty(db);

  const customerIds = await insertCustomers(db, bundle.customers || []);
  const tripIds = await insertTrips(db, bundle.trips || [], customerIds);
  const thingIds = await insertThings(db, bundle.trip_things || [], tripIds);
  await insertBudgetItems(db, bundle.budget_items || [], tripIds, thingIds);
  await insertSupportNotes(db, bundle.support_notes || [], tripIds);

  const counts = await countHosted(db);
  const expected = {
    customers: bundle.customers?.length || 0,
    trips: bundle.trips?.length || 0,
    trip_things: bundle.trip_things?.length || 0,
    budget_items: bundle.budget_items?.length || 0,
    support_notes: bundle.support_notes?.length || 0,
  };
  const checks = Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [`${key}_match`, Number(counts[key]) === Number(value)])
  );
  const report = { ok: Object.values(checks).every(Boolean), expected, counts, checks };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
