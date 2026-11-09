import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(repo, 'scripts/fixtures/vk-lane-grok-perm-893.sh');

const ANCHORS = [
  'VK_HOST_PUBLICATION_ONLY=1',
  'hold_done()',
  'ROWCHK=',
  'DONE.rowcheck-norun',
  '--publish-now',
];

function grokCase(src, label) {
  const start = src.indexOf('  grok-ubuntu)');
  const end = src.indexOf('\n  *)', start);
  assert.ok(start >= 0 && end > start, `${label}: grok-ubuntu case missing`);
  return src.slice(start, end);
}

function assertGrokCase(src, label) {
  const g = grokCase(src, label);
  assert.match(g, /--always-approve/, `${label}: always-approve`);
  assert.match(g, /--permission-mode bypassPermissions/, `${label}: bypassPermissions`);
  for (const tool of ['Bash(*)', 'Read(*)', 'Write(*)', 'Edit(*)', 'Glob(*)', 'Grep(*)']) {
    assert.ok(g.includes(`--allow "${tool}"`), `${label}: missing allow ${tool}`);
  }
  const invoke = g.slice(g.indexOf('timeout 7200'));
  assert.ok(invoke.startsWith('timeout 7200'), `${label}: grok invocation missing`);
  assert.equal(invoke.includes('--deny'), false, `${label}: grok invocation must not pass --deny`);
  assert.match(g, /GROK_NOJEV=/, `${label}: GROK_NOJEV`);
  assert.match(g, /GROK_BASH=/, `${label}: GROK_BASH`);
  assert.match(g, /git commit\/push\/merge\/rebase\/reset are denied/, `${label}: prompt still bans git mutations`);
  assert.match(g, /Do NOT invoke gbrain skill timesyncher-jev-decision-router/, `${label}: no Jev router`);
  const wide = g.indexOf('GROK_READ=(--allow "Bash(*)"');
  const prep = g.indexOf('}" = read-only-prep ]; then');
  assert.ok(wide >= 0 && prep > wide, `${label}: code mode is the wide allowlist`);
  assert.match(g, /Bash\(git -C \$WD status \*\)/, `${label}: read-only-prep keeps narrow git reads`);
  return g;
}

function assertAnchors(src, label) {
  let at = -1;
  for (const anchor of ANCHORS) {
    const i = src.indexOf(anchor, at + 1);
    assert.ok(i > at, `${label}: missing or reordered ${anchor}`);
    at = i;
  }
}

function assertSpec(src) {
  assert.match(src, /#893 \(11\/9\): grok-ubuntu code mode/);
  assert.match(src, /--permission-mode bypassPermissions/);
  assert.match(src, /GROK_NOJEV/);
  assert.match(src, /GROK_BASH/);
  assert.match(src, /Tool and prompt delivery only/);
  assert.match(src, /Not an action\. Lane endings stay/);
  assert.match(src, /PubNowOK == PUBLISH_NOW \/\\ LIVE_ROW_GATE/);
  assert.match(src, /CoderDone ==/);
  assert.match(src, /\{"code", "receipt", "none"\}/);
}

const fixture = fs.readFileSync(fixturePath, 'utf8');
const fixtureCase = assertGrokCase(fixture, 'fixture');
assert.equal(fixture.includes('VK_HOST_PUBLICATION_ONLY'), false, 'fixture is the grok case only');

const dispatch = process.env.TSV_DISPATCH || path.join(os.homedir(), 'tsv-dispatch');
const lanePath = path.join(dispatch, 'lanes/vk-lane-run.sh');
const specPath = path.join(dispatch, 'formal/VKPrLoop.tla');
const liveLane = fs.existsSync(lanePath);
const liveSpec = fs.existsSync(specPath);

if (liveLane || liveSpec) {
  assert.equal(liveLane && liveSpec, true, `dispatcher pair incomplete under ${dispatch}`);
  const lane = fs.readFileSync(lanePath, 'utf8');
  const spec = fs.readFileSync(specPath, 'utf8');
  assert.ok(lane.includes(fixtureCase), 'live vk-lane-run.sh no longer contains the #893 grok case fixture');
  assertGrokCase(lane, 'live lane');
  assertAnchors(lane, 'live lane');
  assertSpec(spec);
  console.log('vkprloop grok perm #893: fixture + live dispatcher ok');
} else {
  console.log('vkprloop grok perm #893: fixture ok (no local tsv-dispatch)');
}
