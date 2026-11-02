// #797: early return of tsv_dispatch.judgment_answered_rerun for BaseStructurePending.
// A NO_VERDICT whose last gateb-verdicts line names BaseStructurePending waits on the
// base run's judgments, not this capture. Re-run once any verdict file is newer than
// that line by more than 60s. A bad log skips the line; a thrown scan does not re-run.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

function basePendingRerun(lines, pr, sha, newestVerdictMtime) {
  try {
    let last = null;
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const entrySha = entry.sha == null ? '' : String(entry.sha);
      if (entry.pr === pr && entrySha && String(sha).startsWith(entrySha)) last = entry;
    }
    if (!last) return false;
    const failing = last.failing || [];
    if (![...failing].some((item) => String(item).includes('BaseStructurePending'))) return false;
    const at = Date.parse(last.at) / 1000;
    if (!Number.isFinite(at)) return false;
    return newestVerdictMtime > at + 60;
  } catch {
    return false;
  }
}

const sha = 'abcdef1234567890';
const at = '2026-11-02T17:40:00+00:00';
const atSec = Date.parse(at) / 1000;
const baseLine = JSON.stringify({
  at,
  pr: 549,
  sha: sha.slice(0, 7),
  verdict: 'NO_VERDICT',
  failing: ['(v6 checker error BaseStructurePending: base structure run gave no verdict: ManagingDrJudgmentPending; harness fault, no verdict)'],
});
const laterFail = JSON.stringify({
  at: '2026-11-02T18:00:00+00:00',
  pr: 549,
  sha: sha.slice(0, 7),
  verdict: 'FAIL',
  failing: ['screen-a'],
});

assert.equal(basePendingRerun([baseLine], 549, sha, atSec + 61), true);
assert.equal(basePendingRerun([baseLine], 549, sha, atSec + 60), false);
assert.equal(basePendingRerun([baseLine], 549, sha, atSec + 59), false);
assert.equal(basePendingRerun([baseLine], 549, sha, 0), false);
assert.equal(basePendingRerun([baseLine, laterFail], 549, sha, atSec + 10000), false);
assert.equal(basePendingRerun([laterFail, baseLine], 549, sha, atSec + 61), true);
assert.equal(basePendingRerun([baseLine], 550, sha, atSec + 61), false);
assert.equal(basePendingRerun([baseLine], 549, 'ffff000', atSec + 61), false);
assert.equal(basePendingRerun(['{'], 549, sha, atSec + 61), false);
assert.equal(basePendingRerun([JSON.stringify({ at, pr: 549, sha: '', failing: ['BaseStructurePending'] })], 549, sha, atSec + 61), false);
assert.equal(basePendingRerun([JSON.stringify({ at, pr: 549, sha: sha.slice(0, 7), failing: ['NO_VERDICT harness'] })], 549, sha, atSec + 61), false);
assert.equal(basePendingRerun([JSON.stringify({ pr: 549, sha: sha.slice(0, 7), failing: ['BaseStructurePending'] })], 549, sha, atSec + 61), false);

const tla = `${homedir()}/tsv-dispatch/formal/VKPrLoop.tla`;
const derive = `${homedir()}/tsv-dispatch/formal/derive_flags.py`;
if (existsSync(tla)) {
  const spec = readFileSync(tla, 'utf8');
  assert.match(spec, /FIX_BASEPENDING/);
  assert.match(spec, /judg' = "base"/);
  assert.match(spec, /FIX_BASEPENDING \/\\ judg = "base"/);
  assert.match(spec, /BaseStructurePending/);
}
if (existsSync(derive)) {
  const flags = readFileSync(derive, 'utf8');
  assert.match(flags, /"FIX_BASEPENDING":/);
  assert.match(flags, /BaseStructurePending/);
  assert.match(flags, /newest > at \+ 60/);
}

console.log('ok');
