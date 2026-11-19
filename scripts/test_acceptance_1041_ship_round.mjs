#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PULLS, applyDryRunCard, bootstrapDryText, doorbellReasons, planBootstrap, planCycle, scrub } from './host/vk_ship_round_core.mjs';

const protectedRules = JSON.parse(readFileSync(new URL('./fixtures/harness/protected-targets.json', import.meta.url), 'utf8'));

const spec = {
  issue: 1100,
  assertions: [{ id: 'ships', type: 'unit_script', script: 'scripts/test_acceptance_1100.mjs' }],
};
const body = `\`\`\`acceptance\n${JSON.stringify(spec)}\n\`\`\`\n`;
const green = {
  checks: [
    { name: 'secrets', conclusion: 'success', sha: 'abc' },
    { name: 'unit-tests', conclusion: 'pass', sha: 'abc' },
  ],
  statuses: [{ context: 'gateb', state: 'success', sha: 'abc' }],
};
const pull = {
  number: 50,
  head: 'abc',
  headNow: 'abc',
  issue: 1100,
  body,
  prLabels: ['project:tsv', 'base:vk', 'craig-asked'],
  issueLabels: ['project:tsv', 'base:vk'],
  mergeableState: 'clean',
  conflictFiles: [],
  conflictDeletions: {},
};

const planned = planCycle({
  pulls: [pull],
  checksBySha: { abc: green },
  acceptanceFiles: {},
  tipLive: { tip: 'live1', live: 'live1', liveAccept: 'pass' },
  state: {},
  storyText: '{"destination":"Hilo"}',
  databaseUrl: '',
});
assert.deepEqual(planned.actions.map((action) => action.type), ['add-labels', 'write-acceptance', 'accept', 'merge', 'batch-deploy', 'live-accept', 'dry-run-after-deploy']);
assert.deepEqual(planned.actions[0].labels, ['craig-asked']);
assert.equal(planned.actions[2].sha, 'abc');

const stale = planCycle({
  pulls: [{ ...pull, headNow: 'def' }],
  checksBySha: { abc: green },
  acceptanceFiles: { 1100: true },
  tipLive: { tip: 'live1', live: 'old', liveAccept: 'pass' },
  state: {},
});
assert.equal(stale.actions.some((action) => action.type === 'accept'), false);
assert.equal(stale.actions.some((action) => action.type === 'dry-run'), false);

const pending = planCycle({
  pulls: [pull],
  checksBySha: { abc: { checks: [{ name: 'secrets', conclusion: 'success' }], statuses: [{ context: 'gateb', state: 'pending' }] } },
  acceptanceFiles: { 1100: true },
  tipLive: { tip: 'live1', live: 'live1', liveAccept: '' },
  state: {},
});
assert.equal(pending.actions.some((action) => action.type === 'accept'), false);

const accepted = planCycle({
  pulls: [pull],
  checksBySha: { abc: { ...green, statuses: [...green.statuses, { context: 'accept', state: 'success', sha: 'abc' }] } },
  acceptanceFiles: { 1100: true },
  tipLive: { tip: 'live1', live: 'live1', liveAccept: 'pass' },
  state: { lastDrySha: 'live1' },
});
assert.equal(accepted.actions.some((action) => action.type === 'accept'), false);
assert.equal(accepted.actions.some((action) => action.type === 'merge'), true);
assert.equal(accepted.actions.some((action) => action.type === 'dry-run'), false);

const dirty = planCycle({
  pulls: [{
    ...pull,
    mergeableState: 'dirty',
    conflictFiles: ['scripts/offline-tests.txt'],
    conflictDeletions: { 'scripts/offline-tests.txt': 0 },
  }],
  checksBySha: { abc: green },
  acceptanceFiles: { 1100: true },
  tipLive: { tip: '', live: '', liveAccept: '' },
  state: {},
});
assert.equal(dirty.actions.some((action) => action.type === 'needs-rebase' && action.file === 'scripts/offline-tests.txt'), true);
assert.equal(dirty.round.doorbell.includes('needs-rebase'), true);

