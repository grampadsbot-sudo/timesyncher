#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import { pathToFileURL } from 'node:url';
import { authorizeLogoReenrichment, reenrichTripLogos } from '../src/vacation/logo-reenrichment.mjs';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

async function main() {
  const url = String(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');
  const actor = authorizeLogoReenrichment({ token: process.env.TIMESYNCHER_OPERATOR_TOKEN, actor: arg('actor') }, process.env);
  const result = await reenrichTripLogos({
    db: neon(url),
    tripId: arg('trip'),
    thingIds: arg('things').split(',').map((id) => id.trim()).filter(Boolean),
    actor,
    apply: process.argv.includes('--apply'),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
}
