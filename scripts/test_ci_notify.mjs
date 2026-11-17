import assert from 'node:assert/strict';
import {
  formatLine,
  noteKey,
  notesFromPullRequest,
  notesFromStatus,
  notesFromWorkflowRun,
  send,
} from './ci-notify.mjs';

const sha = 'f52f514aa11bb22cc33dd44ee55ff66778899001';
const vkPr = { number: 1002, state: 'open', base: { ref: 'vk' }, html_url: 'https://github.com/o/r/pull/1002' };
const mainPr = { number: 9, state: 'open', base: { ref: 'main' }, html_url: 'https://github.com/o/r/pull/9' };

const gate = notesFromStatus({ context: 'gateb', state: 'success', sha, target_url: 'https://x/gateb' }, [vkPr, mainPr]);
assert.equal(gate.length, 1);
assert.equal(formatLine(gate[0]), 'PR #1002 f52f514a gateb: pass https://x/gateb');
assert.equal(notesFromStatus({ context: 'gateb', state: 'pending', sha }, [vkPr]).length, 0);
assert.equal(notesFromStatus({ context: 'Vercel', state: 'success', sha }, [vkPr]).length, 0);
assert.equal(notesFromStatus({ context: 'gateb', state: 'failure', sha }, [vkPr])[0].result, 'fail');

const run = { workflow_run: { id: 1, head_sha: sha, html_url: 'https://x/run', pull_requests: [vkPr] }, action: 'completed' };
const jobs = [
  { name: 'unit-tests', status: 'completed', conclusion: 'failure', html_url: 'https://x/job' },
  { name: 'secrets', status: 'completed', conclusion: 'success' },
];
const unit = notesFromWorkflowRun(run, jobs);
assert.equal(unit.length, 1);
assert.equal(formatLine(unit[0]), 'PR #1002 f52f514a unit-tests: fail https://x/job');
assert.equal(notesFromWorkflowRun({ ...run, workflow_run: { ...run.workflow_run, pull_requests: [mainPr] } }, jobs).length, 0);

const merged = notesFromPullRequest({
  action: 'closed',
  pull_request: { ...vkPr, merged: true, merge_commit_sha: sha, head: { sha: 'abc' } },
});
assert.equal(formatLine(merged[0]), 'PR #1002 f52f514a merge: merged https://github.com/o/r/pull/1002');
assert.equal(notesFromPullRequest({ action: 'opened', pull_request: { ...vkPr, head: { sha } } }).length, 0);

assert.equal(noteKey(gate[0]), noteKey({ ...gate[0] }));
assert.notEqual(noteKey(gate[0]), noteKey({ ...gate[0], result: 'fail' }));

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  return { ok: true };
};
const sent = await send(gate[0], { TELEGRAM_BOT_TOKEN: 'T0K', TELEGRAM_CHAT_ID: '-5', MDR_INBOX_URL: 'https://inbox/x' });
assert.deepEqual(sent, ['telegram', 'mdr-inbox']);
assert.equal(calls[0].body.chat_id, '-5');
assert.ok(!JSON.stringify(calls[1].body).includes('T0K'));
assert.deepEqual(await send(gate[0], {}), []);
globalThis.fetch = realFetch;

process.stdout.write('ci-notify tests passed\n');