const other = planCycle({
  pulls: [{
    ...pull,
    mergeableState: 'dirty',
    conflictFiles: ['src/vacation/live-app-turn.mjs'],
    conflictDeletions: { 'src/vacation/live-app-turn.mjs': 0 },
  }],
  checksBySha: {},
  acceptanceFiles: { 1100: true },
  tipLive: { tip: 'a', live: 'b', liveAccept: 'pass' },
  state: {},
});
assert.equal(other.actions.some((action) => action.type === 'needs-rebase'), false);

const deleted = planCycle({
  pulls: [{
    ...pull,
    mergeableState: 'dirty',
    conflictFiles: ['scripts/offline-tests.txt'],
    conflictDeletions: { 'scripts/offline-tests.txt': 2 },
  }],
  checksBySha: {},
  acceptanceFiles: { 1100: true },
  tipLive: {},
  state: {},
});
assert.equal(deleted.actions.some((action) => action.type === 'needs-rebase'), false);

const blocked = planCycle({
  pulls: [],
  checksBySha: {},
  acceptanceFiles: {},
  tipLive: { tip: 'sha-live', live: 'sha-live', liveAccept: 'pass' },
  state: {},
  storyText: `{"share":"${protectedRules.sharePrefixes[0]}"}`,
});
assert.equal(blocked.actions.some((action) => action.type === 'dry-run'), false);
assert.equal(blocked.round.errors.includes('protected-share'), true);

const card = {
  verdict: 'PASS',
  reason: '',
  checks: ['dialog-pdf', 'keepsake-pdf', 'screens', 'video-check', 'scorecard'].map((id) => ({ id, pass: true })),
  turns: [{ n: 3, role: 'app', stored_model: 'anthropic/claude-haiku-5.5', cost_amount: 0.002, gap: '' }],
  cost: { per_customer: 0.002, per_100: 0.2 },
  cleanup: { remaining: 0 },
};
const passed = applyDryRunCard({ dryRun: { ran: true, sha: 'live1' }, needsRebase: [], errors: [] }, card);
assert.equal(passed.dryRun.outputsPass, true);
assert.equal(doorbellReasons(passed, {}).includes('dry-run-pass'), true);
const again = { ...passed, dryRun: { ...passed.dryRun, ran: false } };
assert.equal(doorbellReasons(again, { reason: '' }).includes('dry-run-pass'), false);

const failed = applyDryRunCard({ dryRun: { ran: true, sha: 'live2' }, needsRebase: [], errors: [] }, {
  verdict: 'FAIL',
  reason: 'stored-cost-missing',
  checks: [],
  turns: [],
  cost: { per_customer: null, per_100: null },
  cleanup: { remaining: 0 },
});
assert.equal(doorbellReasons(failed, {}).includes('new-failure'), true);
assert.equal(doorbellReasons(failed, { reason: 'stored-cost-missing' }).includes('new-failure'), false);

const messy = applyDryRunCard({ dryRun: { ran: true, sha: 'live3' }, needsRebase: [], errors: [] }, {
  verdict: 'PASS',
  reason: '',
  checks: card.checks,
  turns: [],
  cost: {},
  cleanup: { remaining: 2 },
});
assert.equal(messy.dryRun.verdict, 'FAIL');
assert.equal(messy.dryRun.reason, 'cleanup-remaining');
assert.equal(messy.dryRun.outputsPass, false);

assert.equal(scrub('Bearer secret-token postgres://user:pass@host/db', ['secret-token']).includes('secret-token'), false);
assert.equal(scrub('Bearer secret-token postgres://user:pass@host/db', ['secret-token']).includes('postgres://'), false);

function greenFor(sha) {
  return {
    checks: [
      { name: 'secrets', conclusion: 'success', sha },
      { name: 'unit-tests', conclusion: 'pass', sha },
    ],
    statuses: [{ context: 'gateb', state: 'success', sha }],
  };
}

function bootPull(item, sha, extra = {}) {
  return {
    number: item.pr,
    head: sha,
    headNow: sha,
    issue: item.issue,
    body,
    prLabels: ['project:tsv', 'base:vk', 'craig-asked'],
    issueLabels: ['project:tsv', 'base:vk', 'craig-asked'],
    mergeableState: 'clean',
    conflictFiles: [],
    conflictDeletions: {},
    state: 'OPEN',
    ...extra,
  };
}

