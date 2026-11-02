/**
 * #787: vk-lane-run.sh exports CHROME_PATH so lane layout tests see Chrome.
 * That is runner environment. VKPrLoop.tla does not add a PR-loop action for it.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dispatch = process.env.TSV_DISPATCH_ROOT || path.join(os.homedir(), 'tsv-dispatch');
const scriptPath = path.join(dispatch, 'lanes', 'vk-lane-run.sh');
const specPath = path.join(dispatch, 'formal', 'VKPrLoop.tla');
const manifestPath = path.join(dispatch, 'formal', 'manifest.json');

const script = fs.readFileSync(scriptPath, 'utf8');
const lines = script.split('\n');
const chromeIdx = lines.findIndex((line) => line.includes('export CHROME_PATH="$c"'));
assert.ok(chromeIdx >= 0, 'vk-lane-run.sh must export CHROME_PATH from the first executable candidate');
const chromeLine = lines[chromeIdx];
assert.match(chromeLine, /\[ -n "\$\{CHROME_PATH:-}" \]/);
assert.ok(
  chromeLine.includes('"$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome'),
  'candidates start at the Playwright chromium cache',
);
assert.ok(chromeLine.includes('/usr/bin/chromium-browser'), 'fallback candidate is /usr/bin/chromium-browser');
assert.ok(chromeLine.includes('{ for c in'), 'CHROME_PATH export must run in the current shell');
assert.equal(chromeLine.includes('( for c in'), false, 'CHROME_PATH export must not be a subshell');

const startIdx = lines.findIndex((line) => line.includes('START $LANE'));
const runLaneIdx = lines.findIndex((line) => line.startsWith('run_lane()'));
assert.ok(startIdx > chromeIdx, 'CHROME_PATH is set before the job START line');
assert.ok(runLaneIdx > chromeIdx, 'CHROME_PATH is set before run_lane');
assert.equal(script.includes('unset CHROME_PATH'), false, 'the lane must not clear CHROME_PATH');

function hostChromium() {
  try {
    fs.accessSync('/usr/bin/chromium-browser', fs.constants.X_OK);
    return '/usr/bin/chromium-browser';
  } catch {
    return '';
  }
}

function resolveChrome(home, preset) {
  const env = { PATH: '/usr/bin:/bin', HOME: home };
  if (preset !== undefined) env.CHROME_PATH = preset;
  return execFileSync('bash', ['-c', `set -u\n${chromeLine}\nbash -c 'printf %s "\${CHROME_PATH-}"'`], {
    env,
    encoding: 'utf8',
  });
}

function chromeBin(home, version, executable) {
  const dir = path.join(home, '.cache', 'ms-playwright', `chromium-${version}`, 'chrome-linux64');
  fs.mkdirSync(dir, { recursive: true });
  const bin = path.join(dir, 'chrome');
  fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(bin, executable ? 0o755 : 0o644);
  return bin;
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vk787-chrome-'));
try {
  assert.equal(resolveChrome(home, '/preset/chrome'), '/preset/chrome', 'a non-empty CHROME_PATH is left unchanged');
  assert.equal(resolveChrome(home, ''), hostChromium(), 'an empty CHROME_PATH is treated as unset');

  const skipped = chromeBin(home, '1000', false);
  const later = chromeBin(home, '1208', true);
  assert.equal(resolveChrome(home), later, `skips non-executable ${skipped}`);

  const earlier = chromeBin(home, '0900', true);
  assert.equal(resolveChrome(home), earlier, 'lexical glob order picks the earliest executable chromium');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}

const tla = fs.readFileSync(specPath, 'utf8');
assert.match(tla, /CHROME_PATH \(dr eggbot 2026-11-02 #549 loop, #787\)/);
assert.match(tla, /Runner environment only: no verdict, hold, merge/);
assert.match(tla, /Not an action\. Lane endings stay/);
assert.match(tla, /\{"code", "receipt", "none"\}/);
assert.equal(/ChromePath\s*==/.test(tla), false, 'chrome path is not a PR-loop action');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = crypto.createHash('sha256').update(fs.readFileSync(scriptPath)).digest('hex');
assert.equal(
  manifest.functions['lanes/vk-lane-run.sh:*'],
  hash,
  'formal/manifest.json must record this vk-lane-run.sh',
);

console.log('test_vkprloop_lane_chrome_path: ok');
