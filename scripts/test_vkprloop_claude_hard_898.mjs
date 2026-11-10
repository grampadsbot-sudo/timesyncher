import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(repo, 'scripts/fixtures/vk-lane-claude-hard-898.txt');

const ANCHORS = [
  'VK_HOST_PUBLICATION_ONLY=1',
  'hold_done()',
  'ROWCHK=',
  'DONE.rowcheck-norun',
  '--publish-now',
];

const SPEC_BITS = [
  '#898 (11/9): claude-ubuntu model choice',
  'claude hard round needs hard_model',
  'claude-opus-5-5 or',
  'HARD-ESCALATE',
  'No new flag, state, or TLC check',
  'Not an action. Lane endings stay',
  'PubNowOK == PUBLISH_NOW /\\ LIVE_ROW_GATE',
  'CoderDone ==',
  '{"code", "receipt", "none"}',
];

function sections(src) {
  const parts = src.split(/^--- (.+) ---$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ name: parts[i], body: parts[i + 1].replace(/^\n/, '').replace(/\n$/, '') });
  }
  return out;
}

function assertOrder(src, chunks, label) {
  let at = -1;
  for (const chunk of chunks) {
    const i = src.indexOf(chunk.body, at + 1);
    assert.ok(i > at, `${label}: missing or reordered ${chunk.name}`);
    at = i;
  }
}

function assertAnchors(src, label) {
  let at = -1;
  for (const anchor of ANCHORS) {
    const i = src.indexOf(anchor, at + 1);
    assert.ok(i > at, `${label}: missing or reordered ${anchor}`);
    at = i;
  }
}

function assertLane(src, chunks, label) {
  assertOrder(src, chunks, label);
  assertAnchors(src, label);
  const brief = src.indexOf('run_lane "$BRIEF"');
  const gate = src.indexOf('HARD-ESCALATE $LANE $TAG gatefix');
  const row = src.indexOf('HARD-ESCALATE $LANE $TAG rowfix');
  const publish = src.indexOf('--publish-now');
  assert.ok(brief >= 0 && gate > brief && row > gate && publish > row, `${label}: escalate stays inside the running job, before publish`);
  const marks = src.split('HARD-ESCALATE').length - 1;
  assert.equal(marks, 2, `${label}: exactly two hard escalates`);
  assert.ok(src.indexOf('write_early_refuse "claude hard round needs hard_model in lanes.json"') < brief, `${label}: hard-model refuse is pre-start`);
  assert.ok(src.indexOf('write_early_refuse "claude model must be subscription opus/fable not $MODEL"') < brief, `${label}: model allowlist is pre-start`);
}

function assertSpec(src) {
  for (const bit of SPEC_BITS) {
    assert.ok(src.includes(bit), `spec missing ${bit}`);
  }
}

const fixture = fs.readFileSync(fixturePath, 'utf8');
const chunks = sections(fixture);
assert.deepEqual(chunks.map((c) => c.name), ['hard-start', 'model-allow', 'gatefix', 'rowfix']);
for (const chunk of chunks) assert.ok(chunk.body.length > 40, `empty fixture section ${chunk.name}`);
assertOrder(fixture, chunks, 'fixture');
assert.match(chunks[0].body, /write_early_refuse "claude hard round needs hard_model in lanes.json"/);
assert.match(chunks[1].body, /claude-opus-5-5\|claude-fable-5-2/);
assert.match(chunks[2].body, /HARD-ESCALATE \$LANE \$TAG gatefix/);
assert.match(chunks[3].body, /HARD-ESCALATE \$LANE \$TAG rowfix/);
assert.equal(fixture.includes('--publish-now'), false, 'fixture is the claude hard-round excerpts only');

const dispatch = process.env.TSV_DISPATCH || path.join(os.homedir(), 'tsv-dispatch');
const lanePath = path.join(dispatch, 'lanes/vk-lane-run.sh');
const specPath = path.join(dispatch, 'formal/VKPrLoop.tla');
const liveLane = fs.existsSync(lanePath);
const liveSpec = fs.existsSync(specPath);

if (liveLane || liveSpec) {
  assert.equal(liveLane && liveSpec, true, `dispatcher pair incomplete under ${dispatch}`);
  assertLane(fs.readFileSync(lanePath, 'utf8'), chunks, 'live lane');
  assertSpec(fs.readFileSync(specPath, 'utf8'));
  console.log('vkprloop claude hard #898: fixture + live dispatcher ok');
} else {
  console.log('vkprloop claude hard #898: fixture ok (no local tsv-dispatch)');
}
