#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exactHeadMergeReady } from './host/vk_ship_round_core.mjs';
import { planCycle } from './host/vk_ship_round_core.mjs';
import { mergeOrder, mergePull, needsAsyncMerge, noteMergeFailure, rebaseOntoVk, stackBaseRef } from './host/vk_ship_merge.mjs';

function green(sha) {
  return {
    checks: [
      { name: 'secrets', conclusion: 'success', sha },
      { name: 'unit-tests', conclusion: 'success', sha },
    ],
    statuses: [
      { context: 'gateb', state: 'success', sha },
      { context: 'accept', state: 'success', sha },
    ],
  };
}
const ready = green('abc');
assert.equal(exactHeadMergeReady(ready, 'abc'), true);
assert.equal(exactHeadMergeReady({ ...ready, statuses: [{ context: 'gateb', state: 'success', sha: 'abc' }] }, 'abc'), false);
assert.equal(stackBaseRef({ base: { ref: 'vk' } }), '');
assert.equal(stackBaseRef({ base: { ref: 'claude/vk-harness-100-r1' } }), 'claude/vk-harness-100-r1');
assert.equal(needsAsyncMerge({ stack: { position: 1 }, base: { ref: 'vk' } }), true);
assert.equal(needsAsyncMerge({ base: { ref: 'vk' } }), false);

