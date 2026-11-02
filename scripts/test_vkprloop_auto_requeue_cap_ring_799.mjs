// #799: auto_requeue cap ring names gap and coverage reasons. Same rethink, no token.
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

// Mirrors the cap-ring `or` chain. [:3] binds to coverage fails, then concatenates.
function capRingReason(rec) {
  const bad = rec.bad;
  const hard = (rec.coverage_hard || []).map((c) => `coverage: ${c}`);
  const reasons = ((rec.gap_close || {}).reasons) || [];
  const cov = (((rec.coverage || {}).fails) || []).slice(0, 3).map((c) => `coverage: ${c}`);
  const named = reasons.concat(cov);
  const fallback = [`effective ${rec.effective}, no reason recorded`];
  const picked = (bad && bad.length ? bad : null)
    || (hard.length ? hard : null)
    || (named.length ? named : null)
    || fallback;
  return picked.join('; ').slice(0, 300);
}

const cases = [
  {
    rec: {
      bad: ['pixel A', 'pixel B'],
      coverage_hard: ['h'],
      gap_close: { reasons: ['gap'] },
      coverage: { fails: ['c1'] },
      effective: 'FAIL',
    },
    expect: 'pixel A; pixel B',
  },
  {
    rec: {
      bad: [],
      coverage_hard: ['overflow'],
      gap_close: { reasons: ['gap'] },
      coverage: { fails: ['c1', 'c2', 'c3', 'c4'] },
      effective: 'FAIL',
    },
    expect: 'coverage: overflow',
  },
  {
    rec: {
      bad: null,
      coverage_hard: [],
      gap_close: { reasons: ['gap not closed', 'other'] },
      coverage: { fails: ['a', 'b', 'c', 'd'] },
      effective: 'FAIL',
    },
    expect: 'gap not closed; other; coverage: a; coverage: b; coverage: c',
  },
  {
    rec: { coverage: { fails: ['a', 'b', 'c', 'd', 'e'] }, effective: 'FAIL' },
    expect: 'coverage: a; coverage: b; coverage: c',
  },
  {
    rec: { effective: 'FAIL' },
    expect: 'effective FAIL, no reason recorded',
  },
  {
    rec: { gap_close: {}, coverage: { fails: [] }, effective: 'NOPE' },
    expect: 'effective NOPE, no reason recorded',
  },
  {
    rec: { bad: ['x'.repeat(400)], effective: 'FAIL' },
    expect: 'x'.repeat(300),
  },
];

for (const { rec, expect } of cases) {
  assert.equal(capRingReason(rec), expect);
}

const py = spawnSync('python3', ['-c', `
import json, sys
cases = json.loads(sys.stdin.read())
def reason(rec):
    return "; ".join(rec.get("bad") or [("coverage: " + c) for c in (rec.get("coverage_hard") or [])] or list((rec.get("gap_close") or {}).get("reasons") or []) + [("coverage: " + c) for c in ((rec.get("coverage") or {}).get("fails") or [])][:3] or ["effective %s, no reason recorded" % rec.get("effective")])[:300]
for rec, expect in cases:
    got = reason(rec)
    if got != expect:
        sys.stderr.write("got %r expected %r\\n" % (got, expect))
        sys.exit(1)
print("python cap ring ok", len(cases))
`], {
  input: JSON.stringify(cases.map(({ rec, expect }) => [rec, expect])),
  encoding: 'utf8',
});
assert.equal(py.status, 0, (py.stderr || py.stdout || 'python reason check failed').trim());

const fn = sliceFn(read('tsv_dispatch.py'), 'auto_requeue');
const ringAt = fn.indexOf('bell_gate.ring(');
assert.ok(ringAt >= 0, 'cap path rings dr');
const capReturn = fn.indexOf('rang dr eggbot', ringAt);
assert.ok(capReturn > ringAt, 'cap path logs the ring');
const tokenWrite = fn.indexOf('auto-filler/requeue/%d');
assert.ok(tokenWrite > capReturn, 'requeue token is written only after the cap return');
assert.match(
  fn,
  /list\(\(rec\.get\("gap_close"\) or \{\}\)\.get\("reasons"\) or \[\]\) \+ \[\("coverage: " \+ c\) for c in \(\(rec\.get\("coverage"\) or \{\}\)\.get\("fails"\) or \[\]\)\]\[:3\]/,
);
assert.match(fn, /if tier is None or e\["rounds"\] >= AUTO_ROUND_CAP:/);
assert.doesNotMatch(
  fn.slice(ringAt, tokenWrite),
  /auto-filler\/requeue\/%d/,
);

const spec = read('formal/VKPrLoop.tla');
assert.match(spec, /auto_requeue cap ring \(#799, 11\/02\)/);
assert.match(spec, /writes no requeue token/);
assert.match(spec, /first 3 coverage fails/);
assert.match(spec, /Ring text only/);
assert.match(spec, /tier None or cap -> ring dr, no token \(#799 ring text only\)/);
assert.match(spec, /rethink' = TRUE \/\\ UNCHANGED token/);
assert.equal(/CapRing\s*==/.test(spec), false, 'cap ring text is not a PR-loop action');

const check = spawnSync('python3', [path.join(formal, 'manifest.py'), 'check'], { encoding: 'utf8' });
assert.equal(check.status, 0, (check.stdout || check.stderr || 'manifest drift').trim());
assert.match(check.stdout, /in sync/);

console.log('test_vkprloop_auto_requeue_cap_ring_799: ok');
