#!/usr/bin/env node

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const schemaPath = process.argv[2] || 'db/migrations/001_vacation_mvp.sql';
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  if (!databaseUrl) throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');
  const db = neon(databaseUrl);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitStatements(schema);
  for (const statement of statements) {
    await db.query(statement);
  }
  console.log(JSON.stringify({ ok: true, schemaPath, statements: statements.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
