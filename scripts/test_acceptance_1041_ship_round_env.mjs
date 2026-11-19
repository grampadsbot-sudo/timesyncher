#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isHarnessTag } from './harness/protected.mjs';
import { doorbellReasons, dryRunRecorded } from './host/vk_ship_round_core.mjs';
import {
  DATABASE_ENV_ID,
  PULLED_ENV_FILES,
  APP_DB_MODULE,
  NPM_STAMP_NAME,
  applyMissingScorecard,
  databaseUrlFromFiles,
  databaseUrlFromText,
  defaultVercelTokenFile,
  depsNeedInstall,
  dryRunId,
  ensureShipRepoDeps,
  harnessEnvSkipped,
  harnessFailureMessage,
  loadStagingDatabaseUrl,
  lockHash,
  markEnvBlocked,
  missingModule,
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
const tokenFile = '/fixture/vercel-token';
const fileToken = 'vt_file_fixture';
const dispatchPy = 'VERCEL_TEAM_ID = "team_from_dispatch"\nSTAGING_PROJECT_ID = "prj_from_dispatch"\n';
const tokenReads = {
  [tokenFile]: `${fileToken}\n`,
  '/dispatch/tsv_dispatch.py': dispatchPy,
};
let fileHeader = '';
let fileUrl = '';
const fromFile = await loadStagingDatabaseUrl({
  roots: ['/dispatch'],
  env: {},
  tokenFile,
  tokenFileExists: (file) => file === tokenFile,
  readFile: (file) => {
    if (!tokenReads[file]) throw new Error('missing');
    return tokenReads[file];
  },
  fetchImpl: async (requestUrl, init) => {
    fileUrl = String(requestUrl);
    fileHeader = init.headers.Authorization;
    return { ok: true, json: async () => ({ key: 'DATABASE_URL', value: url }) };
  },
});
assert.equal(fromFile.url, url);
assert.equal(fromFile.source, 'vercel-database-url');
assert.equal(fileHeader, `Bearer ${fileToken}`);
assert.equal(fileUrl.includes('teamId=team_from_dispatch'), true);
assert.equal(fileUrl.includes('prj_from_dispatch'), true);
assert.equal(fileUrl.includes(DATABASE_ENV_ID), true);
let missed = 0;
const absent = await loadStagingDatabaseUrl({
  roots: ['/dispatch'],
  env: {},
  tokenFile,
  tokenFileExists: () => false,
  readFile: () => { throw new Error('missing'); },
  fetchImpl: async () => { missed += 1; return { ok: false }; },
});
assert.equal(absent.url, '');
assert.equal(absent.source, '');
assert.equal(missed, 0);
assert.equal(defaultVercelTokenFile('/home/ubishere9995').endsWith('/.config/tsv-deploy/vercel-token'), true);
const id = dryRunId(new Date('2026-11-19T15:00:02.738Z'));
assert.equal(id, 'dry-run-20261119-1500-openrouter');
assert.equal(isHarnessTag(`harness:${id}:dry-run`), true);
assert.equal(isHarnessTag('harness:dry-run-2026-11-19T15-00-02-738Z-openrouter:dry-run'), false);
const stderr = 'file:///home/ubishere9995/tsv-dispatch/ship-repo/scripts/harness/protected.mjs:11\nError: refused: harness tag is invalid\n    at harnessTag (file:///home/ubishere9995/tsv-dispatch/ship-repo/scripts/harness/protected.mjs:11:11)\n';
assert.equal(harnessFailureMessage(stderr), 'refused: harness tag is invalid');
const failedRound = { errors: [], dryRun: { ran: true, verdict: '', reason: '', outputsPass: false } };
applyMissingScorecard(failedRound, stderr);
assert.deepEqual(failedRound.errors, ['refused: harness tag is invalid']);
assert.equal(failedRound.dryRun.verdict, 'FAIL');
assert.equal(failedRound.dryRun.reason, 'refused: harness tag is invalid');
assert.equal(failedRound.dryRun.ran, false);
assert.equal(failedRound.dryRun.blockedEnv, true);
assert.equal(dryRunRecorded(failedRound.dryRun), false);
const crashRing = doorbellReasons({ dryRun: failedRound.dryRun, needsRebase: [], errors: failedRound.errors }, {});
assert.equal(crashRing.includes('blocked: env'), true);
assert.equal(crashRing.includes('new-failure'), false);
const lock = '{"name":"timesyncher"}\n';
const repoFiles = { '/repo/package-lock.json': lock };
const readRepo = (file) => { if (repoFiles[file] == null) throw new Error('missing'); return repoFiles[file]; };
const writeRepo = (file, text) => { repoFiles[file] = text; };
const repoExists = (file) => repoFiles[file] != null;
let spawns = 0;
const spawn = (cmd, args, opts) => {
  spawns += 1;
  assert.equal(cmd, 'npm');
  assert.deepEqual(args, ['ci', '--no-audit', '--no-fund']);
  assert.equal(opts.cwd, '/repo');
  repoFiles['/repo/node_modules'] = 'dir';
  repoFiles[`/repo/node_modules/${APP_DB_MODULE}/package.json`] = '{}';
  return { status: 0 };
};
assert.equal(ensureShipRepoDeps({ repo: '/repo', stateDir: '/state', readFile: readRepo, writeFile: writeRepo, exists: repoExists, spawn }), '');
assert.equal(spawns, 1);
assert.equal(String(repoFiles[`/state/${NPM_STAMP_NAME}`]).trim(), lockHash(lock));
assert.equal(ensureShipRepoDeps({ repo: '/repo', stateDir: '/state', readFile: readRepo, writeFile: writeRepo, exists: repoExists, spawn }), '');
assert.equal(spawns, 1);
repoFiles['/repo/package-lock.json'] = `${lock}\n`;
assert.equal(depsNeedInstall({ hasNodeModules: true, lockHash: lockHash(repoFiles['/repo/package-lock.json']), savedHash: lockHash(lock) }), true);
delete repoFiles[`/repo/node_modules/${APP_DB_MODULE}/package.json`];
assert.equal(missingModule('/repo', APP_DB_MODULE, repoExists), APP_DB_MODULE);
const blockedDeps = ensureShipRepoDeps({
  repo: '/repo',
  stateDir: '/state',
  readFile: readRepo,
  writeFile: writeRepo,
  spawn: () => ({ status: 1 }),
});
assert.equal(blockedDeps, `blocked: env ${APP_DB_MODULE}`);
const blockedRun = markEnvBlocked({ ran: true }, 'sha', 'run', blockedDeps);
assert.equal(dryRunRecorded(blockedRun), false);
assert.equal(doorbellReasons({ dryRun: blockedRun, needsRebase: [], errors: [blockedDeps] }, {}).includes('blocked: env'), true);
assert.equal(doorbellReasons({ dryRun: blockedRun, needsRebase: [], errors: [blockedDeps] }, {}).includes('new-failure'), false);
console.log('test_acceptance_1041_ship_round_env: ok');
