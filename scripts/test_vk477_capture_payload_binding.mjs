#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  bindingVerdict,
  buildHeadCaptureFixture,
  capturePayloadFaults,
} from './ops/verification/vk477-dispatch-binding.mjs';
import {
  verifyCaptureCollectorPin,
  verifyReviewedStepBPins,
} from './ops/verification/vk-gateb-collector-pin.mjs';
import {
  bindingProofShouldFail,
  legacyBindingProofWouldFail,
} from './ops/verification/vk477-proof-exit.mjs';
import { reviewedCaptureBasePath } from './ops/verification/vk477-reviewed-capture-base.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const snapshotPath = join(root, 'scripts/fixtures/pr336-vk-search-places.snapshot.json');
const nycShared = process.env.VK_NYC_SHARED_FIXTURE
  || '/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json';

const staticFaults = capturePayloadFaults(snapshotPath, nycShared);
assert.ok(staticFaults.some((line) => line.includes('missing snapshot rows: 601')));

const tmp = mkdtempSync(join(tmpdir(), 'vk477-bind-'));
const bound = join(tmp, 'bound.json');
buildHeadCaptureFixture(nycShared, snapshotPath, bound);
assert.deepEqual(capturePayloadFaults(snapshotPath, bound), []);

const mismatchedSnap = join(tmp, 'mismatched-snap.json');
const snapCopy = structuredClone(JSON.parse(readFileSync(snapshotPath, 'utf8')));
snapCopy['602'] = { ...snapCopy['602'], title: 'Stale title on row 602' };
writeFileSync(mismatchedSnap, `${JSON.stringify(snapCopy)}\n`);
assert.ok(capturePayloadFaults(mismatchedSnap, bound).some((line) => line.includes('identity mismatch')));

const contract = spawnSync(process.execPath, ['scripts/vk_contract_check_local.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(contract.status, 0, contract.stdout + contract.stderr);

const jobRoot = process.env.VK477_JOB_ROOT
  || '/home/ubishere9995/tsv-dispatch/vk-477-harness-20261018-job';
const setup = spawnSync(process.execPath, ['scripts/ops/verification/setup-reviewed-collector-job.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, VK477_JOB_ROOT: jobRoot },
});
assert.equal(setup.status, 0, setup.stderr);

const collectorRoot = join(jobRoot, 'reviewed-collector-ec4d40de');
const pinsPath = join(collectorRoot, 'ruling99-step-b-pin.json');
const pinBundle = JSON.parse(readFileSync(pinsPath, 'utf8'));
const runtimePins = JSON.parse(
  readFileSync(join(collectorRoot, 'ruling99-runtime-input-pins.json'), 'utf8'),
);
const pinPass = verifyReviewedStepBPins({ pinsPath, collectorRoot });
assert.equal(pinPass.ok, true, pinPass.faults.join('; '));

const baseCapturePath = reviewedCaptureBasePath();
const patchedCapturePath = join(jobRoot, 'capture-patched', 'capture.mjs');
const capturePin = verifyCaptureCollectorPin({
  collectorRoot,
  patchedCapturePath,
  baseCapturePath,
  expectedHelperSha256: pinBundle.capture_collector_sha256,
  expectedPatchSha256: pinBundle.capture_patch_sha256,
  expectedBaseCaptureSha256: runtimePins['../capture/capture.mjs'],
});
assert.equal(capturePin.ok, true, capturePin.faults.join('; '));
assert.notEqual(
  capturePin.observed.patchedCaptureSha256,
  pinBundle.capture_collector_sha256,
  'whole patched capture must not equal helper pin',
);

const wrongHelperPin = verifyCaptureCollectorPin({
  collectorRoot,
  patchedCapturePath,
  baseCapturePath,
  expectedHelperSha256: '0'.repeat(64),
  expectedPatchSha256: pinBundle.capture_patch_sha256,
  expectedBaseCaptureSha256: runtimePins['../capture/capture.mjs'],
});
assert.equal(wrongHelperPin.ok, false);

const wrongBasePin = verifyCaptureCollectorPin({
  collectorRoot,
  patchedCapturePath,
  baseCapturePath,
  expectedHelperSha256: pinBundle.capture_collector_sha256,
  expectedPatchSha256: pinBundle.capture_patch_sha256,
  expectedBaseCaptureSha256: 'f'.repeat(64),
});
assert.equal(wrongBasePin.ok, false);

const wrongRuntimeRoot = process.env.VK_WRONG_RUNTIME_GATEB_ROOT || '/home/ubishere9995/tsv-gateb';
const wrongRuntime = verifyReviewedStepBPins({ pinsPath, collectorRoot: wrongRuntimeRoot });
assert.equal(wrongRuntime.ok, false, 'wrong runtime ~/tsv-gateb must not pass step-b checker pins');

assert.equal(bindingVerdict(snapshotPath, bound).overall, 'PASS');
assert.equal(bindingVerdict(snapshotPath, nycShared).overall, 'DATA_FAULT');

const goodState = {
  boundVerdict: { overall: 'PASS' },
  staticVerdict: { overall: 'DATA_FAULT' },
  contractOk: true,
  collector: { ok: true },
  wrongRuntimeCollector: { ok: false },
  captureCollector: { ok: true },
};
const badWrongRuntime = { ...goodState, wrongRuntimeCollector: { ok: true } };
assert.equal(bindingProofShouldFail(goodState), false);
assert.equal(bindingProofShouldFail(badWrongRuntime), true);
assert.equal(legacyBindingProofWouldFail(goodState), true);
assert.equal(legacyBindingProofWouldFail(badWrongRuntime), false);

console.log('vk477 capture payload binding tests passed');
