// #789: CI-red coder rounds are not blocked by a Gate B harness pause.
// The pause lives in tsv_guard.blocked_reason. VKPrLoop keeps Blocked as stuck / tier / CI tries.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dispatch = process.env.TSV_DISPATCH || path.join(os.homedir(), 'tsv-dispatch');
const formal = path.join(dispatch, 'formal');

function read(rel) {
  const p = path.join(dispatch, rel);
  assert.ok(fs.existsSync(p), `missing ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function sliceFn(src, name) {
  const marker = `def ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `def ${name} not found`);
  const next = src.indexOf('\ndef ', start + marker.length);
  return src.slice(start, next === -1 ? src.length : next);
}

// Mirrors tsv_guard.blocked_reason's harness clause only. Other stops are unchanged.
function harnessPauseBlocks(fixit, ciRed, harnessPending) {
  return Boolean(fixit && !ciRed && harnessPending);
}

const pauseCases = [
  [true, true, true, false],
  [true, false, true, true],
  [false, false, true, false],
  [false, true, true, false],
  [true, true, false, false],
  [true, false, false, false],
];
for (const [fixit, ciRed, pending, blocked] of pauseCases) {
  assert.equal(
    harnessPauseBlocks(fixit, ciRed, pending),
    blocked,
    `harness pause fixit=${fixit} ciRed=${ciRed} pending=${pending}`,
  );
}

const guard = read('tsv_guard.py');
const blocked = sliceFn(guard, 'blocked_reason');
assert.match(blocked, /def blocked_reason\(pr_n, now=None, fixit=False, ci_red=False\)/);
assert.match(
  blocked,
  /if fixit and not ci_red and harness_fault_pending\(pr_n\):/,
);
assert.doesNotMatch(blocked, /if fixit and harness_fault_pending\(pr_n\):/);

const ciloop = sliceFn(read('tsv_ciloop.py'), 'one');
assert.match(ciloop, /blocked_reason\(n, fixit=True, ci_red=True\)/);

const queue = sliceFn(read('lane_autofill.py'), 'build_queue');
assert.match(queue, /blocked_reason\(n, fixit=True, ci_red=head_ci_red\(/);
const headCi = sliceFn(read('lane_autofill.py'), 'head_ci_red');
assert.match(headCi, /except Exception:\s*\n\s*return False/);

const alarm = read('tsv_stall_alarm.py');
const autoFix = sliceFn(alarm, 'auto_fix');
const ciRedStop = autoFix.split('\n').find((line) => line.includes('_blocked_reason(n, ci_red=True)'));
assert.ok(ciRedStop, 'CI-red auto_fix branch must pass ci_red=True');
assert.ok(ciRedStop.includes("re.search"), 'ci_red stop is the CI-failure branch');
const gbFailStop = autoFix.split('\n').find((line) => line.includes('gb_fail and "held on"'));
assert.ok(gbFailStop && gbFailStop.includes('_blocked_reason(n):'), 'Gate B FAIL branch stays ci_red=False');
assert.equal(gbFailStop.includes('ci_red'), false);

const main = sliceFn(alarm, 'main');
assert.match(main, /items = None/);
assert.match(
  main,
  /log\("could not read GitHub \(fail closed\): %s: %s" % \(type\(e\)\.__name__, str\(e\)\[:240\]\)\)/,
);

const spec = read('formal/VKPrLoop.tla');
assert.match(spec, /^Blocked == stuckMark \\\/ fails >= TierStop \\\/ CiTries$/m);
assert.match(spec, /ci_red/);
assert.match(spec, /head_ci_red/);
assert.match(spec, /harness_fault_pending/);
assert.match(spec, /str\(e\)\[:240\]/);
assert.doesNotMatch(spec, /Blocked ==[^\n]*harness/);

const derive = read('formal/derive_flags.py');
assert.match(derive, /"head_ci_red"/);

const check = spawnSync('python3', [path.join(formal, 'manifest.py'), 'check'], {
  encoding: 'utf8',
});
assert.equal(check.status, 0, (check.stdout || check.stderr || 'manifest drift').trim());
assert.match(check.stdout, /in sync/);

console.log('formal VKPrLoop ci_red #789: in sync');
