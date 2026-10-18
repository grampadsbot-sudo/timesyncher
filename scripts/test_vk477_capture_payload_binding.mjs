#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { buildVkHeadCaptureFixture } from './ops/verification/build-vk-head-capture-fixture.mjs';
import {
  bindingVerdict,
  capturePayloadFaults,
} from './ops/verification/vk-capture-payload-binding.mjs';
import { verifyReviewedCollectorPins } from './ops/verification/vk-gateb-collector-pin.mjs';
const VK_SEARCH_SNAPSHOT_COPY_ROW_IDS = Array.from({ length: 11 }, (_, index) => 601 + index);

const root = fileURLToPath(new URL('..', import.meta.url));
const snapshotPath = new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url);
const staticBase = new URL('./ops/verification/fixtures/vk-capture-static-base.stub.json', import.meta.url);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const staticFaults = capturePayloadFaults(snapshot, fileURLToPath(staticBase));
assert.ok(staticFaults.some((line) => line.includes('missing snapshot rows: 601')));
for (const rowId of VK_SEARCH_SNAPSHOT_COPY_ROW_IDS) {
  assert.ok(String(rowId) in snapshot, `snapshot row ${rowId}`);
}

const tmp = mkdtempSync(join(tmpdir(), 'vk477-bind-'));
const bound = join(tmp, 'bound.json');
buildVkHeadCaptureFixture(fileURLToPath(staticBase), snapshot, bound);
const boundFaults = capturePayloadFaults(snapshot, bound);
assert.deepEqual(boundFaults, []);

const mismatchedSnap = join(tmp, 'mismatched-snap.json');
const snapCopy = structuredClone(snapshot);
snapCopy['602'] = { ...snapCopy['602'], title: 'Stale title on row 602' };
writeFileSync(mismatchedSnap, `${JSON.stringify(snapCopy)}\n`);
const mismatchedFaults = capturePayloadFaults(mismatchedSnap, bound);
assert.ok(mismatchedFaults.some((line) => line.includes('identity mismatch')));

const tampered = JSON.parse(readFileSync(bound, 'utf8'));
tampered.places = tampered.places.filter((p) => p.id !== 602);
writeFileSync(join(tmp, 'tampered.json'), `${JSON.stringify(tampered)}\n`);
assert.ok(capturePayloadFaults(snapshot, join(tmp, 'tampered.json')).length > 0);

const contract = spawnSync(process.execPath, ['scripts/vk_contract_check_local.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(contract.status, 0, contract.stdout + contract.stderr);

const pinsUrl = new URL('./ops/verification/reviewed-ec4d40de-runtime-input-pins.json', import.meta.url);
const fakeRoot = mkdtempSync(join(tmpdir(), 'vk477-pin-'));
writeFileSync(join(fakeRoot, 'restore_check.py'), 'reviewed-bytes\n');
const captureDir = join(fakeRoot, 'capture');
mkdirSync(captureDir, { recursive: true });
writeFileSync(join(captureDir, 'capture.mjs'), 'x');
const wrong = verifyReviewedCollectorPins({ pinsUrl, collectorRoot: fakeRoot });
assert.ok(!wrong.ok);

const reviewedGateb = process.env.VK_REVIEWED_GATEB_ROOT || '/home/ubishere9995/tsv-gateb';
const reviewedRestore = join(reviewedGateb, 'restore_check.py');
let reviewedOk = false;
try {
  const body = readFileSync(reviewedRestore);
  const digest = createHash('sha256').update(body).digest('hex');
  reviewedOk = digest === 'b435a8c274bdb3bcfd00f93a435beab537f492f03f0fcb38be61846dec3c6ccb';
} catch {
  reviewedOk = false;
}
if (reviewedOk) {
  const jobRoot = process.env.VK477_JOB_ROOT
    || '/home/ubishere9995/tsv-dispatch/vk-477-harness-20261018-job';
  const setup = spawnSync(process.execPath, ['scripts/ops/verification/setup-reviewed-collector-job.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, VK477_JOB_ROOT: jobRoot },
  });
  assert.equal(setup.status, 0, setup.stderr);
  const collectorRoot = join(jobRoot, 'reviewed-collector-ec4d40de');
  const pinPass = verifyReviewedCollectorPins({ pinsUrl, collectorRoot });
  assert.equal(pinPass.ok, true, pinPass.faults.join('; '));
  const staleRoot = process.env.VK_STALE_COLLECTOR_ROOT || '/home/ubishere9995/tsv-gateb-pin-ec4d40de';
  const stalePin = verifyReviewedCollectorPins({ pinsUrl, collectorRoot: staleRoot });
  assert.equal(stalePin.ok, false, 'stale pin tree must not pass reviewed digest check');
}

assert.equal(bindingVerdict(snapshot, bound).overall, 'PASS');
assert.equal(bindingVerdict(snapshot, fileURLToPath(staticBase)).overall, 'DATA_FAULT');

console.log('vk477 capture payload binding tests passed');
