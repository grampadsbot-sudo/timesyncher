#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const jobRoot = process.env.VK477_JOB_ROOT
  || mkdtempSync(path.join(tmpdir(), 'vk477-collector-'));
const ec4dSource = process.env.VK_EC4D_REVIEWED_SOURCE;
const reviewedFiles = JSON.parse(readFileSync(
  new URL('../../fixtures/vk477/reviewed-collector-ec4d40de.json', import.meta.url), 'utf8',
));
const captureSource = process.env.VK_CAPTURE_SOURCE
  || fileURLToPath(new URL('../../fixtures/vk477/capture.mjs.txt', import.meta.url));

function reviewedFile(rel) {
  return ec4dSource ? readFileSync(path.join(ec4dSource, rel)) : reviewedFiles[rel];
}

const collectorDir = path.join(jobRoot, 'reviewed-collector-ec4d40de');
const pinsPath = path.join(collectorDir, 'ruling99-step-b-pin.json');
const patchPath = path.join(collectorDir, 'capture-name-line.patch');
const patchedCaptureDir = path.join(jobRoot, 'capture-patched');
const patchedCapturePath = path.join(patchedCaptureDir, 'capture.mjs');

mkdirSync(collectorDir, { recursive: true });
mkdirSync(patchedCaptureDir, { recursive: true });

const pinBundle = JSON.parse(reviewedFile('ruling99-step-b-pin.json'));
for (const rel of Object.keys(pinBundle.files || {})) {
  const dest = path.join(collectorDir, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, reviewedFile(rel));
}
writeFileSync(pinsPath, reviewedFile('ruling99-step-b-pin.json'));
writeFileSync(path.join(collectorDir, 'ruling99-runtime-input-pins.json'), reviewedFile('ruling99-runtime-input-pins.json'));
writeFileSync(patchPath, reviewedFile('capture-name-line.patch'));
mkdirSync(path.join(collectorDir, 'lib'), { recursive: true });
writeFileSync(
  path.join(collectorDir, 'lib/capture-name-line.mjs'),
  reviewedFile('lib/capture-name-line.mjs'),
);

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

const runtimePins = JSON.parse(
  reviewedFile('ruling99-runtime-input-pins.json'),
);
const captureObserved = sha256File(patchedCapturePath);
const helperObserved = sha256File(path.join(collectorDir, 'lib/capture-name-line.mjs'));
const patchObserved = sha256File(patchPath);
const baseCaptureObserved = sha256File(captureSource);
const payload = {
  collectorDir,
  pinsPath,
  patchedCapturePath,
  helperObserved,
  helperExpected: pinBundle.capture_collector_sha256,
  patchObserved,
  patchExpected: pinBundle.capture_patch_sha256,
  baseCaptureObserved,
  baseCaptureExpected: runtimePins['../capture/capture.mjs'],
  patchedCaptureObserved: captureObserved,
  observed,
};
writeFileSync(
  path.join(jobRoot, 'reviewed-collector-ec4d40de', 'extract-manifest.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(payload)}\n`);
