#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyDryRunCard, doorbellReasons, planCycle, scrub } from './host/vk_ship_round_core.mjs';

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
assert.deepEqual(planned.actions.map((action) => action.type), ['add-labels', 'write-acceptance', 'accept', 'dry-run']);
assert.deepEqual(planned.actions[0].labels, ['craig-asked']);
assert.equal(planned.actions[3].sha, 'live1');

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

console.log('test_acceptance_1041_ship_round: ok');
