import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// #726: H4 still only rings. The unpublished patch may be PATCH.patch or bare PATCH.
// PATCH.patch wins when both exist. No publish, commit, or PR-loop variable changes.

const FIXTURE = `#!/bin/bash
set -u
h4_decide() {
  local D="$1" TAG="$2"
  local PF="$D/PATCH.patch"
  [ -f "$PF" ] || PF="$D/PATCH"
  if [ -f "$D/$TAG-DONE" ] && [ -f "$PF" ]; then
    local DONE_LINE
    DONE_LINE=$(cat "$D/$TAG-DONE" 2>/dev/null | head -1)
    case "$DONE_LINE" in
      *"result source-ready"*|*"result partial"*|*"result GATE-PASS"*|*"result gate-pass"*)
        case "$TAG" in
          *687*|*693*|vkfill-687|vkfill-693)
            local STAMP="$D/.h4-host-publish-rung"
            local NOW="\${H4_NOW:-1000000}"
            local LAST=0
            [ -f "$STAMP" ] && LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
            if [ $((NOW - LAST)) -ge 600 ]; then
              printf 'RING %s %s\\n' "$TAG" "$(basename "$PF")"
              echo "$NOW" > "$STAMP"
              return 0
            fi
            echo SKIP-DEDUP
            return 0
            ;;
        esac
        ;;
    esac
  fi
  echo SKIP
}
h4_decide "$1" "$2"
`;

const BARE_MUTANT = FIXTURE.replace('[ -f "$PF" ] || PF="$D/PATCH"\n', '');

