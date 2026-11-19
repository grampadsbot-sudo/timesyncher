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
  MEDIA_BIND_ENV,
  defaultMediaBindTokenFile,
  loadHostMediaBindToken,
  loadStagingDatabaseUrl,
  provisionMediaBindToken,
  ensureMediaBindDeployed,
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
const mediaFile = '/fixture/media-bind-token';
const mediaToken = 'mb_fixture_token';
let mediaReads = 0;
const fromMediaFile = loadHostMediaBindToken({
  env: {},
  tokenFile: mediaFile,
  exists: (file) => file === mediaFile,
  readFile: (file) => { mediaReads += 1; assert.equal(file, mediaFile); return `${mediaToken}\n`; },
});
assert.equal(fromMediaFile.token, mediaToken);
assert.equal(fromMediaFile.source, 'file');
assert.equal(fromMediaFile.block, '');
assert.equal(fromMediaFile.block.includes(mediaToken), false);
const fromMediaEnv = loadHostMediaBindToken({
  env: { [MEDIA_BIND_ENV]: mediaToken },
  tokenFile: mediaFile,
  exists: () => { throw new Error('file should not be read'); },
  readFile: () => { throw new Error('file should not be read'); },
});
assert.equal(fromMediaEnv.source, 'env');
assert.equal(fromMediaEnv.token, mediaToken);
const missingMedia = loadHostMediaBindToken({
  env: {},
  tokenFile: mediaFile,
  exists: () => false,
  readFile: () => { throw new Error('missing'); },
});
assert.equal(missingMedia.token, '');
assert.match(missingMedia.block, new RegExp(`blocked: env ${MEDIA_BIND_ENV} missing at ${mediaFile}`));
assert.equal(missingMedia.block.includes(mediaToken), false);
assert.equal(defaultMediaBindTokenFile('/home/ubishere9995').endsWith('/.config/tsv-deploy/media-bind-token'), true);
assert.match(roundJs, /TIMESYNCHER_MEDIA_BIND_TOKEN: ready\.token/);
assert.match(roundJs, /ensureMediaBindDeployed/);
assert.match(roundJs.slice(roundJs.indexOf('async function runHarness')), /ensureMediaBindDeployed/);
const mediaBlocked = markEnvBlocked({ ran: true }, 'sha', 'run', missingMedia.block);
assert.equal(dryRunRecorded(mediaBlocked), false);
const generated = Buffer.from('provision-fixture-token-value');
const generatedToken = generated.toString('base64url');
const vercelToken = 'vt_fixture';
const mediaPath = '/fixture/config/media-bind-token';
const vercelPath = '/fixture/config/vercel-token';
const hostFiles = { [vercelPath]: `${vercelToken}\n` };
const writes = [];
const modes = [];
const calls = [];
const provisioned = await provisionMediaBindToken({
  env: { VERCEL_TEAM_ID: 'team_fixture', VERCEL_PROJECT_ID: 'timesyncher-vacation-staging' },
  roots: [],
  tokenFile: mediaPath,
  vercelTokenFile: vercelPath,
  exists: (file) => hostFiles[file] != null,
  readFile: (file) => hostFiles[file],
  mkdir: () => {},
  writeFile: (file, text, options) => { writes.push({ file, text, mode: options?.mode }); hostFiles[file] = text; },
  chmod: (file, mode) => { modes.push({ file, mode }); },
  random: () => generated,
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body || '', authorization: options.headers?.Authorization || '' });
    if (!options.method || options.method === 'GET') return { ok: true, status: 200, json: async () => ({ envs: [] }) };
    return { ok: true, status: 201, json: async () => ({}) };
  },
});
assert.equal(provisioned.provisioned, true);
assert.equal(provisioned.block, '');
assert.equal(provisioned.block.includes(generatedToken), false);
assert.equal(calls.every((call) => !String(call.url).includes(generatedToken)), true);
assert.equal(calls[0].method, 'GET');
assert.equal(calls[0].url.includes('timesyncher-vacation-staging'), true);
assert.equal(calls[0].url.includes('teamId=team_fixture'), true);
assert.equal(calls[0].authorization, `Bearer ${vercelToken}`);
assert.equal(calls[1].method, 'POST');
const created = JSON.parse(calls[1].body);
assert.equal(created.key, MEDIA_BIND_ENV);
assert.equal(created.type, 'sensitive');
assert.deepEqual(created.target, ['production', 'preview']);
assert.equal(created.value, generatedToken);
assert.equal(writes[0].mode, 0o600);
assert.equal(modes[0].mode, 0o600);
assert.equal(writes[0].text.includes(generatedToken), true);
const again = await provisionMediaBindToken({
  env: { VERCEL_TEAM_ID: 'team_fixture' },
  tokenFile: mediaPath,
  vercelTokenFile: vercelPath,
  exists: (file) => hostFiles[file] != null,
  readFile: (file) => hostFiles[file],
  fetchImpl: async () => { throw new Error('should not call vercel'); },
  random: () => { throw new Error('should not generate'); },
});
assert.equal(again.provisioned, false);
assert.equal(again.block, '');
const failed = await provisionMediaBindToken({
  env: { VERCEL_TEAM_ID: 'team_fixture', VERCEL_PROJECT_ID: 'timesyncher-vacation-staging' },
  tokenFile: '/fixture/missing-media',
  vercelTokenFile: vercelPath,
  exists: (file) => file === vercelPath,
  readFile: (file) => hostFiles[file],
  writeFile: () => { throw new Error('should not write'); },
  random: () => generated,
  fetchImpl: async (url, options) => {
    if (!options.method || options.method === 'GET') return { ok: true, status: 200, json: async () => ({ envs: [{ id: 'env_existing', key: MEDIA_BIND_ENV }] }) };
    assert.equal(options.method, 'PATCH');
    assert.equal(String(url).includes('env_existing'), true);
    return { ok: false, status: 403, json: async () => ({}) };
  },
});
assert.equal(failed.provisioned, false);
assert.equal(failed.block, `blocked: env ${MEDIA_BIND_ENV} upsert http 403`);
assert.equal(failed.block.includes(generatedToken), false);
assert.match(roundJs, /ensureMediaBindDeployed/);
const stamp = '/fixture/config/media-bind-needs-deploy';
const bound = '/fixture/config/round-media-bind-token';
const boundFiles = { [vercelPath]: `${vercelToken}\n` };
const deployErrors = [];
try {
  await ensureMediaBindDeployed({
    env: { VERCEL_TEAM_ID: 'team_fixture', VERCEL_PROJECT_ID: 'timesyncher-vacation-staging' },
    roots: [],
    stampFile: stamp,
    tokenFile: bound,
    vercelTokenFile: vercelPath,
    exists: (file) => boundFiles[file] != null,
    readFile: (file) => boundFiles[file],
    writeFile: (file, text) => { boundFiles[file] = text; },
    remove: (file) => { delete boundFiles[file]; },
    mkdir: () => {},
    chmod: () => {},
    random: () => generated,
    fetchImpl: async (url, options) => {
      if (!options?.method || options.method === 'GET') return { ok: true, status: 200, json: async () => ({ envs: [] }) };
      return { ok: true, status: 201, json: async () => ({}) };
    },
    deploy: async () => { deployErrors.push('deploy'); throw new Error('deploy failed'); },
  });
  assert.fail('deploy failure should surface');
} catch (error) {
  assert.equal(error.message, 'deploy failed');
}
assert.deepEqual(deployErrors, ['deploy']);
assert.equal(boundFiles[stamp], '1\n');
assert.equal(String(boundFiles[stamp]).includes(generatedToken), false);
assert.equal(String(boundFiles[bound]).includes(generatedToken), true);
const retried = [];
const second = await ensureMediaBindDeployed({
  env: {},
  stampFile: stamp,
  tokenFile: bound,
  vercelTokenFile: vercelPath,
  exists: (file) => boundFiles[file] != null,
  readFile: (file) => boundFiles[file],
  writeFile: () => { throw new Error('should not write'); },
  remove: (file) => { delete boundFiles[file]; },
  random: () => { throw new Error('should not generate'); },
  fetchImpl: async () => { throw new Error('should not call vercel'); },
  deploy: async () => { retried.push('deploy'); },
});
assert.deepEqual(retried, ['deploy']);
assert.equal(second.deployed, true);
assert.equal(second.token, generatedToken);
assert.equal(second.block, '');
assert.equal(boundFiles[stamp], undefined);
const third = await ensureMediaBindDeployed({
  env: {},
  stampFile: stamp,
  tokenFile: bound,
  vercelTokenFile: vercelPath,
  exists: (file) => boundFiles[file] != null,
  readFile: (file) => boundFiles[file],
  remove: () => { throw new Error('should not remove'); },
  random: () => { throw new Error('should not generate'); },
  fetchImpl: async () => { throw new Error('should not call vercel'); },
  deploy: async () => { throw new Error('should not deploy'); },
});
assert.equal(third.deployed, false);
assert.equal(third.provisioned, false);
assert.equal(third.token, generatedToken);
console.log('test_acceptance_1041_ship_round_env: ok');
