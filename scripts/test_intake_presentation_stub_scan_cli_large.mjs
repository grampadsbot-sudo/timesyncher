#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const cli = join(repo, 'scripts/intake_presentation_stub_scan_cli.mjs');
const localDirtyFixture = '/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/cc3ead70140b1d9216f9fa3f0822988eebecedfd.json';
const cleanFixture = join(repo, 'scripts/fixtures/nyc-screen-trip99-live-shared-api.json');

const artifactDir = mkdtempSync(join(tmpdir(), 'ips-scan-'));

function assertDirtyFailsClosed(fixture, label) {
  const artifact = join(artifactDir, `${label}-full.json`);
  const dirtyRun = spawnSync('node', [cli, fixture, '--artifact', artifact], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(dirtyRun.status, 1, `${label}: dirty fixture must fail closed (stderr: ${dirtyRun.stderr})`);
  assert.ok(dirtyRun.stdout.length > 64 * 1024, `${label}: stdout carries the complete >64KiB result`);
  const stdout = JSON.parse(dirtyRun.stdout.trim());
  assert.equal(stdout.pass, false);
  assert.equal(stdout.matchCount, 216);
  assert.equal(stdout.matches?.length, 216);
  assert.ok(stdout.matches[0].path, 'stdout matches include full paths');

  const artifactReport = JSON.parse(readFileSync(artifact, 'utf8'));
  assert.equal(artifactReport.matchCount, 216);
  assert.ok(artifactReport.matches.length >= 216);
  assert.ok(readFileSync(artifact, 'utf8').length > 64 * 1024, 'artifact retains full >64KiB report');
}

function largeDirtyTrip() {
  const places = [];
  const thingOverrides = {};
  for (let i = 0; i < 108; i += 1) {
    const id = 1000 + i;
    const stub = `Generated restaurant ${id} ${'with a long intake note '.repeat(8)}Price: $65 dinner prix fixe floor; Status: candidate only.`;
    places.push({ id, name: `Generated Restaurant ${id} ${'x'.repeat(40)}`, category: 'restaurant', details: stub });
    thingOverrides[`place:${id}`] = { category: 'restaurant', sourceRecord: { category: 'restaurant', details: stub } };
  }
  return { places, thingOverrides };
}

const generatedFixture = join(artifactDir, 'large-dirty-trip.json');
writeFileSync(generatedFixture, JSON.stringify(largeDirtyTrip()));
assertDirtyFailsClosed(generatedFixture, 'generated');

if (existsSync(localDirtyFixture)) {
  assertDirtyFailsClosed(localDirtyFixture, 'host');
} else {
  console.log('host dirty fixture absent; generated large fixture covered the dirty path');
}

const missingRun = spawnSync('node', [cli, join(artifactDir, 'missing.json')], { encoding: 'utf8' });
assert.equal(missingRun.status, 2, 'unreadable input fails closed and is distinct from a dirty scan');
assert.equal(missingRun.stdout, '');
assert.match(missingRun.stderr, /cannot read/);

const cleanRun = spawnSync('node', [cli, cleanFixture], { encoding: 'utf8' });
assert.equal(cleanRun.status, 0);
assert.deepEqual(JSON.parse(cleanRun.stdout.trim()), { pass: true, matchCount: 0, matches: [] });

console.log('intake presentation stub scan cli large-output tests passed');