function runDecide(src, dir, tag, now) {
  const run = spawnSync('bash', ['-c', src, 'h4', dir, tag], {
    env: { ...process.env, H4_NOW: String(now) },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, (run.stderr || run.stdout || 'h4 fixture failed').trim());
  return run.stdout.trim();
}

function job(doneLine, { patch = 'patch', tag = 'vkfill-687', stamp = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h4-patch-'));
  if (doneLine !== null) fs.writeFileSync(path.join(dir, `${tag}-DONE`), `${doneLine}\n`);
  if (patch === 'patch' || patch === 'both') fs.writeFileSync(path.join(dir, 'PATCH.patch'), 'diff --git a/x b/x\n');
  if (patch === 'bare' || patch === 'both') fs.writeFileSync(path.join(dir, 'PATCH'), 'diff --git a/y b/y\n');
  if (stamp !== null) fs.writeFileSync(path.join(dir, '.h4-host-publish-rung'), `${stamp}\n`);
  return dir;
}

function once(src, label, done, tag, now, expected, extra) {
  assert.equal(runDecide(src, job(done, { tag, ...extra }), tag, now), expected, label);
}

function assertWake(src, label) {
  const ready = job('result source-ready abc123', { tag: 'vkfill-687', patch: 'patch' });
  assert.equal(runDecide(src, ready, 'vkfill-687', 1_000_000), 'RING vkfill-687 PATCH.patch', `${label}: source-ready rings`);
  assert.equal(runDecide(src, ready, 'vkfill-687', 1_000_100), 'SKIP-DEDUP', `${label}: 100s later is inside 10 min`);
  assert.equal(runDecide(src, ready, 'vkfill-687', 1_000_600), 'RING vkfill-687 PATCH.patch', `${label}: 600s later rings again`);

  once(src, `${label}: bare PATCH rings`, 'result source-ready tip', 'vkfill-687', 2_000_000, 'RING vkfill-687 PATCH', { patch: 'bare' });
  once(src, `${label}: PATCH.patch wins when both exist`, 'result source-ready tip', 'vkfill-693', 2_000_000, 'RING vkfill-693 PATCH.patch', { patch: 'both' });
  once(src, label, 'result partial tip', 'vkfill-693', 2_000_000, 'RING vkfill-693 PATCH.patch');
  once(src, label, 'result GATE-PASS tip', 'issue-687-followup', 2_000_000, 'RING issue-687-followup PATCH.patch');
  once(src, label, 'result gate-pass tip', 'x693y', 2_000_000, 'RING x693y PATCH.patch');
  once(src, `${label}: glob *687*`, 'note result source-ready tail', '16870', 2_000_000, 'RING 16870 PATCH.patch');

  once(src, `${label}: other results stay quiet`, 'result blocked', 'vkfill-687', 2_000_000, 'SKIP');
  once(src, label, 'GATE-PASS without the result word', 'vkfill-687', 2_000_000, 'SKIP');
  once(src, `${label}: other PRs stay quiet`, 'result source-ready', 'vkfill-688', 2_000_000, 'SKIP');
  once(src, `${label}: a patch file is required`, 'result source-ready', 'vkfill-687', 2_000_000, 'SKIP', { patch: false });
  once(src, `${label}: no DONE file`, null, 'vkfill-687', 2_000_000, 'SKIP');
  once(src, label, 'result source-ready', 'vkfill-687', 5_000_599, 'SKIP-DEDUP', { stamp: 5_000_000 });
  once(src, label, 'result source-ready', 'vkfill-687', 5_000_600, 'RING vkfill-687 PATCH.patch', { stamp: 5_000_000 });
}

assertWake(FIXTURE, 'fixture');
assert.throws(() => assertWake(BARE_MUTANT, 'bare-mutant'), /bare PATCH rings/);

function h4Slice(src) {
  const start = src.indexOf('# H4 host-publish wake');
  const end = src.indexOf('echo "$(ts) END', start);
  assert.ok(start >= 0 && end > start, 'live script has an H4 block before END');
  return src.slice(start, end);
}

function pythonSlice(block) {
  const start = block.indexOf("<<'PYH4'");
  const end = block.indexOf('\nPYH4', start);
  assert.ok(start >= 0 && end > start, 'H4 block calls python');
  return block.slice(start, end);
}

function assertAlertOnly(laneSrc) {
  const block = h4Slice(laneSrc);
  const py = pythonSlice(block);
  assert.match(block, /PF="\$D\/PATCH\.patch"; \[ -f "\$PF" \] \|\| PF="\$D\/PATCH"/);
  assert.match(block, /\[ -f "\$D\/\$TAG-DONE" \] && \[ -f "\$PF" \]/);
  assert.equal(block.includes('[ -f "$D/PATCH.patch" ]'), false, 'H4 must not require only PATCH.patch');
  assert.match(block, /\*"result source-ready"\*\|\*"result partial"\*\|\*"result GATE-PASS"\*\|\*"result gate-pass"\*/);
  assert.match(block, /\*687\*\|\*693\*\|vkfill-687\|vkfill-693\)/);
  assert.match(block, /-ge 600/);
  assert.match(py, /from bar_watch import ring_eggbot/);
  assert.match(py, /ring_eggbot\(os\.environ\["H4_MSG"\]\)/);
  for (const forbidden of ['publish', 'lane_autofill', 'git ', 'subprocess', 'os.system', 'mv ', 'DONE', '--publish-now']) {
    assert.equal(py.includes(forbidden), false, `H4 python must not contain ${forbidden}`);
  }
  for (const forbidden of ['--publish-now', 'lane_autofill', 'git push', 'git commit', 'git merge', 'mv ']) {
    assert.equal(block.includes(forbidden), false, `H4 shell must not contain ${forbidden}`);
  }
  assert.ok(!/rc=/.test(block), 'H4 must not change the lane exit code');
  const publishAt = laneSrc.indexOf('--publish-now');
  const rowAt = laneSrc.indexOf('ROWCHK=');
  const holdAt = laneSrc.indexOf('hold_done()');
  assert.ok(holdAt >= 0 && rowAt > holdAt && publishAt > rowAt && laneSrc.indexOf('# H4 host-publish wake') > publishAt,
    'H4 rings only after hold_done, the row gate, and publish_now');
}

function dispatchRoot() {
  const candidates = [
    process.env.TSV_DISPATCH,
    '/home/ubishere9995/tsv-dispatch',
    path.join(os.homedir(), 'tsv-dispatch'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'lanes', 'vk-lane-run.sh')) && fs.existsSync(path.join(dir, 'formal', 'VKPrLoop.tla'))) {
      return dir;
    }
  }
  return null;
}

const root = dispatchRoot();
if (root) {
  const lane = fs.readFileSync(path.join(root, 'lanes', 'vk-lane-run.sh'), 'utf8');
  assertAlertOnly(lane);
  const tla = fs.readFileSync(path.join(root, 'formal', 'VKPrLoop.tla'), 'utf8');
  assert.match(tla, /H4 host-publish wake \(decisions-log #64 \/ eggbot 2026-10-26, #724; patch name #726\)/);
  assert.match(tla, /either\s*\n\\?\* PATCH\.patch or bare PATCH is still unpublished/);
  assert.match(tla, /PATCH\.patch wins when both exist/);
  assert.match(tla, /Which filename is present does not change the PR loop/);
  assert.match(tla, /Alerting only:/);
  assert.match(tla, /no publish, verdict, hold, merge, requeue, or other PR-loop variable changes/);
  assert.match(tla, /Not an action\. Rings are not progress\./);
  const check = spawnSync('python3', ['formal/manifest.py', 'check'], { cwd: root, encoding: 'utf8' });
  assert.equal(check.status, 0, (check.stdout || check.stderr || 'manifest drift').trim());
  console.log('vkprloop H4 patch name #726: live spec in sync');
} else {
  console.log('vkprloop H4 patch name #726: fixture ok (no local tsv-dispatch)');
}
