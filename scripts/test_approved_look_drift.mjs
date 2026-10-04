#!/usr/bin/env node
/**
 * Approved-look screenshot drift.
 *
 * Baselines are not in this PR. TSV Shepherd commits them only after Craig OKs
 * the candidate crops in the PR body.
 *
 * Baseline directory: scripts/fixtures/approved-look/
 *   cars-390.png, cars-1280.png, hotels-390.png, hotels-1280.png,
 *   day-390.png, day-1280.png, pdf-thing-card.png
 *   CRAIG-OK.txt  first line: the commit SHA Craig approved
 *
 * Until those files exist, this harness exits 0 and prints this step.
 * After they exist, a later PR fails when a fresh crop's bytes differ
 * from the baseline, unless CRAIG-OK.txt names that PR's HEAD.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const baseDir = new URL('./fixtures/approved-look/', import.meta.url);
const names = [
  'cars-390.png',
  'cars-1280.png',
  'hotels-390.png',
  'hotels-1280.png',
  'day-390.png',
  'day-1280.png',
  'pdf-thing-card.png',
];

function hash(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const present = existsSync(baseDir)
  ? readdirSync(baseDir).filter((name) => names.includes(name))
  : [];
if (!present.length) {
  console.log('approved-look baselines are not committed yet');
  console.log('Shepherd: after Craig OKs the PR crops, commit them under scripts/fixtures/approved-look/');
  console.log('and write CRAIG-OK.txt with the approved commit SHA on the first line.');
  console.log('Later PRs whose crops differ fail until that file names the new HEAD.');
  process.exit(0);
}

assert.deepEqual(present.sort(), [...names].sort(), 'approved-look baseline set is incomplete');
const okPath = path.join(baseDir.pathname, 'CRAIG-OK.txt');
assert.equal(existsSync(okPath), true, 'CRAIG-OK.txt missing');
const approved = readFileSync(okPath, 'utf8').split('\n')[0].trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL(root).pathname }).toString().trim();
const currentDir = process.env.APPROVED_LOOK_CURRENT;
if (head === approved) {
  console.log('approved-look matches CRAIG-OK', approved);
  process.exit(0);
}
assert.ok(currentDir, 'APPROVED_LOOK_CURRENT must point at fresh crops when baselines exist');
for (const name of names) {
  const baseline = hash(readFileSync(path.join(baseDir.pathname, name)));
  const current = hash(readFileSync(path.join(currentDir, name)));
  assert.equal(current, baseline, `approved look drifted: ${name}`);
}
console.log('approved-look crops match the baseline');
