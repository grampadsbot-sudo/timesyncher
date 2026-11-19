#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { doorbellReasons, dryRunRecorded } from './host/vk_ship_round_core.mjs';
import {
  DATABASE_ENV_ID,
  PULLED_ENV_FILES,
  databaseUrlFromFiles,
  databaseUrlFromText,
  harnessEnvSkipped,
  loadStagingDatabaseUrl,
  markEnvBlocked,
} from './host/vk_ship_dry_env.mjs';

const url = 'postgres://dry-env-fixture@127.0.0.1/dry_env';
const text = `OPENROUTER_API_KEY="do-not-load"\nDATABASE_URL="${url}"\n`;
assert.equal(databaseUrlFromText(text), url);
assert.equal(databaseUrlFromText('DATABASE_URL=not-a-database\n'), '');
assert.equal(harnessEnvSkipped('SKIP harness: host env absent (DATABASE_URL and HARNESS_LIVE=1). Live run was not executed.\n'), true);
assert.equal(harnessEnvSkipped('scorecard written\n'), false);
const blocked = markEnvBlocked({ ran: true, verdict: 'FAIL' }, 'abc', 'run-1');
assert.equal(blocked.ran, false);
assert.equal(blocked.blockedEnv, true);
assert.equal(blocked.reason, 'blocked: env');
assert.equal(dryRunRecorded(blocked), false);
assert.equal(dryRunRecorded({ ran: true, blockedEnv: false, sha: 'abc' }), true);
const ring = doorbellReasons({ dryRun: blocked, needsRebase: [], errors: [] }, {});
assert.equal(ring.includes('blocked: env'), true);
assert.equal(ring.includes('new-failure'), false);
assert.equal(doorbellReasons({ dryRun: blocked, needsRebase: [], errors: [] }, { reason: 'blocked: env' }).includes('blocked: env'), false);
const files = { '/host/.env.production.local': text };
const found = databaseUrlFromFiles(['/host'], (file) => {
  if (!files[file]) throw new Error('missing');
  return files[file];
});
assert.equal(found.url, url);
assert.equal(found.source, '.env.production.local');
let fetched = '';
const loaded = await loadStagingDatabaseUrl({
  roots: ['/empty'],
  env: { VERCEL_TOKEN: 'vt_fixture', VERCEL_TEAM_ID: 'team_fixture' },
  readFile: () => { throw new Error('missing'); },
  fetchImpl: async (requestUrl) => {
    fetched = String(requestUrl);
    return { ok: true, json: async () => ({ key: 'DATABASE_URL', value: `"${url}"` }) };
  },
});
assert.equal(loaded.url, url);
assert.equal(loaded.source, 'vercel-database-url');
assert.equal(fetched.includes(DATABASE_ENV_ID), true);
assert.equal(fetched.includes('decrypt=true'), true);
assert.equal(fetched.includes('84Sr0i1odTrW9wLN'), false);
const source = readFileSync(new URL('./host/vk_ship_dry_env.mjs', import.meta.url), 'utf8');
assert.equal(source.includes('84Sr0i1odTrW9wLN'), false);
assert.equal(source.includes('OPENROUTER'), false);
assert.deepEqual(PULLED_ENV_FILES, ['.env.production.local', '.vercel/.env.production.local', '.env.local']);
const roundJs = readFileSync(new URL('./host/vk_ship_round.mjs', import.meta.url), 'utf8');
assert.match(roundJs, /HARNESS_LIVE: '1'/);
assert.equal(roundJs.includes('process.env.HARNESS_LIVE'), false);
console.log('test_acceptance_1041_ship_round_env: ok');
