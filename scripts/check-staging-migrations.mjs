#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

function databaseUrl(env = process.env) {
  return env.DATABASE_URL || env.NEON_DATABASE_URL || '';
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(db) {
  await db`
    create table if not exists vacation_schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;
}

async function listAppliedMigrations(db) {
  await ensureMigrationsTable(db);
  const rows = await db`select name from vacation_schema_migrations order by name asc`;
  return rows.map((row) => row.name);
}

async function bootstrapLegacyMigrations(db) {
  await ensureMigrationsTable(db);
  const applied = new Set(await listAppliedMigrations(db));
  const trips = await db`select to_regclass('public.trips') as t`;
  if (trips[0]?.t && !applied.has('001_vacation_mvp.sql')) {
    await db`insert into vacation_schema_migrations (name) values ('001_vacation_mvp.sql') on conflict (name) do nothing`;
  }
  const bindings = await db`select to_regclass('public.thing_media_bindings') as t`;
  if (bindings[0]?.t && !applied.has('002_thing_media_bindings.sql')) {
    await db`insert into vacation_schema_migrations (name) values ('002_thing_media_bindings.sql') on conflict (name) do nothing`;
  }
}

async function applyPendingMigrations(db, { dryRun = false } = {}) {
  if (!dryRun) await bootstrapLegacyMigrations(db);
  const files = listMigrationFiles();
  const applied = new Set(await listAppliedMigrations(db));
  const pending = files.filter((name) => !applied.has(name));
  const appliedNow = [];

  for (const name of pending) {
    const fullPath = path.join(MIGRATIONS_DIR, name);
    const sqlText = fs.readFileSync(fullPath, 'utf8');
    const statements = splitStatements(sqlText);
    if (dryRun) {
      appliedNow.push(name);
      continue;
    }
    for (const statement of statements) {
      await db.query(statement);
    }
    await db`insert into vacation_schema_migrations (name) values (${name}) on conflict (name) do nothing`;
    appliedNow.push(name);
  }

  return { files, applied: [...applied], pending, appliedNow };
}

async function assertAllMigrationsApplied(db) {
  await bootstrapLegacyMigrations(db);
  const { files, applied } = await applyPendingMigrations(db, { dryRun: true });
  const appliedSet = new Set(applied);
  const missing = files.filter((name) => !appliedSet.has(name));
  if (missing.length) {
    const error = new Error(`pending migrations: ${missing.join(', ')}`);
    error.missing = missing;
    throw error;
  }
  return { ok: true, files, applied: [...appliedSet].sort() };
}

async function main() {
  const mode = process.argv.includes('--apply') ? 'apply' : 'check';
  const url = databaseUrl();
  if (!url) {
    console.error('DATABASE_URL or NEON_DATABASE_URL is required');
    process.exit(1);
  }
  const db = neon(url);

  if (mode === 'apply') {
    const result = await applyPendingMigrations(db);
    console.log(JSON.stringify({
      ok: true,
      mode,
      repo: result.files,
      alreadyApplied: result.applied,
      appliedNow: result.appliedNow,
    }, null, 2));
    return;
  }

  try {
    const result = await assertAllMigrationsApplied(db);
    console.log(JSON.stringify({ ok: true, mode, repo: result.files, applied: result.applied }, null, 2));
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
