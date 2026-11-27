#!/usr/bin/env node
import {
  provenanceDedupeKey,
  tripThingGateViolations,
} from '../src/vacation/intake-thing-admission.mjs';
import {
  LOPEZ_CUSTOMER_DISPLAY,
  LOPEZ_TRIP_TITLE,
  lopezBadPhraseRows,
} from './fixtures/lopez-intake-phrase-rows.mjs';

const FORBIDDEN_TRIP_IDS = new Set([
  'd0463815',
  '99',
]);

export function planLopezPhraseCleanup(things = [], { itineraryTitles = [] } = {}) {
  const violations = tripThingGateViolations(things, { itineraryTitles });
  const removeIds = new Set(violations.map((row) => row.id).filter(Boolean));
  const mergePairs = [];
  const rows = Array.isArray(things) ? things : [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      const leftKey = provenanceDedupeKey(left);
      const rightKey = provenanceDedupeKey(right);
      if (!leftKey || leftKey !== rightKey) continue;
      const keep = String(left?.id || '');
      const drop = String(right?.id || '');
      if (!keep || !drop) continue;
      mergePairs.push({ keepId: keep, dropId: drop, keepTitle: left.title, dropTitle: right.title });
      removeIds.add(drop);
    }
  }
  return {
    removeIds: [...removeIds],
    mergePairs,
    violations,
  };
}

export function assertLopezTripGuard({ tripId = '', title = '', customerDisplay = '' } = {}) {
  if (FORBIDDEN_TRIP_IDS.has(String(tripId).trim())) {
    throw new Error(`forbidden trip id ${tripId}`);
  }
  if (String(title).trim() !== LOPEZ_TRIP_TITLE) {
    throw new Error(`trip title must be ${LOPEZ_TRIP_TITLE}`);
  }
  if (String(customerDisplay).trim() !== LOPEZ_CUSTOMER_DISPLAY) {
    throw new Error(`customer must be ${LOPEZ_CUSTOMER_DISPLAY}`);
  }
}

async function loadTripRows(db, tripId) {
  return db`
    select id, title, category, metadata, source, description
    from trip_things
    where trip_id = ${tripId}::uuid
  `;
}

async function loadTripMeta(db, tripId) {
  const rows = await db`
    select t.title, c.display_name
    from trips t
    join customers c on c.id = t.customer_id
    where t.id = ${tripId}::uuid
    limit 1
  `;
  return rows[0] || {};
}

function printPlan(plan) {
  for (const id of plan.removeIds) process.stdout.write(`remove\t${id}\n`);
  for (const pair of plan.mergePairs) {
    process.stdout.write(`merge\t${pair.dropId}\tinto\t${pair.keepId}\t${pair.dropTitle}\n`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const tripId = argv.find((arg) => !arg.startsWith('--'));
  if (!tripId) {
    console.error('usage: cleanup_lopez_phrase_things.mjs <trip-id> [--apply]');
    process.exit(2);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL required');
    process.exit(2);
  }
  const { neon } = await import('@neondatabase/serverless');
  const db = neon(databaseUrl);
  const meta = await loadTripMeta(db, tripId);
  assertLopezTripGuard({ tripId, title: meta.title, customerDisplay: meta.display_name });
  const things = await loadTripRows(db, tripId);
  const plan = planLopezPhraseCleanup(things);
  printPlan(plan);
  if (!apply) {
    process.stdout.write('dry-run only (pass --apply to delete)\n');
    return;
  }
  for (const id of plan.removeIds) {
    await db`delete from trip_things where id = ${id}::uuid and trip_id = ${tripId}::uuid`;
  }
  process.stdout.write(`applied removals: ${plan.removeIds.length}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(2);
  });
}

export function dryRunLopezFixture() {
  return planLopezPhraseCleanup(lopezBadPhraseRows);
}