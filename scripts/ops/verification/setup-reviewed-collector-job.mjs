#!/usr/bin/env node
import { mkdirSync, symlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

const jobRoot = process.env.VK477_JOB_ROOT
  || '/home/ubishere9995/tsv-dispatch/vk-477-harness-20261018-job';
const reviewedGateb = process.env.VK_REVIEWED_GATEB_ROOT || '/home/ubishere9995/tsv-gateb';
const captureRoot = process.env.VK_REVIEWED_CAPTURE_ROOT
  || '/home/ubishere9995/tsv-dispatch/capture';

const collectorDir = path.join(jobRoot, 'reviewed-collector-ec4d40de');
const captureDir = path.join(jobRoot, 'capture');
mkdirSync(collectorDir, { recursive: true });

const files = [
  'restore_check.py',
  'restore-check.mjs',
  'restore-check-logo-centres.mjs',
  'ui_paths.py',
  'managing_dr_judge.py',
];
for (const name of files) {
  const target = path.join(collectorDir, name);
  const source = path.join(reviewedGateb, name);
  if (!existsSync(source)) {
    throw new Error(`reviewed gateb file missing: ${source}`);
  }
  if (!existsSync(target)) symlinkSync(source, target);
}

const libDir = path.join(collectorDir, 'lib');
mkdirSync(libDir, { recursive: true });
const layoutChecker = path.join(reviewedGateb, 'lib/gate-b-shell-layout-checker.mjs');
const layoutLink = path.join(libDir, 'gate-b-shell-layout-checker.mjs');
if (!existsSync(layoutLink)) symlinkSync(layoutChecker, layoutLink);

if (!existsSync(captureDir)) symlinkSync(captureRoot, captureDir);

process.stdout.write(`${JSON.stringify({ collectorDir, captureDir })}\n`);
