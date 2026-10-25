import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// #720: keepset_pass_doorbell is an alert on an already-decided Gate B PASS or
// SKIPPED_BACKEND_ONLY. It must not write a verdict, hold, merge, or requeue.

const FIXTURE = `
def keepset_pass_doorbell(n, sha, eff):
    """Ring dr eggbot once per keep-set PR head on Gate B PASS / SKIPPED_BACKEND_ONLY. Never raises."""
    try:
        n = int(n)
        if n not in KEEP_SET_DOOR_PRS or eff not in ("PASS", "SKIPPED_BACKEND_ONLY") or not sha or DRY: return None
        f = os.path.join(D, "logs", "keepset-gateb-pass-rung.json")
        try: seen = json.load(open(f))
        except Exception: seen = {}
        k = "%d:%s" % (n, sha)
        if k in seen: return None
        import bell_gate
        rc = bell_gate.ring("tsv-dispatch", "Keep-set Gate B %s" % eff, "eggbot_decision", meta={"item_key": "keepset-pass-" + k})
        seen[k] = {"at": "now", "rc": str(rc), "eff": eff}
        tmp = f + ".tmp"; json.dump(seen, open(tmp, "w")); os.replace(tmp, f)
        return rc
    except Exception:
        return None
`;

const MUTANT = FIXTURE.replace(
  'return rc',
  'STATE["pregate"][str(n)] = {"verdict": "PASS"}; save_state(); return rc',
);

function extractFn(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`def ${name}(`));
  assert.ok(start >= 0, `missing def ${name}`);
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length && !line.startsWith(' ') && !line.startsWith('\t')) break;
    out.push(line);
  }
  return out.join('\n');
}

function assertAlertOnly(fnSrc, label) {
  assert.match(fnSrc, /eff not in \("PASS", "SKIPPED_BACKEND_ONLY"\)/, `${label}: rings only PASS or SKIPPED_BACKEND_ONLY`);
  assert.match(fnSrc, /n not in KEEP_SET_DOOR_PRS/, `${label}: rings only the keep-set PR numbers`);
  assert.match(fnSrc, /bell_gate\.ring\(/, `${label}: the only side effect is a bell`);
  assert.match(fnSrc, /except Exception/, `${label}: errors are swallowed`);
  for (const forbidden of [
    'STATE[',
    'save_state(',
    'auto_requeue(',
    'gateb_status(',
    'hold:',
    'merge(',
    '"verdict"',
    "'verdict'",
  ]) {
    assert.equal(fnSrc.includes(forbidden), false, `${label}: must not contain ${forbidden}`);
  }
}

function assertCallSites(src) {
  const one = extractFn(src, 'pregate_one');
  const prepared = extractFn(src, 'pregate_prepared');
  const skip = extractFn(src, 'record_backend_skip');
  assert.equal(count(one, 'keepset_pass_doorbell('), 1);
  assert.equal(count(prepared, 'keepset_pass_doorbell('), 1);
  assert.equal(count(skip, 'keepset_pass_doorbell('), 1);
  const passAt = one.indexOf('if (rec.get("effective") or verdict) == "PASS":');
  const doorAt = one.indexOf('keepset_pass_doorbell(n, sha, "PASS")');
  assert.ok(passAt >= 0 && doorAt > passAt, 'pregate_one rings only after an effective PASS');
  const already = prepared.indexOf('elif g.get("sha") == sha and g.get("verdict"):');
  const prepDoor = prepared.indexOf('keepset_pass_doorbell(n, sha, eff)');
  const cont = prepared.indexOf('continue', prepDoor);
  assert.ok(already >= 0 && prepDoor > already && cont > prepDoor, 'pregate_prepared rings on an already-verdict head, then continues');
  const failReturn = skip.indexOf('return rec');
  const skipDoor = skip.indexOf('keepset_pass_doorbell(n, sha, "SKIPPED_BACKEND_ONLY")');
  assert.ok(failReturn >= 0 && skipDoor > failReturn, 'record_backend_skip rings only after the known-gap FAIL returns');
  assert.ok(skip.indexOf('gateb_status(sha, "success"') < skipDoor, 'record_backend_skip rings after the skip is recorded');
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function dispatchRoot() {
  const candidates = [
    process.env.TSV_DISPATCH,
    '/home/ubishere9995/tsv-dispatch',
    path.join(os.homedir(), 'tsv-dispatch'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'tsv_dispatch.py')) && fs.existsSync(path.join(dir, 'formal', 'VKPrLoop.tla'))) {
      return dir;
    }
  }
  return null;
}

assertAlertOnly(FIXTURE, 'fixture');
assert.throws(() => assertAlertOnly(MUTANT, 'mutant'), /must not contain STATE\[/);

const root = dispatchRoot();
if (root) {
  const dispatch = fs.readFileSync(path.join(root, 'tsv_dispatch.py'), 'utf8');
  assert.match(dispatch, /KEEP_SET_DOOR_PRS = frozenset\(\{687, 693\}\)/);
  assertAlertOnly(extractFn(dispatch, 'keepset_pass_doorbell'), 'live keepset_pass_doorbell');
  assertCallSites(dispatch);
  const tla = fs.readFileSync(path.join(root, 'formal', 'VKPrLoop.tla'), 'utf8');
  assert.match(tla, /keepset_pass_doorbell \(Craig 3:05 PM PT 10\/25, #720\)/);
  assert.match(tla, /Alerting only:/);
  assert.match(tla, /Not an action\. Rings are not progress\./);
  assert.match(tla, /no verdict, hold, merge, requeue, or other PR-loop variable changes/);
  const covered = fs.readFileSync(path.join(root, 'formal', 'derive_flags.py'), 'utf8');
  assert.match(covered, /"keepset_pass_doorbell"/);
  const check = spawnSync('python3', ['formal/manifest.py', 'check'], { cwd: root, encoding: 'utf8' });
  assert.equal(check.status, 0, (check.stdout || check.stderr || 'manifest drift').trim());
  console.log('vkprloop keepset door #720: live spec in sync');
} else {
  console.log('vkprloop keepset door #720: fixture ok (no local tsv-dispatch)');
}