const roundJs = readFileSync(new URL('./host/vk_ship_round.mjs', import.meta.url), 'utf8');
const mergeJs = readFileSync(new URL('./host/vk_ship_merge.mjs', import.meta.url), 'utf8');
assert.match(mergeJs, /\/merge`, \{ merge_method: 'merge', sha: head \}/);
assert.match(mergeJs, /merge-async/);
assert.match(mergeJs, /merged !== true/);
assert.match(roundJs, /mergePull\(action, round/);

const pulls = {
  1121: { number: 1121, state: 'open', merged: false, head: { sha: 'basehead', ref: 'claude/vk-harness-100-r1' }, base: { ref: 'vk' }, merge_commit_sha: '' },
  1122: { number: 1122, state: 'open', merged: false, head: { sha: 'childhead', ref: 'cursor/vk-mcp-lopez-a5f5' }, base: { ref: 'claude/vk-harness-100-r1' }, stack: { position: 2 }, merge_commit_sha: '' },
};
const calls = [];
const io = {
  repo: 'grampadsbot-sudo/timesyncher',
  getPull: (number) => pulls[number],
  reportFor: () => ready,
  below: () => [pulls[1121]],
  request(method, path, data) {
    calls.push({ method, path, sha: data?.sha || '' });
    const number = path.includes('/1121/') ? 1121 : 1122;
    if (path.endsWith('/merge') || path.endsWith('/merge-async')) {
      pulls[number].merged = true;
      pulls[number].merge_commit_sha = `merge${number}`;
      return path.endsWith('/merge-async')
        ? { status: 'merged', details: { sha: pulls[number].merge_commit_sha } }
        : { merged: true, sha: pulls[number].merge_commit_sha };
    }
    throw new Error(`unexpected ${method} ${path}`);
  },
};
const round = { merges: [] };
await assert.rejects(() => mergePull({ pr: 1122, sha: 'childhead' }, round, {
  ...io,
  reportFor: (sha) => (sha === 'basehead' ? { checks: [], statuses: [] } : green(sha)),
}), /1121 is not accept/);
assert.equal(calls.length, 0);
assert.equal(round.merges.length, 0);
await mergePull({ pr: 1122, sha: 'childhead' }, round, { ...io, reportFor: green });
assert.deepEqual(round.merges, [1121]);
assert.equal(pulls[1122].merged, true);
assert.equal(calls[0].path.endsWith('/1121/merge'), true);
assert.equal(calls.some((call) => call.path.endsWith('/1122/merge-async')), true);

const ordered = mergeOrder([
  { type: 'accept', pr: 1122 },
  { type: 'merge', pr: 1122, baseRef: 'claude/vk-harness-100-r1' },
  { type: 'merge', pr: 1124, baseRef: 'vk', shipFix: true },
  { type: 'batch-deploy' },
]);
assert.deepEqual(ordered.map((action) => action.pr), [1122, 1124, 1122]);
assert.equal(ordered[0].type, 'accept');
assert.equal(ordered[1].pr, 1124);

const skipped = { errors: [], skipped: [] };
noteMergeFailure(skipped, 'skip: #1122 retargeted onto vk');
noteMergeFailure(skipped, 'merge not completed: 1122');
assert.deepEqual(skipped.skipped, ['skip: #1122 retargeted onto vk']);
assert.deepEqual(skipped.errors, ['merge not completed: 1122']);

const moved = {
  1122: { number: 1122, state: 'open', merged: false, head: { sha: 'childhead', ref: 'cursor/vk-mcp-lopez-a5f5' }, base: { ref: 'claude/vk-harness-100-r1' }, stack: { position: 2 } },
};
const movedCalls = [];
await assert.rejects(() => mergePull({ pr: 1122, sha: 'childhead' }, { merges: [] }, {
  repo: 'grampadsbot-sudo/timesyncher',
  getPull: (number) => moved[number],
  reportFor: () => green('childhead'),
  retarget: () => ({ number: 1122, state: 'open', merged: false, head: { sha: 'newhead' }, base: { ref: 'vk' } }),
  request(method, apiPath) { movedCalls.push(`${method} ${apiPath}`); },
}), /retargeted onto vk/);
assert.equal(movedCalls.length, 0);

const retargeted = {
  1122: { number: 1122, state: 'open', merged: false, head: { sha: 'childhead', ref: 'cursor/vk-mcp-lopez-a5f5' }, base: { ref: 'claude/vk-harness-100-r1' }, stack: { position: 2 }, merge_commit_sha: '' },
};
const retargetCalls = [];
await mergePull({ pr: 1122, sha: 'childhead' }, { merges: [] }, {
  repo: 'grampadsbot-sudo/timesyncher',
  getPull: (number) => retargeted[number],
  reportFor: () => green('childhead'),
  retarget: () => {
    retargeted[1122] = { ...retargeted[1122], base: { ref: 'vk' }, stack: null };
    return retargeted[1122];
  },
  request(method, apiPath, data) {
    retargetCalls.push({ method, path: apiPath, sha: data?.sha || '' });
    retargeted[1122].merged = true;
    retargeted[1122].merge_commit_sha = 'merge1122';
    return { merged: true, sha: 'merge1122' };
  },
});
assert.equal(retargetCalls.length, 1);
assert.equal(retargetCalls[0].path.endsWith('/1122/merge'), true);
assert.equal(retargetCalls[0].path.includes('merge-async'), false);

const traced = { errors: [], skipped: [] };
noteMergeFailure(traced, 'skip: #1122 retargeted onto vk\nError: stack', { type: 'merge' });
noteMergeFailure(traced, 'The "path" argument must be of type string. Received undefined\nError: at runHarness', { type: 'dry-run-after-deploy' });
assert.deepEqual(traced.skipped, ['skip: #1122 retargeted onto vk']);
assert.match(traced.errors[0], /^dry-run-after-deploy: The "path" argument must be of type string\. Received undefined\nError: at runHarness/);

const plannedDry = planCycle({
  pulls: [{
    number: 1122,
    head: 'be253380',
    headNow: 'be253380',
    issue: 1041,
    body: '```acceptance\n{"issue":1041,"assertions":[{"id":"a"}]}\n```\n',
    prLabels: ['project:tsv', 'base:vk', 'craig-asked'],
    issueLabels: ['project:tsv', 'base:vk', 'craig-asked'],
    mergeableState: 'clean',
    conflictFiles: [],
    files: ['scripts/harness/http-live.mjs'],
    baseRef: 'claude/vk-harness-100-r1',
  }],
  checksBySha: { be253380: green('be253380') },
  acceptanceFiles: { 1041: true },
  acceptanceSpecs: { 1041: { issue: 1041, assertions: [{ id: 'a' }] } },
  tipLive: { tip: 'db943aef', live: 'db943aef', liveAccept: 'pass' },
  state: {},
  storyText: '{"destination":"Hilo"}',
  databaseUrl: '',
  runId: '2026-11-24T21:03:00Z',
});
const dryAction = plannedDry.actions.find((action) => action.type === 'dry-run-after-deploy');
assert.equal(dryAction.runId, '2026-11-24T21:03:00Z');

const rebasedCalls = [];
await assert.rejects(() => mergePull({ pr: 1122, sha: 'childhead' }, { merges: [] }, {
  repo: 'grampadsbot-sudo/timesyncher',
  getPull: (number) => moved[number],
  reportFor: () => green('childhead'),
  retarget: () => moved[1122],
  rebase: () => rebaseOntoVk(moved[1122], (args) => {
    rebasedCalls.push(args.join(' '));
    if (args[0] === 'rev-parse') return { status: 0, stdout: 'newhead\n' };
    return { status: 0, stdout: '' };
  }),
  request() { throw new Error('merged after a moved head'); },
}), /retargeted onto vk/);
assert.match(rebasedCalls[1], /^rebase --onto origin\/vk origin\/claude\/vk-harness-100-r1 /);
assert.equal(rebasedCalls.some((line) => line.startsWith('request')), false);

console.log('test_vk_ship_stack_merge: ok');
