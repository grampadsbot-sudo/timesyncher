#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_FINDINGS, REQUIRED_HEADINGS, appendSection, customerSection, implicationOf,
  severityOf, waveSection, withFindingsLock,
} from './harness/findings.mjs';

assert.match(DEFAULT_FINDINGS, /vk-customer-test-findings\.md$/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-findings-'));
const file = path.join(tmp, 'findings.md');
const skeleton = `${REQUIRED_HEADINGS[0]}\nAppend-only.\n\n${REQUIRED_HEADINGS[1]}\n\n${REQUIRED_HEADINGS[2]}\n`;
fs.writeFileSync(file, skeleton);

const passCard = {
  story_id: 'vk-001',
  reply_backend: 'vk_bot_mcp',
  ab_arm: 'B vk_bot_mcp',
  mode: 'live',
  verdict: 'PASS',
  reason: '',
  checks: [],
  turns: [{ wall_ms: 420 }, { wall_ms: 880 }, { wall_ms: 600 }],
  cost: { state: 'measured', amount: 0.0125 },
  media: { gb: 0.852, source: 'estimate-live', storage_dollars_per_month: 0.02 },
  coupon_redemption: { code_hint: 'VK-...001', status: 'redeemed' },
  roster: { id: 1, edge_case: '' },
};
const failCard = {
  story_id: 'vk-004',
  reply_backend: 'vk_bot_mcp',
  ab_arm: 'B vk_bot_mcp',
  mode: 'live',
  verdict: 'FAIL',
  wave_stop: false,
  reason: 'coupon-rejected',
  checks: [{ id: 'coupon-redemption', pass: false, detail: 'rejected: http 400' }],
  turns: [],
  cost: { state: 'not-run', amount: null },
  media: { gb: 0.5 },
  coupon_redemption: { code_hint: 'VK-...004', status: 'rejected' },
  roster: { id: 4, edge_case: 'coupon misuse' },
};

assert.equal(severityOf(passCard), 'minor');
assert.equal(severityOf(failCard), 'blocker');
assert.match(implicationOf(failCard), /coupon/);
assert.match(implicationOf({ verdict: 'PASS', roster: { edge_case: 'confused' } }), /hotel dates/);
assert.match(implicationOf({ verdict: 'PASS', roster: { edge_case: 'quits partway' } }), /resume/);

const fixedTime = new Date('2026-11-24T18:30:00Z');
const s1 = customerSection(passCard, { wave: 'wave 1 (r1-w1)', at: fixedTime });
assert.match(s1, /### wave 1 \(r1-w1\) \/ customer 1 \/ .* HST/);
assert.match(s1, /B vk_bot_mcp/);
assert.match(s1, /VK-\.\.\.001 redeemed/);
assert.match(s1, /3 turns, p50 600 ms, max 880 ms/);
assert.match(s1, /\$0\.0125 replies \/ \$0\.02\/mo media/);
assert.match(s1, /Media GB: 0\.852/);

const r1 = appendSection(file, s1);
assert.ok(r1.bytes > 0);
const after1 = fs.readFileSync(file, 'utf8');
assert.ok(after1.startsWith(skeleton));
assert.ok(after1.includes('### wave 1 (r1-w1) / customer 1'));

const w1 = waveSection({ wave: 'wave 1 (r1-w1)', mode: 'live', cards: [passCard, failCard], failed: true, stopped: 'vk-004 coupon-rejected', cost: '$0.0125 replies measured' }, { at: fixedTime });
appendSection(file, w1);
const after2 = fs.readFileSync(file, 'utf8');
assert.ok(after2.startsWith(after1));
assert.match(after2, /### wave 1 \(r1-w1\) \/ wave summary/);
assert.match(after2, /Result: FAIL \(ramp stopped: vk-004 coupon-rejected\)/);
assert.match(after2, /Severity \(blocker\/major\/minor\): blocker/);

const badFile = path.join(tmp, 'bad.md');
fs.writeFileSync(badFile, '# Wrong heading\n');
assert.throws(() => appendSection(badFile, '### entry'), /skeleton heading missing/);

const lockFile = `${file}.lock`;
fs.writeFileSync(lockFile, '999999\n');
assert.throws(() => withFindingsLock(file, () => 'never', { waitMs: 80, staleMs: 60000 }), /lock is held/);
const staleDate = new Date(Date.now() - 10000);
fs.utimesSync(lockFile, staleDate, staleDate);
assert.equal(withFindingsLock(file, () => 'recovered', { waitMs: 200, staleMs: 1000 }), 'recovered');
assert.equal(fs.existsSync(lockFile), false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test_vk_customer_harness_findings: ok');
