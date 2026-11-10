import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(repo, 'scripts/fixtures/vkprloop-drift-910.txt');

const FILE_OF = {
  'harness-retry': 'tsv_dispatch.py',
  'harness-cap': 'tsv_dispatch.py',
  'gateb-one': 'gateb_one_executor.py',
  'data-fault-round': 'lane_autofill.py',
  'data-fault-call': 'lane_autofill.py',
  'unit-tests-wait': 'lane_autofill.py',
};

const SPEC_BITS = [
  '#910 (11/9): the same conflict_round_if_dirty also runs when the only hold label is hold:test-trip-fixture',
  'state.json pregate verdict is DATA_FAULT',
  'coder round is still skipped (Held)',
  'skips while the head\'s unit-tests check is',
  'queued or in_progress',
  'only drops a Launch this model still allows',
  'ci = "pending"',
  '#910 (11/9): pregate_prepared also re-queues a NO_VERDICT head when harness_lookup_retry_ok',
  'known-gap lookup failed',
  'HARNESS_LOOKUP_RETRIES (3)',
  'does not wait for judg = "answered"',
  'Not an action.',
  '#910 (11/9): gateb_one_executor.py is a watched file',
  'exits 2 when held(pr)',
  'does not consult ci_green first',
  'Merge still needs ci = "green"',
  'No PR-loop state.',
  'Pregate ==',
  'JudgedSkip ==',
];

function sections(src) {
  const parts = src.split(/^--- (.+) ---$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ name: parts[i], body: parts[i + 1].replace(/^\n/, '').replace(/\n$/, '') });
  }
  return out;
}

function fnBody(src, name) {
  const at = src.indexOf(`def ${name}(`);
  assert.ok(at >= 0, `missing def ${name}`);
  const next = src.indexOf('\ndef ', at + 1);
  return src.slice(at, next === -1 ? src.length : next);
}

function assertSpec(src) {
  for (const bit of SPEC_BITS) {
    assert.ok(src.includes(bit), `spec missing ${bit}`);
  }
  const queue = src.indexOf('#910 (11/9): the same conflict_round_if_dirty also runs');
  const judged = src.indexOf('JudgedSkip ==');
  assert.ok(queue > 0 && judged > queue, 'build_queue note stays above JudgedSkip');
  const harness = src.indexOf('#910 (11/9): pregate_prepared also re-queues a NO_VERDICT head');
  const one = src.indexOf('#910 (11/9): gateb_one_executor.py is a watched file');
  const pregate = src.indexOf('Pregate ==');
  assert.ok(harness > 0 && one > harness && pregate > one, 'harness and one-PR notes stay above Pregate');
}

const fixture = fs.readFileSync(fixturePath, 'utf8');
const chunks = sections(fixture);
assert.deepEqual(chunks.map((c) => c.name), Object.keys(FILE_OF));
for (const chunk of chunks) {
  assert.ok(chunk.body.length > 20, `empty fixture section ${chunk.name}`);
}

const dispatch = process.env.TSV_DISPATCH || path.join(os.homedir(), 'tsv-dispatch');
const specPath = path.join(dispatch, 'formal/VKPrLoop.tla');
const live = chunks.map((c) => path.join(dispatch, FILE_OF[c.name]));
const anyLive = live.some((p) => fs.existsSync(p)) || fs.existsSync(specPath);

if (anyLive) {
  assert.equal(fs.existsSync(specPath), true, `spec missing under ${dispatch}`);
  for (const p of new Set(live)) assert.equal(fs.existsSync(p), true, `dispatcher file missing ${p}`);
  const byFile = {};
  for (const chunk of chunks) {
    const rel = FILE_OF[chunk.name];
    const src = byFile[rel] || fs.readFileSync(path.join(dispatch, rel), 'utf8');
    byFile[rel] = src;
    assert.ok(src.includes(chunk.body), `${rel} missing ${chunk.name}`);
  }

  const dispatchPy = byFile['tsv_dispatch.py'];
  const prepared = fnBody(dispatchPy, 'pregate_prepared');
  const pregate = fnBody(dispatchPy, 'pregate');
  const retry = fnBody(dispatchPy, 'harness_lookup_retry_ok');
  const harness = chunks.find((c) => c.name === 'harness-retry').body;
  const cap = chunks.find((c) => c.name === 'harness-cap').body;
  assert.ok(prepared.includes(harness), 'known-gap lookup retry stays in pregate_prepared');
  assert.equal(pregate.includes(harness), false, 'the lookup retry is not the CI-red skip in pregate');
  assert.ok(retry.includes(cap), 'retry stays capped');
  assert.ok(retry.includes('known-gap lookup failed'), 'retry stays limited to the lookup fault');
  const answered = prepared.indexOf('judgment_answered_rerun(n, sha)');
  const lookup = prepared.indexOf(harness);
  const keep = prepared.indexOf('keepset_pass_doorbell');
  assert.ok(answered >= 0 && lookup > answered && keep > lookup, 'lookup retry stays after judgment re-run and before the finished-verdict path');

  const one = byFile['gateb_one_executor.py'];
  assert.equal(one.includes('automerge'), false, 'one-PR runner does not merge');
  assert.ok(one.includes('T.pregate_one(pr, files)'), 'one-PR runner uses pregate_one');
  assert.ok(one.indexOf('if T.held(pr)') < one.indexOf('T.pregate_one(pr, files)'), 'held PR exits before pregate_one');

  const queue = fnBody(byFile['lane_autofill.py'], 'build_queue');
  const holdAt = queue.indexOf(chunks.find((c) => c.name === 'data-fault-round').body);
  const callAt = queue.indexOf(chunks.find((c) => c.name === 'data-fault-call').body);
  const skipAt = queue.indexOf('log("skip #%d: hold label on PR (%s); no coder round"', holdAt);
  const waitAt = queue.indexOf(chunks.find((c) => c.name === 'unit-tests-wait').body);
  const guardAt = queue.indexOf('blocked_reason(n, fixit=True');
  assert.ok(holdAt >= 0 && callAt > holdAt && skipAt > callAt, 'DATA_FAULT conflict round still skips the coder round');
  assert.ok(waitAt > skipAt && guardAt > waitAt, 'unit-tests wait stays after the hold skip and before the guard stop');

  assertSpec(fs.readFileSync(specPath, 'utf8'));
  console.log('vkprloop drift #910: fixture + live dispatcher ok');
} else {
  console.log('vkprloop drift #910: fixture ok (no local tsv-dispatch)');
}
