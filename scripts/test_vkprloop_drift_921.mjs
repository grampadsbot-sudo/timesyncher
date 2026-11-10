import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(repo, 'scripts/fixtures/vkprloop-drift-921.txt');

const FILE_OF = {
  'ci-red-note': 'tsv_stall_alarm.py',
  'skip-reason': 'tsv_stall_alarm.py',
};

const SPEC_BITS = [
  '#921 (11/9 8:42 PM PT, PR #916/#907): on the CI-red branch, after the token is',
  'auto_fix calls _autofill_skip_reason and may append',
  'BUT lane_autofill will not launch it:',
  'lane-autofill-2*.log (last 4000 lines)',
  'a later launch naming this PR yields',
  'The token body, the write, fpFixed, and StallFix are',
  'Alarm text only. No new flag,',
  'Not an action.',
  'StallFix ==',
  'token\' = TRUE',
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
  const prior = src.indexOf('#915 (11/9, #909): main passes the open PR numbers');
  const note = src.indexOf('#921 (11/9 8:42 PM PT, PR #916/#907): on the CI-red branch, after the token is');
  const stall = src.indexOf('StallFix ==');
  assert.ok(prior > 0 && note > prior && stall > note, '#921 note stays after the #915 note and above StallFix');
  const action = src.slice(stall, src.indexOf('(* ---------------- holds_idle_pass', stall));
  assert.ok(action.includes("token' = TRUE"), 'StallFix still writes the requeue token');
  assert.equal(action.includes('_autofill_skip_reason'), false, 'skip-reason text is not a StallFix guard');
  assert.equal(action.includes('BUT lane_autofill'), false, 'alarm text is not a StallFix transition');
}

const fixture = fs.readFileSync(fixturePath, 'utf8');
const chunks = sections(fixture);
assert.deepEqual(chunks.map((c) => c.name), Object.keys(FILE_OF));
for (const chunk of chunks) {
  assert.ok(chunk.body.length > 20, `empty fixture section ${chunk.name}`);
}

const dispatch = process.env.TSV_DISPATCH || path.join(os.homedir(), 'tsv-dispatch');
const specPath = path.join(dispatch, 'formal/VKPrLoop.tla');
const stallPath = path.join(dispatch, 'tsv_stall_alarm.py');
const anyLive = fs.existsSync(stallPath) || fs.existsSync(specPath);

if (anyLive) {
  assert.equal(fs.existsSync(specPath), true, `spec missing under ${dispatch}`);
  assert.equal(fs.existsSync(stallPath), true, `dispatcher file missing ${stallPath}`);
  const stall = fs.readFileSync(stallPath, 'utf8');
  const note = chunks.find((c) => c.name === 'ci-red-note').body;
  const helper = chunks.find((c) => c.name === 'skip-reason').body;
  assert.ok(stall.includes(note), 'tsv_stall_alarm.py missing ci-red-note');
  assert.ok(stall.includes(helper), 'tsv_stall_alarm.py missing skip-reason');

  const autoFix = fnBody(stall, 'auto_fix');
  const helperBody = fnBody(stall, '_autofill_skip_reason');
  assert.ok(autoFix.includes(note), 'CI-red skip note stays inside auto_fix');
  assert.equal(helperBody.includes(note), false, 'the append is not inside the helper');
  assert.ok(helperBody.includes(helper.split('\n').slice(1).join('\n')), 'helper body matches the fixture');

  const writeAt = autoFix.indexOf('open(tok, "w").write("stall-alarm CI red');
  const alreadyAt = autoFix.indexOf('CI-red requeue token already present');
  const whyAt = autoFix.indexOf('_why = _autofill_skip_reason(n)');
  const busyAt = autoFix.indexOf('dispatcher busy; other fixes retry next pass');
  const stopAt = autoFix.indexOf('CI-red requeue skipped: guard stop');
  assert.ok(stopAt >= 0 && writeAt > stopAt && alreadyAt > writeAt && whyAt > alreadyAt && busyAt > whyAt,
    'skip reason is appended after the CI-red token write and before the dispatcher lock give-up');
  const stopBranch = autoFix.slice(stopAt, writeAt);
  assert.equal(stopBranch.includes('_autofill_skip_reason'), false, 'a guard stop still skips the token without the skip-reason note');

  assertSpec(fs.readFileSync(specPath, 'utf8'));
  console.log('vkprloop drift #921: fixture + live dispatcher ok');
} else {
  console.log('vkprloop drift #921: fixture ok (no local tsv-dispatch)');
}
