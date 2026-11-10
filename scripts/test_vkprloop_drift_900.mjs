import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(repo, 'scripts/fixtures/vkprloop-drift-900.txt');

const FILE_OF = {
  'lane-frozen': 'lanes/vk-lane-run.sh',
  'lane-endtrap': 'lanes/vk-lane-run.sh',
  'pregate-ci-wait': 'tsv_dispatch.py',
  'pregate-restore-fail': 'tsv_dispatch.py',
  'automerge-unstable': 'tsv_dispatch.py',
  'stall-covered': 'tsv_stall_alarm.py',
  'gateb-zone': 'gateb_trend.py',
  'gateb-score': 'gateb_trend.py',
  'gateb-headline': 'gateb_trend.py',
};

const SPEC_BITS = [
  '#900 (11/9): pregate, after logging a required-CI-red skip',
  'pregate_prepared, on a head',
  'STATE.pregate (gb) is not cleared',
  'Not an action.',
  '#900 (11/9, #899): automerge accepts mergeable_state=unstable',
  'ci = "green"',
  'Merge ==',
  '#900 (11/9): lanes/vk-lane-run.sh re-execs a frozen copy',
  'VK_LANE_FROZEN',
  '_end_trap',
  'hold_done, ROWBLOCK, unhold_done, and --publish-now are',
  '{"code", "receipt", "none"}',
  '#900 (11/9, #898 follow-up): main\'s ownership() skip',
  'clear_issue_ready',
  'StallFix ==',
  '#900 (11/9): gateb_trend.py is a watched meter file',
  'No PR-loop state.',
  'Pregate ==',
  'PubNowOK == PUBLISH_NOW /\\ LIVE_ROW_GATE',
];

function sections(src) {
  const parts = src.split(/^--- (.+) ---$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ name: parts[i], body: parts[i + 1].replace(/^\n/, '').replace(/\n$/, '') });
  }
  return out;
}

function assertSpec(src) {
  for (const bit of SPEC_BITS) {
    assert.ok(src.includes(bit), `spec missing ${bit}`);
  }
  const lane = src.indexOf('#900 (11/9): lanes/vk-lane-run.sh re-execs a frozen copy');
  const die = src.indexOf('CoderDie ==');
  assert.ok(lane > 0 && die > lane, 'frozen-copy note stays with the lane worker, before CoderDie');
  const pre = src.indexOf('#900 (11/9): pregate, after logging a required-CI-red skip');
  const pregate = src.indexOf('Pregate ==');
  assert.ok(pre > 0 && pregate > pre, 'pregate status note stays above Pregate');
  const mergeNote = src.indexOf('#900 (11/9, #899): automerge accepts mergeable_state=unstable');
  const merge = src.indexOf('Merge ==');
  assert.ok(mergeNote > 0 && merge > mergeNote, 'unstable note stays above Merge');
}

function fnBody(src, name) {
  const at = src.indexOf(`def ${name}(`);
  assert.ok(at >= 0, `missing def ${name}`);
  const next = src.indexOf('\ndef ', at + 1);
  return src.slice(at, next === -1 ? src.length : next);
}

const fixture = fs.readFileSync(fixturePath, 'utf8');
const chunks = sections(fixture);
assert.deepEqual(chunks.map((c) => c.name), Object.keys(FILE_OF));
for (const chunk of chunks) {
  assert.ok(chunk.body.length > 20, `empty fixture section ${chunk.name}`);
  assert.equal(FILE_OF[chunk.name] != null, true, `unmapped section ${chunk.name}`);
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
  const lane = byFile['lanes/vk-lane-run.sh'];
  const frozen = lane.indexOf(chunks[0].body);
  const endtrap = lane.indexOf(chunks[1].body);
  const hold = lane.indexOf('hold_done()');
  const publish = lane.indexOf('--publish-now');
  assert.ok(frozen >= 0 && frozen < endtrap && endtrap < hold && hold < publish, 'frozen copy and END trap stay before hold_done and publish-now');
  assert.ok(lane.includes('VK_HOST_PUBLICATION_ONLY=1'), 'host publication only stays on');
  assert.ok(lane.includes('DONE.rowcheck-norun'), 'row-check withhold stays');

  const dispatchPy = byFile['tsv_dispatch.py'];
  const prepared = fnBody(dispatchPy, 'pregate_prepared');
  const pregate = fnBody(dispatchPy, 'pregate');
  const automerge = fnBody(dispatchPy, 'automerge');
  assert.ok(prepared.includes(chunks.find((c) => c.name === 'pregate-restore-fail').body), 'restore stays in pregate_prepared');
  assert.equal(pregate.includes(chunks.find((c) => c.name === 'pregate-restore-fail').body), false, 'failure restore is not the CI-red skip');
  assert.ok(pregate.includes(chunks.find((c) => c.name === 'pregate-ci-wait').body), 'CI-red wait stays in pregate');
  assert.ok(pregate.includes('no verdict implied') || pregate.includes('Gate B waits: unit-tests red'), 'CI-red rewrite writes no verdict');
  assert.ok(automerge.includes(chunks.find((c) => c.name === 'automerge-unstable').body), 'unstable acceptance stays in automerge');
  assert.equal(automerge.includes('if ign and not red and not pending'), false, 'unstable no longer depends on ignored statuses');
  assert.ok(automerge.includes('if bad:'), 'FORBID_MERGE guard stays');

  const stall = fnBody(byFile['tsv_stall_alarm.py'], 'main');
  const own = stall.indexOf(chunks.find((c) => c.name === 'stall-covered').body);
  const clear = stall.indexOf('clear_issue_ready(g, i["number"])');
  assert.ok(own >= 0 && clear > own, 'covered issues still clear status:ready after the ownership skip');

  const trend = byFile['gateb_trend.py'];
  const zone = trend.indexOf(chunks.find((c) => c.name === 'gateb-zone').body);
  const score = trend.indexOf(chunks.find((c) => c.name === 'gateb-score').body);
  const headline = trend.indexOf(chunks.find((c) => c.name === 'gateb-headline').body);
  assert.ok(zone >= 0 && zone < score && score < headline, 'meter scorer stays a headline over in-process v6 results');

  assertSpec(fs.readFileSync(specPath, 'utf8'));
  console.log('vkprloop drift #900: fixture + live dispatcher ok');
} else {
  console.log('vkprloop drift #900: fixture ok (no local tsv-dispatch)');
}
