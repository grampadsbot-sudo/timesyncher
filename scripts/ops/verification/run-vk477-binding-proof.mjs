#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  bindingVerdict,
  buildHeadCaptureFixture,
} from './vk477-dispatch-binding.mjs';
import {
  verifyCaptureCollectorPin,
  verifyReviewedStepBPins,
} from './vk-gateb-collector-pin.mjs';
import { bindingProofShouldFail } from './vk477-proof-exit.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const jobRoot = process.env.VK477_JOB_ROOT
  || mkdtempSync(path.join(tmpdir(), 'vk477-proof-'));
const nycShared = process.env.VK_NYC_SHARED_FIXTURE
  || path.join(root, 'scripts/fixtures/vk477/nyc-shared.json');
const outDir = path.join(jobRoot, 'binding-proof');
mkdirSync(outDir, { recursive: true });

const setup = spawnSync(process.execPath, ['scripts/ops/verification/setup-reviewed-collector-job.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, VK477_JOB_ROOT: jobRoot },
});
if (setup.status !== 0) {
  process.stderr.write(setup.stderr || setup.stdout || 'collector job setup failed\n');
  process.exit(setup.status || 1);
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'git rev-parse failed');
  return r.stdout.trim();
}

const snapshotPath = path.join(root, 'scripts/fixtures/pr336-vk-search-places.snapshot.json');
const boundFixture = path.join(outDir, 'head-capture-bound.json');
const manifestPath = path.join(outDir, 'capture-manifest.json');
const collectorRoot = path.join(jobRoot, 'reviewed-collector-ec4d40de');
const pinsPath = path.join(collectorRoot, 'ruling99-step-b-pin.json');
const pinBundle = JSON.parse(readFileSync(pinsPath, 'utf8'));
const patchedCapturePath = path.join(jobRoot, 'capture-patched', 'capture.mjs');

buildHeadCaptureFixture(nycShared, snapshotPath, boundFixture);

const snapshotSha256 = sha256File(snapshotPath);
const nycSharedSha256 = sha256File(nycShared);
const fixtureSha256 = sha256File(boundFixture);
const repoHeadSha = gitHead();

const staticVerdict = bindingVerdict(snapshotPath, nycShared);
const boundVerdict = bindingVerdict(snapshotPath, boundFixture);

const contractRun = spawnSync(process.execPath, ['scripts/vk_contract_check_local.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
const contractOk = contractRun.status === 0;

const runtimePins = JSON.parse(
  readFileSync(path.join(collectorRoot, 'ruling99-runtime-input-pins.json'), 'utf8'),
);
const baseCapturePath = process.env.VK_CAPTURE_SOURCE
  || path.join(root, 'scripts/fixtures/vk477/capture.mjs.txt');

const collector = verifyReviewedStepBPins({ pinsPath, collectorRoot });
const captureCollector = verifyCaptureCollectorPin({
  collectorRoot,
  patchedCapturePath,
  baseCapturePath,
  expectedHelperSha256: pinBundle.capture_collector_sha256,
  expectedPatchSha256: pinBundle.capture_patch_sha256,
  expectedBaseCaptureSha256: runtimePins['../capture/capture.mjs'],
});
const wrongRuntimeRoot = process.env.VK_WRONG_RUNTIME_GATEB_ROOT || path.join(jobRoot, 'unreviewed-collector');
if (!process.env.VK_WRONG_RUNTIME_GATEB_ROOT) {
  cpSync(collectorRoot, wrongRuntimeRoot, { recursive: true });
  const changedChecker = path.join(wrongRuntimeRoot, 'restore_check.py');
  writeFileSync(changedChecker, `${readFileSync(changedChecker, 'utf8')}\n`);
}
const wrongRuntimeCollector = verifyReviewedStepBPins({
  pinsPath,
  collectorRoot: wrongRuntimeRoot,
});

writeFileSync(
  manifestPath,
  `${JSON.stringify({
    repoHeadSha,
    snapshotPath,
    snapshotSha256,
    nycShared,
    nycSharedSha256,
    fixture: boundFixture,
    fixtureSha256,
    data_snapshot: snapshotPath,
    data_snapshot_sha256: snapshotSha256,
    fixture_sha256: fixtureSha256,
    note: 'manifest records fixture binding inputs only; no browser capture consumed',
  }, null, 2)}\n`,
  'utf8',
);

const payload = {
  repoHeadSha,
  snapshotSha256,
  nycSharedSha256,
  fixtureSha256,
  staticVerdict,
  boundFixtureVerdict: boundVerdict,
  vkContractCheckOk: contractOk,
  vkContractCheckExitCode: contractRun.status,
  collector,
  captureCollector,
  wrongRuntimeCollector,
  wrongRuntimeRejected: !wrongRuntimeCollector.ok,
  manifestPath,
  boundFixture,
  nycShared,
  noBrowserCapture: true,
};

writeFileSync(path.join(outDir, 'binding-proof.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(payload)}\n`);

const fail = bindingProofShouldFail({
  boundVerdict,
  staticVerdict,
  contractOk,
  collector,
  wrongRuntimeCollector,
  captureCollector,
});
process.exit(fail ? 1 : 0);
