#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exactHeadMergeReady } from './host/vk_ship_round_core.mjs';
import { mergePull, needsAsyncMerge, stackBaseRef } from './host/vk_ship_merge.mjs';

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

console.log('test_vk_ship_stack_merge: ok');