const bootHeads = Object.fromEntries(BOOTSTRAP_PULLS.map((item) => [item.pr, item.sha || `head-${item.pr}`]));
const bootPulls = BOOTSTRAP_PULLS.map((item) => bootPull(item, bootHeads[item.pr]));
const boot = planBootstrap({
  pulls: bootPulls,
  checksBySha: Object.fromEntries(BOOTSTRAP_PULLS.map((item) => [bootHeads[item.pr], greenFor(bootHeads[item.pr])])),
  acceptanceFiles: {},
  tipLive: { tip: '', live: '', liveAccept: '' },
  state: {},
});
assert.deepEqual(boot.actions.map((action) => action.type), [
  'write-acceptance', 'accept', 'merge',
  'write-acceptance', 'accept', 'merge',
  'write-acceptance', 'accept', 'merge',
  'batch-deploy', 'live-accept', 'dry-run-after-deploy',
]);
assert.equal(boot.actions.find((action) => action.pr === 1040 && action.type === 'accept').sha, BOOTSTRAP_PULLS[1].sha);
assert.equal(boot.actions.find((action) => action.pr === 1044 && action.type === 'accept').sha, BOOTSTRAP_PULLS[2].sha);
assert.equal(boot.actions.filter((action) => action.type === 'merge').map((action) => action.pr).join(','), '1042,1040,1044');

const movedPulls = BOOTSTRAP_PULLS.map((item) => bootPull(item, item.pr === 1040 ? 'other-head' : bootHeads[item.pr]));
const moved = planBootstrap({
  pulls: movedPulls,
  checksBySha: Object.fromEntries(movedPulls.map((pull) => [pull.head, greenFor(pull.head)])),
  acceptanceFiles: { 1041: true, 1039: true, 1043: true },
  tipLive: {},
  state: {},
});
assert.equal(moved.round.errors.includes('head-moved:1040'), true);
assert.equal(moved.actions.some((action) => action.pr === 1040 && action.type === 'merge'), false);
assert.equal(moved.actions.some((action) => action.pr === 1042 && action.type === 'merge'), true);

const dirtyBoot = planBootstrap({
  pulls: BOOTSTRAP_PULLS.map((item) => bootPull(item, bootHeads[item.pr], item.pr === 1044 ? {
    mergeableState: 'dirty',
    conflictFiles: ['scripts/offline-tests.txt'],
    conflictDeletions: { 'scripts/offline-tests.txt': 0 },
  } : {})),
  checksBySha: Object.fromEntries(BOOTSTRAP_PULLS.map((item) => [bootHeads[item.pr], greenFor(bootHeads[item.pr])])),
  acceptanceFiles: { 1041: true, 1039: true, 1043: true },
  tipLive: {},
  state: {},
});
assert.equal(dirtyBoot.actions.some((action) => action.pr === 1044 && action.type === 'needs-rebase'), true);
assert.equal(dirtyBoot.actions.some((action) => action.pr === 1044 && action.type === 'merge'), false);
assert.equal(dirtyBoot.actions.some((action) => action.pr === 1042 && action.type === 'merge'), true);

