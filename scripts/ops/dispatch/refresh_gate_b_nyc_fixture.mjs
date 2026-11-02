#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NYC_DAYBYDAY_SLUG = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const defaultOut = resolve(repoRoot, 'scripts/fixtures/gate-b-nyc-shared-staging.json');

function usage() {
  process.stderr.write(
    'usage: refresh_gate_b_nyc_fixture.mjs [--out <path>] [--base <staging-origin>]\n',
  );
  process.exit(2);
}

function parseArgs(argv) {
  let out = defaultOut;
  let base = process.env.TSV_CAPTURE_BASE || 'https://vacation-staging.timesyncher.com';
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = resolve(String(argv[++i] || ''));
      continue;
    }
    if (argv[i] === '--base') {
      base = String(argv[++i] || '').replace(/\/+$/, '');
      continue;
    }
    if (argv[i] === '-h' || argv[i] === '--help') usage();
    usage();
  }
  return { out, base };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function main() {
  const { out, base } = parseArgs(process.argv);
  const version = await fetchJson(`${base}/api/version`);
  const sourceSha = String(version.sha || version.commit || '').trim();
  if (!sourceSha) throw new Error(`staging /api/version missing sha (${base})`);

  const shared = await fetchJson(`${base}/api/shared/${encodeURIComponent(NYC_DAYBYDAY_SLUG)}`);
  if (!shared || typeof shared !== 'object') throw new Error('shared payload is not an object');

  const pulledAt = new Date().toISOString();
  const trip = shared.trip && typeof shared.trip === 'object' ? { ...shared.trip } : {};
  const metadata = trip.metadata && typeof trip.metadata === 'object' ? { ...trip.metadata } : {};
  metadata.gateBNycFixturePull = {
    sourceSha,
    pulledAt,
    stagingBase: base,
    shareToken: NYC_DAYBYDAY_SLUG,
  };
  trip.metadata = metadata;

  const body = { ...shared, trip };
  writeFileSync(out, `${JSON.stringify(body, null, 1)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    out,
    sourceSha,
    pulledAt,
    places: Array.isArray(body.places) ? body.places.length : 0,
  })}\n`);
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
