#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./vk_contract_check_local.mjs', import.meta.url));

const row = {
  title: 'Ledger Store',
  category: 'store',
  summary: 'Juice option near the park.',
  description:
    'Juice option near the park. Price: $12 typical spend floor; Status: candidate only.',
  price: 12,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.77,
  lng: -73.98,
};

function runCheck(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'vk-contract-'));
  const path = join(dir, 'snap.json');
  writeFileSync(path, JSON.stringify(rows));
  try {
    return { ok: true, out: execFileSync(process.execPath, [checker, path], { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const paddedOnly = runCheck({ 901: row });
assert.equal(paddedOnly.ok, false, 'intake padding-only distinction must still fail summary');
assert.match(paddedOnly.out, /summary\/store/);

const distinct = runCheck({
  902: {
    ...row,
    summary: 'Upper West juice stop with acai bowls.',
    description: row.description,
    googleRating: 4.5,
    ratingCount: 120,
    reviews: [{ text: 'Great acai.' }],
  },
});
assert.equal(distinct.ok, true, distinct.out);
assert.doesNotMatch(distinct.out, /summary\/store/, 'meaningful summary must not fail summary/store');

const sameRaw = runCheck({
  903: {
    ...row,
    summary: row.description,
    description: row.description,
  },
});
assert.equal(sameRaw.ok, false, 'raw-equal narratives remain base debt');
assert.match(sameRaw.out, /summary\/store/);

console.log('test_vk_contract_meaningful_summary: ok');
