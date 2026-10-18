#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const jobRoot = process.env.VK477_JOB_ROOT
  || '/home/ubishere9995/tsv-dispatch/vk-477-harness-20261018-job';
const ec4dSource = process.env.VK_EC4D_REVIEWED_SOURCE
  || '/home/ubishere9995/tsv-dispatch/vk-336-rebuild-a-20261017-job/host-publish-gateb/checker-ec4d40de';
const captureSource = process.env.VK_CAPTURE_SOURCE
  || '/home/ubishere9995/tsv-dispatch/capture/capture.mjs';

const collectorDir = path.join(jobRoot, 'reviewed-collector-ec4d40de');
const pinsPath = path.join(collectorDir, 'ruling99-step-b-pin.json');
const patchPath = path.join(collectorDir, 'capture-name-line.patch');
const patchedCaptureDir = path.join(jobRoot, 'capture-patched');
const patchedCapturePath = path.join(patchedCaptureDir, 'capture.mjs');

mkdirSync(collectorDir, { recursive: true });
mkdirSync(patchedCaptureDir, { recursive: true });

const pinBundle = JSON.parse(readFileSync(path.join(ec4dSource, 'ruling99-step-b-pin.json'), 'utf8'));
for (const rel of Object.keys(pinBundle.files || {})) {
  const dest = path.join(collectorDir, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(path.join(ec4dSource, rel), dest);
}
copyFileSync(path.join(ec4dSource, 'ruling99-step-b-pin.json'), pinsPath);
copyFileSync(path.join(ec4dSource, 'capture-name-line.patch'), patchPath);

const captureWork = path.join(patchedCaptureDir, 'work');
mkdirSync(captureWork, { recursive: true });
copyFileSync(captureSource, path.join(captureWork, 'capture.mjs'));
const patchRun = spawnSync('patch', ['-p1'], {
  cwd: captureWork,
  input: readFileSync(patchPath),
  encoding: 'buffer',
});
if (patchRun.status !== 0) {
  throw new Error(`capture-name-line.patch failed: ${(patchRun.stderr || '').toString().slice(-200)}`);
}
copyFileSync(path.join(captureWork, 'capture.mjs'), patchedCapturePath);

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const observed = {};
for (const [rel, expected] of Object.entries(pinBundle.files)) {
  observed[rel] = sha256File(path.join(collectorDir, rel));
  if (observed[rel] !== expected) {
    throw new Error(`extracted collector ${rel} digest mismatch after copy`);
  }
}

const captureObserved = sha256File(patchedCapturePath);
const payload = {
  collectorDir,
  pinsPath,
  patchedCapturePath,
  captureObserved,
  captureExpected: pinBundle.capture_collector_sha256,
  capturePatchSha256: pinBundle.capture_patch_sha256,
  observed,
};
writeFileSync(
  path.join(jobRoot, 'reviewed-collector-ec4d40de', 'extract-manifest.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(payload)}\n`);
