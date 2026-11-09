#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const cli = join(repo, 'scripts/intake_presentation_stub_scan_cli.mjs');
const dirtyFixture = '/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/cc3ead70140b1d9216f9fa3f0822988eebecedfd.json';
const cleanFixture = join(repo, 'scripts/fixtures/nyc-screen-trip99-live-shared-api.json');

const artifactDir = mkdtempSync(join(tmpdir(), 'ips-scan-'));
const artifact = join(artifactDir, 'full.json');

const dirtyRun = spawnSync('node', [cli, dirtyFixture, '--artifact', artifact], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
assert.equal(dirtyRun.status, 1, 'dirty fixture must fail closed');
const stdout = JSON.parse(dirtyRun.stdout.trim());
assert.equal(stdout.matchCount, 216);
assert.ok(stdout.matches?.length > 0);
assert.ok(stdout.matches[0].path, 'stdout matches include full paths');

const artifactReport = JSON.parse(readFileSync(artifact, 'utf8'));
assert.equal(artifactReport.matchCount, 216);
assert.ok(artifactReport.matches.length >= 216);
assert.ok(readFileSync(artifact, 'utf8').length > 64 * 1024, 'artifact retains full >64KiB report');

const cleanRun = spawnSync('node', [cli, cleanFixture], { encoding: 'utf8' });
assert.equal(cleanRun.status, 0);
assert.deepEqual(JSON.parse(cleanRun.stdout.trim()), { pass: true, matchCount: 0, matches: [] });

console.log('intake presentation stub scan cli large-output tests passed');
