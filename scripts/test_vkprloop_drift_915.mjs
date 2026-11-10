import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(repo, 'scripts/fixtures/vkprloop-drift-915.txt');

const FILE_OF = {
  'allow-nj': 'tsv_dispatch.py',
  'pregate-slot': 'tsv_dispatch.py',
  'pregate-skip': 'tsv_dispatch.py',
  'stall-open': 'tsv_stall_alarm.py',
  'stall-void': 'tsv_stall_alarm.py',
  'stall-clear': 'tsv_stall_alarm.py',
};

const SPEC_BITS = [
  'raw FAIL or NEEDS_JUDGMENT inside dr-verified allowance regions = PASS',
  '#915 (11/9): pregate\'s PREGATE_PER_RUN cap applies only to UI heads',
  'A backend-only record_backend_skip does not increment done',
  '~ui still takes the SKIP arm of Pregate',
  'Not an action.',
  'raw FAIL or NEEDS_JUDGMENT, every changed pixel inside a dr-verified allowance region',
  '#915 extends the 10/21 FAIL promotion',
  'gb\' = (IF ALLOW_PASS THEN "PASS" ELSE "ALLOW")',
  '#915 (11/9): automerge promotes a raw NEEDS_JUDGMENT',
  'reference starts with "base-"',
  'A NEEDS_JUDGMENT whose effective is not PASS stays out of',
  'Merge ==',
  '#915 (11/9, #909): main passes the open PR numbers into vkfill_held_stall_checks',
  'prclosed-not-pushed',
  'failed GitHub read does not void',
  'Launch still skips while VKFILL_BATCH holds wtC = "ahead"',
  'StallFix ==',
  'Pregate ==',
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
  const slot = src.indexOf('#915 (11/9): pregate\'s PREGATE_PER_RUN cap applies only to UI heads');
  const pregate = src.indexOf('Pregate ==');
  const allow = src.indexOf('raw FAIL or NEEDS_JUDGMENT, every changed pixel inside a dr-verified allowance region');
  const mergeNote = src.indexOf('#915 (11/9): automerge promotes a raw NEEDS_JUDGMENT');
  const merge = src.indexOf('Merge ==');
  const stallNote = src.indexOf('#915 (11/9, #909): main passes the open PR numbers into vkfill_held_stall_checks');
  const stall = src.indexOf('StallFix ==');
  assert.ok(slot > 0 && pregate > slot && allow > pregate, 'slot note stays above Pregate; allowance arm stays inside it');
  assert.ok(mergeNote > allow && merge > mergeNote, 'NEEDS_JUDGMENT promotion stays above Merge');
  assert.ok(stallNote > merge && stall > stallNote, 'closed-PR vkfill note stays above StallFix');
}

const fixture = fs.readFileSync(fixturePath, 'utf8');
const chunks = sections(fixture);
assert.deepEqual(chunks.map((c) => c.name), Object.keys(FILE_OF));
for (const chunk of chunks) {
  assert.ok(chunk.body.length > 20, `empty fixture section ${chunk.name}`);
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

  const dispatchPy = byFile['tsv_dispatch.py'];
  const automerge = fnBody(dispatchPy, 'automerge');
  const pregate = fnBody(dispatchPy, 'pregate');
  const allow = chunks.find((c) => c.name === 'allow-nj').body;
  const slot = chunks.find((c) => c.name === 'pregate-slot').body;
  const skip = chunks.find((c) => c.name === 'pregate-skip').body;
  assert.ok(automerge.includes(allow), 'allowance promotion stays in automerge');
  assert.equal(pregate.includes(allow), false, 'NEEDS_JUDGMENT promotion is not the pregate slot');
  const promo = automerge.indexOf(allow);
  const rewrite = automerge.indexOf('g = dict(g, verdict="PASS")', promo);
  const kick = automerge.indexOf('back to the coder (kickback)', promo);
  assert.ok(promo >= 0 && rewrite > promo && kick > rewrite, 'verdict rewrite stays before the kickback line');
  assert.ok(automerge.includes('if bad:'), 'FORBID_MERGE guard stays');

  assert.ok(pregate.includes(slot), 'UI-only slot cap stays in pregate');
  assert.ok(pregate.includes(skip), 'backend-only skip stays in pregate');
  const slotAt = pregate.indexOf(slot);
  const skipAt = pregate.indexOf(skip);
  assert.ok(slotAt >= 0 && skipAt > slotAt, 'slot cap stays before the backend-only skip');
  const between = pregate.slice(skipAt, skipAt + skip.length);
  assert.equal(between.includes('done += 1'), false, 'backend-only skip does not consume the Gate B slot');
  const uiCount = pregate.indexOf('done += 1');
  assert.ok(uiCount > skipAt, 'a real Gate B run still increments done');

  const stallPy = byFile['tsv_stall_alarm.py'];
  const main = fnBody(stallPy, 'main');
  const held = fnBody(stallPy, 'vkfill_held_stall_checks');
  const openCall = chunks.find((c) => c.name === 'stall-open').body;
  const voidIf = chunks.find((c) => c.name === 'stall-void').body;
  const cleared = chunks.find((c) => c.name === 'stall-clear').body;
  assert.ok(main.includes(openCall), 'main passes the open-PR set only after a GitHub read');
  assert.equal(held.includes(openCall), false, 'the open-PR argument is the main call, not the helper body');
  assert.ok(held.includes('open_prs=None'), 'a missing open set does not void');
  const clearAt = held.indexOf(cleared);
  const voidAt = held.indexOf(voidIf);
  const overdue = held.indexOf('held, push overdue');
  assert.ok(clearAt >= 0 && voidAt > clearAt && overdue > voidAt, 'clear and closed-PR void both skip the overdue ring');
  const afterClear = held.slice(clearAt, voidAt);
  assert.ok(afterClear.includes('continue'), 'a remote match does not also report push overdue');
  assert.ok(held.includes('prclosed-not-pushed'), 'a closed PR marker is renamed, not deleted');

  assertSpec(fs.readFileSync(specPath, 'utf8'));
  console.log('vkprloop drift #915: fixture + live dispatcher ok');
} else {
  console.log('vkprloop drift #915: fixture ok (no local tsv-dispatch)');
}