const install = readFileSync(new URL('./host/install_vk_ship_round.sh', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('./host/vk_ship_round.sh', import.meta.url), 'utf8');
const roundJs = readFileSync(new URL('./host/vk_ship_round.mjs', import.meta.url), 'utf8');
assert.match(install, /from tsv_common import GH/);
assert.match(install, /crontab\.bak/);
assert.match(install, /grep -F/);
assert.match(install, /\$\{ROOT\}\/bin\/vk_ship_round\.sh/);
assert.match(install, /exec "\$ROOT\/bin\/vk_ship_round\.sh"/);
assert.match(install, /preflight: missing/);
assert.doesNotMatch(install, /gh api|gh repo|GH_TOKEN@/);
assert.match(launcher, /https:\/\/github.com\/grampadsbot-sudo\/timesyncher\.git/);
assert.match(launcher, /reset --hard origin\/vk/);
assert.match(launcher, /refusing remote url with credentials/);
assert.match(launcher, /credential\.helper=!python3 \$\{HELPER\} credential/);
assert.match(launcher, /preflight: missing/);
assert.doesNotMatch(launcher, /gh api|gh repo|gh auth|GH_TOKEN@/);
assert.doesNotMatch(roundJs, /spawnSync\('gh'/);

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(`${tmpdir()}/vk-ship-dry-`);
const env = { ...process.env, TSV_DISPATCH_ROOT: tmp, TSV_SHIP_BOOTSTRAP: '1', HOME: tmp };
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
delete env.GH_ENTERPRISE_TOKEN;
const ran = spawnSync(process.execPath, ['scripts/host/vk_ship_round.mjs', '--dry'], { cwd: repoRoot, encoding: 'utf8', env });
assert.equal(ran.status, 0, ran.stderr);
assert.equal(ran.stdout, `${bootstrapDryText()}\n`);
const shell = spawnSync('bash', ['scripts/host/vk_ship_round.sh', '--dry'], { cwd: repoRoot, encoding: 'utf8', env });
assert.equal(shell.status, 0, shell.stderr);
assert.equal(shell.stdout, `${bootstrapDryText()}\n`);
assert.equal(existsSync(tmp) && readdirSync(tmp).length === 0, true);
rmSync(tmp, { recursive: true, force: true });

const preflightRoot = mkdtempSync(`${tmpdir()}/vk-ship-preflight-`);
const preflightEnv = {
  ...process.env,
  TSV_DISPATCH_ROOT: preflightRoot,
  HOME: preflightRoot,
  GH_TOKEN_FILE: join(preflightRoot, 'missing-token'),
};
delete preflightEnv.GH_TOKEN;
delete preflightEnv.TSV_DISPATCH_BIN;
const preflight = spawnSync('bash', ['scripts/host/vk_ship_round.sh', '--preflight'], { cwd: repoRoot, encoding: 'utf8', env: preflightEnv });
assert.notEqual(preflight.status, 0);
assert.match(preflight.stderr, /^preflight: missing GitHub auth batch_deploy\n$/);
assert.equal(preflight.stdout, '');
const host = join(preflightRoot, 'host');
mkdirSync(host);
writeFileSync(join(host, 'tsv_common.py'), [
  'import os',
  'GH_TOKEN_FILE = os.environ.get("GH_TOKEN_FILE") or ""',
  'def read_secret(path, sudo_user=None):',
  '    return open(path).read().strip()',
  'class GH:',
  '    def __init__(self, token=None):',
  '        self.tok = read_secret(GH_TOKEN_FILE) if GH_TOKEN_FILE else ""',
  '    def req(self, method, path, data=None, ok404=False, raw=False, accept="", timeout=60):',
  '        if raw:',
  '            return b"raw-file"',
  '        return {"method": method, "path": path, "data": data}',
  '',
].join('\n'));
writeFileSync(join(host, 'tsv_dispatch.py'), 'print("--batch-deploy")\n');
const tokenPath = join(preflightRoot, 'token');
const tokenValue = 'ship-round-test-token';
writeFileSync(tokenPath, `${tokenValue}\n`);
const ready = spawnSync('bash', ['scripts/host/vk_ship_round.sh', '--preflight'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...preflightEnv, TSV_DISPATCH_ROOT: host, GH_TOKEN_FILE: tokenPath },
});
assert.equal(ready.status, 0, ready.stderr);
assert.equal(ready.stdout, '');
assert.equal(ready.stderr.includes(tokenValue), false);
const helper = spawnSync('python3', ['scripts/host/vk_ship_github.py', 'GET', '/repos/grampadsbot-sudo/timesyncher/pulls/1042'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...preflightEnv, TSV_DISPATCH_ROOT: host, GH_TOKEN_FILE: tokenPath },
  input: '',
});
assert.equal(helper.status, 0, helper.stderr);
assert.equal(helper.stdout.includes(tokenValue), false);
assert.equal(helper.stderr.includes(tokenValue), false);
assert.equal(JSON.parse(helper.stdout).path, '/repos/grampadsbot-sudo/timesyncher/pulls/1042');
const raw = spawnSync('python3', ['scripts/host/vk_ship_github.py', 'RAW', '/repos/grampadsbot-sudo/timesyncher/contents/scripts/host/install_vk_ship_round.sh?ref=abc'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...preflightEnv, TSV_DISPATCH_ROOT: host, GH_TOKEN_FILE: tokenPath },
});
assert.equal(raw.status, 0, raw.stderr);
assert.equal(raw.stdout, 'raw-file');
assert.equal(raw.stdout.includes(tokenValue), false);
rmSync(preflightRoot, { recursive: true, force: true });

console.log('test_acceptance_1041_ship_round: ok');
